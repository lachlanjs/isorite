<script lang="ts">
  import { agentName } from "@isorite/core";
  import { resolve } from "$app/paths";
  // The shell: the three panes, and on a phone their tabs. There is no header or status line (M10b): each pane's
  // header holds its own tools, what it is doing, and its settings.
  import "../app.css";
  import "katex/dist/katex.min.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { app } from "$lib/app.svelte.ts";
  import { onMount } from "svelte";
  import AtlasPane from "$lib/components/AtlasPane.svelte";
  import IsoPane from "$lib/components/IsoPane.svelte";
  import NoteList from "$lib/components/NoteList.svelte";
  import PaneHead from "$lib/components/PaneHead.svelte";
  import { converse } from "$lib/converse.svelte.ts";
  import { PANES, panes, type Pane, type Switch } from "$lib/panes.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import IsoSettings from "$lib/components/IsoSettings.svelte";
  import NoteSettings from "$lib/components/NoteSettings.svelte";

  let { children }: { children: Snippet } = $props();
  // The tutorial walks through the app with a coach card (lib/tutorial): in the tutorial's own build, and on the base
  // isorite --tutorial serves, which the session names as the tutorial's. Loaded only then.
  const tutorial = $derived(import.meta.env.MODE === "tutorial" || app.session?.tutorial ? import("$lib/tutorial/Tutorial.svelte") : null);
  // Back from signing in at the provider: Iso's settings open to say how it went.
  if (app.signIn !== null) panes.settings = "iso";

  // The three panes (M10). The Note pane shows the route's page; the Atlas and Iso stand in the shell, so they keep
  // their state while notes open and close.
  const standing = $derived(panes.standing);
  $effect(() => { if (page.route.id === "/n/[...id]" && page.params.id) panes.setLast(page.params.id); });
  // The notes open over a note close when a note is chosen from them.
  $effect(() => { void page.url.href; panes.tree = false; });
  onMount(() => {
    const media = matchMedia("(max-width: 760px)");
    panes.narrow = media.matches;
    const changed = () => { panes.narrow = media.matches; if (panes.narrow) requestAnimationFrame(() => panes.scroll?.(panes.focus)); };
    media.addEventListener("change", changed);
    panes.scroll = (p) => {
      if (!panes.narrow || !row) return;
      const el = row.querySelector<HTMLElement>(`[data-pane="${p}"]`);
      if (el) row.scrollTo({ left: el.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    return () => { media.removeEventListener("change", changed); panes.scroll = null; };
  });
  let row = $state<HTMLElement>();
  // The grid: columns by each pane's width, or the note beside the Atlas over Iso.
  const grid = $derived.by(() => {
    if (panes.layout === "stack" && standing.length === 3) {
      const [a, b] = standing;
      return { template: `"a b" minmax(0, 1fr) "a c" minmax(0, 1fr) / minmax(0, ${panes.widths[a!]}fr) minmax(0, ${panes.widths[b!]}fr)`, areas: Object.fromEntries(standing.map((p, i) => [p, "abc"[i]!])) as Record<string, string> };
    }
    return { template: `minmax(0, 1fr) / ${standing.map((p) => `minmax(0, ${panes.widths[p]}fr)`).join(" ")}`, areas: {} as Record<string, string> };
  });
  // A divider at a pane's left edge moves width between it and the pane to its left.
  function drag(e: PointerEvent, p: Pane): void {
    const el = e.currentTarget as HTMLElement;
    const left = standing[standing.indexOf(p) - 1];
    if (!left || !row) return;
    el.setPointerCapture(e.pointerId);
    const total = standing.reduce((a, x) => a + (panes.layout === "stack" && x === standing[2] ? 0 : panes.widths[x]), 0);
    const px = row.getBoundingClientRect().width / total;
    let x0 = e.clientX;
    const move = (m: PointerEvent) => {
      const d = (m.clientX - x0) / px;
      const a = panes.widths[left] + d, b = panes.widths[p] - d;
      if (a < 0.4 || b < 0.4) return;
      panes.setWidth(left, a); panes.setWidth(p, b); x0 = m.clientX;
    };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  }
  function nudge(e: KeyboardEvent, p: Pane): void {
    const left = standing[standing.indexOf(p) - 1];
    if (!left || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const d = e.key === "ArrowLeft" ? -0.1 : 0.1;
    if (panes.widths[left] + d >= 0.4 && panes.widths[p] - d >= 0.4) { panes.setWidth(left, panes.widths[left] + d); panes.setWidth(p, panes.widths[p] - d); }
    e.preventDefault();
  }
  // On a phone, the pane swiped into view takes the focus.
  function scrolled(): void {
    if (!panes.narrow || !row) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      const p = PANES[Math.round(row!.scrollLeft / row!.clientWidth)];
      if (p && p !== panes.focus) { panes.focus = p; if (p === "iso") panes.unseen = 0; }
    }, 60);
  }
  let settle: ReturnType<typeof setTimeout> | undefined;
  // Keys: Alt+1/2/3 a pane, Alt+←/→ the next, Alt+↑/↓ its lens or Iso's mode, Alt+L the layout. The arrows are left
  // to the editor while you type in it, where they move lines and words.
  function keys(e: KeyboardEvent): void {
    if (e.key === "Escape" && panes.tree) { panes.tree = false; return; }
    // What the editor took (Alt+L, Alt+1… on a link) is its own, not the panes'.
    if (!e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const inEditor = (e.target as HTMLElement | null)?.closest?.(".cm-editor, input, textarea") != null;
    const k = e.key;
    if (k === "1" || k === "2" || k === "3") panes.to(PANES[+k - 1]!);
    else if (k.toLowerCase() === "l" && !panes.narrow) panes.nextLayout();
    else if (inEditor) return;
    else if (k === "ArrowLeft" || k === "ArrowRight") panes.step(k === "ArrowRight" ? 1 : -1);
    else if (SWITCH_KEYS[k.toLowerCase()]) panes.flip(SWITCH_KEYS[k.toLowerCase()]!);
    else return;
    e.preventDefault();
  }
  const NAME: Record<Pane, string> = { note: "Note", atlas: "Atlas", iso: "Iso" };
  // The panes' switches (M12), each its letter with Alt.
  const SWITCH_KEYS: Record<string, Switch> = { p: "provenance", t: "timeline", c: "context", n: "notes", f: "files", r: "run" };
  const inNote = $derived(page.route.id === "/n/[...id]" || page.route.id === "/draft/[id]");
  // Iso's request as the map shows it: running, or how it ended until the map lets it go.
  // A turn in Iso's pane tells itself there; the Atlas's header tells of a request in a note, Iso's of a terminal agent.
  const run = $derived(app.atlas && !app.atlas.pick && app.iso?.start?.place.form !== "turn" ? app.iso : null);
  const running = $derived(run?.state === "reading" || run?.state === "writing");
  const runTitle = $derived(run ? (app.listing.notes.find((n) => n.id === run.note)?.title ?? "your note") : "");
  const stop = (): void => { if (run) void app.api.stop(run.request); };
  // A terminal agent's turn: who it is, and the note it has opened last.
  const agentNamed = $derived(agentName(run?.agent));
  const agentReading = $derived.by(() => {
    const id = run?.steps.findLast((s) => s.opened && !s.failed)?.opened;
    return id ? (app.listing.notes.find((n) => n.id === id)?.title ?? id) : "";
  });
</script>

<svelte:head><title>{inNote && app.here ? `${app.here} · isorite` : "isorite"}</title></svelte:head>

<div class="shell">
  <main class="panes" data-layout={panes.layout} style:grid-template={grid.template} bind:this={row} onscroll={scrolled}>
    {#if app.error}
      <p class="stopped">isorite could not open the base: {app.error}</p>
    {:else}
      {#each PANES as p (p)}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <section class="pane" data-pane={p} aria-label={NAME[p]} hidden={!standing.includes(p)} class:focus={panes.focus === p} class:first={standing[0] === p} class:top={panes.layout === "stack" && standing[1] === p && standing.length === 3} style:grid-area={grid.areas[p]} onpointerdowncapture={() => { if (!panes.narrow) panes.focus = p; }}>
          {#if !panes.narrow && standing[0] !== p && !(panes.layout === "stack" && standing[2] === p)}
            <!-- A focusable separator is a widget (WAI-ARIA window splitter): dragged, or moved with the arrow keys. -->
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="divider" role="separator" aria-orientation="vertical" aria-label="Resize {NAME[p]}" tabindex="0" onpointerdown={(e) => drag(e, p)} onkeydown={(e) => nudge(e, p)}></div>
          {/if}
          {#if p === "note"}
            <PaneHead pane="note" name="Note" settings={noteSettings}>
              {#snippet tools()}
                {#if page.route.id === "/n/[...id]" && !(page.params.id ?? "").startsWith("@")}
                  <!-- The note's Understanding note (M10), in place of the note while pressed. -->
                  <button class="icon" type="button" data-tour="understanding" aria-label="Understanding note" title="Understanding note" aria-pressed={panes.understanding} onclick={() => panes.showUnderstanding()}>
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14.5V7.5M8 7.5L4.6 4.4M8 7.5l3.4-3.1M8 7.5V2.5M4.6 4.4L2.8 4.6M4.6 4.4L4.5 2.4M11.4 4.4l1.8.2M11.4 4.4l.1-2M8 11L5.8 9.6M8 11l2.2-1.4" /></svg>
                  </button>
                {/if}
                {#if inNote && app.saving}<span class="saved" class:bad={app.saving.bad} class:busy={!app.saving.text.startsWith("saved")} title={app.saving.text} role="status"><i aria-hidden="true"></i><span class="hidden-label">{app.saving.text}</span></span>{/if}
                <button class="icon" type="button" aria-label="All notes" title="All notes, and search" aria-pressed={page.route.id === "/notes" || panes.tree} onclick={() => { if (page.route.id !== "/notes") panes.tree = !panes.tree; }}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 3h4M4.5 3v9.5h3M4.5 7.5h3" /><rect x="8" y="5.5" width="5.5" height="3.5" /><rect x="8" y="10.5" width="5.5" height="3.5" /></svg>
                </button>
              {/snippet}
            </PaneHead>
            <div class="pbody note-body">{@render children()}</div>
            {#if panes.tree && page.route.id !== "/notes"}<div class="tree"><NoteList /></div>{/if}
          {:else if p === "atlas"}
            <PaneHead pane="atlas" name="Atlas" settings={atlasSettings}>
              {#snippet tools()}
                <!-- Iso's request in a note, as the Atlas draws it: not for the note open beside it, which says so itself. -->
                {#if run && !run.agent && (!app.open || run.note !== app.open) && (running || !app.atlas?.chosen)}
                  {#if running}
                    <span class="says">{run.note.startsWith("@draft/") ? "your note opens when Iso is done" : `Iso is answering in ${runTitle}`}</span>
                    <button class="link" type="button" onclick={stop}>stop</button>
                  {:else}
                    <span class="says" class:bad={run.state === "failed"} title="click open ground to let its path go">{run.state === "done" ? `Iso is done in ${runTitle}` : run.state === "stopped" ? "Iso was stopped" : `Iso could not answer: ${run.message}`}</span>
                  {/if}
                {:else if app.atlas?.pick}
                  <span class="says">click a note to link it, again to take it away</span>
                {:else if app.atlas?.chosen && app.atlas.steps}
                  <span class="says">{app.atlas.steps} {app.atlas.steps === 1 ? "step" : "steps"} back</span>
                {/if}
                {#if app.atlas?.here}<span class="where soft">{app.atlas.here}</span><button class="btn out" type="button" onclick={app.atlas.out}>↑ out</button>{/if}
              {/snippet}
            </PaneHead>
            <div class="pbody atlas-body"><AtlasPane /></div>
          {:else}
            <PaneHead pane="iso" name="Iso" settings={isoSettings}>
              {#snippet tools()}
                {#if run?.agent}
                  <span class="says" title={running ? "" : "click open ground on the Atlas to let its path go"}>{running ? `${agentNamed} is ${agentReading ? `reading ${agentReading}` : "at work"} in the terminal` : `${agentNamed}'s turn is done`}</span>
                {/if}
                <!-- What the next turn is sent (I8), with how many parts you gave; a new conversation. -->
                <button class="icon ctx" type="button" aria-label="Context" aria-pressed={converse.view === "context"} title="What Iso is sent: what you gave, and the rest" onclick={() => (converse.view = converse.view === "context" ? "chat" : "context")}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h6" /></svg>
                  {#if tray.sent.length}{#key tray.fresh}<span class="n" class:pulse={converse.view === "chat" && tray.fresh !== ""}>{tray.sent.length}</span>{/key}{/if}
                </button>
                <button class="icon" type="button" aria-label="A new conversation" title="A new conversation: nothing earlier is sent" disabled={panes.mode === "build" || !!converse.running || !converse.turns.length} onclick={() => { converse.fresh(); converse.view = "chat"; }}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 3.5v9M3.5 8h9" /></svg>
                </button>
              {/snippet}
            </PaneHead>
            <div class="pbody iso-body"><IsoPane /></div>
          {/if}
        </section>
      {/each}
    {/if}
  </main>
  <!-- Not over the terminal's replay, which has a card of its own. -->
  {#if tutorial && page.route.id !== "/terminal"}{#await tutorial then t}<t.default />{/await}{/if}

  <nav class="tabs" aria-label="Panes">
    {#each PANES as p (p)}
      <button type="button" aria-current={panes.focus === p} aria-label={NAME[p]} onclick={() => panes.to(p)}>
        {NAME[p]}
        {#if p === "iso" && panes.unseen}<span class="badge">{panes.unseen}</span>{/if}
      </button>
    {/each}
  </nav>
</div>
<svelte:window onkeydown={keys} />

{#snippet noteSettings()}<NoteSettings />{/snippet}
{#snippet isoSettings()}<IsoSettings />{/snippet}
{#snippet atlasSettings()}
  <section class="set">
    <h2 class="label">the map</h2>
    {#if app.atlas}
      <p class="soft">{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</p>
    {/if}
  </section>
{/snippet}

<style>
  .says { overflow: hidden; text-overflow: ellipsis; min-width: 0; font-size: 12px; color: var(--text-soft); flex: 0 1 auto; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; font-size: 12px; flex: none; cursor: pointer; }
  .out { height: 28px; padding: 0 10px; font-size: 12px; flex: none; }
  .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-size: 12px; }
  /* Out of a folder is the phone's (Mobile-Atlas): on a desktop a click on open ground steps out. */
  @media (min-width: 761px) { .out, .where { display: none; } }
  .bad { color: var(--rose); }
  /* The note's saving, as a mark: faint when saved, lit while saving or not saved, rose when it failed. */
  .saved { display: grid; place-items: center; width: 14px; height: 28px; flex: none; }
  .saved i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
  .saved.busy i { background: var(--growth); }
  .saved.bad i { background: var(--rose); }
  .set { display: flex; flex-direction: column; gap: var(--space-2); }
  .set h2 { font-weight: 400; }
  /* The panes (M10): a grid on a desktop, a row of full-width panes on a phone. */
  /* Under a phone's status bar, opened from the Home Screen, the panes start below it. */
  .shell { padding-top: env(safe-area-inset-top); }
  .panes { display: grid; min-height: 0; min-width: 0; height: calc(100dvh - env(safe-area-inset-top)); }
  .pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-left: 1px solid var(--line); position: relative; background: var(--ground-0); }
  .pane.first { border-left: 0; }
  .pane.top { border-bottom: 1px solid var(--line); }
  .pane[hidden] { display: none; }
  .pbody { flex: 1 1 auto; min-height: 0; overflow: auto; position: relative; overscroll-behavior: contain; }
  .atlas-body { overflow: hidden; }
  .iso-body { overflow: hidden; display: flex; flex-direction: column; }
  /* The note's page lays itself out by its pane's width, not the window's: its margin and timeline columns. */
  .note-body { container: page / inline-size; }
  .divider { position: absolute; top: 0; bottom: 0; left: -4px; width: 7px; z-index: 6; cursor: col-resize; touch-action: none; }
  .divider::before { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background 0.15s, width 0.15s, left 0.15s; }
  .divider:hover::before, .divider:focus-visible::before { background: var(--lattice); width: 3px; left: 2px; }
  .divider:focus-visible { outline: none; }
  .tree { position: absolute; left: 0; right: 0; bottom: 0; top: 40px; z-index: 7; overflow: auto; background: var(--ground-0); }
  button.icon { background: none; border: 0; padding: 0; cursor: pointer; }
  button.icon[aria-pressed="true"] { color: var(--text); background: var(--ground-2); }
  .tabs { display: none; }
  @media (max-width: 760px) {
    .tree { top: 48px; }
    .panes { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; height: calc(100dvh - env(safe-area-inset-top) - 52px - env(safe-area-inset-bottom)); }
    .panes::-webkit-scrollbar { display: none; }
    .pane, .pane[hidden] { display: flex; flex: 0 0 100%; scroll-snap-align: start; scroll-snap-stop: always; border-left: 0; }
    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); background: var(--ground-0); }
    .tabs button { height: 52px; background: none; border: 0; font-family: var(--font-pixel); font-size: 14px; color: var(--text-faint); position: relative; display: grid; place-content: center; gap: 2px; cursor: pointer; }
    .tabs button[aria-current="true"] { color: var(--text); }
    .tabs button[aria-current="true"]::before { content: ""; position: absolute; top: -1px; left: 20%; right: 20%; height: 2px; background: var(--text); }
    .tabs .badge { position: absolute; top: 8px; right: calc(50% - 30px); font: 10px var(--font-ui); color: var(--ground-0); background: var(--growth); min-width: 16px; height: 16px; display: grid; place-items: center; padding: 0 3px; }
  }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; }
  .icon:hover, .icon:focus-visible { color: var(--text); text-decoration: none; }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .ctx { width: auto; min-width: 28px; padding: 0 5px; display: inline-flex; align-items: center; gap: 4px; }
  .ctx .n { font: 11px/1 var(--font-ui); color: var(--growth); font-variant-numeric: tabular-nums; }
  .ctx .n.pulse { animation: pulse 900ms ease-out; }
  @keyframes pulse { 0% { color: var(--text); text-shadow: 0 0 6px var(--growth); } }
  @media (prefers-reduced-motion: reduce) { .ctx .n.pulse { animation: none; } }
  .stopped { padding: var(--space-12) var(--space-4); text-align: center; color: var(--rose); }
</style>
