<script lang="ts">
  // Every note in the base, by folder, narrowed by typing. Typing matches titles, paths and descriptions at
  // once, and the text of the notes a moment later.
  import { goto } from "$app/navigation";
  import type { NoteSummary, SearchHit } from "@isorite/engine";
  import { app, noteHref, slug } from "$lib/app.svelte.ts";
  import FolderField from "$lib/components/FolderField.svelte";
  import { resolve } from "$app/paths";
  import { Gesture, type Item } from "$lib/gesture.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import HoldTags from "$lib/components/HoldTags.svelte";
  import NoteMenu from "$lib/components/NoteMenu.svelte";
  import { panes } from "$lib/panes.svelte.ts";

  let query = $state("");
  let hits = $state.raw<SearchHit[]>([]);
  let making = $state(false);
  let title = $state("");
  let folder = $state("");
  let problem = $state("");
  // Press and hold on a note or a folder's heading (M33): tags to move, delete or send it. The menu on each row does
  // the same by keyboard.
  const g = new Gesture({
    move: (item, dir) => void moveItem(item, dir),
    remove: (item) => void askRemove(item),
    send: (item) => send(item),
  });
  let asking = $state.raw<{ item: Item; text: string; empty: boolean } | null>(null);
  const dragged = $derived(g.phase === "moving" ? g.item?.id ?? null : null);
  const over = $derived(g.phase === "moving" ? g.over : null);
  let folding = $state(false);
  let renaming = $state<string | null>(null), draft = $state("");
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };
  async function rename(dir: string) {
    const name = draft.trim().replace(/^\/+|\/+$/g, ""), parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
    renaming = null;
    if (!name || name === last(dir)) return;
    said = "";
    try { await app.api.moveFolder(dir, [parent, name].filter(Boolean).join("/")); await app.refresh(); } catch (e) { said = (e as Error).message; }
  }
  let sent = $state("");
  let sentTimer: ReturnType<typeof setTimeout> | undefined;
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

  const tagged = (tag: "delete" | "send", id: string) => g.phase === "held" && g.tag === tag && g.item?.id === id;
  const last = (id: string) => id.split("/").at(-1)!;
  async function moveItem(item: Item, dir: string) {
    said = "";
    try {
      if (item.kind === "folder") {
        const to = dir ? `${dir}/${last(item.id)}` : last(item.id);
        if (to !== item.id) await app.api.moveFolder(item.id, to);
      } else {
        const to = dir ? `${dir}/${last(item.id)}` : last(item.id);
        if (to !== item.id) await app.api.moveNote(item.id, to, (await app.api.readNote(item.id)).version);
      }
      await app.refresh();
    } catch (e) {
      said = (e as Error).message;
    }
  }
  async function askRemove(item: Item) {
    said = "";
    try {
      if (item.kind === "folder") {
        const n = app.listing.notes.filter((x) => x.dir === item.id || x.dir.startsWith(`${item.id}/`)).length;
        if (n) { said = `${item.id} holds ${n} ${n === 1 ? "note" : "notes"}: move or delete ${n === 1 ? "it" : "them"} first.`; return; }
        asking = { item, empty: true, text: `Delete the empty folder ${item.id}?` };
        return;
      }
      const map = await app.api.map();
      const linked = [...new Set(map.model.edges.filter(([from, to]) => to === item.id && from !== item.id && !from.startsWith("@")).map(([from]) => map.notes[from]?.title || from))];
      asking = { item, empty: false, text: `Delete “${item.title}”? ${linked.length ? `${linked.length === 1 ? "One note links" : `${linked.length} notes link`} to it (${linked.join(", ")}); ${linked.length === 1 ? "its link is" : "their links are"} left broken.` : "No note links to it."} Its history stays.` };
    } catch (e) {
      said = (e as Error).message;
    }
  }
  async function confirmRemove() {
    const a = asking;
    asking = null;
    if (!a) return;
    try {
      if (a.item.kind === "folder") await app.api.deleteFolder(a.item.id);
      else {
        await app.api.deleteNote(a.item.id, (await app.api.readNote(a.item.id)).version);
        if (app.open === a.item.id) await goto(resolve("/notes"), { replaceState: true });
      }
      await app.refresh();
    } catch (e) {
      said = (e as Error).message;
    }
  }
  function send(item: Item) {
    const put = tray.add({ kind: item.kind, id: item.id, title: item.title });
    said = "";
    sent = put ? `${item.title} is with the agent.` : `${item.title} was with the agent already.`;
    clearTimeout(sentTimer);
    sentTimer = setTimeout(() => (sent = ""), 4000);
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

  {#snippet tags(kind: "note" | "folder", id: string)}
    {#if g.item?.kind === kind && g.item.id === id}<HoldTags {g} mode="row" />{/if}
  {/snippet}

  {#if sent}<p class="soft" role="status">{sent}</p>{/if}
  {#if asking}
    <!-- Over the list, at the top of what is in view, however far down the row asked about was: the list stays where it was. -->
    <div class="ask-at"><div class="frame ask" role="alertdialog" aria-label="Delete">
      <span>{asking.text}</span>
      <div class="row"><button class="btn danger" type="button" onclick={() => void confirmRemove()}>{asking.item.kind === "folder" ? `delete ${asking.item.id}` : "delete"}</button><button class="btn quiet" type="button" onclick={() => (asking = null)}>keep it</button></div>
    </div></div>
  {/if}
  <HoldTags {g} mode="ghost" />

  {#each folders as [dir, notes] (dir)}
    <section data-dir={dir} style:margin-left="{dir ? dir.split("/").length * 14 : 0}px" class:over={over === dir && dragged !== null}>
      <h2 class="head" class:lifted={dragged === dir && dir !== ""} class:doomed={tagged("delete", dir)} class:sending={tagged("send", dir)} use:g.press={() => ({ kind: "folder", id: dir, title: dir })}>{#if renaming === dir && dir}<input class="field rename" aria-label="Rename the folder {dir}" bind:value={draft} use:focus onkeydown={(e) => { if (e.key === "Enter") void rename(dir); else if (e.key === "Escape") renaming = null; }} onblur={() => (renaming = null)} />{:else}<span class="label" ondblclick={() => { if (dir) { draft = last(dir); renaming = dir; } }} role="presentation">{dir || "the top of the base"}</span>{/if}<span class="acts"><button class="btn quiet add" type="button" onclick={() => start(dir)} aria-label={`New note in ${dir || "the top of the base"}`}>+</button>{#if dir}<button class="btn quiet" type="button" onclick={() => { draft = last(dir); renaming = dir; }} aria-label={`Rename the folder ${dir}`}>rename</button>{/if}{#if dir && !notes.length}<button class="btn quiet" type="button" onclick={() => void askRemove({ kind: "folder", id: dir, title: dir })} aria-label={`Delete the empty folder ${dir}`}>delete</button>{/if}</span>{@render tags("folder", dir)}</h2>
      <ul>
        {#each notes as n (n.id)}
          <li class:lifted={dragged === n.id} class:doomed={tagged("delete", n.id)} class:sending={tagged("send", n.id)} use:g.press={() => ({ kind: "note", id: n.id, title: n.title })}><a class="vein-row" class:on={n.id === panes.last} data-lustre draggable="false" href={noteHref(n.id)}><span class="serif title">{n.title}</span>{#if n.description}<span class="soft desc">{n.description}</span>{/if}</a><NoteMenu id={n.id} title={n.title} />{@render tags("note", n.id)}</li>
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
  .rename { height: 24px; padding: 0 6px; width: min(260px, 60%); }
  /* A folder a note is over (M31): it is outlined, with no motion (gold is Iso's alone). */
  section.over { outline: 1px dashed var(--text-soft); outline-offset: 4px; }
  section.over h2 { border-bottom-color: var(--text-soft); }
  li.lifted, h2.lifted { opacity: 0.45; }
  /* Held (M33): the tags, and the item tinted for what letting go would do. Blue moves, red deletes, gold is Iso's. */
  li.doomed, h2.doomed { background: var(--rose-soft); }
  li.sending, h2.sending { background: var(--growth-soft); }
  .head { position: relative; }
  .acts { display: flex; gap: var(--space-2); }
  .ask-at { position: sticky; top: 8px; height: 0; z-index: 40; }
  .ask { position: absolute; left: 0; right: 0; top: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); filter: var(--lift-drop); animation: appear var(--t-change) var(--ease-out); }
  .notes:has(:global(.tags)), .notes:has(:global(.ghost)) { user-select: none; -webkit-user-select: none; }
  li, .head { touch-action: pan-y; -webkit-touch-callout: none; }
  ul { list-style: none; margin: 0; padding: 0; }
  /* Rows with a vein (M24, D): the note last open is chosen. */
  li { position: relative; }
  li :global(.menu) { position: absolute; right: 0; top: 6px; }
  li a { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) 44px var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); color: var(--text); }
  li a:hover { text-decoration: none; }
  .title { font-size: 18px; line-height: 1.3; }
  .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
