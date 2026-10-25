<script lang="ts">
  // The Atlas's routes, one layer under the blocks: the routes at rest, and over them the links of the note
  // chosen, their dashes running from what is required to what requires it; a weaker link ("uses") is a plain
  // line that does not run. Where routes overlap they are one line (geometry's mergeRoutes). At rest, as on the
  // boards, a line between two folders is heavy (3 px) and one inside a folder light (1.5 px), whatever it
  // carries: the count says how many. A lit line is 3 px however many links run along it, as on the boards; one
  // whose links run both ways stands still. Iso's steps along links are gold, as its lines on Desktop-Think, and a
  // note for Iso has a blue line to each note it links to.
  let { k, rest, hot, counts, sent = [], grown = [], beat = "", retracting = [] }: {
    /** The zoom: paths are given at zoom 1. */
    k: number;
    /** `strong`: a "requires" runs along it. A route of weaker links only is drawn lighter. `trunk`: between two folders. */
    rest: { key: string; d: string; count: number; strong: boolean; trunk: boolean }[];
    hot: { key: string; d: string; kind: "requires" | "builds" | "uses" | "iso"; count: number; still: boolean }[];
    /** The lit links of each kind, however their lines merge: said on the layer, for whoever reads it. */
    counts: { requires: number; builds: number; uses: number };
    /** A note for Iso's lines to the notes it links to. */
    sent?: { key: string; d: string }[];
    /** Links just made, drawn growing from one end to the other, then gone (K3). */
    grown?: { key: string; d: string }[];
    /** A new layout's beats (V7): the old lines retract, nothing is drawn while things move, the new lines draw out. */
    beat?: "" | "retract" | "move" | "draw";
    retracting?: { key: string; d: string; strong: boolean; trunk: boolean }[];
  } = $props();
  // A line drawn along its own length (pathLength) is in the map's units, so its width is set by the zoom.
  const width = (r: { strong: boolean; trunk: boolean }): string => `${(r.strong ? (r.trunk ? 3 : 1.5) : r.trunk ? 2 : 1) / k}px`;
</script>

<svg class="routes" aria-hidden="true" data-requires={counts.requires} data-builds={counts.builds} data-uses={counts.uses}>
  <g transform="scale({k})">
    {#if beat === "retract"}
      {#each retracting as r (r.key)}<path class="along retract {r.strong ? 'base' : 'base weak'}" class:trunk={r.trunk} pathLength="1" d={r.d} style:stroke-width={width(r)} />{/each}
    {:else if beat === "draw"}
      {#each rest as r (r.key)}<path class="along draw {r.strong ? 'base' : 'base weak'}" class:trunk={r.trunk} pathLength="1" d={r.d} style:stroke-width={width(r)} />{/each}
    {:else if beat === ""}
      {#each rest as r (r.key)}<path class={r.strong ? "base" : "base weak"} class:trunk={r.trunk} d={r.d} />{/each}
      {#each sent as r (r.key)}<path class="sent" d={r.d} />{/each}
      {#each hot as r (r.key)}<path class="lit {r.kind}" class:still={r.still} d={r.d} />{/each}
    {/if}
    <!-- Measured along its own length (pathLength), so drawn in the map's units: its width is set by the zoom. -->
    {#each grown as r (r.key)}<path class="grown" pathLength="1" d={r.d} style:stroke-width="{3 / k}px" />{/each}
  </g>
</svg>

<style>
  .routes { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  path { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .base { stroke: var(--line-strong); stroke-width: 1.5px; opacity: .6; } /* as the boards' .base */
  .base.trunk { stroke-width: 3px; opacity: .8; }
  .weak { stroke-width: 1px; opacity: .3; }
  .weak.trunk { stroke-width: 2px; opacity: .45; }
  .lit { stroke-width: 3px; stroke-dasharray: 7 5; animation: run .7s linear infinite; }
  .requires { stroke: var(--requires); }
  .builds { stroke: var(--builds); }
  .iso { stroke: var(--growth); stroke-width: 2.5px; } /* as the boards' .au */
  .sent { stroke: var(--lattice); stroke-width: 2px; } /* as the boards' .me */
  .uses { stroke: var(--text-soft); stroke-width: 1.5px; stroke-dasharray: none; animation: none; }
  @keyframes run { to { stroke-dashoffset: -12; } }
  /* Slow enough to follow (Lachlan, 2026-10-20): a moment's wait, 1.8 s to grow, 2 s to stand, then it fades. */
  .grown { vector-effect: none; stroke: var(--growth); stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: grow 5.5s ease-in-out forwards; }
  @keyframes grow { 0% { stroke-dashoffset: 1; opacity: 1; } 9% { stroke-dashoffset: 1; } 42% { stroke-dashoffset: 0; opacity: 1; } 78% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
  .still { animation: none; }
  /* The beats of a new layout (V7): along each line from its start, back to it, then out again. */
  .along { vector-effect: none; stroke-dasharray: 1; stroke-linecap: butt; }
  .retract { stroke-dashoffset: 0; animation: retract 0.22s ease-in forwards; }
  .draw { stroke-dashoffset: 1; animation: draw 0.34s ease-out forwards; }
  @keyframes retract { to { stroke-dashoffset: 1; } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) { .lit { animation: none; } .grown { animation: none; stroke-dashoffset: 0; opacity: .6; } }
</style>
