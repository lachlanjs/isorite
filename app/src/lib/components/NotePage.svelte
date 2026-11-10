<script lang="ts">
  import Drawing from "./Drawing.svelte";
    import { resolve } from "$app/paths";
  // A note, open for writing: its title, its details when they are wanted, and its text. Saving is the
  // session's business (note.svelte.ts); this shows how it stands and offers the choice when a save is refused.
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { doneOf, hasConflict, kindOf, moments, textAt, touched as touchedBy, type Moment } from "@isorite/core";
  import { app, noteHref, slug } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import { wordAuthors } from "@isorite/core";
  import type { Mark } from "$lib/editor/overlays.ts";
  import { NoteJournal } from "$lib/journal.svelte.ts";
  import { NoteSession } from "$lib/note.svelte.ts";
  import NoteLabel from "./NoteLabel.svelte";
  import NoteEditor from "./NoteEditor.svelte";
  import NoteVersion from "./NoteVersion.svelte";
  import Timeline from "./Timeline.svelte";
  import { ago, describe, momentKey } from "@isorite/core";
  import type { Touched } from "$lib/editor/overlays.ts";
  import { swap } from "$lib/motion.ts";

  let { id }: { id: string } = $props();

  // One session for the page's life: the route gives each note its own page ({#key}).
  // svelte-ignore state_referenced_locally
  const note = new NoteSession(id);
  // Opening is quick (a frame or two): the drawing that says so would only blink. It shows when it is slow.
  let slow = $state(false);
  onMount(() => { const t = setTimeout(() => (slow = true), 300); return () => clearTimeout(t); });
  // svelte-ignore state_referenced_locally
  const journal = new NoteJournal(id);

  // Git left markers in it, from a merge it could not finish: it goes on being a note, with the text as it is.
  const torn = $derived(hasConflict(note.text));
  let source = $state(false);
  // Frontmatter that cannot be read is mended in the source, where all of the file shows.
  const asSource = $derived(source || note.meta === null);
  // Read mode (M30): the note as it is read: its title as a heading, the text a little larger and not to be edited, and none
  // of what edits it or hangs from it (the label, the attached questions, the timeline).
  let reading = $state(false);
  const read = $derived(reading && !asSource);

  // The timeline (Desktop-Editor): its switch is in the pane's header (M12). A moment pointed at marks what it
  // changed; one chosen shows the note as it was just after it, to step from or restore.
  const timeline = $derived(panes.on.timeline);
  let pointed = $state.raw<Moment | null>(null);
  let at = $state.raw<Moment | null>(null);
  let restoring = $state(false), restoreProblem = $state("");
  const all = $derived(moments(journal.entries));
  const byAgent = (m: Moment) => m.who.startsWith("iso:") || m.who.startsWith("agent:");
  const lines = (runs: { from: number; to: number }[]) => runs.flatMap((r) => Array.from({ length: r.to - r.from }, (_, k) => r.from + k));
  // In the note as it is: the moment pointed at, or, with the timeline open and nothing pointed at, the agent's latest
  // kept or written.
  const live = $derived.by((): Touched | null => {
    if (!timeline || at || asSource) return null;
    // With provenance on, the agent's words are marked already, so only the moment pointed at is.
    const m = pointed ?? (agentLens ? undefined : all.findLast((x) => byAgent(x) && (x.what === "kept" || x.what === "edited")));
    if (!m) return null;
    const got = lines(touchedBy(journal.entries, m.ids).runs);
    return got.length ? { who: byAgent(m) ? "agent" : "you", lines: got } : null;
  });
  // The note as it was after the chosen moment, and what that moment changed in it.
  const version = $derived.by(() => {
    if (!at) return null;
    const key = momentKey(at), text = textAt(journal.entries, key);
    if (text === null) return null;
    const upTo = journal.entries.filter((e) => e.id <= key);
    return { text, touched: { who: byAgent(at) ? "agent" : "you", lines: lines(touchedBy(upTo, at.ids).runs) } as Touched, asked: at.asked };
  });
  // Opened from a moment chosen elsewhere (the Atlas's timeline): `?at=<entry>` shows the note as it was then.
  // The note may already be open in its pane when the moment is chosen, so the address is followed, not read once.
  const atOf = (): string | null => page.url.searchParams.get("at") ?? new URLSearchParams(location.hash.split("?")[1] ?? "").get("at");
  let wanted = $state(atOf());
  $effect(() => { const w = atOf(); if (w) wanted = w; });
  $effect(() => {
    if (!wanted) return;
    const m = all.find((x) => x.ids.includes(wanted!));
    if (!m) return;
    wanted = null;
    panes.flip("timeline", true); at = m;
  });
  // Provenance (M12; M10's agent lens): the words the agent wrote are marked, and so is what was given to the agent.
  const agentLens = $derived(panes.on.provenance);
  $effect(() => { if (!timeline) { at = null; pointed = null; } });
  const lensMarks = $derived.by((): Mark[] => {
    if (!agentLens || note.loaded !== "ready") return [];
    const out: Mark[] = [];
    // Words: where the journal's text is the note's (not while unsaved typing runs ahead of it).
    const runs = wordAuthors(journal.entries), lines = note.text.split("\n");
    if (runs && runs.length === lines.length) {
      let at = 0;
      for (const [k, line] of lines.entries()) {
        for (const r of runs[k]!) if ((r.who.startsWith("iso:") || r.who.startsWith("agent:")) && r.to <= line.length && line.slice(r.from, r.to).trim()) out.push({ kind: "by-agent", from: at + r.from, to: at + r.to });
        at += line.length + 1;
      }
    }
    for (const p of tray.parts) {
      if (p.kind !== "passage" || p.id !== id) continue;
      const k = note.text.indexOf(p.text);
      if (k >= 0) out.push({ kind: "given", from: k, to: k + p.text.length });
    }
    return out;
  });
  function pick(m: Moment) { restoreProblem = ""; at = at === m ? null : m; }
  function step(by: number) {
    if (!at) return;
    const k = all.indexOf(at) + by;
    if (k >= 0 && k < all.length) at = all[k]!;
  }
  async function restore() {
    if (!at) return;
    restoring = true; restoreProblem = "";
    try { await note.restore(momentKey(at)); at = null; } catch (e) { restoreProblem = (e as Error).message; } finally { restoring = false; }
  }
  // While a version is shown: ← and → step through the moments, Escape goes back to now.
  function keys(e: KeyboardEvent) {
    if (!at || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "Escape") { e.preventDefault(); at = null; }
  }

  onMount(() => {
    app.open = id;
    void note.open().then(() => journal.open());
    const leaving = () => { void note.save(); };
    addEventListener("pagehide", leaving);
    document.addEventListener("visibilitychange", leaving);
    return () => {
      removeEventListener("pagehide", leaving);
      document.removeEventListener("visibilitychange", leaving);
      journal.close();
      void note.close();
      app.here = "";
      app.open = "";
      app.saving = null;
    };
  });

  // A note made on the Atlas is "untitled-note" (or "untitled-question", "untitled-problem") until it is named: its
  // first title names its file too.
  async function named(): Promise<void> {
    const name = id.split("/").at(-1)!, title = note.fields.title.trim();
    if (!/^untitled-(note|question|problem)(-\d+)?$/.test(name) || !title || /^untitled (note|question|problem)( \d+)?$/i.test(title)) return;
    const to = [...id.split("/").slice(0, -1), slug(title)].filter(Boolean).join("/");
    if (!slug(title) || app.listing.notes.some((n) => n.id === to)) return;
    try {
      const moved = await note.move(to);
      await app.refresh();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      await goto(noteHref(moved), { replaceState: true });
    } catch { /* it keeps its name: details can move it */ }
  }

  // A note just made on the Atlas opens with its title chosen, to type over (V6).
  $effect(() => {
    if (note.loaded !== "ready" || panes.fresh !== id) return;
    panes.fresh = "";
    void tick().then(() => { const t = document.getElementById("title") as HTMLTextAreaElement | null; t?.focus(); t?.select(); });
  });

  const SAYS = { saved: "saved", unsaved: "not saved yet", saving: "saving", conflict: "changed elsewhere: choose below", failed: "not saved" } as const;
  $effect(() => {
    app.here = note.loaded === "ready" ? note.fields.title || id.split("/").at(-1)! : "";
    app.saving = note.loaded === "ready"
      ? { text: note.saving === "failed" ? `not saved: ${note.message}` : SAYS[note.saving], bad: note.saving === "failed" || note.saving === "conflict" }
      : null;
  });
  // A question or a problem (M12): its kind and when it was done, the notes it is about or uses, and on any note,
  // the questions and problems attached to it.
  const kind = $derived(kindOf(String(note.meta?.type ?? "")));
  const done = $derived(kind === "note" ? null : doneOf(note.meta ?? {}, kind));
  const attached = $derived(app.listing.notes.filter((n) => n.kind && n.id !== id && n.attached?.includes(id)).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "question" ? -1 : 1)));
  let marking = $state(false);
  async function toggleDone(): Promise<void> {
    marking = true;
    try { await note.setDone(!done); } catch { /* said by the session's saving state */ } finally { marking = false; }
  }

  let noteEl = $state<HTMLElement>();
