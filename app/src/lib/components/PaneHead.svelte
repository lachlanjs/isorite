<script lang="ts">
  // A pane's header: its name, then its switches (M12: in place of M10's lenses and Iso's modes), its own tools, and
  // at its right the pane's settings (M10b: there is no header above the panes). A switch says what it is on hover;
  // when on, its icon takes its colour, with a bar under it.
  import type { Snippet } from "svelte";
  import { SWITCHES, panes, type Pane, type Switch } from "$lib/panes.svelte.ts";

  let { pane, name, tools, settings }: { pane: Pane; name: string; tools?: Snippet; settings?: Snippet } = $props();

  const SAYS: Record<Switch, string> = {
    provenance: "Provenance: whose words are whose (Alt+P)", timeline: "Timeline (Alt+T)", context: "Iso's context: what it is sent, what it read and changed (Alt+C)",
    notes: "Iso may edit the notes (Alt+N)", files: "Iso may edit the project's files (Alt+F)", run: "Iso may run commands (Alt+R)",
  };
  const COLOUR: Record<Switch, string> = { provenance: "growth", timeline: "lattice", context: "growth", notes: "growth", files: "growth", run: "growth" };
  // The project's files and commands are the terminal's: offered only while one is attached (M11).
  const shown = $derived((SWITCHES[pane] as readonly Switch[]).filter((k) => (k !== "files" && k !== "run") || panes.terminal));
  const open = $derived(panes.settings === pane);
  let menu = $state<HTMLElement>();
  $effect(() => { if (open) menu?.focus(); });
  // A press outside the settings, and not on their button, closes them.
  function outside(e: PointerEvent): void {
    if (!open || !(e.target instanceof Element)) return;
    if (menu?.contains(e.target) || e.target.closest(`[data-settings="${pane}"]`)) return;
    panes.settings = null;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => { if (open && e.key === "Escape") panes.settings = null; }} />

<header class="phead">
  <span class="pname">{name}</span>
  <span class="switches" role="group" aria-label="{name}'s switches">
    {#each shown as k (k)}
      <button type="button" class="sw" data-switch={k} aria-pressed={panes.on[k]} aria-label={SAYS[k].replace(/ \(Alt\+.\)$/, "")} title={SAYS[k]} style:--c="var(--{COLOUR[k]})" onclick={() => panes.flip(k)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          {#if k === "provenance"}<rect x="2.5" y="2.5" width="11" height="11" /><path d="M8 2.5v11" /><rect x="8.6" y="3.1" width="4.3" height="9.8" fill="currentColor" stroke="none" />
          {:else if k === "timeline"}<path d="M8 1v14" stroke-width="1.2" /><rect x="5.5" y="2" width="5" height="3.2" fill="currentColor" stroke="none" /><path d="M8 6.3l2.3 2.3L8 10.9 5.7 8.6z" fill="currentColor" stroke="none" /><rect x="5.5" y="12" width="5" height="3" stroke-width="1.2" />
          {:else if k === "context"}<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" /><path d="M8 5.5l2.5 2.5L8 10.5 5.5 8z" fill="currentColor" stroke="none" />
          {:else if k === "notes"}<path d="M2.5 13.5l2.5-2.5M5 11c.6-4.2 3.6-7.4 8.5-8.5C12.6 7.2 9.4 10.4 5 11zM7.2 8.8l2.6-.3M8.8 6.6l2.4-.4" />
          {:else if k === "files"}<path d="M3.5 2.5h5.5l3.5 3.5v7.5h-9z" /><path d="M9 2.5V6h3.5" />
          {:else}<path d="M3 4.5l3 3.5-3 3.5M7.5 12h5.5" />{/if}
        </svg>
      </button>
    {/each}
  </span>
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
    <!-- Scrolled inside, so the frame's title, which stands over its edge, is not cut off. -->
    <div class="inner">{@render settings()}</div>
  </div>
{/if}

<style>
  .phead { height: 40px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 10px 0 16px; border-bottom: 1px solid var(--line); white-space: nowrap; user-select: none; position: relative; min-width: 0; overflow: hidden; }
  .pname { font-family: var(--font-pixel); font-size: 15px; color: var(--text-soft); display: flex; align-items: center; gap: 8px; }
  .pname::before { content: ""; width: 6px; height: 6px; background: var(--line-strong); }
  :global(.pane.focus) .pname { color: var(--text); }
  :global(.pane.focus) .pname::before { background: var(--lattice); }
  .switches { display: flex; align-items: center; gap: 1px; margin-left: -4px; }
  .sw { position: relative; width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .sw:hover, .sw:focus-visible { color: var(--text); }
  .sw[aria-pressed="true"] { color: var(--c); }
  .sw[aria-pressed="true"]::after { content: ""; position: absolute; left: 7px; right: 7px; bottom: 1px; height: 2px; background: var(--c); }
  .grow { flex: 1 1 auto; }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; background: none; border: 0; padding: 0; cursor: pointer; }
  .icon:hover, .icon:focus-visible { color: var(--text); }
  .gear[aria-expanded="true"] { color: var(--text); background: var(--ground-2); }
  .gear[aria-expanded="true"] rect { fill: var(--ground-2); }
  .settings { --inside: var(--ground-2); position: absolute; z-index: 21; top: 54px; right: 8px; width: min(400px, calc(100% - 16px)); padding: 0; white-space: normal; user-select: text; }
  .inner { max-height: calc(100dvh - 140px); overflow: auto; padding: 24px 18px 14px; display: flex; flex-direction: column; gap: var(--space-6); }
  .settings:focus-visible { outline: none; }
  @media (max-width: 760px) {
    .phead { height: 48px; }
    .settings { top: 62px; }
    .inner { max-height: calc(100dvh - 210px); }
  }
</style>
