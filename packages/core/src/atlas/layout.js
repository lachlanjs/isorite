// The Atlas's layout and routes as plain functions over plain data, so the
// browser (in a worker), the server and a terminal all read the same layout.

import { nestedLayout } from "./nested.js";
import { buildCells } from "./cells.js";
import { highwayTrunks, highwayFeeders, cornerEnds } from "./highways.js";
import { makeRouter, lanes, routeAll as gridRouteAll, ROUTER_DEFAULTS } from "./router.js";

// What the router sees, for drawing it (the Atlas's grid, a debugging view).
export { buildCells, KEEP } from "./cells.js";
export { ROUTER_DEFAULTS };
export { highwayTrunks, highwayFeeders, cornerEnds, CORNER, HIGHWAY_COSTS, FEEDER_COSTS } from "./highways.js";

// What the layout needs from the map model, as plain data a worker can receive.
// `flat`: the folderless view (T71): every note an item of one folder, the root, so the whole base is one DAG.
export function plainModel(model, flat = false) {
  const strip = (n) => (n.kind === "dir"
    ? { kind: "dir", id: n.id, ref: n.ref, children: n.children.map(strip) }
    : { kind: n.kind, id: n.id, ref: n.ref, weight: n.weight, rank: n.rank || 0 });
  if (flat) {
    const notes = [];
    const walk = (n) => { if (n.kind === "dir") n.children.forEach(walk); else notes.push(strip(n)); };
    walk(model.root);
    return { root: { kind: "dir", id: model.root.id, ref: model.root.ref, children: notes }, edges: model.edges, code: false };
  }
  return { root: strip(model.root), edges: model.edges, code: !!model.code };
}

// The grid Atlas's layout (grid/nested.js, which says what one is): each
// folder a layered DAG of its items, and one item in its parent's. `gridFlow`
// is the top level's direction, "up" or "right"; `grain`, the cell's size ("fine", "coarse" or "coarser");
// `blocks`, a folder holding folders placed as blocks (floorplan.js) and not in layers.
export function gridLayout(model, o) {
  const opts = { flow: o.gridFlow === "right" ? "right" : "up", grain: grainOf(o), plan: !!o.blocks, from: o.from ?? null };
  let layout = nestedLayout(model, opts);
  // Blocks: laid out once, the highways found, and packed again as they were with each busy gutter widened.
  if (o.blocks) {
    const planned = gutters(layout, highwayTrunks(layout, buildCells(layout)));
    if ([...planned.values()].some((p) => p.wider.size)) layout = nestedLayout(model, { ...opts, planned });
  }
  layout.feeders = feeders(layout);
  const cells = buildCells(layout), highways = highwayTrunks(layout, cells); // and the highways (highways.js), with their own feeders
  const fed = highwayFeeders(layout, highways, cells);
  cornerEnds(layout, [...highways, ...fed]); // after the feeders are found: they start from where the highways end
  layout.highways = { trunks: highways, feeders: fed };
  return layout;
}

