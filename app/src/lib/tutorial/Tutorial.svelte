<script lang="ts">
  // The tutorial's coach card (Tour-1 … Tour-6): first the sections, to take in order or one by one; then a section
  // a step at a time, what the step is about lit and the rest dimmed. Each step has an objective, ticked when the base
  // or the page shows it was met (T2); "next" is always there. back re-reads the step before; redo puts the base back
  // as the step found it (T3). A wrong move the step watches for is named, with redo beside it (T4).
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { app } from "$lib/app.svelte.ts";
  import { restore, snapshot } from "./redo.ts";
  import { PARTS as ALL, remember, type Step } from "./steps.ts";
  import { begun, tick, tour } from "./tour.svelte.ts";

  // Beside the terminal's tour (isorite --tutorial, on a server), not the tutorial's own site: some sections read
  // differently there.
  const local = import.meta.env.MODE !== "tutorial" && Boolean(app.session?.tutorial);
  const PARTS = ALL.map((p) => (local && p.local ? { ...p, ...p.local } : p));
  // Where the tutorial is lives outside the card, so it carries on if the card is drawn again.
  const left = $derived(tour.left);
  const part = $derived(tour.part >= 0 ? PARTS[tour.part]! : null);
  let narrow = $state(false);
  const step = $derived.by<Step | null>(() => {
    const s = part?.steps[tour.at];
    return s ? { ...s, ...(narrow ? s.phone : {}) } : null;
  });
  const waits = $derived(Boolean(step?.until || step?.check));
  const last = $derived(part !== null && tour.at === part.steps.length - 1);
  const ticked = (key: string, k: number) => tour.ticks[key]?.includes(k) ?? false;
  const met = $derived(part !== null && ticked(part.key, tour.at));
  let spot = $state.raw<{ x: number; y: number; w: number; h: number } | null>(null);
  // The card stands bottom right, or bottom left where it would cover what the step lights.
  let coach = $state<HTMLElement>();
  let leftSide = $state(false);
  // The lit area eases only when the step's target changes; while the page scrolls it follows at once (T6).
  let easing = $state(false);
  let redoing = $state(false);
  // On a phone the foot of the screen holds what a step asks you to use (ask Iso here, an exercise's buttons, a note
  // for Iso's): the card stands above it, and folds to its title when it is in the way.
  let lift = $state(0);
  let small = $state(false);
  const FOOT = ".seed, .foot, .changes, .deck";

  async function enter(k: number) {
    tour.at = k; tour.mistake = ""; small = false;
    easing = true; setTimeout(() => (easing = false), 200);
    const s = PARTS[tour.part]!.steps[k]!, go = (narrow ? s.phone?.go : undefined) ?? s.go;
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- an address within the app, by its hash
    if (go) await goto(`#${typeof go === "string" ? go : await go()}`);
    begun.snap = snapshot().catch(() => null as never);
  }
  function begin(k: number) {
    remember();
    tour.part = k; tour.left = false;
    void enter(0);
  }
  /** On to the next step, or the list at the end. A step that waits for nothing has its objective met by reading it. */
  function next() {
    if (!part) return;
    if (!waits) tick(part.key, tour.at);
    if (!last) { void enter(tour.at + 1); return; }
    tour.part = -1;
  }
  function back() { if (tour.at > 0) void enter(tour.at - 1); }
  async function redo() {
    const snap = await begun.snap;
    if (!snap || redoing) return;
    redoing = true;
    try { await restore(snap); } finally { redoing = false; }
    await enter(tour.at);
  }
  function lit(target: Step["target"]): Element[] {
    if (!target) return [];
    return typeof target === "function" ? target() : [...document.querySelectorAll(target)];
  }

  onMount(() => {
    const media = matchMedia("(max-width: 600px)");
    narrow = media.matches;
    const changed = () => { narrow = media.matches; };
    media.addEventListener("change", changed);
    const met = () => { if (part) tick(part.key, tour.at); next(); };
    const off = app.on((e) => { if (!left && step?.until?.(e)) met(); });
    // Every frame: what the step lights, as one area round all of it.
    let frame = 0;
    const look = () => {
      frame = requestAnimationFrame(look);
      if (left || !step) { spot = null; return; }
      lift = 0;
      if (narrow) for (const el of document.querySelectorAll<HTMLElement>(FOOT)) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top > innerHeight / 2) lift = Math.max(lift, innerHeight - r.top + 8);
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of lit(step.target)) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
      }
      spot = x0 < x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
      // Where the card would stand on the right: over the lit area, it goes left, unless the left is as bad.
      if (!narrow && coach) {
        const c = coach.getBoundingClientRect(), w = c.width, h = c.height, top = innerHeight - 48 - h;
        const over = (x: number) => (spot ? Math.max(0, Math.min(x + w, spot.x + spot.w) - Math.max(x, spot.x)) * Math.max(0, Math.min(top + h, spot.y + spot.h) - Math.max(top, spot.y)) : 0);
        const right = over(innerWidth - 24 - w), left = over(24);
        leftSide = right > 0 && left < right;
      }
    };
    look();
    // A few times a second: whether the objective is met, a wrong move, and the prompt to fill in.
    const every = setInterval(() => {
      if (left || !step || redoing) return;
      if (step.fill) {
        const field = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('[aria-label="Ask Iso"]');
        if (field && !field.value && !field.dataset.filled) {
          field.dataset.filled = "1";
          field.value = step.fill;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      if (step.check?.()) { met(); return; }
      tour.mistake = step.wrong?.() ?? "";
    }, 250);
    return () => { off(); cancelAnimationFrame(frame); clearInterval(every); media.removeEventListener("change", changed); };
  });
