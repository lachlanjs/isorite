<script lang="ts">
  // What can be done to a note from the list (M29): move it to a folder (a new one is made by typing its name), or
  // delete it, asked first, saying which notes link to it. The same as the Note pane's settings do for the open note,
  // where it was hard to find.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { app } from "$lib/app.svelte.ts";
  import FolderField from "$lib/components/FolderField.svelte";

  let { id, title }: { id: string; title: string } = $props();
  let open = $state(false), mode = $state<"menu" | "move" | "delete">("menu"), folder = $state(""), linked = $state<string[]>([]), problem = $state("");

  const name = $derived(id.split("/").at(-1)!);
  const target = $derived([folder.trim().replace(/^\/+|\/+$/g, ""), name].filter(Boolean).join("/"));

  function toggle(): void { open = !open; mode = "menu"; problem = ""; folder = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : ""; }
  async function askDelete(): Promise<void> {
    problem = "";
    try {
      const map = await app.api.map();
      linked = [...new Set(map.model.edges.filter(([from, to]) => to === id && from !== id && !from.startsWith("@")).map(([from]) => map.notes[from]?.title || from))];
      mode = "delete";
    } catch (e) { problem = (e as Error).message; }
  }
  async function move(): Promise<void> {
    if (target === id) { open = false; return; }
    try {
      await app.api.moveNote(id, target, (await app.api.readNote(id)).version);
      open = false;
      await app.refresh();
    } catch (e) { problem = (e as Error).message; }
  }
  async function remove(): Promise<void> {
    try {
      await app.api.deleteNote(id, (await app.api.readNote(id)).version);
      open = false;
      await app.refresh();
      if (app.open === id) await goto(resolve("/notes"), { replaceState: true });
    } catch (e) { problem = (e as Error).message; }
  }
  function key(e: KeyboardEvent): void { if (e.key === "Escape") { open = false; e.stopPropagation(); } }
</script>

<span class="menu" role="presentation" onkeydown={key}>
  <button class="more" type="button" aria-label="Do something with {title}" aria-expanded={open} onclick={toggle}>⋯</button>
  {#if open}
    <span class="panel" role="group" aria-label="{title}">
      {#if mode === "menu"}
        <button class="item" type="button" onclick={() => (mode = "move")}>Move to a folder…</button>
        <button class="item danger-text" type="button" onclick={() => void askDelete()}>Delete…</button>
      {:else if mode === "move"}
        <label class="label" for="move-{id}">move to</label>
        <FolderField id="move-{id}" label="Folder to move {title} to" bind:value={folder} placeholder="the top of the base" onpick={() => void move()} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void move(); } }} />
        <span class="faint path">{target}.md</span>
        <span class="row"><button class="btn primary" type="button" onclick={() => void move()}>move</button><button class="btn quiet" type="button" onclick={() => (open = false)}>cancel</button></span>
      {:else}
        <span class="ask">Delete “{title}”? {#if linked.length}{linked.length === 1 ? "One note links" : `${linked.length} notes link`} to it ({linked.join(", ")}); {linked.length === 1 ? "its link is" : "their links are"} left broken.{:else}No note links to it.{/if} Its history stays.</span>
        <span class="row"><button class="btn danger" type="button" onclick={() => void remove()}>delete</button><button class="btn quiet" type="button" onclick={() => (open = false)}>keep it</button></span>
      {/if}
      {#if problem}<span class="problem" role="alert">{problem}</span>{/if}
    </span>
  {/if}
</span>

<style>
  .menu { position: relative; display: inline-block; }
  .more { background: none; border: 0; color: var(--text-faint); font: 18px/1 var(--font-ui); padding: 4px 10px; cursor: pointer; }
  .more:hover, .more[aria-expanded="true"] { color: var(--text); }
  .panel { position: absolute; right: 0; top: 100%; z-index: 40; min-width: 240px; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--ground-2); border: 1px solid var(--line); box-shadow: 0 6px 18px color-mix(in srgb, var(--ground-0) 60%, transparent); }
  .item { background: none; border: 0; text-align: left; padding: 6px 4px; color: var(--text-soft); font: 13px var(--font-ui); cursor: pointer; }
  .item:hover { color: var(--text); background: var(--ground-1); }
  .danger-text { color: var(--rose); }
  .row { display: flex; gap: var(--space-2); }
  .path { overflow-wrap: anywhere; font-size: 12px; }
  .ask { font-size: 13px; line-height: 1.45; color: var(--text-soft); white-space: normal; }
  .problem { color: var(--rose); font-size: 12px; white-space: normal; }
</style>
