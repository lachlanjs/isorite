<script lang="ts">
  import { agentName } from "@isorite/core";
  import { resolve } from "$app/paths";
  // The shell: the header (the name, where you are, the layouts), the three panes, the status line, and on a phone
  // the panes' tabs.
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
  import { LAYOUTS, PANES, panes, type Pane } from "$lib/panes.svelte.ts";
  import Logo from "$lib/components/Logo.svelte";
  import Menu from "$lib/components/Menu.svelte";

  let { children }: { children: Snippet } = $props();
  // The tutorial walks through the app with a coach card (lib/tutorial): in the tutorial's own build, and on the base
  // isorite --tutorial serves, which the session names as the tutorial's. Loaded only then.
  const tutorial = $derived(import.meta.env.MODE === "tutorial" || app.session?.tutorial ? import("$lib/tutorial/Tutorial.svelte") : null);
  // Back from signing in at the provider: the settings open to say how it went.
  let menu = $state(app.signIn !== null);

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
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const inEditor = (e.target as HTMLElement | null)?.closest?.(".cm-editor, input, textarea") != null;
    const k = e.key;
    if (k === "1" || k === "2" || k === "3") panes.to(PANES[+k - 1]!);
    else if (k.toLowerCase() === "l" && !panes.narrow) panes.nextLayout();
    else if (inEditor) return;
    else if (k === "ArrowLeft" || k === "ArrowRight") panes.step(k === "ArrowRight" ? 1 : -1);
    else if (k === "ArrowUp" || k === "ArrowDown") { const by = k === "ArrowDown" ? 1 : -1; if (panes.focus === "iso") panes.stepMode(by); else panes.stepLens(panes.focus, by); }
    else return;
    e.preventDefault();
  }
  const NAME: Record<Pane, string> = { note: "Note", atlas: "Atlas", iso: "Iso" };
  const LAYOUT_NAME: Record<string, string> = { cols: "Three columns", stack: "The note beside the Atlas over Iso", one: "One pane: the one in focus" };
  const inNote = $derived(page.route.id === "/n/[...id]" || page.route.id === "/draft/[id]");
  // Iso's request as the map shows it: running, or how it ended until the map lets it go.
  // A turn in Iso's pane tells itself there; the status line tells of a request in a note, and of a terminal agent.
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
  <header class="bar">
    <button class="home" type="button" aria-label="isorite: settings" aria-haspopup="dialog" aria-expanded={menu} onclick={() => (menu = !menu)}><Logo /></button>
    <span class="path">
      {#if app.session}
        <a href={resolve("/notes")}>{app.session.name}</a>{#if inNote && app.here}<span class="faint sep">/</span>{app.here}{/if}
      {/if}
    </span>
    <span class="grow"></span>
    {#if app.atlas?.here}<span class="where soft">{app.atlas.here}</span><button class="btn out" type="button" onclick={app.atlas.out}>↑ out</button>{/if}
    {#if running && !run?.agent}<button class="btn stop" type="button" onclick={stop}>stop</button>{/if}
    {#if app.exercise}
      {@const x = app.exercise}
      <!-- An exercise (Study-Written): its kind, Iso's read of you as six squares, wind back, and the next if it names one. -->
      <span class="label kind">{x.kind}</span><span class="faint dot">·</span><span class="label read">Iso's read of you</span>
      {#key x.flash}<button class="squares" class:flash={x.flash > 0} type="button" aria-label="understanding {x.squares} of 6{x.due ? ', due' : ''}: why" onclick={x.why}>{#each [0, 1, 2, 3, 4, 5] as k (k)}<i class="pip" class:lv={k < x.squares}></i>{/each}</button>{/key}
      <button class="link wind" type="button" onclick={x.windBack}>[ wind back ]</button>
      {#if x.next}<a class="next" href={resolve("/n/[...id]", { id: x.next })}>next</a>{/if}
    {/if}
    <span class="layouts" role="group" aria-label="Layout">
      {#each LAYOUTS as l (l)}
        <button class="icon" type="button" aria-pressed={panes.layout === l} aria-label={LAYOUT_NAME[l]} title="{LAYOUT_NAME[l]}  (Alt+L)" onclick={() => panes.setLayout(l)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" />{#if l === "cols"}<path d="M5.8 2.5v11M10.2 2.5v11" />{:else if l === "stack"}<path d="M8 2.5v11M8 8h6.5" />{/if}</svg>
        </button>
      {/each}
      <i class="div" aria-hidden="true"></i>
      {#each PANES as p (p)}
        <button class="icon" type="button" class:off={!panes.show[p]} aria-pressed={panes.show[p]} aria-label="Show {NAME[p]}" title="Show or hide {NAME[p]}{p === 'iso' ? ' (hide it when your terminal has the session)' : ''}" onclick={() => panes.toggle(p)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">{#if p === "note"}<path d="M4 2.5h6l2.5 2.5v8.5H4zM6 7h5M6 9.5h5" />{:else if p === "atlas"}<rect x="2" y="2.5" width="5" height="4" /><rect x="9" y="9.5" width="5" height="4" /><path d="M4.5 6.5v5H9" />{:else}<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" />{/if}</svg>
        </button>
      {/each}
    </span>
  </header>

  {#if menu}<Menu close={() => (menu = false)} />{/if}

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
            <PaneHead pane="note" name="Note">
              {#snippet tools()}
                <button class="icon" type="button" aria-label="All notes" title="All notes, and search" aria-pressed={page.route.id === "/notes" || panes.tree} onclick={() => { if (page.route.id !== "/notes") panes.tree = !panes.tree; }}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 3h4M4.5 3v9.5h3M4.5 7.5h3" /><rect x="8" y="5.5" width="5.5" height="3.5" /><rect x="8" y="10.5" width="5.5" height="3.5" /></svg>
                </button>
              {/snippet}
            </PaneHead>
            <div class="pbody note-body">{@render children()}</div>
            {#if panes.tree && page.route.id !== "/notes"}<div class="tree"><NoteList /></div>{/if}
          {:else if p === "atlas"}
            <PaneHead pane="atlas" name="Atlas" />
            <div class="pbody atlas-body"><AtlasPane /></div>
          {:else}
            <PaneHead pane="iso" name="Iso" />
            <div class="pbody iso-body"><IsoPane /></div>
          {/if}
        </section>
      {/each}
    {/if}
  </main>
  <!-- Not over the terminal's replay, which has a card of its own. -->
  {#if tutorial && page.route.id !== "/terminal"}{#await tutorial then t}<t.default />{/await}{/if}

  <footer class="status">
    {#if app.session}
      <span>{app.session.study ? "study" : "project: no journal is kept"}</span>
      {#if inNote && app.saving}<span class:bad={app.saving.bad} role="status">{app.saving.text}</span>{/if}
      {#if inNote && app.hint && !run}<span class="grow"></span><span class="hint">{app.hint}</span>{/if}
      <!-- Iso's request, as the Atlas shows it: not for the note open beside it, which says so itself. -->
      {#if run && (!app.open || run.note !== app.open) && (running || !app.atlas?.chosen)}
        <span class="grow"></span>
        {#if run.agent}
          <span class="hint">{running ? `${agentNamed} is ${agentReading ? `reading ${agentReading}` : "at work"} in the terminal` : `${agentNamed}'s turn is done · click open ground to let its path go`}</span>
        {:else if running}
          <span class="hint">{run.note.startsWith("@draft/") ? "your note opens when Iso is done" : `Iso is answering in ${runTitle}`}</span>
          <button class="link" type="button" onclick={stop}>stop</button>
        {:else}
          <span class="hint" class:bad={run.state === "failed"}>{run.state === "done" ? `Iso is done in ${runTitle}` : run.state === "stopped" ? "Iso was stopped" : `Iso could not answer: ${run.message}`} · click open ground to let its path go</span>
        {/if}
      {:else if app.atlas?.pick}
        <span class="grow"></span>
        <span class="hint">click a note to link it, again to take it away</span>
      {:else if app.atlas?.chosen}
        {#if app.atlas.steps}<span>{app.atlas.steps} {app.atlas.steps === 1 ? "step" : "steps"} back</span>{/if}
        <span class="grow"></span>
      {:else if app.atlas}
        <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
        {#if app.atlas.items}<span>{app.atlas.items} study {app.atlas.items === 1 ? "item" : "items"}</span>{/if}
        <span class="grow"></span>
      {:else}
        <span class="grow"></span>
        <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
      {/if}
    {/if}
  </footer>
  <nav class="tabs" aria-label="Panes">
    {#each PANES as p (p)}
      <button type="button" aria-current={panes.focus === p} onclick={() => panes.to(p)}>
        {NAME[p]}
        <span class="under">{#if p === "iso"}<span class="g">{panes.mode}</span>{:else if panes.lens[p] === "iso"}<span class="g">◆ Iso</span>{:else if panes.lens[p] === "understand"}<span class="m">◇ understand</span>{/if}</span>
        {#if p === "iso" && panes.unseen}<span class="badge">{panes.unseen}</span>{/if}
      </button>
    {/each}
  </nav>
</div>
<svelte:window onkeydown={keys} />

<style>
  .hint { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; font-size: 12px; flex: none; }
  .bar .out, .bar .stop { height: 28px; padding: 0 10px; font-size: 12px; }
  .bar .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* Out of a folder, and stopping Iso from the header, are the phone's (Mobile-Atlas, Mobile-Think): on a desktop
     a click on open ground steps out, and the status line has stop. */
  @media (min-width: 601px) { .bar .out, .bar .where, .bar .stop { display: none; } }
  /* In a folder, a phone's header names the folder, not the base (Mobile-Atlas). */
  @media (max-width: 600px) { .bar:has(.where) .path { display: none; } }
  .bad { color: var(--rose); }
  .squares { display: inline-flex; gap: 4px; background: none; border: 0; padding: 6px 2px; cursor: pointer; }
  .squares.flash { animation: flash 900ms ease-out; }
  @keyframes flash { 0% { box-shadow: 0 0 0 0 var(--malachite); background: var(--malachite-soft); } 100% { box-shadow: 0 0 0 10px transparent; background: none; } }
  .bar .kind, .bar .read, .bar .dot { white-space: nowrap; }
  .bar .next { white-space: nowrap; }
  /* On a phone an exercise's header is its kind and the squares (Mobile-Study): wind back is in the squares' panel. */
  @media (max-width: 600px) { .bar .read, .bar .dot, .bar .wind, .bar:has(.squares) :global(.count), .bar:has(.squares) .path { display: none; } }
  /* The panes (M10): a grid on a desktop, a row of full-width panes on a phone. */
  .panes { display: grid; min-height: 0; min-width: 0; height: calc(100dvh - var(--bar-h) - 28px); }
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
  .layouts { display: flex; align-items: center; gap: 2px; }
  .layouts .div { width: 1px; height: 18px; background: var(--line); margin: 0 8px; }
  .layouts .icon.off { opacity: 0.45; background: none; }
  .tabs { display: none; }
  @media (max-width: 760px) {
    .layouts { display: none; }
    .tree { top: 48px; }
    .panes { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; height: calc(100dvh - var(--bar-h) - 28px - 52px - env(safe-area-inset-bottom)); }
    .panes::-webkit-scrollbar { display: none; }
    .pane, .pane[hidden] { display: flex; flex: 0 0 100%; scroll-snap-align: start; scroll-snap-stop: always; border-left: 0; }
    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); background: var(--ground-0); }
    .tabs button { height: 52px; background: none; border: 0; font-family: var(--font-pixel); font-size: 14px; color: var(--text-faint); position: relative; display: grid; place-content: center; gap: 2px; cursor: pointer; }
    .tabs button[aria-current="true"] { color: var(--text); }
    .tabs button[aria-current="true"]::before { content: ""; position: absolute; top: -1px; left: 20%; right: 20%; height: 2px; background: var(--text); }
    .tabs .under { font: 10px var(--font-ui); height: 12px; color: var(--text-faint); }
    .tabs .g { color: var(--growth); }
    .tabs .m { color: var(--malachite); }
    .tabs .badge { position: absolute; top: 8px; right: calc(50% - 30px); font: 10px var(--font-ui); color: var(--ground-0); background: var(--growth); min-width: 16px; height: 16px; display: grid; place-items: center; padding: 0 3px; }
  }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; }
  .icon:hover, .icon:focus-visible { color: var(--text); text-decoration: none; }
  .stopped { padding: var(--space-12) var(--space-4); text-align: center; color: var(--rose); }
</style>
