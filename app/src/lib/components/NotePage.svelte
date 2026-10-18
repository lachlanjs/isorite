<script lang="ts">
  import SendToAgent from "./SendToAgent.svelte";
  import { agentName } from "$lib/agents.ts";
  import { resolve } from "$app/paths";
  // A note, open for writing: its title, its details when they are wanted, and its text. Saving is the
  // session's business (note.svelte.ts); this shows how it stands and offers the choice when a save is refused.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { isStudyId, moments, textAt, touched as touchedBy, type Insert, type Moment, type Rewrite } from "@isorite/core";
  import type { StudyReport } from "@isorite/engine";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { ExerciseState, moveText } from "$lib/exercise.svelte.ts";
  import { NoteIso } from "$lib/iso.svelte.ts";
  import { NoteSession } from "$lib/note.svelte.ts";
  import NoteDetails from "./NoteDetails.svelte";
  import NoteEditor from "./NoteEditor.svelte";
  import NoteVersion from "./NoteVersion.svelte";
  import Timeline from "./Timeline.svelte";
  import { ago, describe, momentKey } from "$lib/timeline.ts";
  import type { Touched } from "$lib/editor/overlays.ts";

  let { id }: { id: string } = $props();

  // One session for the page's life: the route gives each note its own page ({#key}).
  // svelte-ignore state_referenced_locally
  const note = new NoteSession(id);
  const iso = new NoteIso(note);
  // svelte-ignore state_referenced_locally
  const exercise = isStudyId(id) ? new ExerciseState(note, iso) : null;
  const ex = $derived(exercise?.is ? exercise : null);
  let why = $state(false);
  const KINDS: Record<string, string> = { written: "written response" };
  const titleOf = (n: string): string => app.listing.notes.find((x) => x.id === n)?.title ?? n.split("/").at(-1)!;

  // A note of the base, in study (Study-Fit): its squares in the margin, the exercises that test it, and the way to
  // ask for one. Project mode shows none of this.
  // svelte-ignore state_referenced_locally
  const studied = !id.startsWith("@") && Boolean(app.session?.study);
  let report = $state.raw<StudyReport | null>(null);
  let marginProblem = $state("");
  const reading = $derived(report?.notes[id]);
  const testing = $derived(report?.exercises.filter((x) => x.tests.includes(id)).length ?? 0);
  const STEPS = ["not reached", "opened", "worked through", "understood"];
  async function readStudy() { try { report = await app.api.study(); } catch { /* the next event asks again */ } }
  async function askExercise() {
    try {
      const made = await app.api.createExerciseDraft(app.listing.notes.find((n) => n.id === id)?.dir ?? id.split("/").slice(0, -1).join("/"), [id]);
      await goto(resolve("/draft/[id]", { id: made.id.slice("@draft/".length) }));
    } catch (e) { marginProblem = (e as Error).message; }
  }

  const remembered = (key: string): boolean => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
  const remember = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* not kept */ } };
  let details = $state(remembered("isorite.details"));
  let source = $state(false);
  // Frontmatter that cannot be read is mended in the source, where all of the file shows.
  const asSource = $derived(source || note.meta === null);

  // The timeline (Desktop-Editor): open or not is remembered on this device. A moment pointed at marks what it
  // changed; one chosen shows the note as it was just after it, to step from or restore.
  let timeline = $state(remembered("isorite.timeline"));
  let pointed = $state.raw<Moment | null>(null);
  let at = $state.raw<Moment | null>(null);
  let restoring = $state(false), restoreProblem = $state("");
  const all = $derived(moments(iso.entries));
  const isos = (m: Moment) => m.who.startsWith("iso:") || m.who.startsWith("agent:");
  const lines = (runs: { from: number; to: number }[]) => runs.flatMap((r) => Array.from({ length: r.to - r.from }, (_, k) => r.from + k));
  // In the note as it is: the moment pointed at, or, with the timeline open and nothing pointed at, Iso's latest kept.
  const live = $derived.by((): Touched | null => {
    if (!timeline || at || asSource) return null;
    const m = pointed ?? all.findLast((x) => isos(x) && x.what === "kept");
    if (!m) return null;
    const got = lines(touchedBy(iso.entries, m.ids).runs);
    return got.length ? { who: isos(m) ? "iso" : "you", lines: got } : null;
  });
  // The note as it was after the chosen moment, what that moment changed in it, and what Iso offered if not kept.
  const version = $derived.by(() => {
    if (!at) return null;
    const key = momentKey(at), text = textAt(iso.entries, key);
    if (text === null) return null;
    const upTo = iso.entries.filter((e) => e.id <= key);
    const first = iso.entries.find((e) => e.id === at!.ids[0]);
    const offered = at.what === "offered" || at.what === "discarded"
      ? first?.kind === "proposal" ? (first.form === "insert" ? (first as Insert).text : (first as Rewrite).regions.map((r) => r.new).join("\n\n")) : undefined
      : undefined;
    return { text, touched: { who: isos(at) ? "iso" : "you", lines: lines(touchedBy(upTo, at.ids).runs) } as Touched, asked: at.asked, offered };
  });
  // Opened from a moment chosen elsewhere (the Atlas's timeline): `?at=<entry>` shows the note as it was then.
  let wanted = new URLSearchParams(location.hash.split("?")[1] ?? "").get("at");
  $effect(() => {
    if (!wanted) return;
    const m = all.find((x) => x.ids.includes(wanted!));
    if (!m) return;
    wanted = null;
    timeline = true; at = m;
  });
  function toggleTimeline() { timeline = !timeline; remember("isorite.timeline", timeline); if (!timeline) { at = null; pointed = null; } }
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
    void note.open().then(() => iso.open());
    void exercise?.open();
    const unhear = studied ? app.on((e) => { if (e.type === "record" || (e.type === "note-changed" && e.id.startsWith("@study/"))) void readStudy(); }) : null;
    if (studied) void readStudy();
    const leaving = () => { void note.save(); };
    addEventListener("pagehide", leaving);
    document.addEventListener("visibilitychange", leaving);
    return () => {
      removeEventListener("pagehide", leaving);
      unhear?.();
      document.removeEventListener("visibilitychange", leaving);
      iso.close();
      exercise?.close();
      app.exercise = null;
      app.hint = "";
      void note.close();
      app.here = "";
      app.open = "";
      app.saving = null;
    };
  });

  // The header's part of an open exercise: its kind, the squares, wind back and next.
  $effect(() => {
    app.exercise = ex ? { kind: KINDS[ex.ex.kind] ?? ex.ex.kind, squares: ex.squares.squares, due: ex.squares.due, flash: ex.flash, windBack: () => void ex.windBack(), why: () => (why = !why), next: ex.ex.next ? `@study/${ex.ex.next}` : null } : null;
    app.hint = ex ? "write as much as you like · only what you mark is your answer" : "";
  });

  const SAYS = { saved: "saved", unsaved: "not saved yet", saving: "saving", conflict: "changed elsewhere: choose below", failed: "not saved" } as const;
  $effect(() => {
    app.here = note.loaded === "ready" ? note.fields.title || id.split("/").at(-1)! : "";
    app.saving = note.loaded === "ready"
      ? { text: note.saving === "failed" ? `not saved: ${note.message}` : SAYS[note.saving], bad: note.saving === "failed" || note.saving === "conflict" }
      : null;
  });
  // Whose changes wait: Iso's, an agent's, or both.
  const changesFrom = $derived([...new Set(iso.changes.map((c) => agentName(c.proposal.who) || "Iso"))].join(" and "));
  // Sending the note, or the passage chosen in it, to the terminal's agent.
  let sending = $state(false);
  const chosen = $derived(iso.cursor && iso.cursor.to > iso.cursor.from ? note.text.slice(iso.cursor.from, iso.cursor.to).trim() : "");
