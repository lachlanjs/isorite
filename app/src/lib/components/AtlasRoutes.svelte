<script lang="ts">
  // The Atlas's routes, one layer under the blocks: the routes at rest, and over them the links of the note
  // chosen, their dashes running from what is required to what requires it; a weaker link ("uses") is a plain
  // line that does not run. Where routes overlap they are one line (geometry's mergeRoutes). At rest, as on the
  // boards, a line between two folders is heavy (3 px) and one inside a folder light (1.5 px), whatever it
  // carries: the count says how many. A lit line is 3 px however many links run along it, as on the boards; one
  // whose links run both ways stands still. The agent's steps along links are gold, as its lines on Desktop-Think, and a
  // note for the agent has a blue line to each note it links to.
  let { k, rest, hot, ghosts = [], pulses = [], counts, pointed = false, grown = [], beat = "", retracting = [] }: {
    /** The zoom: paths are given at zoom 1. */
    k: number;
    /** `strong`: a "requires" runs along it. A route of weaker links only is drawn lighter. `trunk`: between two folders. */
    rest: { key: string; d: string; count: number; strong: boolean; trunk: boolean }[];
    /** One pulse for each lit link, along its own way (see Atlas). */
    pulses?: { key: string; d: string; kind: "requires" | "builds" | "uses" | "agent" }[];
    hot: { key: string; d: string; kind: "requires" | "builds" | "uses" | "agent"; count: number; still: boolean }[];
    /** A lens's ghost joined to its home by a dotted line, while either is lit. */
    ghosts?: { key: string; d: string }[];
    /** The note's links are lit because it is pointed at, not chosen (M24): they draw out along their length in
     *  blue, and stand. Chosen, they run in their kinds' colours. */
    pointed?: boolean;
    /** The lit links of each kind, however their lines merge: said on the layer, for whoever reads it. */
    counts: { requires: number; builds: number; uses: number };
    /** Links just made, drawn growing from one end to the other, then gone (K3). */
    grown?: { key: string; d: string }[];
    /** A new layout's beats (V7): the old lines retract, nothing is drawn while things move, the new lines draw out. */
    beat?: "" | "retract" | "move" | "draw";
    retracting?: { key: string; d: string; strong: boolean; trunk: boolean }[];
  } = $props();
  // A line drawn along its own length (pathLength) is in the map's units, so its width is set by the zoom.
  const width = (r: { strong: boolean; trunk: boolean }): string => `${(r.strong ? (r.trunk ? 3 : 1.5) : r.trunk ? 2 : 1) / k}px`;
</script>

