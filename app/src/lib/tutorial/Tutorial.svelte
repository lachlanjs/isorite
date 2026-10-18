<script lang="ts">
  // The tutorial's coach card (Tour-1 … Tour-6): first the five parts, to take in order or one by one; then a part a
  // step at a time, the part of the page it is about lit and the rest dimmed. A step moves on when you have done what
  // it asks (the engine says so, or the page shows it), or with "next". On a phone a step may read differently.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { app } from "$lib/app.svelte.ts";
  import { PARTS, remember, type Step } from "./steps.ts";
  import { tour } from "./tour.svelte.ts";

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
  let spot = $state.raw<{ x: number; y: number; w: number; h: number } | null>(null);
  // On a phone the foot of the screen holds what a step asks you to use (ask Iso here, an exercise's buttons, a note
  // for Iso's): the card stands above it, and folds to its title when it is in the way.
  let lift = $state(0);
  let small = $state(false);
  const FOOT = ".seed, .foot, .changes, .deck";

  async function enter(k: number) {
    tour.at = k; small = false;
    const s = PARTS[tour.part]!.steps[k]!, go = (narrow ? s.phone?.go : undefined) ?? s.go;
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- an address within the app, by its hash
    if (go) await goto(`#${typeof go === "string" ? go : await go()}`);
  }
  function begin(k: number) {
    remember();
    tour.part = k; tour.left = false;
    void enter(0);
  }
  function next() {
    if (!part) return;
    if (!last) { void enter(tour.at + 1); return; }
    if (!tour.done.includes(tour.part)) tour.done.push(tour.part);
    tour.part = -1;
  }

  onMount(() => {
    const media = matchMedia("(max-width: 600px)");
    narrow = media.matches;
    const changed = () => { narrow = media.matches; };
    media.addEventListener("change", changed);
    const off = app.on((e) => { if (!left && step?.until?.(e)) next(); });
    // A few times a second: what the step lights, whether it is done, and the prompt to fill in.
    let frame = 0;
    const look = () => {
      frame = requestAnimationFrame(look);
      if (left || !step) { spot = null; return; }
      lift = 0;
      if (narrow) for (const el of document.querySelectorAll<HTMLElement>(FOOT)) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top > innerHeight / 2) lift = Math.max(lift, innerHeight - r.top + 8);
      }
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      const r = el?.getBoundingClientRect();
      spot = r && r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    };
    look();
    const tick = setInterval(() => {
      if (left || !step) return;
      if (step.fill) {
        const field = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('[aria-label="Ask Iso"]');
        if (field && !field.value && !field.dataset.filled) {
          field.dataset.filled = "1";
          field.value = step.fill;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      if (step.check?.()) next();
    }, 250);
    return () => { off(); cancelAnimationFrame(frame); clearInterval(tick); media.removeEventListener("change", changed); };
  });
</script>

