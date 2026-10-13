<script lang="ts">
  // Every note in the base, by folder, narrowed by typing. Typing matches titles, paths and descriptions at
  // once, and the text of the notes a moment later.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { DraftSummary, NoteSummary, SearchHit } from "@isorite/engine";
  import { app, noteHref, slug } from "$lib/app.svelte.ts";

  let query = $state("");
  let hits = $state.raw<SearchHit[]>([]);
  let making = $state(false);
  let title = $state("");
  let folder = $state("");
  let problem = $state("");

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (n: NoteSummary) => words.every((w) => `${n.title}\n${n.id}\n${n.description}`.toLowerCase().includes(w));
  const shown = $derived(words.length ? app.listing.notes.filter(matches) : app.listing.notes);
  const folders = $derived.by(() => {
    const by = new Map<string, NoteSummary[]>();
    // Empty folders are listed too, so a note can be made in one; not while narrowing.
    if (!words.length) for (const dir of app.listing.dirs) by.set(dir, []);
    for (const n of shown) by.set(n.dir, [...(by.get(n.dir) ?? []), n]);
    return [...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  });
  // Notes that match in their text and were not already listed by title.
  const inText = $derived(words.length ? hits.filter((h) => !shown.some((n) => n.id === h.id)) : []);

  $effect(() => {
    const q = query.trim();
    if (q.length < 2) { hits = []; return; }
    const timer = setTimeout(() => { void app.api.search(q).then((found) => { if (query.trim() === q) hits = found; }, () => undefined); }, 200);
    return () => clearTimeout(timer);
  });

  // Notes written for Iso that are waiting, and the way to start one.
  let drafts = $state.raw<DraftSummary[]>([]);
  $effect(() => { void app.api.drafts().then((d) => (drafts = d), () => undefined); });
  async function forIso() {
    try {
      const made = await app.api.createDraft();
      await goto(resolve("/draft/[id]", { id: made.id.slice("@draft/".length) }));
    } catch (e) { problem = (e as Error).message; making = true; }
  }

  const id = $derived([folder.trim().replace(/^\/+|\/+$/g, ""), slug(title)].filter(Boolean).join("/"));

  function start(dir = "") {
    making = true;
    folder = dir;
    title = "";
    problem = "";
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
    <button class="btn primary" type="button" onclick={() => start()}>new note</button>
  </div>

  <!-- Notes for Iso: written to it, not in the base until its reply is kept (the Desktop-Ask board). -->
  {#if app.session?.study}
    <section>
      <h2><span class="label">for Iso · not in your base yet</span><button class="btn quiet add" type="button" onclick={forIso}>new note for Iso</button></h2>
      <ul>
        {#each drafts as d (d.id)}
          <li><a href={resolve("/draft/[id]", { id: d.id.slice("@draft/".length) })}><span class="serif title draft"><i class="dia open" aria-hidden="true"></i>{d.title || "a new note"}</span></a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if making}
    <form class="frame new" onsubmit={make}>
      <span class="frame-title">a new note</span>
      <label><span class="label">title</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={title} placeholder="Entropy" autocomplete="off" autofocus /></label>
      <label><span class="label">folder</span>
        <input class="field" bind:value={folder} placeholder="none: the top of the base" list="folders" autocomplete="off" /></label>
      <datalist id="folders">{#each app.listing.dirs as dir (dir)}<option value={dir}></option>{/each}</datalist>
      <p class="faint path">{id ? `${id}.md` : " "}</p>
      {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      <div class="row"><button class="btn primary" type="submit">make it</button><button class="btn quiet" type="button" onclick={() => (making = false)}>cancel</button></div>
    </form>
  {/if}

  {#if !app.listing.notes.length && !making}
    <p class="soft empty">This base has no notes yet. Make the first one.</p>
  {/if}

  {#each folders as [dir, notes] (dir)}
    <section>
      <h2><span class="label">{dir || "the top of the base"}</span><button class="btn quiet add" type="button" onclick={() => start(dir)} aria-label={`New note in ${dir || "the top of the base"}`}>+</button></h2>
      <ul>
        {#each notes as n (n.id)}
          <li><a href={noteHref(n.id)}><span class="serif title">{n.title}</span>{#if n.description}<span class="soft desc">{n.description}</span>{/if}</a></li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if inText.length}
    <section>
      <h2><span class="label">in the text</span></h2>
      <ul>
        {#each inText as h (h.id)}
          <li><a href={noteHref(h.id)}><span class="serif title">{h.title}</span><span class="soft desc">{h.snippet}</span></a></li>
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
  ul { list-style: none; margin: 0; padding: 0; }
  li a { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) 0; border-bottom: 1px solid var(--line); color: var(--text); }
  li a:hover { text-decoration: none; background: var(--ground-1); }
  .title { font-size: 18px; line-height: 1.3; }
  .title.draft { display: flex; align-items: center; gap: 12px; }
  .title.draft .dia { margin-left: 3px; }
  .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