<!-- A pulse in three strokes, widest and faintest first: the halo (blurred, so it reads as light around the line), the
     glow, the sheen at its heart. -->
{#snippet pulse(d: string, tone: string, w: number)}
  <path class="pulse halo {tone}" pathLength="1" {d} style:stroke-width="{10 * w / k}px" style:filter="blur({3 / k}px)" /><path class="pulse glow {tone}" pathLength="1" {d} style:stroke-width="{4 * w / k}px" /><path class="pulse core {tone}" pathLength="1" {d} style:stroke-width="{1.3 * w / k}px" />
{/snippet}
<svg class="routes" aria-hidden="true" data-requires={counts.requires} data-builds={counts.builds} data-uses={counts.uses}>
  <g transform="scale({k})">
    {#if beat === "retract"}
      {#each retracting as r (r.key)}<path class="along retract {r.strong ? 'base' : 'base weak'}" class:trunk={r.trunk} pathLength="1" d={r.d} style:stroke-width={width(r)} />{/each}
    {:else if beat === "draw"}
      {#each rest as r (r.key)}<path class="along draw {r.strong ? 'base' : 'base weak'}" class:trunk={r.trunk} pathLength="1" d={r.d} style:stroke-width={width(r)} />{/each}
    {:else if beat === ""}
      {#each rest as r (r.key)}<path class={r.strong ? "base" : "base weak"} class:trunk={r.trunk} d={r.d} />{/each}
      {#each ghosts as r (r.key)}<path class="ghostline" d={r.d} />{/each}
      {#each hot as r (r.key)}
        {#if pointed && r.kind !== "agent"}<path class="along touch" pathLength="1" d={r.d} style:stroke-width="{2 / k}px" />
        {:else}<path class="lit {r.kind}" class:still={r.still} d={r.d} />
          {#if r.kind === "agent"}{@render pulse(r.d, `loop pk-${r.kind}`, 1)}{/if}{/if}
      {/each}
      {#each pulses as r (r.key)}
        {#if pointed}{@render pulse(r.d, "blue", 1)}{:else if r.kind !== "uses"}{@render pulse(r.d, `loop pk-${r.kind}`, 1)}{/if}
      {/each}
    {/if}
    <!-- Measured along its own length (pathLength), so drawn in the map's units: its width is set by the zoom. -->
    {#each grown as r (r.key)}{@render pulse(r.d, "slow", 1.25)}{/each}
  </g>
</svg>

<style>
  .routes { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  path { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  /* A ghost's line to its home: dotted, not running, and drawn only while lit. */
  .ghostline { stroke: var(--text-soft); stroke-width: 1.5px; stroke-dasharray: 2 4; opacity: .8; }
  .base { stroke: var(--line-strong); stroke-width: 1.5px; opacity: .6; } /* as the boards' .base */
  .base.trunk { stroke-width: 3px; opacity: .8; }
  .weak { stroke-width: 1px; opacity: .3; }
  .weak.trunk { stroke-width: 2px; opacity: .45; }
  /* A lit link is a plain line with pulses of light running along it, from what is required to what requires it, again and
     again; one whose links run both ways, and a weaker "uses", stand still. */
  .lit { stroke-width: 2px; opacity: .55; }
  .requires { stroke: var(--requires); }
  .builds { stroke: var(--builds); }
  .agent { stroke: var(--growth); stroke-width: 2.5px; } /* as the boards' .au */
  .uses { stroke: var(--text-soft); stroke-width: 1.5px; opacity: 1; }
  /* A pulse of light along a line, as the one round a touched control (lustre.ts): a bright head with a tail that fades,
     run once from the start of the line past its end. A new link is gold, a pointed note's links blue; the core is the
     sheen the controls' pulse has. The dash is measured along the line (pathLength 1), so it runs the same on any line. */
  .pulse { vector-effect: none; stroke-linecap: round; stroke-dasharray: var(--len) 3; stroke-dashoffset: var(--len); animation: pulse var(--dur, .6s) cubic-bezier(.3, .5, .4, 1) forwards; }
  .pulse.glow { --len: .3; stroke: var(--growth); opacity: .22; }
  /* The halo, longer than the glow so its light leads and trails it, and faint enough to read as light, not a line. */
  .pulse.halo { --len: .36; stroke: var(--growth); opacity: .16; } /* blurred by 3 screen pixels at any zoom (set where it is drawn) */
  .pulse:is(.glow, .halo).blue { stroke: var(--lattice); }
  .pulse:is(.glow, .halo).pk-requires { stroke: var(--requires); } .pulse:is(.glow, .halo).pk-builds { stroke: var(--builds); } .pulse:is(.glow, .halo).pk-agent { stroke: var(--growth); }
  .pulse.loop { animation: pulse-loop 2.2s cubic-bezier(.3, .5, .4, 1) infinite; }
  @keyframes pulse-loop { 0% { stroke-dashoffset: var(--len); } 55%, 100% { stroke-dashoffset: -1; } }
  .pulse.core { --len: .09; stroke: rgb(var(--sheen)); opacity: .7; }
  .pulse.slow { --dur: .9s; }
  @keyframes pulse { to { stroke-dashoffset: -1; } }
  /* The beats of a new layout (V7): along each line from its start, back to it, then out again. */
  .along { vector-effect: none; stroke-dasharray: 1; stroke-linecap: butt; }
  .retract { stroke-dashoffset: 0; animation: retract 0.22s ease-in forwards; }
  .draw { stroke-dashoffset: 1; animation: draw 0.34s ease-out forwards; }
  /* 1.5 times a change (Lachlan, 2026-10-29), slow enough to follow where it goes. */
  .touch { stroke: var(--lattice); stroke-dashoffset: 1; opacity: .85; animation: draw calc(var(--t-change) * 1.2) var(--ease-out) forwards; }
  @keyframes retract { to { stroke-dashoffset: 1; } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) { .touch { animation: none; stroke-dashoffset: 0; } .pulse { display: none; } }
</style>