</script>

{#snippet tickMark()}<svg class="tick" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 6.5l2.6 2.6L10 3.4" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>{/snippet}

{#if left}
  <button class="back btn quiet" type="button" onclick={() => { tour.left = false; tour.part = -1; }}>the tutorial</button>
{:else if !part}
  <div class="coach frame parts" role="dialog" aria-label="The tutorial" aria-live="polite">
    <span class="label">isorite, tutorial</span>
    <p>This is a demo of isorite on an example N-body simulation project. Explore and read the knowledge base as you like, or follow the sections below for an interactive walkthrough.</p>
    <p class="faint">{#if local}Iso and the agent are scripted, and nothing leaves your machine; what you change is kept in the tutorial's folder.{:else}Iso is scripted, and nothing leaves this page; a reload starts it all again.{/if}</p>
    <ol class="list">
      {#each PARTS as p, k (p.key)}
        {@const n = tour.ticks[p.key]?.length ?? 0}
        <li>
          {#if p.steps.length}
            <button type="button" class="section" onclick={() => begin(k)} aria-label="{p.key}: {p.title}{n ? `, ${n} of ${p.steps.length} done` : ''}">
              <span class="key">{p.key}</span>
              <span class="what"><span class="t">{p.title}</span><span class="about">{p.about}</span>{#if p.earlier}<span class="note">an earlier version, being rewritten</span>{/if}</span>
              <span class="progress">{#if n === p.steps.length}{@render tickMark()}{:else if n}{n} of {p.steps.length}{/if}<span class="go" aria-hidden="true">›</span></span>
            </button>
          {:else}
            <div class="section coming" aria-label="{p.key}: {p.title}, coming">
              <span class="key">{p.key}</span>
              <span class="what"><span class="t">{p.title}</span><span class="about">{p.about}</span><span class="note">coming</span></span>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    <div class="row actions"><span class="grow"></span><button class="btn quiet" type="button" onclick={() => (tour.left = true)}>leave</button></div>
  </div>
{:else if step}
  {#if spot}<div class="spot" class:easing aria-hidden="true" style="left:{spot.x - 8}px;top:{spot.y - 8}px;width:{spot.w + 16}px;height:{spot.h + 16}px"></div>{/if}
  <div class="coach frame" class:small class:left={leftSide && !narrow} bind:this={coach} role="dialog" aria-label="The tutorial" aria-live="polite" style:bottom={lift ? `${lift}px` : null}>
    <div class="row head">
      <span class="label">{part.key} · {part.title.toLowerCase()}</span><span class="grow"></span>
      <span class="seg" aria-label="step {tour.at + 1} of {part.steps.length}, {tour.ticks[part.key]?.length ?? 0} done">{#each part.steps as s, k (s.title)}<i class:d={ticked(part.key, k)} class:at={k === tour.at}></i>{/each}</span>
      <button class="link" type="button" onclick={() => (tour.part = -1)}>sections</button>
      <button class="link" type="button" onclick={() => (tour.left = true)}>leave</button>
    </div>
    <h2>{#if narrow}<button class="fold" type="button" aria-expanded={!small} onclick={() => (small = !small)}>{step.title}</button>{:else}{step.title}{/if}</h2>
    {#if !small}<p>{step.text}</p>{/if}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an address within the app, by its hash -->
    {#if step.link && !small}<p><a href={step.link.href}>{step.link.text}</a></p>{/if}
    {#if tour.mistake && !small}<p class="mistake" role="status">{tour.mistake}</p>{/if}
    <div class="row actions" class:hidden={small}>
      {#if tour.at > 0}<button class="btn quiet" type="button" onclick={back} aria-label="back a step">‹ back</button>{/if}
      {#if waits}
        {#if met}<span class="label done">{@render tickMark()} done</span>{:else}<span class="label waiting">waiting for you</span>{/if}
      {/if}
      <span class="grow"></span>
      {#if waits}<button class="btn quiet" type="button" onclick={redo} disabled={redoing} title="put the base back as this step found it">{redoing ? "redoing…" : "redo"}</button>{/if}
      <button class="btn {waits && !met ? 'quiet' : 'primary'}" type="button" onclick={next}>{last ? "done" : "next ›"}</button>
    </div>
  </div>
{/if}

<style>
  /* What the step is about, lit; the rest dimmed to 80% (Tour-1). It takes no clicks, so the page works under it.
     It follows the page at once; it eases only into a new step's target (T6). */
  .spot {
    position: fixed; z-index: 40; pointer-events: none;
    box-shadow: 0 0 0 4000px color-mix(in srgb, var(--ground-0) 80%, transparent);
    outline: 1.5px dotted var(--growth); outline-offset: 0;
  }
  .spot.easing { transition: left 0.15s, top 0.15s, width 0.15s, height 0.15s; }
  .coach {
    position: fixed; right: 24px; bottom: 48px; z-index: 50; width: 340px; padding: 20px 22px 14px;
    display: flex; flex-direction: column; gap: 12px; --fill: var(--ground-2); --edge: var(--growth); --behind: var(--ground-2);
  }
  .coach.left { right: auto; left: 24px; }
  .coach.parts { width: 420px; max-height: calc(100vh - 96px); overflow-y: auto; }
  .row { display: flex; align-items: center; gap: 8px; }
  .coach h2 { font-family: var(--font-text); font-size: 23px; line-height: 1.25; font-weight: 400; margin: 0; color: var(--text); }
  .coach p { color: var(--text-soft); font-size: 13px; line-height: 1.55; margin: 0; }
  .coach p.faint { color: var(--text-faint); font-size: 12px; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  /* A section looks like something to open even before it is pointed at (T1): an edge, and › at the end. */
  .section {
    display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 10px 10px; text-align: left; font: inherit; color: var(--text);
    background: none; border: 1px solid var(--line); border-left: 2px solid var(--growth);
  }
  button.section { cursor: pointer; }
  button.section:hover, button.section:focus-visible { background: var(--ground-1); border-color: var(--growth); outline: none; }
  button.section:hover .go, button.section:focus-visible .go { color: var(--growth); transform: translateX(2px); }
  .section.coming { border-left-color: var(--line); color: var(--text-faint); }
  .section.coming .key { color: var(--text-faint); }
  .key { font-family: var(--font-mono); color: var(--growth); font-size: 13px; flex: none; width: 2em; padding-top: 2px; }
  .what { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  .t { font-family: var(--font-text); font-size: 16px; }
  .about { color: var(--text-faint); font-size: 12px; line-height: 1.45; }
  .note { font-family: var(--font-mono); color: var(--text-faint); font-size: 11px; }
  .progress { display: flex; align-items: center; gap: 8px; flex: none; font-family: var(--font-mono); font-size: 11px; color: var(--growth); padding-top: 3px; white-space: nowrap; }
  .go { color: var(--text-faint); font-size: 16px; line-height: 1; transition: transform 0.15s, color 0.15s; }
  .tick { color: var(--growth); flex: none; }
  .head { flex-wrap: wrap; row-gap: 6px; column-gap: 10px; }
  .seg { display: inline-flex; gap: 3px; margin-left: auto; align-items: center; }
  .seg i { width: 9px; height: 2px; background: var(--line); }
  .seg i.d { background: var(--growth); }
  .seg i.at { height: 4px; }
  .mistake { color: var(--rose) !important; border-left: 2px solid var(--rose); padding-left: 8px; }
  .actions { margin-top: 2px; gap: 10px; }
  .actions .btn { height: 30px; font-size: 12px; }
  .link { background: none; border: 0; padding: 2px 0; color: var(--text-faint); font-size: 11px; cursor: pointer; }
  .link:hover, .link:focus-visible { color: var(--text); }
  .waiting { color: var(--growth); white-space: nowrap; }
  .done { color: var(--growth); white-space: nowrap; display: inline-flex; gap: 4px; align-items: center; }
  .fold { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .fold::after { content: " ▾"; color: var(--text-faint); font-size: 0.7em; }
  .small .fold::after { content: " ▴"; }
  .hidden { display: none; }
  .back { position: fixed; right: 16px; bottom: 44px; z-index: 50; height: 28px; font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .spot.easing, .go { transition: none; } }
  @media (max-width: 600px) {
    .coach, .coach.parts { left: 8px; right: 8px; bottom: calc(84px + env(safe-area-inset-bottom)); width: auto; padding: 14px 16px 10px; gap: 8px; }
    .coach.parts { max-height: calc(100dvh - 160px); }
    .coach h2 { font-size: 19px; }
    .seg i { width: 7px; }
    .actions { gap: 8px; }
    .back { bottom: calc(84px + env(safe-area-inset-bottom)); }
  }
</style>
