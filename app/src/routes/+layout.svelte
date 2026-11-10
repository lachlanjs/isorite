<script lang="ts">
  import { agentName } from "@isorite/core";
  import { resolve } from "$app/paths";
  // The shell: the three panes, and on a phone their tabs. There is no header or status line (M10b): each pane's
  // header holds its own tools, what it is doing, and its settings.
  import "../app.css";
  import "katex/dist/katex.min.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { onNavigate } from "$app/navigation";
  import { carryTitle } from "$lib/motion.ts";
  import { app } from "$lib/app.svelte.ts";
  import { onMount, untrack } from "svelte";
  import { install as states } from "$lib/lustre.ts";
  import AtlasPane from "$lib/components/AtlasPane.svelte";
  import AgentPane from "$lib/components/AgentPane.svelte";
  import NoteList from "$lib/components/NoteList.svelte";
  import PaneHead from "$lib/components/PaneHead.svelte";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { PANES, panes, type Pane, type Switch } from "$lib/panes.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import { finder } from "$lib/finder.svelte.ts";
  import Crystal from "$lib/components/Crystal.svelte";
  import AgentSettings from "$lib/components/AgentSettings.svelte";
  import NoteSettings from "$lib/components/NoteSettings.svelte";
  import SelectionTags from "$lib/components/SelectionTags.svelte";

  let { children }: { children: Snippet } = $props();

  // The three panes (M10). The Note pane shows the route's page; the Atlas and the agent stand in the shell, so they keep
  // their state while notes open and close.
  const standing = $derived(panes.standing);
  $effect(() => { if (page.route.id === "/n/[...id]" && page.params.id) { const id = page.params.id; panes.setLast(id); untrack(() => panes.visit(id)); } });
  // The notes open over a note close when a note is chosen from them.
  $effect(() => { void page.url.href; panes.tree = false; });
  onMount(states);
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
  // A note opened from a row of the list or a link in a note: its title is carried from where it was to the note's
  // heading (motion.ts, View Transitions where the browser has them). What was pressed is noted as it is pressed.
  let carried: HTMLElement | null = null;
  function pressed(e: MouseEvent): void {
    const a = (e.target as Element | null)?.closest?.("a");
    carried = a?.closest(".notes li") ? a.querySelector<HTMLElement>(".title") : a?.classList.contains("vein") ? a : null;
  }
  onNavigate((nav) => {
    const from = carried;
    carried = null;
    if (nav.to?.route.id !== "/n/[...id]" || nav.to.params?.id === page.params.id) return;
    return carryTitle(from, nav.complete);
  });
  // The note's saving mark blinks malachite once when what was being saved is saved.
  let wasSaving = false, justSaved = $state(false), savedTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const saving = !!app.saving && !app.saving.text.startsWith("saved");
    if (wasSaving && !saving && app.saving && !app.saving.bad) { justSaved = true; clearTimeout(savedTimer); savedTimer = setTimeout(() => (justSaved = false), 700); }
    wasSaving = saving;
  });
  // An agent's turn in its own terminal, told in the Agent pane's header: once it is done, said for a few seconds.
  let doneShown = $state(false);
  $effect(() => {
    if (running || !run?.agent) { doneShown = running; return; }
    doneShown = true;
    const t = setTimeout(() => (doneShown = false), 3000);
    return () => clearTimeout(t);
  });
  // The grid: columns by each pane's width, or the note beside the Atlas over the agent.
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
    at = row.scrollLeft / Math.max(1, row.clientWidth); // scroll events come once a frame, before it is drawn
    clearTimeout(settle);
    settle = setTimeout(() => {
      const p = PANES[Math.round(row!.scrollLeft / row!.clientWidth)];
      if (p && p !== panes.focus) { panes.focus = p; if (p === "agent") panes.unseen = 0; }
    }, 60);
  }
  let settle: ReturnType<typeof setTimeout> | undefined;
  /** Where the row of panes is, in panes (1.5: half way from the second to the third): the tabs' bar follows it, so it
   *  moves with the panes as they slide, tapped or swiped, and the tab nearest it is lit as soon as it is past half way. */
  let at = $state(0);
  // Keys: Alt+1/2/3 a pane, Alt+←/→ the next, Alt+↑/↓ its lens or the agent's mode, Alt+L the layout. The arrows are left
  // to the editor while you type in it, where they move lines and words.
  // Ctrl+K (⌘K): find a note on the Atlas, whichever pane has the keys (taken before the editor sees it).
  function find(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== "KeyK") return;
    e.preventDefault(); e.stopPropagation();
    panes.to("atlas");
    finder.show();
  }
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
  const NAME: Record<Pane, string> = { note: "Note", atlas: "Atlas", agent: "Agent" };
  // The panes' switches (M12), each its letter with Alt.
  const SWITCH_KEYS: Record<string, Switch> = { p: "provenance", t: "timeline", q: "questions", b: "problems", w: "web", k: "code", i: "pictures", a: "artifacts", c: "context", n: "notes", f: "files", r: "run" };
  const inNote = $derived(page.route.id === "/n/[...id]");
  // An agent's turn as the map shows it: running, or how it ended until the map lets it go. A session the pane
  // carries tells itself there; the agent's header tells of an agent's turn through MCP alone, in its own terminal.
  const run = $derived(app.atlas ? app.agent : null);
  const running = $derived(run?.state === "reading" || run?.state === "writing");
  // Who it is, and the note it has opened last.
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
            <PaneHead pane="note" first={panes.narrow || standing[0] === "note"} name="Note" settings={noteSettings}>
              {#snippet tools()}
                <button class="icon" type="button" aria-label="Back to the note before" title="Back to the note before" disabled={!panes.canBack} onclick={() => void panes.walk(-1)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M10 3L5 8l5 5" /></svg></button>
                <button class="icon" type="button" aria-label="Forward to the note after" title="Forward to the note after" disabled={!panes.canForward} onclick={() => void panes.walk(1)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 3l5 5-5 5" /></svg></button>
                {#if inNote && app.saving}<span class="saved" class:just={justSaved} class:bad={app.saving.bad} class:busy={!app.saving.text.startsWith("saved")} title={app.saving.text} role="status"><i aria-hidden="true"></i><span class="hidden-label">{app.saving.text}</span></span>{/if}
                <button class="icon" type="button" aria-label="All notes" title="All notes" aria-pressed={page.route.id === "/notes" || panes.tree} onclick={() => { if (page.route.id !== "/notes") panes.tree = !panes.tree; }}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 3h4M4.5 3v9.5h3M4.5 7.5h3" /><rect x="8" y="5.5" width="5.5" height="3.5" /><rect x="8" y="10.5" width="5.5" height="3.5" /></svg>
                </button>
              {/snippet}
            </PaneHead>
            <div class="pbody note-body">{@render children()}</div>
            {#if panes.tree && page.route.id !== "/notes"}<div class="tree"><NoteList /></div>{/if}
          {:else if p === "atlas"}
            <PaneHead pane="atlas" first={panes.narrow || standing[0] === "atlas"} name="Atlas">
              {#snippet tools()}
                {#if app.atlas?.chosen && app.atlas.steps}
                  <span class="says steps" title="{app.atlas.steps} {app.atlas.steps === 1 ? 'step' : 'steps'} back">−{app.atlas.steps}</span>
                {/if}
                {#if app.atlas?.here}<span class="where soft">{app.atlas.here}</span><button class="btn out" type="button" onclick={app.atlas.out}>↑ out</button>{/if}
                {#if app.atlas}<button class="icon" type="button" aria-label="The whole map" title="The whole map (0) · {app.listing.notes.length} {app.listing.notes.length === 1 ? 'note' : 'notes'}" onclick={app.atlas.fit}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg></button><button class="icon" type="button" aria-label="Lay the map out again" title="Lay the map out again" onclick={app.atlas.relayout}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" /></svg></button>{/if}
              {/snippet}
            </PaneHead>
            <div class="pbody atlas-body"><AtlasPane /></div>
          {:else}
            <PaneHead pane="agent" first={panes.narrow || standing[0] === "agent"} name="Agent" settings={agentSettings}>
              {#snippet tools()}
                <!-- An agent's turn told in the agent's header, unless its session is the pane's (M25), where it shows itself. -->
                {#if run?.agent && !terminal.inPane && doneShown}
                  <span class="says" class:at-work={running} title="{agentNamed}, in its own terminal">{#if running}<i class="dia" aria-hidden="true"></i> {agentReading || "at work"}{:else}done{/if}</span>
                {/if}
                <!-- The drawer (M24, K): the agents' sessions, live and kept (M25), and the agent's own conversations from
                     before, under the crystal of the one shown. -->
                {@const shownId = terminal.session?.session}
                <button class="icon past" type="button" aria-label="Sessions" aria-pressed={terminal.shown === "past"} title="Sessions" onclick={() => void terminal.drawer()}>
                  {#if shownId}<Crystal id={shownId} size={20} />{:else}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 4.5h11v8h-11zM2.5 7.5h11M6.5 10h3" /></svg>{/if}
                </button>
                <!-- What the agent has in hand (I8, M25), with how many parts are in the tray; a new session. -->
                <button class="icon ctx" type="button" aria-label="Context" aria-pressed={terminal.shown === "context"} title="Context" onclick={() => (terminal.shown = terminal.shown === "context" ? "session" : "context")}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h6" /></svg>
                  {#if tray.sent.length}{#key tray.fresh}<span class="n" class:pulse={terminal.shown === "session" && tray.fresh !== ""}>{tray.sent.length}</span>{/key}{/if}
                </button>
                {#if terminal.view?.connected}
                  <button class="icon" type="button" aria-label="A new session" title="New session" onclick={() => { void terminal.fresh(terminal.view?.agentId ?? ""); terminal.shown = "session"; }}>
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 3.5v9M3.5 8h9" /></svg>
                  </button>
                {/if}
              {/snippet}
            </PaneHead>
            <div class="pbody agent-body"><AgentPane /></div>
          {/if}
        </section>
      {/each}
    {/if}
  </main>

  <nav class="tabs" aria-label="Panes">
    <span class="bar" aria-hidden="true" style:translate="{at * 100}% 0"></span>
    {#each PANES as p, i (p)}
      <button type="button" class:near={Math.round(at) === i} aria-current={panes.focus === p} aria-label={NAME[p]} onclick={() => panes.to(p)}>
        {NAME[p]}
        {#if p === "agent" && panes.unseen}<span class="badge">{panes.unseen}</span>{/if}
      </button>
    {/each}
  </nav>
</div>
<svelte:window onkeydown={keys} onkeydowncapture={find} onclickcapture={pressed} />
<SelectionTags />

{#snippet noteSettings()}<NoteSettings />{/snippet}
{#snippet agentSettings()}<AgentSettings />{/snippet}

<style>
  .says { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 5.5em; font-size: 0.75rem; color: var(--text-soft); flex: 0 1 auto; }
  @media (max-width: 760px) { .says { flex: none; } }
  .out { height: 28px; padding: 0 10px; font-size: 0.75rem; flex: none; }
  .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-size: 0.75rem; }
  /* Out of a folder is the phone's (Mobile-Atlas): on a desktop a click on open ground steps out. */
  @media (min-width: 761px) { .out, .where { display: none; } }
  .bad { color: var(--rose); }
  /* The note's saving, as a mark: faint when saved, lit while saving or not saved, rose when it failed. */
  .saved { display: grid; place-items: center; width: 14px; height: 28px; flex: none; }
  .saved i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); transition: background-color var(--dur-1) var(--ease-out); }
  .saved.just i { animation: saved var(--dur-3) var(--ease-out); }
  @keyframes saved { 0%, 30% { background: var(--malachite); box-shadow: 0 0 6px var(--malachite); } }
  .steps { min-width: 0; font-variant-numeric: tabular-nums; color: var(--text-faint); }
  .says.at-work { display: inline-flex; align-items: center; gap: 6px; }
  .says .dia { width: 7px; height: 7px; animation: turn 2.4s linear infinite; }
  @keyframes turn { to { rotate: 405deg; } }
  @media (prefers-reduced-motion: reduce) { .says .dia { animation: none; } }
  .saved.busy i { background: var(--growth); }
  .saved.bad i { background: var(--rose); }
  /* The panes (M10): a grid on a desktop, a row of full-width panes on a phone. */
  /* Under a phone's status bar, opened from the Home Screen, the panes start below it. */
  .shell { padding-top: env(safe-area-inset-top); }
  .panes { display: grid; min-height: 0; min-width: 0; height: calc(100dvh - env(safe-area-inset-top)); }
  .pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-left: 1px solid var(--line); position: relative; background: var(--ground-0); }
  .pane.first { border-left: 0; }
  .pane.top { border-bottom: 1px solid var(--line); }
  .pane[hidden] { display: none; }
  /* Contained up and down only: a sideways swipe in a pane goes on to the row of panes, so on a phone it changes pane. */
  .pbody { flex: 1 1 auto; min-height: 0; overflow: auto; position: relative; overscroll-behavior: auto contain; }
  /* Nothing scrolls sideways under the reader (screenshots/scrollbar.png: the title cut at its left); what is wider than
     the page (a table, a long formula) scrolls in its own box. */
  .note-body { overflow-x: clip; }
  .atlas-body { overflow: hidden; }
  .agent-body { overflow: hidden; display: flex; flex-direction: column; }
  /* The note's page lays itself out by its pane's width, not the window's: its margin and timeline columns. */
  .note-body { container: page / inline-size; }
  .divider { position: absolute; top: 0; bottom: 0; left: -4px; width: 7px; z-index: 6; cursor: col-resize; touch-action: none; }
  .divider::before { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background 0.15s, width 0.15s, left 0.15s; }
  .divider:hover::before, .divider:focus-visible::before { background: var(--lattice); width: 3px; left: 2px; }
  .divider:focus-visible { outline: none; }
  .tree { position: absolute; left: 0; right: 0; bottom: 0; top: 40px; z-index: 7; overflow: auto; background: var(--ground-0); }
  button.icon { background: none; border: 0; padding: 0; cursor: pointer; }
  /* On, quietly: its colour as a tint and on its icon, and a bar under it that grows from the middle (design audit, P0). */
  button.icon { position: relative; transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
  button.icon::after { content: ""; position: absolute; left: 6px; right: 6px; bottom: 0; height: 2px; background: var(--c, var(--lattice)); transform: scaleX(0); transition: transform var(--dur-2) var(--ease-out); pointer-events: none; }
  button.icon[aria-pressed="true"] { background: color-mix(in srgb, var(--c, var(--lattice)) var(--tint), transparent); color: var(--c, var(--lattice)); clip-path: var(--chosen-cut); }
  button.icon[aria-pressed="true"]::after { transform: scaleX(1); }
  .tabs { display: none; }
  @media (max-width: 760px) {
    .tree { top: 48px; }
    .panes { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; height: calc(100dvh - env(safe-area-inset-top) - 52px - env(safe-area-inset-bottom)); }
    .panes::-webkit-scrollbar { display: none; }
    .pane, .pane[hidden] { display: flex; flex: 0 0 100%; scroll-snap-align: start; scroll-snap-stop: always; border-left: 0; }
    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); background: var(--ground-0); }
    .tabs button { -webkit-tap-highlight-color: transparent; height: 52px; background: none; border: 0; transition: color var(--t-ack) var(--ease-out); font-family: var(--font-pixel); font-size: 0.875rem; color: var(--text-faint); position: relative; display: grid; place-content: center; gap: 2px; cursor: pointer; }
    .tabs button.near { color: var(--text); }
    .tabs button:active { background: var(--ground-1); }
    /* The bar under the pane in view: a third of the row wide, its line inset as the label is, moved by the scroll itself. */
    .tabs .bar { position: absolute; top: -1px; left: 0; width: calc(100% / 3); height: 2px; pointer-events: none; }
    .tabs .bar::before { content: ""; position: absolute; inset: 0 20%; background: var(--text); }
    .tabs .badge { position: absolute; top: 8px; right: calc(50% - 30px); font: 0.625rem var(--font-ui); color: var(--ground-0); background: var(--growth); min-width: 16px; height: 16px; display: grid; place-items: center; padding: 0 3px; }
  }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; }
  .icon:hover, .icon:focus-visible { color: var(--text); text-decoration: none; }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .ctx { width: auto; min-width: 28px; padding: 0 5px; display: inline-flex; align-items: center; gap: 4px; }
  .ctx .n { font: 0.6875rem/1 var(--font-ui); color: var(--growth); font-variant-numeric: tabular-nums; }
  .ctx .n.pulse { animation: pulse 900ms ease-out; }
  @keyframes pulse { 0% { color: var(--text); text-shadow: 0 0 6px var(--growth); } }
  @media (prefers-reduced-motion: reduce) { .ctx .n.pulse { animation: none; } }
  .stopped { padding: var(--space-12) var(--space-4); text-align: center; color: var(--rose); }
</style>