</script>

<svelte:window onkeydown={keys} />

{#snippet glyph(k: "note" | "question" | "problem", solved: boolean)}
  <svg class="glyph {k}" class:solved viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">
    {#if k === "question"}<path d="M8 2.5L13.5 8L8 13.5L2.5 8Z" fill={solved ? "currentColor" : "none"} />{:else}<path d="M8 2.5l5.8 10.5H2.2z" fill={solved ? "currentColor" : "none"} />{/if}
  </svg>
{/snippet}


<article class="note" bind:this={noteEl} class:ready={note.loaded === "ready"} class:reading={read} class:timed={timeline && note.loaded === "ready" && !asSource && !read}>
  {#if note.loaded === "loading"}
    {#if slow}<p class="faint opening"><Drawing label="opening" /></p>{/if}
  {:else if note.loaded === "missing"}
    <p class="soft">There is no note at <span class="faint">{id}</span>.</p>
    <p><a href={resolve("/notes")}>all notes</a></p>
  {:else if note.loaded === "error"}
    <p class="bad">{note.message}</p>
  {:else}
    {#if note.saving === "conflict"}
      <div class="frame choice" role="alert">
        <span class="frame-title">changed elsewhere</span>
        <p>{note.theirs === null ? "Deleted or moved elsewhere while you wrote." : "This note was changed somewhere else while you wrote. Nothing was saved over it."}</p>
        <div class="row">
          <button class="btn primary" type="button" onclick={() => note.keepMine()}>keep mine</button>
          {#if note.theirs}<button class="btn" type="button" onclick={() => note.keepTheirs()}>take theirs</button>{/if}
        </div>
        <p class="faint">The other stays in the journal.</p>
      </div>
    {/if}

    {#if torn}
      <div class="frame torn" role="alert">
        <span class="frame-title">merge conflict</span>
        <p>Keep one side between <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>, then delete the markers.</p>
      </div>
    {/if}

    <div class="head">
      {#if read}
        <div class="titlerow">
        {#if kind !== "note"}{@render glyph(kind, !!done)}{/if}
        <h1 class="serif title read">{note.fields.title || id.split("/").at(-1)}</h1>
        </div>
      {:else if !asSource}
        <div class="titlerow">
        {#if kind !== "note"}{@render glyph(kind, !!done)}{/if}
        <label class="hidden-label" for="title">Title</label>
        <!-- A textarea so a long title wraps instead of running out of sight; a title is still one line of text. -->
        <textarea id="title" class="serif title" rows="1" value={note.fields.title} placeholder={id.split("/").at(-1)} autocomplete="off"
          oninput={(e) => note.setFields({ title: e.currentTarget.value.replace(/\s*\n\s*/g, " ") })}
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} onblur={() => void named()}></textarea>
        </div>
      {:else}
        <span class="grow faint path">{id}.md{#if note.meta === null}<span class="broken"> · frontmatter broken: fix it here</span>{/if}</span>
      {/if}
      <div class="side">
      <!-- Three modes of one thing, one control (design audit, P1); pressed again, read or source goes back to editing. -->
      <div class="tools segs" role="group" aria-label="Mode">
        <button type="button" aria-pressed={!read && !asSource} disabled={note.meta === null} title="Edit" onclick={() => swap(() => { reading = false; source = false; })}>edit</button>
        <button type="button" aria-pressed={read} disabled={asSource} title="Read mode" onclick={() => swap(() => (reading = !reading))}>read</button>
        <button type="button" aria-pressed={asSource} disabled={note.meta === null} title="The file as it is" onclick={() => swap(() => { reading = false; source = !source; })}>source</button>
      </div>
      </div>
    </div>
    {#if !asSource && !read}<NoteLabel {note} {kind} {done} {marking} onmark={() => void toggleDone()} />{/if}

    {#if timeline && !asSource && !read}
      <div class="tl-col"><Timeline moments={all} strata at={at ? momentKey(at) : null} {pointed} point={(m) => (pointed = m)} {pick} /></div>
    {/if}

    {#if at && version}
      <div class="atbar" role="status">
        <span class="label">{describe(at)} · {ago(at.at)}</span>
        <span class="grow"></span>
        {#if restoreProblem}<span class="bad" role="alert">{restoreProblem}</span>{/if}
        <button class="icon" type="button" aria-label="restore to here" title="restore to here" disabled={restoring || version.text === note.text} onclick={restore}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 9.5A5 5 0 1 0 4.6 4.3" stroke="currentColor" stroke-width="1.3" fill="none" /><path d="M3 1.8v3.4h3.4" stroke="currentColor" stroke-width="1.3" fill="none" /></svg>
        </button>
        <button class="icon" type="button" aria-label="back to now" title="back to now" onclick={() => (at = null)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8h9M8 4.8 11.2 8 8 11.2" stroke="currentColor" stroke-width="1.3" fill="none" /><path d="M13.5 3v10" stroke="currentColor" stroke-width="1.3" /></svg>
        </button>
      </div>
      {#key momentKey(at)}<NoteVersion id={note.id} text={version.text} title={note.fields.title} touched={version.touched} asked={version.asked} />{/key}
    {/if}

    <div class="live" hidden={Boolean(at && version)}>
      {#key `${asSource}${read}`}<NoteEditor {note} source={asSource} reading={read} touched={live} lens={lensMarks} />{/key}
    </div>

    {#if attached.length && !asSource && !at && !read}
      <!-- What is attached to it, by kind (M12): its questions, then its problems. -->
      <ul class="attached">
        {#each attached as a (a.id)}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
          <li><a href={noteHref(a.id)} class:done={!!a.done && a.kind === "question"}>{@render glyph(a.kind ?? "question", !!a.done)}<span>{a.title}</span>{#if a.done}<svg class="ok" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8.5l3 3 7-7" /></svg>{/if}</a></li>
        {/each}
      </ul>
    {/if}

  {/if}
</article>

<style>
  /* A note opened comes in, rather than taking the place of the one before between one frame and the next (with a frame of
     nothing between them). Only its opacity: what it holds is already where it will stay. */
  .note.ready, .opening { animation: arrive var(--t-change) var(--ease-out); }
  @keyframes arrive { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .note.ready, .opening { animation: none; } }
  /* Room after the end, so the last line can be written somewhere other than the pane's bottom edge. */
  .note { position: relative; max-width: calc(var(--measure) + 2 * var(--space-4)); margin: 0 auto; padding: 40px var(--space-4) 30vh; display: flex; flex-direction: column; gap: var(--space-2); }
  .head { display: flex; align-items: flex-start; gap: var(--space-3); }
  /* Read mode (M30): a heading, set larger, with room round it; the tools stay at the corner to leave it. */
  .reading { --text-size: 20px; padding-top: 64px; }
  .reading .title.read { margin: 0; font-size: 34px; line-height: 1.2; }
  .reading .tools { opacity: .6; transition: opacity var(--dur-1) var(--ease-out); }
  .reading .tools:hover, .reading .tools:focus-within { opacity: 1; }
  .title { flex: 1 1 auto; min-width: 0; font-size: 34px; line-height: 1.2; font-weight: 700; background: none; border: 0; padding: 0 2px; color: var(--text); resize: none; field-sizing: content; overflow: hidden; }
  .title::placeholder { color: var(--text-faint); }
  .title:focus-visible { outline: none; }
  .tools { margin-top: 6px; }
  .path { font-size: var(--fs-small); padding-top: 8px; }
  .broken { color: var(--rose); }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); flex: none; }
  /* Where the pane leaves room (a container query: the note may stand beside the Atlas), the margin is the page's own, beside the text and level with the title, 8 px down
     (Study-Fit), and the text starts under the title as in any note. */
  /* The quiet icon buttons: the timeline's, and with a version shown, restore and back to now. Faint until pointed at. */
  .icon { width: 28px; height: 28px; display: inline-grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .icon:hover:not(:disabled), .icon:focus-visible { color: var(--text); }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .titlerow { flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-start; gap: var(--space-2); }
  .titlerow > .glyph { flex: none; margin-top: 13px; }
  .glyph.question { color: var(--rose); }
  .glyph.problem { color: var(--text-soft); }
  .glyph.problem.solved { color: var(--malachite); }
  .attached { list-style: none; margin: 32px 0 0; padding: 10px 0 0; border-top: 1px solid var(--line-faint); display: flex; flex-direction: column; }
  .attached a { display: grid; grid-template-columns: 18px minmax(0, 1fr) 14px; gap: 10px; align-items: center; padding: 6px 0; font: 15px var(--font-text); color: var(--text); text-decoration: none; }
  .attached a:hover span { color: var(--lattice); }
  .attached a.done span { color: var(--text-faint); }
  .attached .ok { color: var(--malachite); }
  .atbar { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 2px 4px 2px 10px; background: var(--fill-hover); }
  /* The timeline sits in the page's left margin, level with the title (Desktop-Editor); where there is no margin,
     it is a narrow column at the note's left (Mobile-Timeline). */
  .tl-col { position: absolute; z-index: 4; }
  @container page (min-width: 1100px) {
    .tl-col { top: 52px; right: calc(100% + 14px); }
  }
  @container page (max-width: 1099px) {
    .note.timed { padding-left: calc(var(--space-4) + 40px); }
    .tl-col { top: 40px; left: 8px; }
  }
  /* Held at the top of the pane, over the note: it comes when the note is saved, and you may be far down it then, where
     at the head of the note it was out of sight and nothing said why the note had stopped saving. */
  .torn { margin-bottom: var(--space-4); padding: var(--space-6) var(--space-4) var(--space-4); --edge: var(--rose); }
  .torn p { margin: 0; color: var(--text-soft); }
  .choice { position: sticky; top: var(--space-3); z-index: 5; filter: var(--lift-drop); animation: appear var(--t-change) var(--ease-out); padding: var(--space-6) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); --edge: var(--rose); }
  .row { display: flex; gap: var(--space-2); }
  .bad { color: var(--rose); }
  /* A narrow pane (M10) lays the head out as a phone does: the title under the tools, the whole width. */
  @container page (max-width: 600px) {
    .head { flex-direction: column-reverse; gap: var(--space-1); }
    .tools { align-self: flex-end; padding-top: 0; }
    .side { align-self: stretch; flex-direction: row-reverse; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 30px; width: 100%; }
  }
  @media (max-width: 600px) {
    .note { padding: 20px 20px 30vh; }
    .note.timed { padding-left: 56px; }
    .tl-col { top: 20px; left: 8px; bottom: 0; z-index: 1; padding-right: 2px; border-right: 1px solid var(--line); background: var(--ground-1); }
      .head { flex-direction: column-reverse; gap: var(--space-1); }
    .tools { align-self: flex-end; padding-top: 0; }
    .side { align-self: stretch; flex-direction: row-reverse; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 30px; width: 100%; }
  }
</style>
