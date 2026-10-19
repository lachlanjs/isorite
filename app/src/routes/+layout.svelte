<script lang="ts">
  import { agentName } from "@isorite/core";
  import { resolve } from "$app/paths";
  // The shell: the header (the name, where you are, the atlas / notes / study switch), the page, and the
  // status line.
  import "../app.css";
  import "katex/dist/katex.min.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { app } from "$lib/app.svelte.ts";
  import { onMount } from "svelte";
  import AtlasPane from "$lib/components/AtlasPane.svelte";
  import ContextCount from "$lib/components/ContextCount.svelte";
  import { views } from "$lib/views.svelte.ts";
  import Logo from "$lib/components/Logo.svelte";
  import Menu from "$lib/components/Menu.svelte";

  let { children }: { children: Snippet } = $props();
  // The tutorial walks through the app with a coach card (lib/tutorial): in the tutorial's own build, and on the base
  // isorite --tutorial serves, which the session names as the tutorial's. Loaded only then.
  const tutorial = $derived(import.meta.env.MODE === "tutorial" || app.session?.tutorial ? import("$lib/tutorial/Tutorial.svelte") : null);
  // Back from signing in at the provider: the settings open to say how it went.
  let menu = $state(app.signIn !== null);

  // What stands (V1): the Atlas, the note, both side by side, or neither (the list, study). The switch's two
  // buttons follow the table in views.svelte.ts; the note they open, when none is, is the last one open, or else the
  // note chosen on the Atlas (Q5).
  const shown = $derived(views.shown(page.route.id));
  const exists = (id: string) => app.listing.notes.some((n) => n.id === id);
  const target = $derived(page.route.id === "/n/[...id]" && page.params.id ? page.params.id : exists(views.last) ? views.last : (app.atlas?.chosenId && !app.atlas.chosenId.startsWith("@") ? app.atlas.chosenId : ""));
  $effect(() => { if (page.route.id === "/n/[...id]" && page.params.id) views.setLast(page.params.id); });
  const atlasOn = $derived(shown === "atlas" || shown === "both");
  const noteOn = $derived(shown === "note" || shown === "both");
  onMount(() => {
    const media = matchMedia("(max-width: 600px)");
    views.narrow = media.matches;
    const changed = () => { views.narrow = media.matches; };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  });
  // The divider between the two: dragged, or moved with the arrow keys.
  let panes = $state<HTMLElement>();
  function drag(e: PointerEvent): void {
    const el = e.currentTarget as HTMLElement, box = panes!.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => views.setSplit((m.clientX - box.left) / box.width);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  }
  function nudge(e: KeyboardEvent): void {
    if (e.key === "ArrowLeft") { views.setSplit(views.split - 0.05); e.preventDefault(); }
    if (e.key === "ArrowRight") { views.setSplit(views.split + 0.05); e.preventDefault(); }
  }
  const inNote = $derived(page.route.id === "/n/[...id]" || page.route.id === "/draft/[id]");
  // Iso's request as the map shows it: running, or how it ended until the map lets it go.
  const run = $derived(app.atlas && !app.atlas.pick ? app.iso : null);
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
    <button class="home" class:in-note={inNote} type="button" aria-label="isorite: settings" aria-haspopup="dialog" aria-expanded={menu} onclick={() => (menu = !menu)}><Logo /></button>
    {#if inNote && app.session}{#if app.exercise || app.studying}<a class="back" href={resolve("/study")}>‹ study</a>{:else}<a class="back" href={resolve("/notes")}>‹ {app.session.name}</a>{/if}{/if}
    <span class="path" class:in-note={inNote}>
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
    {#if !app.error}<ContextCount />{/if}
    <!-- Study keeps a way in until learning becomes a mode (V3). -->
    <a class="icon study" href={resolve("/study")} aria-label="study" title="study" aria-current={page.route.id === "/study" || app.exercise || app.studying ? "page" : undefined}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" fill="currentColor" /><rect x="9" y="2.5" width="4.5" height="4.5" fill="none" stroke="currentColor" stroke-width="1.2" /><rect x="2.5" y="9" width="4.5" height="4.5" fill="none" stroke="currentColor" stroke-width="1.2" /><rect x="9" y="9" width="4.5" height="4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.2" /></svg>
    </a>
    <nav class="switch" aria-label="Views" data-shown={shown}>
      <i class="slide" aria-hidden="true"></i>
      <button type="button" aria-pressed={atlasOn} disabled={shown === "atlas" && !target && !views.narrow} onclick={() => void views.atlas(shown, target)}><span>atlas</span></button>
      <button type="button" aria-pressed={noteOn} disabled={!noteOn && !target} title={!noteOn && !target ? "choose a note on the Atlas first" : undefined} onclick={() => void views.note(shown, target)}><span>note</span></button>
    </nav>
  </header>

  {#if menu}<Menu close={() => (menu = false)} />{/if}

  <main class="page" class:panes={atlasOn} class:both={shown === "both"} bind:this={panes} style:--split={views.split}>
    {#if app.error}
      <p class="stopped">isorite could not open the base: {app.error}</p>
    {:else}
      {#if atlasOn}<div class="pane atlas-pane"><AtlasPane beside={shown === "both"} /></div>{/if}
      {#if shown === "both"}
        <!-- A focusable separator is a widget (WAI-ARIA window splitter): dragged, or moved with the arrow keys. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div class="divider" role="separator" aria-orientation="vertical" aria-label="Atlas and note: drag to resize" aria-valuenow={Math.round(views.split * 100)} aria-valuemin={20} aria-valuemax={80} tabindex="0" onpointerdown={drag} onkeydown={nudge}></div>
      {/if}
      {#if shown !== "atlas"}<div class="pane" class:note-pane={shown === "both"}>{@render children()}</div>{/if}
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
          <button class="link" type="button" onclick={stop}>[ stop ]</button>
        {:else}
          <span class="hint" class:bad={run.state === "failed"}>{run.state === "done" ? `Iso is done in ${runTitle}` : run.state === "stopped" ? "Iso was stopped" : `Iso could not answer: ${run.message}`} · click open ground to let its path go</span>
        {/if}
      {:else if app.atlas?.pick}
        <span class="grow"></span>
        <span class="hint">click a note to link it, again to take it away</span>
      {:else if app.atlas?.chosen}
        {#if app.atlas.steps}<span>{app.atlas.steps} {app.atlas.steps === 1 ? "step" : "steps"} back</span>{/if}
        <span class="grow"></span>
        <span class="hint">click a note it requires to step back to it, the note again to open it</span>
      {:else if app.atlas}
        <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
        {#if app.atlas.items}<span>{app.atlas.items} study {app.atlas.items === 1 ? "item" : "items"}</span>{/if}
        <span class="grow"></span>
        <span class="hint">click a note to see what it rests on · hold on open ground to start a note for Iso, on a note to start from it</span>
      {:else}
        <span class="grow"></span>
        <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
      {/if}
    {/if}
  </footer>
</div>

<style>
  .hint { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; font-size: 12px; flex: none; }
  .bar .out, .bar .stop { height: 28px; padding: 0 10px; font-size: 12px; }
  .bar .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* Out of a folder, and stopping Iso from the header, are the phone's (Mobile-Atlas, Mobile-Think): on a desktop
     a click on open ground steps out, and the status line has [ stop ]. */
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
  /* The Atlas and the note side by side (V1): each scrolls on its own, the divider between. */
  .page.panes { display: flex; min-height: 0; }
  .page.panes .pane { min-width: 0; }
  /* The note's page lays itself out by its pane's width, not the window's: its margin and timeline columns. */
  .pane { container: page / inline-size; }
  .atlas-pane { flex: 1 1 auto; }
  .both .atlas-pane { flex: 0 0 calc(var(--split) * 100%); }
  .note-pane { flex: 1 1 0; height: calc(100dvh - var(--bar-h) - 28px); overflow-y: auto; }
  .divider { flex: none; width: 7px; margin: 0 -3px; z-index: 6; cursor: col-resize; position: relative; touch-action: none; }
  .divider::before { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: var(--line); transition: background 0.15s, width 0.15s, left 0.15s; }
  .divider:hover::before, .divider:focus-visible::before { background: var(--lattice); width: 3px; left: 2px; }
  .divider:focus-visible { outline: none; }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; }
  .icon:hover, .icon:focus-visible { color: var(--text); text-decoration: none; }
  .icon[aria-current="page"] { color: var(--text); }
  .stopped { padding: var(--space-12) var(--space-4); text-align: center; color: var(--rose); }
</style>
