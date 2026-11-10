<script lang="ts">
  // Every note in the base, by folder, narrowed by typing. Typing matches titles, paths and descriptions at
  // once, and the text of the notes a moment later.
  import { goto } from "$app/navigation";
  import type { NoteSummary, SearchHit } from "@isorite/engine";
  import { app, noteHref, slug } from "$lib/app.svelte.ts";
  import FolderField from "$lib/components/FolderField.svelte";
  import { resolve } from "$app/paths";
  import { Gesture, type Item } from "$lib/gesture.svelte.ts";
  import { vanish } from "$lib/flight.ts";
  import { pointers } from "$lib/pointers.svelte.ts";
  import HoldTags from "$lib/components/HoldTags.svelte";
  import NoteMenu from "$lib/components/NoteMenu.svelte";
  import { panes } from "$lib/panes.svelte.ts";
  import Glyph from "$lib/components/Glyph.svelte";
  import type { Glyph as GlyphKind } from "$lib/glyphs.ts";
  import { DUR_2, fadeIn, foldAway, glide, growOpen } from "$lib/motion.ts";

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
    rename: (item) => { draft = last(item.id); renaming = item.id; },
    hide: (item) => { void app.hide(item.id).then(() => { said = ""; sent = `${item.title} is hidden. Hold on open ground on the Atlas to bring it back.`; clearTimeout(sentTimer); sentTimer = setTimeout(() => (sent = ""), 5000); }, (e: Error) => { said = e.message; }); },
  }, { targetOf: (dir) => document.querySelector(`.notes section[data-dir="${CSS.escape(dir)}"] h2`) });
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

  // The files beside the notes that are not notes (artifacts, data, documents, others), listed in their folders as the
  // Atlas has them: found with the map, and again when the notes change.
  type Beside = { ref: string; title: string; kind: GlyphKind; dir: string };
  let besides = $state.raw<Beside[]>([]);
  $effect(() => {
    void app.listing;
    void app.api.map().then((m) => {
      besides = Object.entries(m.files ?? {}).filter(([ref]) => !ref.endsWith("/")).map(([ref, f]) => ({ ref, title: f.title, kind: (f.kind === "image" ? "image" : f.kind) as GlyphKind, dir: ref.split("/").slice(0, -1).join("/") })).filter((f) => !app.isHidden(f.ref));
    }, () => undefined);
  });

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const seenBesides = $derived(words.length ? besides.filter((f) => words.every((w) => `${f.title}\n${f.ref}`.toLowerCase().includes(w))) : besides);
  const besideIn = (dir: string): Beside[] => seenBesides.filter((f) => f.dir === dir);
  const matches = (n: NoteSummary) => words.every((w) => `${n.title}\n${n.id}\n${n.description}`.toLowerCase().includes(w));
  const seen = $derived(app.hidden.length ? app.listing.notes.filter((n) => !app.isHidden(n.id)) : app.listing.notes);
  const shown = $derived(words.length ? seen.filter(matches) : seen);
  const folders = $derived.by(() => {
    const by = new Map<string, NoteSummary[]>();
    // Empty folders are listed too, so a note can be made in one; not while narrowing.
    if (!words.length) for (const dir of app.listing.dirs) if (!app.isHidden(dir)) by.set(dir, []);
    for (const n of shown) by.set(n.dir, [...(by.get(n.dir) ?? []), n]);
    for (const f of seenBesides) if (!by.has(f.dir)) by.set(f.dir, []);
    const sorted = [...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    // The top of the base is somewhere to drop a note too, though nothing be there: at the end, so nothing moves under the pointer.
    if (dragged !== null && !by.has("")) sorted.push(["", []]);
    return sorted;
  });
  // Moving a note (M33), where it would land is shown before it is let go: in the folder it is over, a gap opens at the
  // place it would take there (the list is by path), with its title in it.
  const landing = (dir: string, notes: NoteSummary[]): { at: number; title: string } | null => {
    if (dragged === null || over !== dir || g.item?.kind !== "note") return null;
    const to = dir ? `${dir}/${last(g.item.id)}` : last(g.item.id);
    if (to === g.item.id) return null;
    const rest = notes.filter((n) => n.id !== g.item!.id), at = rest.findIndex((n) => n.id > to);
    return { at: at < 0 ? rest.length : at, title: g.item.title };
  };
  // A list narrowed by typing changes at once (and for a moment after the box is cleared): rows gliding, fading and
  // folding would make finding feel slow. Read when a row's motion starts. Nor while the list first fills (the files
  // beside the notes come a moment after them).
  let typedAt = performance.now();
  const still = (): boolean => words.length > 0 || performance.now() - typedAt < 600;
  // Notes that match in their text and were not already listed by title.
  const inText = $derived(words.length ? hits.filter((h) => !app.isHidden(h.id) && !shown.some((n) => n.id === h.id)) : []);

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
    // It goes before it is gone: folded away where it stands, then deleted (put back if that fails).
    const back = await vanish(document.querySelector(a.item.kind === "folder" ? `.notes section[data-dir="${CSS.escape(a.item.id)}"]` : `.notes li[data-row="${CSS.escape(a.item.id)}"]`));
    try {
      if (a.item.kind === "folder") await app.api.deleteFolder(a.item.id);
      else {
        await app.api.deleteNote(a.item.id, (await app.api.readNote(a.item.id)).version);
        if (app.open === a.item.id) await goto(resolve("/notes"), { replaceState: true });
      }
      await app.refresh();
    } catch (e) {
      back();
      said = (e as Error).message;
    }
  }
  function send(item: Item) {
    const put = !pointers.holds(item.kind, item.id);
    if (put) pointers.toggle(item.kind, item.id, item.title);
    said = "";
    sent = put ? `${item.title} is in your message.` : `${item.title} was in your message already.`;
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
    <input id="filter" class="field grow" type="search" placeholder="Find" bind:value={query} oninput={() => (typedAt = performance.now())} autocomplete="off" autofocus />
    <button class="btn quiet icon-btn" type="button" onclick={() => (folding = !folding)} aria-expanded={folding} aria-label="New folder" title="New folder">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 3.5h4.5l1.5 1.8h7v8.2h-13z" /><path d="M8 7.5v4M6 9.5h4" /></svg>
    </button>
    <button class="btn primary" type="button" data-tour="new-note" onclick={() => start()}>New note</button>
  </div>

  {#if folding}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="frame new" onsubmit={makeFolder} transition:growOpen onkeydown={(e) => { if (e.key === "Escape") folding = false; }}>
      <span class="frame-title">new folder</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="new-folder-path" class="field" bind:value={path} placeholder="geometry/surfaces" aria-label="The new folder's path" autocomplete="off" autofocus />
      <div class="row"><button class="btn primary" type="submit" disabled={!path.trim()}>Create</button><button class="btn quiet" type="button" title="Esc" onclick={() => (folding = false)}>Cancel</button></div>
    </form>
  {/if}
  {#if said}<p class="problem" role="alert">{said}</p>{/if}

  {#if making}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="frame new" onsubmit={make} transition:growOpen onkeydown={(e) => { if (e.key === "Escape") making = false; }}>
      <span class="frame-title">new note</span>
      <label><span class="label">title</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={title} placeholder="Entropy" autocomplete="off" autofocus /></label>
      <label for="new-folder"><span class="label">folder</span></label>
      <FolderField id="new-folder" label="folder" bind:value={folder} placeholder="(top level)" />
      <p class="faint path">{id ? `${id}.md` : " "}</p>
      {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      <div class="row"><button class="btn primary" type="submit">Create</button><button class="btn quiet" type="button" title="Esc" onclick={() => (making = false)}>Cancel</button></div>
    </form>
  {/if}

  {#if !app.listing.notes.length && !making}
    <p class="empty"><button class="btn tall first" type="button" onclick={() => start()}><span aria-hidden="true">+</span> New note</button></p>
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
    {@const lands = landing(dir, notes)}
    <section data-dir={dir} style:margin-left="{dir ? (dir.split("/").length - 1) * 14 : 0}px" class:over={over === dir && dragged !== null} class:toplevel={!dir} animate:glide={{ duration: still() ? 0 : DUR_2 }}>
      <h2 class="head" class:lifted={dragged === dir && dir !== ""} class:doomed={tagged("delete", dir)} class:sending={tagged("send", dir)} use:g.press={() => ({ kind: "folder", id: dir, title: dir })}>{#if renaming === dir && dir}<input class="field rename" aria-label="Rename the folder {dir}" bind:value={draft} use:focus onkeydown={(e) => { if (e.key === "Enter") void rename(dir); else if (e.key === "Escape") renaming = null; }} onblur={() => (renaming = null)} />{:else}<span class="label" ondblclick={() => { if (dir) { draft = last(dir); renaming = dir; } }} role="presentation">{dir || "top level"}</span>{/if}<span class="acts"><button class="act" type="button" onclick={() => start(dir)} aria-label={`New note in ${dir || "the top level"}`} title="New note here"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 3v10M3 8h10" /></svg></button>{#if dir}<button class="act" type="button" onclick={() => { draft = last(dir); renaming = dir; }} aria-label={`Rename the folder ${dir}`} title="Rename"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 13l.6-2.8L11 2.8l2.2 2.2-7.4 7.4z" /></svg></button>{/if}{#if dir && !notes.length && !besides.some((f) => f.dir === dir || f.dir.startsWith(`${dir}/`))}<button class="act danger-text" type="button" onclick={() => void askRemove({ kind: "folder", id: dir, title: dir })} aria-label={`Delete the empty folder ${dir}`} title="Delete"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" /></svg></button>{/if}</span>{@render tags("folder", dir)}</h2>
      <ul>
        {#each notes as n, k (n.id)}
          <li data-row={n.id} class:lifted={dragged === n.id} class:doomed={tagged("delete", n.id)} class:sending={tagged("send", n.id)} use:g.press={() => ({ kind: "note", id: n.id, title: n.title })} animate:glide={{ duration: still() ? 0 : DUR_2 }} in:fadeIn={{ delay: 130, duration: still() ? 0 : DUR_2 }} out:foldAway={{ duration: still() ? 0 : DUR_2 }}>{#if lands?.at === k}<span class="landing" aria-hidden="true" transition:fadeIn={{ duration: 120 }}><span class="serif">{lands.title}</span></span>{/if}<a class="vein-row" class:on={n.id === panes.last} data-lustre draggable="false" href={noteHref(n.id)}><span class="titleline"><span class="serif title">{n.title}</span>{#if n.conflicted}<span class="conflict" role="img" aria-label="Merge conflict" title="Merge conflict">!</span>{/if}</span>{#if n.description}<span class="desc">{n.description}</span>{/if}</a><NoteMenu id={n.id} title={n.title} />{@render tags("note", n.id)}</li>
        {/each}
        {#if lands && lands.at === notes.length}<li class="landing-end" aria-hidden="true"><span class="landing" transition:fadeIn={{ duration: 120 }}><span class="serif">{lands.title}</span></span></li>{/if}
        {#each besideIn(dir) as f (f.ref)}
          <li data-file={f.ref}><a class="vein-row file" class:on={f.ref === panes.last} data-lustre draggable="false" href={noteHref(f.ref)}><span class="title"><Glyph kind={f.kind} size={14} /><span class="serif">{f.title}</span></span>{#if f.title !== f.ref.split("/").at(-1)}<span class="desc">{f.ref.split("/").at(-1)}</span>{/if}</a></li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if inText.length}
    <section>
      <h2><span class="label">Matches in text</span></h2>
      <ul>
        {#each inText as h (h.id)}
          <li><a class="vein-row" class:on={h.id === panes.last} data-lustre href={noteHref(h.id)}><span class="serif title">{h.title}</span><span class="desc">{h.snippet}</span></a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if words.length && !shown.length && !inText.length && !seenBesides.length}
    <p class="soft empty">No note matches.</p>
  {/if}
</div>

<style>
  .notes { max-width: var(--measure); margin: 0 auto; padding: var(--space-8) var(--space-4) var(--space-16); display: flex; flex-direction: column; gap: var(--space-2); }
  .top { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); }
  .icon-btn { padding: 0; width: 32px; justify-content: center; color: var(--text-faint); }
  .new { padding: var(--space-6) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-2) 0 var(--space-4); }
  .new label { display: flex; flex-direction: column; gap: var(--space-1); }
  .new .path { min-height: 1.5em; overflow-wrap: anywhere; font-size: var(--fs-small); }
  .row { display: flex; gap: var(--space-2); }
  .problem { color: var(--rose); }
  .empty { padding: var(--space-8) 0; text-align: center; }
  /* The first move, drawn: an outline, not a sentence. */
  .empty .first { --fill: transparent; outline: 1px dashed var(--line-strong); outline-offset: -1px; color: var(--text-soft); }
  .empty .first:hover { color: var(--text); outline-color: var(--lattice); }
  /* A folder's head: its name in a label's voice, with room above it and no rule (tone and space group, not lines). */
  h2 { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-weight: 400; min-height: 28px; padding: 0 4px 0 var(--space-4); margin-top: var(--space-6); }
  h2 .label { font-size: var(--fs-small); color: var(--text-soft); letter-spacing: .02em; }
  section:first-of-type h2 { margin-top: 0; }
  /* The top level has no head: its notes come first. Only while a note is carried does it say it can be put there. */
  section.toplevel > h2 { min-height: 0; margin: 0; height: 0; overflow: hidden; }
  section.toplevel > h2 .acts { display: none; }
  :global(body:has(.ghost)) section.toplevel > h2 { height: auto; min-height: 28px; overflow: visible; margin-top: var(--space-6); }
  /* The folder's actions, and the menu of a row: where you are, not repeated down the list. On a pointer, shown on hover
     or when the keyboard is in them; on touch, always. */
  .acts { display: flex; gap: 2px; }
  .act { width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--dur-1) var(--ease-out); }
  .act:hover, .act:focus-visible { color: var(--text); }
  .act.danger-text:hover, .act.danger-text:focus-visible { color: var(--rose); }
  @media (hover: hover) {
    .acts, li :global(.menu > .more) { opacity: 0; transition: opacity var(--dur-1) var(--ease-out); }
    h2:hover .acts, h2:focus-within .acts, li:hover :global(.menu > .more), li:focus-within :global(.menu > .more), li :global(.menu > .more[aria-expanded="true"]) { opacity: 1; }
  }
  .conflict { flex: none; display: inline-grid; place-items: center; width: 16px; height: 16px; font: 700 0.6875rem/1 var(--font-ui); color: var(--ground-0); background: var(--rose); clip-path: var(--chosen-cut); }
  .titleline { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .file .title { display: inline-flex; align-items: center; gap: 8px; }
  .file :global(.glyph) { color: var(--text-faint); }
  .rename { height: 24px; padding: 0 6px; width: min(260px, 60%); }
  /* A folder a note is over (M31): it is outlined, with no motion (gold is the agent's alone), and the gap where it would land opens. */
  section.over { outline: 1px dashed var(--text-soft); outline-offset: 4px; }
  /* Where it would land: a line between the rows at that place, with its title on it. Drawn over the list, not in its
     flow, so nothing moves under the pointer while it is carried. */
  .landing { position: absolute; z-index: 3; left: 0; right: 0; top: -2px; height: 2px; background: var(--lattice); pointer-events: none; }
  .landing > span { position: absolute; right: 8px; top: -9px; padding: 0 6px; font-size: 0.8125rem; line-height: 1.125rem; color: var(--lattice); background: var(--ground-0); max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .landing-end { position: relative; height: 0; }
  .landing-end:not(:first-child) { margin-top: -2px; }
  .landing-end .landing { top: 0; }
  li.lifted, h2.lifted { opacity: 0.45; }
  /* Held (M33): the tags, and the item tinted for what letting go would do. Blue moves, red deletes, gold is the agent's. */
  li.doomed, h2.doomed { background: var(--rose-soft); animation: tremble .32s ease-in-out infinite; }
  li.sending, h2.sending { background: var(--growth-soft); box-shadow: inset 2px 0 0 var(--growth); }
  @keyframes tremble { 0%, 100% { translate: 0 0; } 25% { translate: -1px 0; } 75% { translate: 1px 0; } }
  @media (prefers-reduced-motion: reduce) { li.doomed, h2.doomed { animation: none; } }
  .head { position: relative; }
  .ask-at { position: sticky; top: 8px; height: 0; z-index: 40; }
  .ask { position: absolute; left: 0; right: 0; top: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); filter: var(--lift-drop); animation: appear var(--t-change) var(--ease-out); }
  :global(body:has(.ring, .ghost)) .notes { user-select: none; -webkit-user-select: none; }
  li, .head { touch-action: pan-y; -webkit-touch-callout: none; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  /* Rows with a vein (M24, D), no rule between them: space and the raised ground of the one pointed at or chosen. */
  li { position: relative; }
  li :global(.menu) { position: absolute; right: 0; top: 6px; }
  li a { display: flex; flex-direction: column; gap: 2px; padding: 10px 44px 10px var(--space-4); color: var(--text); transition: background-color var(--dur-1) var(--ease-out); }
  li a:hover { text-decoration: none; background: var(--fill-hover); }
  li a.on { background: var(--fill-chosen); }
  .title { font-size: 1rem; line-height: 1.35; }
  .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: italic 0.8125rem/1.4 var(--font-text); color: var(--text-faint); }
</style>
