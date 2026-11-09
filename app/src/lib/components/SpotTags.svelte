<script lang="ts">
  // What a hold on open ground offers: two tags stand out from the spot held, up and to either side of it: a new note,
  // and a new folder (with its first note). Let go on one and it is made; let go anywhere else and nothing is.
  // `choice` is the one the pointer is on (the caller finds it by `data-spot`); `px`, `py` is the pointer, so the
  // tags lean towards it as it comes near. Coordinates are the surface's own.
  import Petal from "./Petal.svelte";

  let { x, y, w, h, choice, px, py }: { x: number; y: number; w: number; h: number; choice: "note" | "folder" | null; px: number; py: number } = $props();

  const WAYS = [{ which: "note" as const, deg: -128, label: "new note" }, { which: "folder" as const, deg: -52, label: "new folder" }];
  const R = 58, EDGE = 18;
  const tags = $derived.by(() => {
    // Up from the spot, either side of it; turned as little as it takes to keep both in the surface (a spot in a corner
    // has them stand out along its edges), and then kept apart whatever is left.
    const place = (turn: number) => WAYS.map((v) => {
      const t = ((v.deg + turn) * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t);
      return { ...v, ux, uy, tx: x + ux * R, ty: y + uy * R };
    });
    const lost = (p: ReturnType<typeof place>) => p.reduce((n, q) => n + Math.max(0, EDGE - q.tx) + Math.max(0, q.tx - (w - EDGE)) + Math.max(0, EDGE - q.ty) + Math.max(0, q.ty - (h - EDGE)), 0);
    let best = place(0), least = lost(best);
    for (const turn of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 105, -105, 120, -120, 135, -135, 150, -150, 165, 180]) {
      const p = place(turn), l = lost(p);
      if (l === 0) { best = p; least = 0; break; }
      if (l < least) { best = p; least = l; }
    }
    const out = best.map((q, i) => {
      const tx = Math.min(Math.max(q.tx, EDGE), Math.max(EDGE, w - EDGE)), ty = Math.min(Math.max(q.ty, EDGE), Math.max(EDGE, h - EDGE));
      return { ...q, i, tx, ty };
    });
    if (out.length === 2 && Math.hypot(out[0]!.tx - out[1]!.tx, out[0]!.ty - out[1]!.ty) < 46) {
      // Squeezed: the second goes along the edge it is against, clear of the first.
      const a = out[0]!, b = out[1]!, dx = b.tx - a.tx, dy = b.ty - a.ty, d = Math.hypot(dx, dy) || 1;
      b.tx = Math.min(Math.max(a.tx + (dx / d) * 46, EDGE), Math.max(EDGE, w - EDGE));
      b.ty = Math.min(Math.max(a.ty + (dy / d) * 46, EDGE), Math.max(EDGE, h - EDGE));
    }
    return out.map((q) => {
      const near = Math.max(0, Math.min(1, (84 - Math.hypot(px - q.tx, py - q.ty)) / 64));
      return { which: q.which, label: q.label, i: q.i, x: q.tx, y: q.ty, near, below: q.ty > y + 8, sx: x + q.ux * 6, sy: y + q.uy * 6, ex: q.tx - q.ux * 15, ey: q.ty - q.uy * 15 };
    });
  });
</script>

<div class="spot" role="presentation">
  <svg class="stems" aria-hidden="true">
    <circle cx={x} cy={y} r="4" />
    {#each tags as t (t.which)}<line x1={t.sx} y1={t.sy} x2={t.ex} y2={t.ey} class:on={choice === t.which} />{/each}
  </svg>
  {#each tags as t (t.which)}
    <Petal x={t.x} y={t.y} label={t.label} on={choice === t.which} near={t.near} below={t.below} i={t.i} data-spot={t.which}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        {#if t.which === "note"}<path d="M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3" /><path d="M8 8v4M6 10h4" />
        {:else}<path d="M1.5 4.5h5l1.5 2h6.5v7h-13z" /><path d="M8 8.5v3.5M6.2 10.2h3.6" />{/if}
      </svg>
    </Petal>
  {/each}
</div>

<style>
  .spot { position: absolute; inset: 0; z-index: 9; pointer-events: none; }
  .stems { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
  .stems circle { fill: var(--lattice); opacity: .8; }
  .stems line { stroke: var(--lattice); stroke-width: 1.5; stroke-linecap: round; opacity: .6; }
  .stems line.on { stroke-width: 2.5; opacity: 1; }
</style>
