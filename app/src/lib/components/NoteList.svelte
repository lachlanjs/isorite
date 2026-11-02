<script lang="ts">
  // Every note in the base, by folder, narrowed by typing. Typing matches titles, paths and descriptions at
  // once, and the text of the notes a moment later.
  import { goto } from "$app/navigation";
  import type { NoteSummary, SearchHit } from "@isorite/engine";
  import { app, noteHref, slug } from "$lib/app.svelte.ts";
  import FolderField from "$lib/components/FolderField.svelte";
  import NoteMenu from "$lib/components/NoteMenu.svelte";
  import { panes } from "$lib/panes.svelte.ts";

  let query = $state("");
  let hits = $state.raw<SearchHit[]>([]);
  let making = $state(false);
  let title = $state("");
  let folder = $state("");
  let problem = $state("");
  // A note being dragged (M31) and the folder it is over; the menu on each row does the same by keyboard and touch.
  let dragged = $state<string | null>(null);
  let carrying: string | null = null; // set at once; `dragged` a moment later, since changing the page in dragstart cancels the drag
  let over = $state<string | null>(null);
  let folding = $state(false);
  let path = $state("");
  let said = $state("");

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (n: NoteSummary) => words.every((w) => `${n.title}\n${n.id}\n${n.description}`.toLowerCase().includes(w));
  const shown = $derived(words.length ? app.listing.notes.filter(matches) : app.listing.notes);
  const folders = $derived.by(() => {
    const by = new Map<string, NoteSummary[]>();
    // Empty folders are listed too, so a note can be made in one; not while narrowing.
    if (!words.length) for (const dir of app.listing.dirs) by.set(dir, []);
    for (const n of shown) by.set(n.dir, [...(by.get(n.dir) ?? []), n]);
    const sorted = [...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    // The top of the base is somewhere to drop a note too, though nothing be there: at the end, so nothing moves under the pointer.
    if (dragged !== null && !by.has("")) sorted.push(["", []]);
    return sorted;
  });
  // Notes that match in their text and were not already listed by title.
  const inText = $derived(words.length ? hits.filter((h) => !shown.some((n) => n.id === h.id)) : []);

  $effect(() => {
    const q = query.trim();
    if (q.length < 2) { hits = []; return; }
    const timer = setTimeout(() => { void app.api.search(q).then((found) => { if (query.trim() === q) hits = found; }, () => undefined); }, 200);
    return () => clearTimeout(timer);
  });

  const id = $derived([folder.trim().replace(/^\/+|\/+$/g, ""), slug(title)].filter(Boolean).join("/"));

  function start(dir = "") {
    making = true;
    folder = dir;
    title = "";
    problem = "";
  }

  function drag(event: DragEvent, noteId: string) {
    carrying = noteId;
    setTimeout(() => { if (carrying === noteId) dragged = noteId; });
    event.dataTransfer?.setData("text/plain", noteId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }
  function enter(event: DragEvent, dir: string) {
    if (carrying === null) return;
    event.preventDefault();
    over = dir;
  }
  async function drop(event: DragEvent, dir: string) {
    event.preventDefault();
    const noteId = carrying;
    carrying = dragged = over = null;
    if (noteId === null) return;
    const name = noteId.split("/").at(-1)!, to = dir ? `${dir}/${name}` : name;
    if (to === noteId) return;
    said = "";
    try {
      await app.api.moveNote(noteId, to, (await app.api.readNote(noteId)).version);
      await app.refresh();
    } catch (e) {
      said = (e as Error).message;
    }
  }

  async function makeFolder(event: SubmitEvent) {
    event.preventDefault();
    try {
      await app.api.makeFolder(path.trim().replace(/^\/+|\/+$/g, ""));
      folding = false;
      path = "";
      said = "";
      await app.refresh();
    } catch (e) {
      said = (e as Error).message;
    }
  }

  async function make(event: SubmitEvent) {
    event.preventDefault();
    if (!slug(title)) { problem = "Give the note a title."; return; }
    try {
      await app.api.createNote(id, `---\ntype: Concept\ntitle: ${JSON.stringify(title.trim())}\n---\n\n`);
      await app.refresh();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      await goto(noteHref(id));
    } catch (e) {
      problem = (e as Error).message;
    }
  }
</script>

<div class="notes">
  <div class="top">
    <label class="hidden-label" for="filter">Find a note</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="filter" class="field grow" type="search" placeholder="find a note" bind:value={query} autocomplete="off" autofocus />
    <button class="btn quiet" type="button" onclick={() => (folding = !folding)} aria-expanded={folding}>new folder</button>
    <button class="btn primary" type="button" data-tour="new-note" onclick={() => start()}>new note</button>
  </div>

  {#if folding}
    <form class="frame new" onsubmit={makeFolder}>
      <span class="frame-title">a new folder</span>
      <label for="new-folder-path"><span class="label">name, with / for one inside another</span></label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="new-folder-path" class="field" bind:value={path} placeholder="geometry/surfaces" autocomplete="off" autofocus />
      <div class="row"><button class="btn primary" type="submit" disabled={!path.trim()}>make it</button><button class="btn quiet" type="button" onclick={() => (folding = false)}>cancel</button></div>
    </form>
  {/if}
  {#if said}<p class="problem" role="alert">{said}</p>{/if}

  {#if making}
    <form class="frame new" onsubmit={make}>
      <span class="frame-title">a new note</span>
      <label><span class="label">title</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={title} placeholder="Entropy" autocomplete="off" autofocus /></label>
      <label for="new-folder"><span class="label">folder</span></label>
      <FolderField id="new-folder" label="folder" bind:value={folder} placeholder="none: the top of the base" />
      <p class="faint path">{id ? `${id}.md` : " "}</p>
      {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      <div class="row"><button class="btn primary" type="submit">make it</button><button class="btn quiet" type="button" onclick={() => (making = false)}>cancel</button></div>
    </form>
  {/if}

  {#if !app.listing.notes.length && !making}
    <p class="soft empty">This base has no notes yet. Make the first one.</p>
  {/if}

  {#each folders as [dir, notes] (dir)}
    <!-- svelte-ignore a11y_no_static_element_interactions -- a drop target only; the row's menu moves a note by keyboard -->
    <section class:over={over === dir && dragged !== null} ondragenter={(e) => enter(e, dir)} ondragover={(e) => enter(e, dir)} ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) over = null; }} ondrop={(e) => void drop(e, dir)}>
      <h2><span class="label">{dir || "the top of the base"}</span><button class="btn quiet add" type="button" onclick={() => start(dir)} aria-label={`New note in ${dir || "the top of the base"}`}>+</button></h2>
      <ul>
        {#each notes as n (n.id)}
          <li draggable="true" ondragstart={(e) => drag(e, n.id)} ondragend={() => (carrying = dragged = over = null)} class:lifted={dragged === n.id}><a class="vein-row" class:on={n.id === panes.last} data-lustre href={noteHref(n.id)}><span class="serif title">{n.title}</span>{#if n.description}<span class="soft desc">{n.description}</span>{/if}</a><NoteMenu id={n.id} title={n.title} /></li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if inText.length}
    <section>
      <h2><span class="label">in the text</span></h2>
      <ul>
        {#each inText as h (h.id)}
          <li><a class="vein-row" class:on={h.id === panes.last} data-lustre href={noteHref(h.id)}><span class="serif title">{h.title}</span><span class="soft desc">{h.snippet}</span></a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if words.length && !shown.length && !inText.length}
    <p class="soft empty">No note matches.</p>
  {/if}
</div>

<style>
  .notes { max-width: var(--measure); margin: 0 auto; padding: var(--space-8) var(--space-4) var(--space-16); display: flex; flex-direction: column; gap: var(--space-6); }
  .top { display: flex; gap: var(--space-3); }
  .new { padding: var(--space-6) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
  .new label { display: flex; flex-direction: column; gap: var(--space-1); }
  .new .path { min-height: 1.5em; overflow-wrap: anywhere; }
  .row { display: flex; gap: var(--space-2); }
  .problem { color: var(--rose); }
  .empty { padding: var(--space-8) 0; text-align: center; }
  h2 { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); font-weight: 400; min-height: 28px; }
  .add { height: 24px; }
  /* A folder a note is over (M31): it is outlined, with no motion (gold is Iso's alone). */
  section.over { outline: 1px dashed var(--text-soft); outline-offset: 4px; }
  section.over h2 { border-bottom-color: var(--text-soft); }
  li.lifted { opacity: 0.45; }
  ul { list-style: none; margin: 0; padding: 0; }
  /* Rows with a vein (M24, D): the note last open is chosen. */
  li { position: relative; }
  li :global(.menu) { position: absolute; right: 0; top: 6px; }
  li a { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) 44px var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); color: var(--text); }
  li a:hover { text-decoration: none; }
  .title { font-size: 18px; line-height: 1.3; }
  .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
