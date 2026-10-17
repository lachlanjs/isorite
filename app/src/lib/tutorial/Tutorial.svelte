<script lang="ts">
  // The tutorial's coach card (Tour-1 … Tour-6): a step at a time, the part it is about lit and the rest dimmed.
  // A step moves on when you have done what it asks (the engine says so, or the page shows it), or with "next".
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { app } from "$lib/app.svelte.ts";
  import { SECTIONS, STEPS, type Step } from "./steps.ts";
  import { tour } from "./tour.svelte.ts";

  // Where the tutorial is lives outside the card, so it carries on if the card is drawn again.
  const at = $derived(tour.at);
  const left = $derived(tour.left);
  let spot = $state.raw<{ x: number; y: number; w: number; h: number } | null>(null);
  const step = $derived<Step>(STEPS[at]!);
  const waits = $derived(Boolean(step.until || step.check));

  async function enter(k: number) {
    tour.at = k; tour.started = true;
    const s = STEPS[k]!;
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- an address within the app, by its hash
    if (s.go) await goto(`#${typeof s.go === "string" ? s.go : await s.go()}`);
  }
  const next = () => { if (tour.at < STEPS.length - 1) void enter(tour.at + 1); else tour.left = true; };

  onMount(() => {
    if (!tour.started) void enter(0);
    const off = app.on((e) => { if (!left && step.until?.(e)) next(); });
    // A few times a second: what the step lights, whether it is done, and the prompt to fill in.
    let frame = 0;
    const look = () => {
      frame = requestAnimationFrame(look);
      if (left) { spot = null; return; }
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      const r = el?.getBoundingClientRect();
      spot = r && r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    };
    look();
    const tick = setInterval(() => {
      if (left) return;
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
    return () => { off(); cancelAnimationFrame(frame); clearInterval(tick); };
  });
</script>

{#if !left}
  {#if spot}<div class="spot" aria-hidden="true" style="left:{spot.x - 8}px;top:{spot.y - 8}px;width:{spot.w + 16}px;height:{spot.h + 16}px"></div>{/if}
  <div class="coach frame" role="dialog" aria-label="The tutorial" aria-live="polite">
    <div class="row">
      <i class="dia" aria-hidden="true"></i><span class="label">a short tour</span><span class="grow"></span>
      <span class="seg" aria-label="{SECTIONS[step.section]}: part {step.section + 1} of {SECTIONS.length}">{#each SECTIONS as s, k (s)}<i class:d={k <= step.section}></i>{/each}</span>
    </div>
    <h2>{step.title}</h2>
    <p>{step.text}</p>
    <div class="row actions">
      {#if waits}
        <span class="label waiting">waiting for you</span><span class="grow"></span>
        <button class="btn quiet" type="button" onclick={next}>skip</button>
      {:else}
        <button class="btn primary" type="button" onclick={next}>{at === STEPS.length - 1 ? "done" : "next"}</button><span class="grow"></span>
      {/if}
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
  .row { display: flex; align-items: center; gap: 8px; }
  .coach h2 { font-family: var(--font-text); font-size: 23px; line-height: 1.25; font-weight: 400; margin: 0; color: var(--text); }
  .coach p { color: var(--text-soft); font-size: 13px; line-height: 1.55; margin: 0; }
  .seg { display: inline-flex; gap: 4px; }
  .seg i { width: 16px; height: 2px; background: var(--line); }
  .seg i.d { background: var(--growth); }
  .actions { margin-top: 4px; gap: 12px; }
  .actions .btn { height: 30px; font-size: 12px; }
  .waiting { color: var(--growth); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .spot { transition: none; } }
  @media (max-width: 600px) {
    .coach { left: 8px; right: 8px; bottom: calc(84px + env(safe-area-inset-bottom)); width: auto; padding: 14px 16px; gap: 8px; }
    .coach h2 { font-size: 19px; }
    .seg i { width: 10px; }
  }
</style>
