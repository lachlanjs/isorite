<script lang="ts">
  // A tag that stands out from a point on a stem, in the shape the held note's tags have: a cut-corner square in a
  // colour, an icon in it, its name said beside it when it is pointed at (it grows and glows as the pointer nears,
  // and fills when it is the one). Used where a selection or a hold on open ground offers a choice. The caller places
  // it (`x`, `y` on its own surface), says which side its name goes on, and handles what is done with it.
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let { x, y, label, hint = "", on = false, near = 0, below = true, i = 0, tone = "var(--lattice)", children, ...rest }: {
    x: number; y: number; label: string; hint?: string; on?: boolean; near?: number; below?: boolean; i?: number; tone?: string; children: Snippet;
  } & Omit<HTMLButtonAttributes, "children"> = $props();
</script>

<button type="button" class="tag" class:on class:below tabindex="-1" aria-label={label} style="left:{x}px;top:{y}px;--i:{i};--near:{near};--c:{tone}" {...rest}>
  <span class="face">{@render children()}</span>
  <span class="lbl">{label}{#if hint}<kbd>{hint}</kbd>{/if}</span>
</button>

<style>
  .tag { padding: 0; border: 0; background: none; font: inherit; position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; pointer-events: auto; color: var(--c); user-select: none; -webkit-user-select: none; cursor: pointer;
    scale: calc(1 + .14 * var(--near)); filter: drop-shadow(0 0 calc(var(--near) * 8px) color-mix(in srgb, var(--c) calc(var(--near) * 70%), transparent)) drop-shadow(0 4px 8px rgb(0 0 0 / .25));
    transition: scale var(--t-ack) var(--ease-out), filter var(--t-ack) var(--ease-out);
    animation: tag var(--t-change) cubic-bezier(.2, 1.3, .4, 1) backwards; animation-delay: calc(var(--i) * 30ms); }
  .tag:hover, .tag.on { scale: 1.16; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c) 70%, transparent)) drop-shadow(0 4px 8px rgb(0 0 0 / .25)); }
  @keyframes tag { from { scale: .3; opacity: 0; } }
  .face { position: absolute; inset: 0; display: grid; place-items: center; background: var(--c); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
  .face::before { content: ""; position: absolute; inset: 1.5px; background: var(--ground-2); transition: background-color var(--t-ack) var(--ease-out); clip-path: polygon(7.4px 0, 100% 0, 100% calc(100% - 7.4px), calc(100% - 7.4px) 100%, 0 100%, 0 7.4px); }
  .face :global(svg) { position: relative; transition: color var(--t-ack) var(--ease-out); }
  .tag:hover .face::before, .tag.on .face::before { background: var(--c); }
  .tag:hover .face :global(svg), .tag.on .face :global(svg) { color: var(--ground-0); }
  .lbl { position: absolute; left: 50%; top: calc(100% + 6px); translate: -50% -4px; padding: 2px 6px; font: 11px/1.4 var(--font-ui); white-space: nowrap; color: var(--c); background: var(--ground-0); opacity: 0; transition: opacity var(--t-ack) var(--ease-out), translate var(--t-ack) var(--ease-out); pointer-events: none; }
  .tag:not(.below) .lbl { top: auto; bottom: calc(100% + 6px); translate: -50% 4px; }
  .tag:hover .lbl, .tag.on .lbl { opacity: 1; translate: -50% 0; }
  .lbl :global(kbd) { margin-left: 6px; font: 10px var(--font-mono); color: var(--text-faint); }
  @media (prefers-reduced-motion: reduce) { .tag { animation: none; transition: none; } }
</style>
