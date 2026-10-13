<script lang="ts">
  // The Atlas's routes, one layer under the blocks: the layout's trunks and branches at rest, and over them
  // the links of the note chosen, their dashes running from what is required to what requires it.
  let { k, rest, hot }: {
    /** The zoom: paths are given at zoom 1. */
    k: number;
    rest: { key: string; d: string; count: number; study: boolean }[];
    hot: { key: string; d: string; kind: "requires" | "builds" }[];
  } = $props();
</script>

<svg class="routes" aria-hidden="true">
  <g transform="scale({k})">
    {#each rest as r (r.key)}<path class={r.study ? "study" : "base"} d={r.d} style:stroke-width={r.study ? undefined : `${(1.5 + Math.log2(r.count) * 0.5).toFixed(2)}px`} />{/each}
    {#each hot as r (r.key)}<path class="lit {r.kind}" d={r.d} />{/each}
  </g>
</svg>

<style>
  .routes { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  path { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .base { stroke: var(--line-strong); stroke-width: 1.5px; opacity: .6; }
  .study { stroke: var(--line-strong); stroke-width: 1.6px; stroke-dasharray: 1.5 5; stroke-linecap: round; opacity: .9; }
  .lit { stroke-width: 3px; stroke-dasharray: 7 5; animation: run .7s linear infinite; }
  .requires { stroke: var(--requires); }
  .builds { stroke: var(--builds); }
  @keyframes run { to { stroke-dashoffset: -12; } }
  @media (prefers-reduced-motion: reduce) { .lit { animation: none; } }
</style>
