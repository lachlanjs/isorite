<script lang="ts">
  // A note's details: its type, description and tags, and where it is in the base: its path, which moves it, and
  // deleting it. One quiet line under the title, and hidden altogether when it is not wanted. Other frontmatter
  // fields are not shown here and are never touched.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";

  let { note }: { note: NoteSession } = $props();

  const types = $derived([...new Set(app.listing.notes.map((n) => n.type).filter(Boolean))].sort());
  // Only a note of the base has a path to change: exercises and notes for Iso live in the study base.
  const inBase = $derived(!note.id.startsWith("@"));
  let problem = $state("");
  let asking = $state<string[] | null>(null);

  async function move(input: HTMLInputElement): Promise<void> {
    const to = input.value.trim().replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
    if (!to || to === note.id) { input.value = note.id; return; }
    problem = "";
    try {
      const id = await note.move(to);
      await app.refresh();
      await goto(noteHref(id), { replaceState: true });
    } catch (e) { problem = (e as Error).message; input.value = note.id; }
  }

  /** Before deleting, who links here: their links will be left broken. */
  async function askDelete(): Promise<void> {
    problem = "";
    try {
      const map = await app.api.map();
      asking = [...new Set(map.model.edges.filter(([from, to]) => to === note.id && from !== note.id && !from.startsWith("@")).map(([from]) => map.notes[from]?.title || from))];
    } catch (e) { problem = (e as Error).message; }
  }

  async function remove(): Promise<void> {
    try {
      await note.remove();
      await app.refresh();
      await goto(resolve("/notes"), { replaceState: true });
    } catch (e) { problem = (e as Error).message; asking = null; }
  }
</script>

<div class="details">
  <label><span>type</span><input value={note.fields.type} oninput={(e) => note.setFields({ type: e.currentTarget.value })} list="types" size={Math.max(7, note.fields.type.length)} autocomplete="off" /></label>
  <label class="wide"><span>tags</span><input value={note.fields.tags} onchange={(e) => note.setFields({ tags: e.currentTarget.value })} placeholder="none" autocomplete="off" /></label>
  <label class="full"><span>description</span><input value={note.fields.description} oninput={(e) => note.setFields({ description: e.currentTarget.value })} placeholder="one line on what this note says" autocomplete="off" /></label>
  {#if inBase}
    <label class="wide"><span>path</span><input class="mono" value={note.id} list="dirs" spellcheck="false" autocomplete="off" aria-label="path: change it to move the note"
      onchange={(e) => void move(e.currentTarget)} onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { e.currentTarget.value = note.id; e.currentTarget.blur(); } }} /></label>
    {#if asking === null}<button class="link" type="button" onclick={() => void askDelete()}>delete</button>{/if}
  {/if}
  {#if asking !== null}
    <div class="full ask" role="alertdialog" aria-label="delete this note">
      <span>Delete this note? {#if asking.length}{asking.length === 1 ? "One note links" : `${asking.length} notes link`} to it ({asking.join(", ")}); {asking.length === 1 ? "its link is" : "their links are"} left broken.{:else}No note links to it.{/if} Its history stays.</span>
      <button class="btn danger" type="button" onclick={() => void remove()}>delete</button>
      <button class="btn quiet" type="button" onclick={() => { asking = null; }}>keep it</button>
    </div>
  {/if}
  {#if problem}<p class="full problem" role="alert">{problem}</p>{/if}
  <datalist id="types">{#each types as t (t)}<option value={t}></option>{/each}</datalist>
  <datalist id="dirs">{#each app.listing.dirs as d (d)}<option value={`${d}/${note.id.split("/").at(-1)}`}></option>{/each}</datalist>
</div>

<style>
  .details { padding: 0 2px; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-6); font-size: 12px; color: var(--text-faint); }
  label { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
  .wide { flex: 1 1 160px; }
  .full { flex: 1 1 100%; }
  input { flex: 1 1 auto; min-width: 0; background: none; border: 0; border-bottom: 1px solid transparent; padding: 2px 0; color: var(--text-soft); }
  input.mono { font-family: var(--font-mono); }
  input::placeholder { color: var(--text-faint); opacity: .7; }
  input:hover { border-bottom-color: var(--line); }
  input:focus-visible { outline: none; border-bottom-color: var(--lattice); color: var(--text); }
  .link { background: none; border: 0; padding: 2px 0; color: var(--text-faint); font: inherit; cursor: pointer; }
  .link:hover, .link:focus-visible { color: var(--rose); text-decoration: underline; }
  .ask { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); margin: var(--space-1) 0 0; color: var(--text-soft); }
  .ask span { flex: 1 1 260px; }
  .ask .btn { height: 26px; font-size: 12px; }
  .problem { margin: 0; color: var(--rose); }
</style>
