<script lang="ts">
  // A pane's header: its name, then its lenses (Note, Atlas) or Iso's modes, its own tools, and at its right the
  // pane's settings (M10b: there is no header above the panes). On a phone a swipe up or down on the header changes
  // the lens or mode; never on the pane's body, which scrolls (agreed 2026-10-22).
  import type { Snippet } from "svelte";
  import { LENSES, panes, type Lens, type Pane } from "$lib/panes.svelte.ts";

  let { pane, name, tools, settings }: { pane: Pane; name: string; tools?: Snippet; settings?: Snippet } = $props();

  const SYM: Record<Lens, string> = { normal: "○", iso: "◆", understand: "◇" };
  const WORD: Record<Lens, string> = { normal: "normal", iso: "Iso", understand: "understand" };
  const MODE_NAME: Record<string, string> = { ask: "Ask", write: "Write", build: "Build", understand: "Understand" };
  const MODE_SAYS: Record<string, string> = { ask: "reads the knowledge base, changes nothing", write: "reads and writes the knowledge base", build: "reads, writes and runs the project", understand: "reads the knowledge base, writes the study base" };
  const open = $derived(panes.settings === pane);
  let menu = $state<HTMLElement>();

  function step(by: number): void {
    if (pane === "iso") panes.stepMode(by);
    else panes.stepLens(pane, by);
  }
  let start: { x: number; y: number } | null = null;
  function down(e: TouchEvent): void { const t = e.touches[0]!; start = { x: t.clientX, y: t.clientY }; }
  function up(e: TouchEvent): void {
    if (!start) return;
    const t = e.changedTouches[0]!, dx = t.clientX - start.x, dy = t.clientY - start.y;
    start = null;
    if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx) * 1.3) step(dy < 0 ? 1 : -1);
  }
  $effect(() => { if (open) menu?.focus(); });
  // A press outside the settings, and not on their button, closes them.
  function outside(e: PointerEvent): void {
    if (!open || !(e.target instanceof Element)) return;
    if (menu?.contains(e.target) || e.target.closest(`[data-settings="${pane}"]`)) return;
    panes.settings = null;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => { if (open && e.key === "Escape") panes.settings = null; }} />

