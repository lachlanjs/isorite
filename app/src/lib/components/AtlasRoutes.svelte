<script lang="ts">
  // The Atlas's routes, one layer under the blocks: the routes at rest, and over them the links of the note
  // chosen, their dashes running from what is required to what requires it; a weaker link ("uses") is a plain
  // line that does not run. Where routes overlap they are one line (geometry's mergeRoutes). At rest, as on the
  // boards, a line between two folders is heavy (3 px) and one inside a folder light (1.5 px), whatever it
  // carries: the count says how many. A lit line is 3 px however many links run along it, as on the boards; one
  // whose links run both ways stands still. Iso's steps along links are gold, as its lines on Desktop-Think, and a
  // note for Iso has a blue line to each note it links to.
  let { k, rest, hot, counts, sent = [] }: {
    /** The zoom: paths are given at zoom 1. */
    k: number;
    /** `strong`: a "requires" runs along it. A route of weaker links only is drawn lighter. `trunk`: between two folders. */
    rest: { key: string; d: string; count: number; study: boolean; strong: boolean; trunk: boolean }[];
    hot: { key: string; d: string; kind: "requires" | "builds" | "uses" | "iso"; count: number; still: boolean }[];
    /** The lit links of each kind, however their lines merge: said on the layer, for whoever reads it. */
    counts: { requires: number; builds: number; uses: number };
    /** A note for Iso's lines to the notes it links to. */
    sent?: { key: string; d: string }[];
  } = $props();
</script>

<svg class="routes" aria-hidden="true" data-requires={counts.requires} data-builds={counts.builds} data-uses={counts.uses}>
  <g transform="scale({k})">
    {#each rest as r (r.key)}<path class={r.study ? "study" : r.strong ? "base" : "base weak"} class:trunk={r.trunk && !r.study} d={r.d} />{/each}
    {#each sent as r (r.key)}<path class="sent" d={r.d} />{/each}
    {#each hot as r (r.key)}<path class="lit {r.kind}" class:still={r.still} d={r.d} />{/each}
  </g>
</svg>

<style>
  .routes { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  path { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .base { stroke: var(--line-strong); stroke-width: 1.5px; opacity: .6; } /* as the boards' .base */
  .base.trunk { stroke-width: 3px; opacity: .8; }
  .weak { stroke-width: 1px; opacity: .3; }
  .weak.trunk { stroke-width: 2px; opacity: .45; }
  .study { stroke: var(--line-strong); stroke-width: 1.6px; stroke-dasharray: 1.5 5; stroke-linecap: round; opacity: .9; }
  .lit { stroke-width: 3px; stroke-dasharray: 7 5; animation: run .7s linear infinite; }
  .requires { stroke: var(--requires); }
  .builds { stroke: var(--builds); }
  .iso { stroke: var(--growth); stroke-width: 2.5px; } /* as the boards' .au */
  .sent { stroke: var(--lattice); stroke-width: 2px; } /* as the boards' .me */
  .uses { stroke: var(--text-soft); stroke-width: 1.5px; stroke-dasharray: none; animation: none; }
  @keyframes run { to { stroke-dashoffset: -12; } }
  .still { animation: none; }
  @media (prefers-reduced-motion: reduce) { .lit { animation: none; } }
</style>
