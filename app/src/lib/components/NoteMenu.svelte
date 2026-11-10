<script lang="ts">
  // What can be done to a note from the list (M29): move it to a folder (a new one is made by typing its name), or
  // delete it, asked first, saying which notes link to it. The same as the Note pane's settings do for the open note,
  // where it was hard to find.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { app } from "$lib/app.svelte.ts";
  import FolderField from "$lib/components/FolderField.svelte";
  import { flyOut } from "$lib/motion.ts";

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
  <button class="more" type="button" aria-label="Do something with {title}" title="More" aria-expanded={open} onclick={toggle}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg></button>
  {#if open}
    <span class="panel" role="group" aria-label="{title}" out:flyOut>
      {#if mode === "menu"}
        <button class="item" type="button" onclick={() => (mode = "move")}>Move to a folder…</button>
        <button class="item danger-text" type="button" onclick={() => void askDelete()}>Delete…</button>
      {:else if mode === "move"}
        <label class="label" for="move-{id}">move to</label>
        <FolderField id="move-{id}" label="Folder to move {title} to" bind:value={folder} placeholder="(top level)" onpick={() => void move()} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void move(); } }} />
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
  .more { width: 32px; height: 28px; display: grid; place-items: center; background: none; border: 0; color: var(--text-faint); padding: 0; margin-right: 6px; cursor: pointer; transition: color var(--dur-1) var(--ease-out); }
  .more:hover, .more:focus-visible, .more[aria-expanded="true"] { color: var(--text); }
  /* It floats over the list: lifted, coming in as floating things do and going a little down as it leaves. */
  .panel { position: absolute; right: 0; top: 100%; z-index: 40; min-width: 240px; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2); background: var(--surface-float); border: 1px solid var(--line-faint); border-radius: var(--round); box-shadow: var(--lift); animation: appear var(--dur-1) var(--ease-out); }
  .item { background: none; border: 0; text-align: left; padding: 6px 8px; color: var(--text-soft); font: 0.8125rem var(--font-ui); cursor: pointer; border-radius: var(--round); transition: background-color var(--dur-1) var(--ease-out); }
  .item:hover, .item:focus-visible { color: var(--text); background: var(--fill-hover); }
  .danger-text { color: var(--rose); }
  .row { display: flex; gap: var(--space-2); }
  .path { overflow-wrap: anywhere; font-size: 0.75rem; }
  .ask { font-size: 0.8125rem; line-height: 1.45; color: var(--text-soft); white-space: normal; }
  .problem { color: var(--rose); font-size: 0.75rem; white-space: normal; }
</style>