{#if left}
  <button class="back btn quiet" type="button" onclick={() => { tour.left = false; tour.part = -1; }}>the tutorial</button>
{:else if !part}
  <div class="coach frame parts" role="dialog" aria-label="The tutorial" aria-live="polite">
    <div class="row"><i class="dia" aria-hidden="true"></i><span class="label">the tutorial</span></div>
    <h2>{tour.done.length ? "Another part?" : "isorite, on a small project"}</h2>
    <p>The base here is a developer's notes on an N-body simulation: bodies under gravity, stepped in time, made fast with Barnes–Hut. Each part stands on its own. Iso is scripted, and nothing leaves this page; a reload starts it all again.</p>
    <ol class="list">
      {#each PARTS as p, k (p.key)}
        <li><button type="button" class:done={tour.done.includes(k)} onclick={() => begin(k)} aria-label="part {p.key}: {p.title}{tour.done.includes(k) ? ', done' : ''}">
          <span class="key">{p.key}</span><span class="what"><span class="t">{p.title}</span><span class="about">{p.about}</span></span>{#if tour.done.includes(k)}<i class="dia" aria-hidden="true"></i>{/if}
        </button></li>
      {/each}
    </ol>
    <div class="row actions"><span class="grow"></span><button class="btn quiet" type="button" onclick={() => (tour.left = true)}>leave</button></div>
  </div>
{:else if step}
  {#if spot}<div class="spot" aria-hidden="true" style="left:{spot.x - 8}px;top:{spot.y - 8}px;width:{spot.w + 16}px;height:{spot.h + 16}px"></div>{/if}
  <div class="coach frame" class:small role="dialog" aria-label="The tutorial" aria-live="polite" style:bottom={lift ? `${lift}px` : null}>
    <div class="row head">
      <i class="dia" aria-hidden="true"></i><span class="label">part {part.key} · {part.title.toLowerCase()}</span><span class="grow"></span>
      <span class="seg" aria-label="step {tour.at + 1} of {part.steps.length}">{#each part.steps as s, k (s.title)}<i class:d={k <= tour.at}></i>{/each}</span>
    </div>
    <h2>{#if narrow}<button class="fold" type="button" aria-expanded={!small} onclick={() => (small = !small)}>{step.title}</button>{:else}{step.title}{/if}</h2>
    {#if !small}<p>{step.text}</p>{/if}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an address within the app, by its hash -->
    {#if step.link && !small}<p><a href={step.link.href}>{step.link.text}</a></p>{/if}
    <div class="row actions" class:hidden={small}>
      {#if waits}
        <span class="label waiting">waiting for you</span><span class="grow"></span>
        <button class="btn quiet" type="button" onclick={next}>skip</button>
      {:else}
        <button class="btn primary" type="button" onclick={next}>{last ? "done" : "next"}</button><span class="grow"></span>
      {/if}
      <button class="btn quiet" type="button" onclick={() => (tour.part = -1)}>parts</button>
      <button class="btn quiet" type="button" onclick={() => (tour.left = true)}>leave</button>
    </div>
  </div>
{/if}

<style>
  /* What the step is about, lit; the rest dimmed to 80% (Tour-1). It takes no clicks, so the page works under it. */
  .spot {
    position: fixed; z-index: 40; pointer-events: none;
    box-shadow: 0 0 0 4000px color-mix(in srgb, var(--ground-0) 80%, transparent);
    outline: 1.5px dotted var(--growth); outline-offset: 0;
    transition: left 0.15s, top 0.15s, width 0.15s, height 0.15s;
  }
  .coach {
    position: fixed; right: 24px; bottom: 48px; z-index: 50; width: 340px; padding: 20px 22px 18px;
    display: flex; flex-direction: column; gap: 12px; --fill: var(--ground-2); --edge: var(--growth); --behind: var(--ground-2);
  }
  .coach.parts { width: 400px; max-height: calc(100vh - 96px); overflow-y: auto; }
  .row { display: flex; align-items: center; gap: 8px; }
  .coach h2 { font-family: var(--font-text); font-size: 23px; line-height: 1.25; font-weight: 400; margin: 0; color: var(--text); }
  .coach p { color: var(--text-soft); font-size: 13px; line-height: 1.55; margin: 0; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .list button {
    display: flex; align-items: baseline; gap: 12px; width: 100%; padding: 8px 6px; border: 0; background: none; text-align: left;
    color: var(--text); cursor: pointer; font: inherit;
  }
  .list button:hover, .list button:focus-visible { background: var(--ground-1); outline: none; }
  .key { font-family: var(--font-mono); color: var(--growth); font-size: 13px; flex: none; }
  .what { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .t { font-family: var(--font-text); font-size: 16px; }
  .about { color: var(--text-faint); font-size: 12px; line-height: 1.45; }
  .done .t { color: var(--text-soft); }
  .head { flex-wrap: wrap; row-gap: 6px; }
  .seg { display: inline-flex; gap: 3px; margin-left: auto; }
  .seg i { width: 9px; height: 2px; background: var(--line); }
  .seg i.d { background: var(--growth); }
  .actions { margin-top: 4px; gap: 12px; }
  .actions .btn { height: 30px; font-size: 12px; }
  .waiting { color: var(--growth); white-space: nowrap; }
  .fold { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .fold::after { content: " ▾"; color: var(--text-faint); font-size: 0.7em; }
  .small .fold::after { content: " ▴"; }
  .hidden { display: none; }
  .back { position: fixed; right: 16px; bottom: 44px; z-index: 50; height: 28px; font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .spot { transition: none; } }
  @media (max-width: 600px) {
    .coach, .coach.parts { left: 8px; right: 8px; bottom: calc(84px + env(safe-area-inset-bottom)); width: auto; padding: 14px 16px; gap: 8px; }
    .coach.parts { max-height: calc(100dvh - 160px); }
    .coach h2 { font-size: 19px; }
    .seg i { width: 7px; }
    .actions { gap: 8px; }
    .back { bottom: calc(84px + env(safe-area-inset-bottom)); }
  }
</style>
