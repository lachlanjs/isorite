<script lang="ts">
  // The Atlas's routes, one layer under the blocks: the layout's trunks and branches at rest, and over them
  // the links of the note chosen, their dashes running from what is required to what requires it; a weaker
  // link ("uses") is a plain line that does not run.
  let { k, rest, hot }: {
    /** The zoom: paths are given at zoom 1. */
    k: number;
    /** `strong`: a "requires" runs along it. A route of weaker links only is drawn lighter. */
    rest: { key: string; d: string; count: number; study: boolean; strong: boolean }[];
    hot: { key: string; d: string; kind: "requires" | "builds" | "uses" }[];
  } = $props();
</script>

<svg class="routes" aria-hidden="true">
  <g transform="scale({k})">
    {#each rest as r (r.key)}<path class={r.study ? "study" : r.strong ? "base" : "base weak"} d={r.d} style:stroke-width={r.study ? undefined : `${((r.strong ? 1.5 : 1) + Math.log2(r.count) * 0.5).toFixed(2)}px`} />{/each}
    {#each hot as r (r.key)}<path class="lit {r.kind}" d={r.d} />{/each}
  </g>
</svg>

<style>
  .routes { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  path { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .base { stroke: var(--line-strong); stroke-width: 1.5px; opacity: .6; }
  .weak { opacity: .28; }
  .study { stroke: var(--line-strong); stroke-width: 1.6px; stroke-dasharray: 1.5 5; stroke-linecap: round; opacity: .9; }
  .lit { stroke-width: 3px; stroke-dasharray: 7 5; animation: run .7s linear infinite; }
  .requires { stroke: var(--requires); }
  .builds { stroke: var(--builds); }
  .uses { stroke: var(--text-soft); stroke-width: 1.5px; stroke-dasharray: none; animation: none; }
  @keyframes run { to { stroke-dashoffset: -12; } }
  @media (prefers-reduced-motion: reduce) { .lit { animation: none; } }
</style>
