<script lang="ts">
  // A debugging view of the Atlas: the router's grid, a point at the centre of every cell, coloured by what the
  // router makes of it. Drawn on a canvas over the map, in screen pixels, and only the cells in view.
  import { buildCells, ROUTER_DEFAULTS, type Layout, type Point } from "@isorite/core/atlas";
  import type { View } from "$lib/atlas/geometry.ts";

  let { layout, view, size, rested, routes, coarse, blocks, leaves, onhide, onroutes, ongrain, onlayout, onleaves }: {
    layout: Layout;
    view: View;
    size: { w: number; h: number };
    /** The routes drawn at rest, in cells. */
    rested: Point[][];
    /** Which they are: the highways, the gated routes, or the layout's trunks (each with feeders but the gated). */
    routes: "highways" | "gates" | "trunks";
    /** Whether the map is on the coarse grid. */
    coarse: boolean;
    /** Whether folders holding folders are placed as blocks, not in layers. */
    blocks: boolean;
    /** Whether each note's branch to its folder's wall is drawn at rest. */
    leaves: boolean;
    onhide: () => void;
    onroutes: () => void;
    ongrain: () => void;
    onlayout: () => void;
    onleaves: () => void;
  } = $props();

  /** Below this many pixels a cell, the points are too close to tell apart and are not drawn. */
  const LEAST = 5;
  const FREE = 1, NEAR = 2, WALL = 3, ROUTE = 4, GATE = 5;
  const NAMES = ["a note", "free", "near a note or wall", "at a folder's wall", "on a route at rest", "a gate"];

  // What each cell is, most telling first: a gate, on a resting route, at a wall (a change of depth), within
  // the clearance of a note or wall, free. Notes are 0: nothing is routed through them.
  const grid = $derived.by(() => {
    const cells = buildCells(layout), { W, H, elev, blocked, close } = cells, kind = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = y * W + x;
      if (blocked[c]) continue;
      const e = elev[c], wall = (x > 0 && elev[c - 1] !== e) || (x < W - 1 && elev[c + 1] !== e) || (y > 0 && elev[c - W] !== e) || (y < H - 1 && elev[c + W] !== e);
      kind[c] = wall ? WALL : close[c] ? NEAR : FREE;
    }
    const pass = (pts: Point[]): void => { // the cells a path in cell units runs through
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1]!, [x1, y1] = pts[k]!, n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
        for (let s = 0; s <= n; s++) {
          const x = Math.floor(x0 + ((x1 - x0) * s) / n), y = Math.floor(y0 + ((y1 - y0) * s) / n);
          if (x >= 0 && y >= 0 && x < W && y < H && !blocked[y * W + x]) kind[y * W + x] = ROUTE;
        }
      }
    };
    for (const pts of rested) pass(pts);
    for (const g of layout.gated.gates) { kind[g.cell] = GATE; if (g.inner >= 0) kind[g.inner] = GATE; }
    return { ...cells, kind };
  });

  const u = $derived(layout.cell * view.k);
  let canvas = $state<HTMLCanvasElement>();

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1, { w, h } = size, { W, H, kind } = grid;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (u < LEAST) return;
    const css = getComputedStyle(canvas), tone = (name: string) => css.getPropertyValue(name).trim();
    const colour = ["", tone("--line-strong"), tone("--growth"), tone("--rose"), tone("--lattice"), tone("--text")];
    const x0 = Math.max(0, Math.floor(-view.x / u)), x1 = Math.min(W - 1, Math.ceil((w - view.x) / u));
    const y0 = Math.max(0, Math.floor(-view.y / u)), y1 = Math.min(H - 1, Math.ceil((h - view.y) / u));
    const side = Math.min(4, Math.max(1.5, u * 0.2));
    for (let k = FREE; k <= GATE; k++) {
      g.fillStyle = colour[k]!;
      g.globalAlpha = k === FREE ? 0.55 : 1;
      const s = k === ROUTE ? side * 1.4 : k === GATE ? side * 2 : side;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (kind[y * W + x] === k) g.fillRect(view.x + (x + 0.5) * u - s / 2, view.y + (y + 0.5) * u - s / 2, s, s);
      }
    }
  });

  // The cell under the pointer, and what it is.
  let under = $state("");
  function point(e: PointerEvent): void {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect(), x = Math.floor((e.clientX - r.left - view.x) / u), y = Math.floor((e.clientY - r.top - view.y) / u);
    const { W, H, kind, elev, owner } = grid;
    if (e.clientX < r.left || e.clientY < r.top || x < 0 || y < 0 || x >= W || y >= H) { under = ""; return; }
    const c = y * W + x, f = owner[c]!;
    under = `${x}, ${y} · ${NAMES[kind[c]!]} · depth ${elev[c]}${f >= 0 ? ` · in ${layout.items[f]!.ref || "the base"}` : ""}`;
  }
</script>

<svelte:window onpointermove={point} />

<canvas class="grid" bind:this={canvas} style="width: {size.w}px; height: {size.h}px" aria-hidden="true"></canvas>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="key" onpointerdown={(e) => e.stopPropagation()}>
  <b>the router's grid</b> <span class="faint">a point every cell, {layout.cell} units at zoom 1</span>
  <span><i class="free"></i>free</span>
  <span><i class="near"></i>near a note or wall, +{ROUTER_DEFAULTS.hug} a step</span>
  <span><i class="wall"></i>at a folder's wall, +{ROUTER_DEFAULTS.climb} to cross</span>
  <span><i class="route"></i>on a route at rest</span>
  <span><i class="gate"></i>a gate: the middle of a side, or a folder's corner</span>
  <span>routes: {routes === "highways" ? "highways between linked neighbours" : routes === "gates" ? "through the gates" : "the layout's trunks"} <button class="link" type="button" onclick={onroutes}>[ next · r ]</button></span>
  <span>grid: {coarse ? "coarse, folders further apart" : "fine"} <button class="link" type="button" onclick={ongrain}>[ {coarse ? "fine" : "coarse"} · c ]</button></span>
  <span>layout: {blocks ? "folders as blocks" : "layers"} <button class="link" type="button" onclick={onlayout}>[ {blocks ? "layers" : "blocks"} · b ]</button></span>
  <span>lines from notes to walls: {leaves ? "drawn" : "not drawn"} <button class="link" type="button" onclick={onleaves}>[ {leaves ? "hide" : "show"} · l ]</button></span>
  <span class="faint">{u < LEAST ? "zoom in to see the points" : under || "point at a cell"}</span>
  <button class="link" type="button" onclick={onhide}>[ hide · g ]</button>
</div>

<style>
  .grid { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; }
  .key { position: absolute; left: 12px; top: 12px; z-index: 2; display: flex; flex-direction: column; gap: 3px; max-width: calc(100% - 24px); padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line-strong); font-size: 11px; line-height: 1.4; color: var(--text-soft); cursor: default; }
  .key b { color: var(--text); font-weight: 600; }
  .key span { display: flex; align-items: center; gap: 6px; }
  .key i { width: 6px; height: 6px; flex: none; }
  .free { background: var(--line-strong); }
  .near { background: var(--growth); }
  .wall { background: var(--rose); }
  .route { background: var(--lattice); }
  .gate { background: var(--text); }
  .faint { color: var(--text-faint); }
  .link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--lattice); font: inherit; cursor: pointer; }
</style>