</script>

<svelte:window onkeydown={keys} />

{#snippet clockIcon()}
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1v14" stroke="currentColor" stroke-width="1.2" fill="none" /><rect x="5.5" y="2" width="5" height="3.2" fill="currentColor" /><path d="M8 6.3l2.3 2.3L8 10.9 5.7 8.6z" fill="currentColor" /><rect x="5.5" y="12" width="5" height="3" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
{/snippet}

<article class="note" class:timed={timeline && note.loaded === "ready" && !asSource}>
  {#if note.loaded === "loading"}
    <p class="faint">opening…</p>
  {:else if note.loaded === "missing"}
    <p class="soft">There is no note at <span class="faint">{id}</span>.</p>
    <p><a href={resolve("/notes")}>all notes</a></p>
  {:else if note.loaded === "error"}
    <p class="bad">{note.message}</p>
  {:else}
    {#if note.saving === "conflict"}
      <div class="frame choice" role="alert">
        <span class="frame-title">changed elsewhere</span>
        <p>{note.theirs === null ? "This note was deleted or moved while you were writing." : "This note was changed somewhere else while you were writing. Nothing here has been saved over it."}</p>
        <div class="row">
          <button class="btn primary" type="button" onclick={() => note.keepMine()}>keep mine</button>
          {#if note.theirs}<button class="btn" type="button" onclick={() => note.keepTheirs()}>take theirs</button>{/if}
        </div>
        <p class="faint">Whichever you keep, the other stays in the note's journal.</p>
      </div>
    {/if}

    {#if ex && why}
      <div class="frame why" role="region" aria-label="Iso's read of you">
        <span class="frame-title">Iso's read of you</span>
        {#each ex.ex.tests as t (t)}
          {@const n = ex.study?.notes[t]}
          <div class="reading">
            <span class="soft">{titleOf(t)}</span>
            <span class="squares" aria-label="{n?.squares ?? 0} of 6">{#each [0, 1, 2, 3, 4, 5] as k (k)}<i class="pip" class:lv={k < (n?.squares ?? 0)}></i>{/each}</span>
            {#if n?.due}<span class="label">due</span>{/if}
          </div>
          {#each [...(n?.evidence ?? [])].reverse() as e (e.id)}
            <div class="evidence label"><span class="by">{moveText(e.by)}</span><span>{e.event === "wind-back" ? "you wound it back" : e.why || (e.result ?? "")}</span><span class="grow"></span><span>{e.at.slice(0, 10)}</span></div>
          {:else}
            <div class="evidence label">nothing yet</div>
          {/each}
        {/each}
        <div class="row"><span class="label">rated too highly? one square down for each note it tests</span><span class="grow"></span><button class="link" type="button" onclick={() => ex.windBack()}>[ wind back ]</button></div>
      </div>
    {/if}

    {#if ex && !asSource}
      <div class="tests">
        <span class="label">{KINDS[ex.ex.kind] ?? ex.ex.kind} · tests</span>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
        {#each ex.ex.tests as t (t)}<a href={noteHref(t)}>{titleOf(t)}</a>{:else}<span class="faint">nothing: name a note in its tests</span>{/each}
        <span class="grow"></span>
        <div class="tools">
          <button class="icon" type="button" aria-label="timeline" title="timeline" aria-pressed={timeline} onclick={toggleTimeline}>{@render clockIcon()}</button>
          <button class="btn quiet" type="button" aria-pressed={details} onclick={() => { details = !details; remember("isorite.details", details); }}>details</button>
          <button class="btn quiet" type="button" aria-pressed={asSource} disabled={note.meta === null} onclick={() => (source = !source)}>source</button>
        </div>
      </div>
    {:else}
    <div class="head">
      {#if !asSource}
        <label class="hidden-label" for="title">Title</label>
        <!-- A textarea so a long title wraps instead of running out of sight; a title is still one line of text. -->
        <textarea id="title" class="serif title" rows="1" value={note.fields.title} placeholder={id.split("/").at(-1)} autocomplete="off"
          oninput={(e) => note.setFields({ title: e.currentTarget.value.replace(/\s*\n\s*/g, " ") })}
          onkeydown={(e) => { if (e.key === "Enter") e.preventDefault(); }}></textarea>
      {:else}
        <span class="grow faint">{id}.md{note.meta === null ? ": the frontmatter cannot be read, so the file is shown as it is" : ""}</span>
      {/if}
      <div class="side">
      <div class="tools">
        {#if !asSource}<button class="icon" type="button" aria-label="timeline" title="timeline" aria-pressed={timeline} onclick={toggleTimeline}>{@render clockIcon()}</button>{/if}
        {#if !asSource}<button class="btn quiet" type="button" aria-pressed={details} onclick={() => { details = !details; remember("isorite.details", details); }}>details</button>{/if}
        <button class="btn quiet" type="button" aria-pressed={asSource} disabled={note.meta === null} onclick={() => (source = !source)}>source</button>
        {#if !asSource}<button class="btn quiet" type="button" aria-pressed={sending} onclick={() => (sending = !sending)}>send to agent</button>{/if}
      </div>
      {#if studied && !asSource && report}
        <div class="margin" role="group" aria-label="Iso's read of you">
          <span class="squares" aria-label="{reading?.squares ?? 0} of 6">{#each [0, 1, 2, 3, 4, 5] as k (k)}<i class="pip" class:lv={k < (reading?.squares ?? 0)}></i>{/each}</span>
          {#if testing}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved, with the note to narrow to -->
            <a href={`${resolve("/study")}?note=${encodeURIComponent(id)}`}>{testing} {testing === 1 ? "exercise" : "exercises"}</a>
          {/if}
          <span class="label">{STEPS[reading?.step ?? 0]}{reading?.due ? " · due" : ""}</span>
          <button class="link" type="button" onclick={askExercise}>[ + an exercise ]</button>
          {#if marginProblem}<span class="bad" role="alert">{marginProblem}</span>{/if}
        </div>
      {/if}
      </div>
    </div>
    {/if}
    {#if sending && !asSource}<SendToAgent note={id} passage={chosen} onclose={() => (sending = false)} />{/if}
    {#if details && !asSource}<NoteDetails {note} />{/if}

    {#if timeline && !asSource}
      <div class="tl-col"><Timeline moments={all} at={at ? momentKey(at) : null} {pointed} point={(m) => (pointed = m)} {pick} /></div>
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
      {#key momentKey(at)}<NoteVersion text={version.text} title={note.fields.title} touched={version.touched} asked={version.asked} offered={version.offered} />{/key}
    {/if}

    <div class="live" hidden={Boolean(at && version)}>
      {#key asSource}<NoteEditor {note} {iso} exercise={ex ?? undefined} source={asSource} touched={live} />{/key}
    </div>

    {#if ex && !asSource && !at}
      <!-- The foot of an exercise (Study-Written, Mobile-Study): mark the selection as the answer, send it for marking. -->
      <div class="foot">
        {#if ex.selection && !(ex.answerAt && ex.answerAt.from === ex.selection.from && ex.answerAt.to === ex.selection.to)}
          <button class="btn" type="button" onmousedown={(e) => e.preventDefault()} onclick={() => ex.markAnswer()}>mark as answer</button>
        {/if}
        <button class="btn primary tall" type="button" disabled={!ex.answerAt || ex.marking !== null} onclick={() => ex.send()}>
          {ex.marking !== null ? "marking…" : ex.last ? "mark it again" : "send for marking"}
        </button>
        {#if ex.marking !== null}<span class="label">Iso is marking</span>
        {:else if ex.failed}<span class="bad" role="alert">{ex.failed}</span>
        {:else if !ex.answerAt}<span class="label">select a part of your working, then mark it as your answer</span>
        {:else if ex.last}
          <span class="label moves">moves: {#each ex.moves as m, k (m.note)}{k ? ", " : ""}{titleOf(m.note)} {moveText(m.by)}{/each}</span>
        {/if}
        <span class="grow"></span>
        {#if ex.last?.cost && ex.marking === null}<span class="label">{ex.last.cost.tier} · ${ex.last.cost.usd.toFixed(3)}</span>{/if}
      </div>
    {/if}

    <!-- A rewrite's changes are kept or removed one by one in the text; here, all that are left at once. -->
    {#if iso.changes.length}
      <div class="changes" role="status">
        <i class="dia" aria-hidden="true"></i>
        <span class="soft">{iso.changes.length} {iso.changes.length === 1 ? "change" : "changes"} from {changesFrom} waiting</span>
        <span class="grow"></span>
        <button class="link" type="button" disabled={iso.busy === "all"} onclick={() => iso.settleAll(true)}>[ keep all ]</button>
        <button class="link" type="button" disabled={iso.busy === "all"} onclick={() => iso.settleAll(false)}>[ remove all ]</button>
      </div>
    {/if}

    <!-- On a phone there is no Ctrl+Enter: a field at the foot opens the prompt where the cursor was (Mobile-Note). -->
    {#if iso.prompt === null && !iso.asking}
      <div class="seed"><button class="field" type="button" onclick={() => iso.promptHere()}><span class="faint">›</span><span class="faint">ask Iso here</span></button></div>
    {/if}
  {/if}
</article>

<style>
  .note { position: relative; max-width: calc(var(--measure) + 2 * var(--space-4)); margin: 0 auto; padding: 40px var(--space-4) 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .head { display: flex; align-items: flex-start; gap: var(--space-3); }
  .title { flex: 1 1 auto; min-width: 0; font-size: 34px; line-height: 1.2; font-weight: 700; background: none; border: 0; padding: 0 2px; color: var(--text); resize: none; field-sizing: content; overflow: hidden; }
  .title::placeholder { color: var(--text-faint); }
  .title:focus-visible { outline: none; }
  .tools { display: flex; flex: none; padding-top: 6px; }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); flex: none; }
  .margin { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-size: 12px; padding-top: 2px; }
  .margin .link { font-size: 12px; padding: 0; }
  /* Where the window leaves room, the margin is the page's own, beside the text and level with the title, 8 px down
     (Study-Fit), and the text starts under the title as in any note. */
  @media (min-width: 1100px) { .margin { position: absolute; top: 46px; left: calc(100% + 8px); align-items: flex-start; width: 150px; } }
  .tools .btn { height: 28px; font-size: 12px; }
  .tools .btn[aria-pressed="true"] { color: var(--text); --fill: var(--ground-3); }
  /* The quiet icon buttons: the timeline's, and with a version shown, restore and back to now. Faint until pointed at. */
  .icon { width: 28px; height: 28px; display: inline-grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .icon:hover:not(:disabled), .icon:focus-visible { color: var(--text); }
  .icon[aria-pressed="true"] { color: var(--text-soft); }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .tools .icon { margin-right: 4px; }
  .atbar { display: flex; align-items: center; gap: 6px; min-height: 28px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
  /* The timeline sits in the page's left margin, its button at the top level with the title (Desktop-Editor), its
     marks under it; where there is no margin, it is a narrow column at the note's left (Mobile-Timeline). */
  .tl-col { position: absolute; z-index: 4; }
  @media (min-width: 1100px) {
    .tools .icon { position: absolute; top: 52px; right: calc(100% + 14px); margin: 0; }
    .tl-col { top: 92px; right: calc(100% + 14px); }
  }
  @media (max-width: 1099px) {
    .note.timed { padding-left: calc(var(--space-4) + 40px); }
    .tl-col { top: 40px; left: 8px; }
  }
  .choice { padding: var(--space-6) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); --edge: var(--rose); }
  .row { display: flex; gap: var(--space-2); }
  .bad { color: var(--rose); }
  .changes { position: sticky; bottom: 28px; z-index: 8; display: flex; align-items: center; gap: 12px; padding: 10px 2px; background: var(--ground-0); border-top: 1px solid var(--line); }
  .changes .dia { margin: 0 3px; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; }
  .seed { display: none; }
  .tests { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; padding-top: 16px; }
  .tests .tools { padding-top: 0; }
  .foot { position: sticky; bottom: 28px; z-index: 8; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 16px 0 20px; background: var(--ground-0); border-top: 1px solid var(--line); }
  .foot .moves { min-width: 0; }
  .why { padding: var(--space-6) var(--space-4) var(--space-3); display: flex; flex-direction: column; gap: 6px; margin-top: var(--space-3); }
  .reading { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
  .squares { display: inline-flex; gap: 4px; }
  .evidence { display: flex; gap: 12px; padding-left: 4px; }
  .evidence .by { width: 2.5ch; flex: none; text-align: right; color: var(--text-soft); }
  @media (max-width: 600px) {
    .seed { display: block; position: fixed; left: 0; right: 0; bottom: 84px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--ground-1); z-index: 9; }
    .seed .field { width: 100%; height: 44px; display: flex; align-items: center; gap: 8px; text-align: left; }
    .note { padding: 20px 20px 80px; }
    .note.timed { padding-left: 56px; }
    .tl-col { top: 20px; left: 8px; bottom: 0; z-index: 1; padding-right: 2px; border-right: 1px solid var(--line); background: var(--ground-1); }
    .changes { bottom: 156px; flex-wrap: wrap; }
    .foot { bottom: 156px; gap: 12px; padding: 12px 0; }
    .foot .tall { flex: 1 1 100%; justify-content: center; }
    .head { flex-direction: column-reverse; gap: var(--space-1); }
    .tools { align-self: flex-end; padding-top: 0; }
    .side { align-self: stretch; flex-direction: row-reverse; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; }
    .margin { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
    .title { font-size: 30px; width: 100%; }
  }
</style>