// How much wider each gutter between two blocks of a floorplanned folder should be: by a lane (3 cells, 2 on the
// coarse grid) for each line beyond the first running along it (lines side by side, counted by the columns, or
// rows, that a highway runs at least 4 cells along within the gutter). ref -> { pair, wider: "refA|refB" -> cells }.
export function gutters(layout, highways) {
  const { items } = layout, lane = layout.cell > 7 ? 2 : 3, out = new Map();
  for (const [ref, pair] of layout.pairs ?? []) {
    const F = ref === "" ? -1 : items.findIndex((n) => n.kind === "folder" && n.ref === ref), kids = items.map((n, i) => i).filter((i) => items[i].parent === F);
    const mine = highways.filter((h) => h.pts && items[h.a].parent === F), wider = new Map();
    for (const a of kids) for (const b of kids) {
      if (a >= b) continue;
      const A = items[a], B = items[b], [L, R] = A.gx <= B.gx ? [A, B] : [B, A], [T, U] = A.gy <= B.gy ? [A, B] : [B, A];
      const across = R.gx - (L.gx + L.w), down = U.gy - (T.gy + T.h);
      // The gutter: between two blocks side by side (or one above the other) that overlap along it.
      let rect = null, upright = false;
      if (across > 0 && across <= 16 && Math.min(A.gy + A.h, B.gy + B.h) - Math.max(A.gy, B.gy) >= 4) { rect = [L.gx + L.w, Math.max(A.gy, B.gy), R.gx, Math.min(A.gy + A.h, B.gy + B.h)]; upright = true; }
      else if (down > 0 && down <= 16 && Math.min(A.gx + A.w, B.gx + B.w) - Math.max(A.gx, B.gx) >= 4) rect = [Math.max(A.gx, B.gx), T.gy + T.h, Math.min(A.gx + A.w, B.gx + B.w), U.gy];
      if (!rect) continue;
      const runs = new Map(); // column (or row) -> cells along it
      for (const h of mine) for (let k = 1; k < h.pts.length; k++) {
        const [x0, y0] = h.pts[k - 1], [x1, y1] = h.pts[k], n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) {
          const x = Math.floor(x0 + ((x1 - x0) * s) / n), y = Math.floor(y0 + ((y1 - y0) * s) / n);
          if (x < rect[0] || x >= rect[2] || y < rect[1] || y >= rect[3]) continue;
          const key = upright ? x : y;
          if (!runs.has(key)) runs.set(key, new Set());
          runs.get(key).add(upright ? y : x);
        }
      }
      const lines = [...runs.values()].filter((c) => c.size >= 4).length;
      if (lines > 1) wider.set([A.ref, B.ref].sort().join("|"), lane * (lines - 1));
    }
    out.set(ref, { pair, wider });
  }
  return out;
}

