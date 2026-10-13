<script lang="ts">
  // A note's details: its type, description and tags. One quiet line under the title, and hidden altogether
  // when it is not wanted. Other frontmatter fields are not shown here and are never touched.
  import { app } from "$lib/app.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";

  let { note }: { note: NoteSession } = $props();

  const types = $derived([...new Set(app.listing.notes.map((n) => n.type).filter(Boolean))].sort());
</script>

<div class="details">
  <label><span>type</span><input value={note.fields.type} oninput={(e) => note.setFields({ type: e.currentTarget.value })} list="types" size={Math.max(7, note.fields.type.length)} autocomplete="off" /></label>
  <label class="wide"><span>tags</span><input value={note.fields.tags} onchange={(e) => note.setFields({ tags: e.currentTarget.value })} placeholder="none" autocomplete="off" /></label>
  <label class="full"><span>description</span><input value={note.fields.description} oninput={(e) => note.setFields({ description: e.currentTarget.value })} placeholder="one line on what this note says" autocomplete="off" /></label>
  <datalist id="types">{#each types as t (t)}<option value={t}></option>{/each}</datalist>
</div>

<style>
  .details { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-6); font-size: 12px; color: var(--text-faint); }
  label { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
  .wide { flex: 1 1 160px; }
  .full { flex: 1 1 100%; }
  input { flex: 1 1 auto; min-width: 0; background: none; border: 0; border-bottom: 1px solid transparent; padding: 2px 0; color: var(--text-soft); }
  input::placeholder { color: var(--text-faint); opacity: .7; }
  input:hover { border-bottom-color: var(--line); }
  input:focus-visible { outline: none; border-bottom-color: var(--lattice); color: var(--text); }
</style>