<!-- The swipe only adds to the buttons, which do the same. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="phead" ontouchstart={down} ontouchend={up}>
  <span class="pname">{name}</span>
  {#if pane === "iso"}
    <span class="modes" role="group" aria-label="Iso's mode">
      {#each panes.modes as m (m)}
        <!-- A speech bubble, a scribe's quill, an L-system's sprig (I7). -->
        <button type="button" class="mode" data-mode={m} aria-pressed={panes.mode === m} aria-label={MODE_NAME[m]} title="{MODE_NAME[m]}: {MODE_SAYS[m]}  (Shift+Tab in Iso's box)" onclick={() => panes.setMode(m)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            {#if m === "ask"}<path d="M2.5 3.5h11v7.5h-6.5l-3 2.5v-2.5h-1.5z" />
            {:else if m === "write"}<path d="M2.5 13.5l2.5-2.5M5 11c.6-4.2 3.6-7.4 8.5-8.5C12.6 7.2 9.4 10.4 5 11zM7.2 8.8l2.6-.3M8.8 6.6l2.4-.4" />
            {:else if m === "understand"}<path d="M8 14.5V7.5M8 7.5L4.6 4.4M8 7.5l3.4-3.1M8 7.5V2.5M4.6 4.4L2.8 4.6M4.6 4.4L4.5 2.4M11.4 4.4l1.8.2M11.4 4.4l.1-2M8 11L5.8 9.6M8 11l2.2-1.4" />
            {:else}<path d="M3 4.5l3 3.5-3 3.5M7.5 12h5.5" />{/if}
          </svg>
        </button>
      {/each}
    </span>
  {:else}
    {@const p = pane}
    <span class="lenses" role="group" aria-label="{name}'s lens">
      {#each LENSES as l (l)}
        <button type="button" class="lens" data-lens={l} class:waiting={panes.waiting[p] === l} aria-pressed={panes.lens[p] === l} aria-label="{WORD[l]} lens" title="{WORD[l]} lens  (Alt+↑ / Alt+↓)" onclick={() => panes.setLens(p, l)}>
          <span class="sym" aria-hidden="true">{SYM[l]}</span><span class="word">{WORD[l]}</span>
        </button>
      {/each}
    </span>
  {/if}
  <span class="grow"></span>
  {@render tools?.()}
  {#if settings}
    <button class="icon gear" type="button" data-settings={pane} aria-label="{name} settings" aria-expanded={open} title="{name} settings" onclick={() => (panes.settings = open ? null : pane)}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /><rect x="9" y="3" width="2.5" height="3" fill="var(--ground-0)" /><rect x="4.5" y="6.5" width="2.5" height="3" fill="var(--ground-0)" /><rect x="10" y="10" width="2.5" height="3" fill="var(--ground-0)" /></svg>
    </button>
  {/if}
</header>
{#if settings && open}
  <div class="frame settings" role="dialog" aria-label="{name} settings" tabindex="-1" bind:this={menu}>
    <span class="frame-title">{name.toLowerCase()}</span>
    {@render settings()}
  </div>
{/if}

<style>
  .phead { height: 40px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 10px 0 16px; border-bottom: 1px solid var(--line); white-space: nowrap; user-select: none; position: relative; min-width: 0; overflow: hidden; }
  .pname { font-family: var(--font-pixel); font-size: 15px; color: var(--text-soft); display: flex; align-items: center; gap: 8px; }
  .pname::before { content: ""; width: 6px; height: 6px; background: var(--line-strong); }
  :global(.pane.focus) .pname { color: var(--text); }
  :global(.pane.focus) .pname::before { background: var(--lattice); }
  .lenses, .modes { display: flex; align-items: center; gap: 2px; }
  .lens, .mode { height: 24px; padding: 0 7px; background: none; border: 0; color: var(--text-faint); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .lens:hover, .mode:hover { color: var(--text); }
  .lens .sym { font-size: 11px; }
  .lens .word { display: none; }
  .lens[aria-pressed="true"] { color: var(--text); background: var(--ground-2); }
  .lens[aria-pressed="true"] .word { display: inline; }
  .lens[data-lens="iso"][aria-pressed="true"] .sym { color: var(--growth); }
  .lens[data-lens="understand"][aria-pressed="true"] .sym { color: var(--malachite); }
  /* Iso has something to show in this lens, and you are working in the pane: lit, not switched to. */
  .lens.waiting .sym { color: var(--growth); animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0.3; } }
  /* The mode is the strongest mark in a header, so it is never taken for a lens. */
  .mode { width: 28px; height: 26px; padding: 0; justify-content: center; }
  .mode[aria-pressed="true"] { color: var(--ground-0); background: var(--growth); }
  .mode[data-mode="understand"][aria-pressed="true"] { background: var(--malachite); }
  .grow { flex: 1 1 auto; }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; background: none; border: 0; padding: 0; cursor: pointer; }
  .icon:hover, .icon:focus-visible { color: var(--text); }
  .gear[aria-expanded="true"] { color: var(--text); background: var(--ground-2); }
  .gear[aria-expanded="true"] rect { fill: var(--ground-2); }
  .settings { --inside: var(--ground-2); position: absolute; z-index: 21; top: 54px; right: 8px; width: min(400px, calc(100% - 16px)); max-height: calc(100% - 64px); overflow: auto; padding: 24px 18px 14px; display: flex; flex-direction: column; gap: var(--space-6); white-space: normal; user-select: text; }
  .settings:focus-visible { outline: none; }
  @media (max-width: 760px) {
    .phead { height: 48px; touch-action: pan-x; }
    /* The handle says the header can be swiped up and down. */
    .phead::after { content: ""; position: absolute; left: 50%; bottom: 3px; width: 28px; height: 3px; margin-left: -14px; background: var(--line); }
    .lens .word, .lens[aria-pressed="true"] .word { display: none; }
    .settings { top: 62px; max-height: calc(100% - 72px); }
  }
  @media (prefers-reduced-motion: reduce) { .lens.waiting .sym { animation: none; } }
</style>