// Feeders (T72): where a trunk (`trunks`: the layout's, or the highways) ends on a folder, what is in the folder that the trunk's links come from.
// From each of the folder's items holding an end of one of those links, a branch runs to the trunk's foot,
// the cell just inside the wall where the trunk arrives, with the number of links it carries. Branches to
// one foot join: subfolders are routed first, the one with the most links before the rest, and each one
// after may stop on a branch already there. A branch from a subfolder is itself fed, from inside it, in
// the same way. Only the branches from subfolders are drawn at rest (a branch from every note is too
// much); those from notes (`leaf`) are kept so that a link can be traced the whole way, note to note,
// along its trunk. A note's branch may join any branch; a subfolder's only another subfolder's.
//   [{ item, folder, trunk, count, pts, lane, leaf, via }]: the item fed from, the folder it is in, the
//   trunk fed (an index into `trunks`), the links carried, the path in cells from the item's edge, whether
//   the item is a note, and the feeder whose branch this one ends on (its index, or -1 at the foot).
export function feeders(layout, trunks = layout.trunks) {
  const { items, links, W } = layout;
  if (!trunks.some((t) => t.pts && (items[t.a].kind === "folder" || items[t.b].kind === "folder"))) return [];
  // haste 1.5, not the router's 3.2: overstated that far, the search ran greedily at the foot and came back, so
  // a branch could dip and climb for nothing. Each search heads for the foot (`toward`) and counts the way left
  // along a branch it joins. On 1,177 notes both layouts take a second (2.6 s before); haste 1 takes 9.
  const cells = buildCells(layout), router = makeRouter(layout, cells, { crowd: 1, haste: 1.5 });
  for (const t of trunks) if (t.pts) router.occupy(t.pts);
  const childIn = (i, f) => { while (items[i].parent !== f) i = items[i].parent; return i; }; // the item of folder f that holds i
  const foot = (f, [x, y]) => { // the cell just inside f's wall at a point on the wall
    const F = items[f], near = (p, q) => Math.abs(p - q) < 1e-6;
    return near(x, F.gx) ? [F.gx, Math.floor(y)] : near(x, F.gx + F.w) ? [F.gx + F.w - 1, Math.floor(y)] : near(y, F.gy) ? [Math.floor(x), F.gy] : [Math.floor(x), F.gy + F.h - 1];
  };
  // Each end of a drawn trunk that is a folder is a stem to feed: the notes in the folder that its links end on.
  const stems = [];
  trunks.forEach((t, k) => {
    if (!t.pts) return;
    const level = items[t.a].parent, mine = links.filter((l) => l.s >= 2 && l.level === level && childIn(l.a, level) === t.a && childIn(l.b, level) === t.b);
    if (items[t.a].kind === "folder") stems.push({ folder: t.a, at: t.pts[t.pts.length - 1], notes: mine.map((l) => l.a), trunk: k });
    if (items[t.b].kind === "folder") stems.push({ folder: t.b, at: t.pts[0], notes: mine.map((l) => l.b), trunk: k });
  });
  const out = [];
  for (let s = 0; s < stems.length; s++) {
    const { folder, at, notes, trunk } = stems[s];
    const [fx, fy] = foot(folder, at);
    if (fx < 0 || fy < 0 || fx >= W || cells.blocked[fy * W + fx]) continue;
    const by = new Map();
    for (const n of notes) { const c = childIn(n, folder); by.set(c, [...(by.get(c) || []), n]); }
    const footCell = fy * W + fx, isNote = (i) => items[i].kind === "note";
    const ends = new Map([[footCell, [footCell, at[0], at[1]]]]), endsAny = new Map(ends), owner = new Map([[footCell, -1]]);
    for (const [item, held] of [...by].sort((a, b) => isNote(a[0]) - isNote(b[0]) || b[1].length - a[1].length || a[0] - b[0])) {
      const leaf = isNote(item), r = router.routeTo(item, { ends: leaf ? endsAny : ends, folder, toward: footCell });
      if (!r) continue;
      const me = out.length;
      out.push({ item, folder, trunk, count: held.length, pts: r.pts, cells: r.cells, leaf, via: owner.get(r.cells[r.cells.length - 1]) ?? -1 });
      // What is left from each of its cells to the foot: along this branch, then from where it ends, at what the
      // router would charge for the steps (their length, and the clearance of notes and walls).
      const rest = new Float32Array(r.cells.length);
      rest[rest.length - 1] = endsAny.get(r.cells[r.cells.length - 1])?.[3] ?? 0;
      for (let k = r.cells.length - 2; k >= 0; k--) {
        const p = r.cells[k], q = r.cells[k + 1];
        rest[k] = rest[k + 1] + (p % W !== q % W && Math.floor(p / W) !== Math.floor(q / W) ? Math.SQRT2 : 1) + (cells.close[q] ? ROUTER_DEFAULTS.hug : 0);
      }
      for (const [k, c] of r.cells.entries()) {
        if (endsAny.has(c)) continue;
        const end = [c, (c % W) + 0.5, Math.floor(c / W) + 0.5, rest[k]];
        endsAny.set(c, end); owner.set(c, me);
        if (!leaf) ends.set(c, end);
      }
      if (!leaf) stems.push({ folder: item, at: r.pts[0], notes: held, trunk });
    }
  }
  lanes(out, cells.W * cells.H);
  return out.map(({ item, folder, trunk, count, pts, lane, leaf, via }) => ({ item, folder, trunk, count, pts, lane, leaf, via }));
}

// Routes over a grid layout's cells (grid/router.js). The cells and the
// router's arrays are made once per layout and kept.
export function gridRouter(layout) {
  const cells = buildCells(layout), router = makeRouter(layout, cells);
  return (asks) => gridRouteAll(router, asks, cells.W, cells.H);
}

// cyrb53: a fast 53-bit string hash, plenty to tell layouts apart.
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Bump whenever the layout changes what it returns, so nothing keeps an old one.
export const LAYOUT_VERSION = 13;
const grainOf = (o) => (o.grain === "coarse" || o.grain === "coarser" ? o.grain : "fine");
/** What a kept layout is filed under: the version, the direction, the grid, and what the map contains. */
export function layoutKey(plain, o = {}) {
  return hash(JSON.stringify([LAYOUT_VERSION, o.gridFlow === "right" ? "right" : "up", grainOf(o), !!o.blocks, plain]));
}
