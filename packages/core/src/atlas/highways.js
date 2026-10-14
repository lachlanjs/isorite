// The Atlas's highways: Lachlan's routing, in place of the layout's trunks (nested.js) and rdstudio's router.
//
//   The tree   The base is a tree: notes its leaves, folders the rest, each folder laid out as a DAG of its items.
//   Highways   Between two items of one folder that a link joins (the layout's trunks name every such pair), the
//              shortest way across the folder's floor, from the edge of one to the edge of the other. Where the
//              two face each other the way is straight, through the middle of what they share; where they are
//              offset, it leaves the middle of one side and enters the middle of the other, with one run at 45
//              degrees halfway, as on the boards. Only where that is blocked is it searched for. Where it meets
//              a folder's wall is that folder's gate for the pair.
//   Feeders    From each item in a folder holding an end of a highway's links, the way to the highway's gate on
//              the folder's wall, top down: a subfolder's way starts on its own wall, and that is its gate in
//              turn (layout.js `feeders`, the same as for the trunks).
//   A link     note to note is put together from these: up the feeders, along the highway, and down the feeders.
//
// Returns { trunks, feeders }, shaped as the layout's own, so that everything drawn from those draws these.

import { buildCells } from "./cells.js";
import { lanes } from "./router.js";

const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
const NONE = 8;

export const HIGHWAY_COSTS = { turn45: 1.5, turn90: 3, diag: 1.3, hug: 1, share: 0.35, centre: 0.3, gather: 224 };

/** Highways for every pair of items the layout has a trunk between: `trunks` as the layout's, each with `pts`
 *  from the wall of `b` (what is required) to the wall of `a`, or none where no way was found.
 *  Gates on one side of a folder closer than `gather` (in units, as the cells are drawn at zoom 1) are gathered
 *  into one, at the busiest of them, and the highways through them run from there: a folder's side
 *  then has one gate where it had several, and one tree of feeders inside (`highwayFeeders`). */
export function highwayTrunks(layout, cells = buildCells(layout), o = {}) {
  const { turn45, turn90, diag, hug, share, centre, gather } = { ...HIGHWAY_COSTS, ...o };
  const { items, trunks } = layout, { W, H, blocked, owner } = cells, N = W * H;
  // How far each cell is from a wall or a note, in cells (to `reach`): a step costs `hug` for each cell short of
  // that, so a way runs down the middle of a channel rather than along one side of it.
  const reach = Math.max(2, Math.round(28 / (layout.cell ?? 7))), room = clearance(cells, reach), apart = reach;
  const used = new Uint8Array(N), ch = CORNER / (layout.cell ?? 7);
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const free = (x, y, region) => inside(x, y) && !blocked[y * W + x] && owner[y * W + x] === region;

  // The way drawn from cell p to cell q: a run on the main axis, the 45 degrees, the rest of the run (or, where
  // the two are further apart across than along, 45 degrees, across, 45 degrees). Each cell on the way.
  function direct(p, q, horizontal) {
    const [px, py] = p, [qx, qy] = q;
    const along = horizontal ? qx - px : qy - py, across = horizontal ? qy - py : qx - px;
    const sa = Math.sign(along), sc = Math.sign(across), la = Math.abs(along), lc = Math.abs(across);
    const steps = [];
    if (la >= lc) {
      const before = Math.floor((la - lc) / 2);
      for (let k = 0; k < before; k++) steps.push([sa, 0]);
      for (let k = 0; k < lc; k++) steps.push([sa, sc]);
      for (let k = 0; k < la - lc - before; k++) steps.push([sa, 0]);
    } else {
      const half = Math.floor(la / 2);
      for (let k = 0; k < half; k++) steps.push([sa, sc]);
      for (let k = 0; k < lc - la; k++) steps.push([0, sc]);
      for (let k = 0; k < la - half; k++) steps.push([sa, sc]);
    }
    const out = [[px, py]];
    let x = px, y = py;
    for (const [a, c] of steps) { if (horizontal) { x += a; y += c; } else { x += c; y += a; } out.push([x, y]); }
    return out;
  }

  // The straight or offset way between two items' facing sides, if every cell of it is free. `pa`, `pb`: a
  // gate the way must use on A or B ({ side, t }: an index into `sides`, and the cell along it).
  function drawn(A, B, region, pa, pb) {
    const gapX = Math.max(A.gx - (B.gx + B.w), B.gx - (A.gx + A.w)), gapY = Math.max(A.gy - (B.gy + B.h), B.gy - (A.gy + A.h));
    const horizontal = gapX >= gapY;
    if ((horizontal ? gapX : gapY) < 1) return null;
    const [sb, sa] = horizontal ? (B.gx < A.gx ? [3, 2] : [2, 3]) : (B.gy < A.gy ? [1, 0] : [0, 1]); // the sides facing
    if ((pb && pb.side !== sb) || (pa && pa.side !== sa)) return null;
    const fb = sides(B)[sb], fa = sides(A)[sa];
    // Facing: straight across what they share, through its middle unless that runs close by something between
    // them, when through the row (or column) furthest from it. Offset: from the middle of one side to the middle
    // of the other. Either way, not where it runs closer than `apart` to a wall or a note on its way.
    const lo = horizontal ? Math.max(A.gy, B.gy) : Math.max(A.gx, B.gx), hi = horizontal ? Math.min(A.gy + A.h, B.gy + B.h) : Math.min(A.gx + A.w, B.gx + B.w);
    const mid = (f) => Math.floor(f.mid - 0.5 + 1e-9), shared = (t) => t >= lo && t < hi;
    const tries = pa || pb // through a gate: straight on where the other side is across from it, else to its middle
      ? [[pb ? pb.t : shared(pa.t) ? pa.t : mid(fb), pa ? pa.t : shared(pb.t) ? pb.t : mid(fa), 0]]
      : hi - lo >= 1
        ? range(lo, hi).map((t) => [t, t, Math.abs(t + 0.5 - (lo + hi) / 2)])
        : [[mid(fb), mid(fa), 0]];
    let best = null;
    for (const [tb, ta, off] of tries) {
      if (inCut(B, sb, tb, ch) || inCut(A, sa, ta, ch)) continue; // not into a folder's cut corner
      const p = horizontal ? [sb === 3 ? B.gx + B.w : B.gx - 1, tb] : [tb, sb === 1 ? B.gy + B.h : B.gy - 1];
      const q = horizontal ? [sa === 2 ? A.gx - 1 : A.gx + A.w, ta] : [ta, sa === 0 ? A.gy - 1 : A.gy + A.h];
      const way = direct(p, q, horizontal);
      if (!way.every(([x, y]) => free(x, y, region))) continue;
      const between = way.slice(reach, way.length - reach); // clear of the two ends, which are by A and B
      const least = between.length ? Math.min(...between.map(([x, y]) => room[y * W + x])) : reach;
      if (least < apart) continue;
      if (!best || least > best.least || (least === best.least && off < best.off)) best = { least, off, tb, ta, way };
    }
    if (!best) return null;
    return [fb.wall(best.tb), ...best.way.map(([x, y]) => [x + 0.5, y + 0.5]), fa.wall(best.ta)];
  }

  // Otherwise the cheapest way over the folder's floor: leaving B from any side, the nearer its middle the
  // cheaper, and entering A the same way; turns, running beside a note and the 45 degrees cost as above, and a
  // cell another highway already takes costs less.
  const dist = new Float32Array(N + 1), prev = new Int32Array(N + 1), dirIn = new Uint8Array(N + 1), seen = new Uint32Array(N + 1);
  let gen = 0;
  const heap = [];
  const push = (f, s) => { heap.push([f, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let m = 2 * i + 1; if (m >= heap.length) break; if (m + 1 < heap.length && heap[m + 1][0] < heap[m][0]) m++; if (heap[m][0] >= heap[i][0]) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const turn = (d, k) => { if (d === NONE || d === k) return 0; const t = Math.min((k - d + 8) % 8, (d - k + 8) % 8); return t === 1 ? turn45 : turn90 * (t >= 3 ? 2 : 1); };
  function searched(A, B, region, pa, pb) {
    gen++; heap.length = 0;
    const FIN = N, ends = new Map(); // a cell beside A -> [the side's inward direction, its cost, its wall point]
    const through = (pin, k, t) => !pin || (pin.side === k && pin.t === t);
    sides(A).forEach((s, k) => s.cells.forEach(([x, y]) => {
      const t = s.dir === 6 || s.dir === 2 ? x : y;
      if (!free(x, y, region) || !through(pa, k, t) || inCut(A, k, t, ch)) return;
      ends.set(y * W + x, [(s.dir + 4) % 8, centre * Math.abs(t + 0.5 - s.mid), s.wall(t)]);
    }));
    // A folder's cut corners: entered at 45 degrees, into the middle of the cut.
    if (!pa) for (const c of corners(A, ch)) if (free(...c.out, region)) ends.set(c.out[1] * W + c.out[0], [(c.dir + 4) % 8, centre * Math.min(A.w, A.h) / 2, c.pt]);
    if (!ends.size) return null;
    const ax0 = A.gx - 1, ax1 = A.gx + A.w, ay0 = A.gy - 1, ay1 = A.gy + A.h;
    const guess = (x, y) => { const dx = Math.max(ax0 - x, x - ax1, 0), dy = Math.max(ay0 - y, y - ay1, 0); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const starts = new Map();
    const start = (c, g, dir, pt) => {
      if (seen[c] === gen && dist[c] <= g) return;
      seen[c] = gen; dist[c] = g; prev[c] = -1; dirIn[c] = dir; starts.set(c, pt);
      push(g + guess(c % W, (c / W) | 0), c);
    };
    sides(B).forEach((s, k) => s.cells.forEach(([x, y]) => {
      const t = s.dir === 6 || s.dir === 2 ? x : y;
      if (!free(x, y, region) || !through(pb, k, t) || inCut(B, k, t, ch)) return;
      start(y * W + x, centre * Math.abs(t + 0.5 - s.mid), s.dir, s.wall(t));
    }));
    if (!pb) for (const c of corners(B, ch)) if (free(...c.out, region)) start(c.out[1] * W + c.out[0], centre * Math.min(B.w, B.h) / 2, c.dir, c.pt);
    while (heap.length) {
      const [f, s] = pop();
      if (s === FIN) break;
      const g = dist[s];
      if (f - guess(s % W, (s / W) | 0) > g + 1e-4) continue; // stale
      const e = ends.get(s);
      if (e) { const ng = g + e[1] + turn(dirIn[s], e[0]); if (seen[FIN] !== gen || ng < dist[FIN]) { seen[FIN] = gen; dist[FIN] = ng; prev[FIN] = s; push(ng, FIN); } }
      const x = s % W, y = (s / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (!free(nx, ny, region)) continue;
        if (DX[k] && DY[k] && (!free(nx, y, region) || !free(x, ny, region))) continue;
        const nc = ny * W + nx;
        const ng = g + (DX[k] && DY[k] ? Math.SQRT2 * diag : 1) * (used[nc] ? 1 - share : 1) + hug * (reach - room[nc]) + turn(dirIn[s], k);
        if (seen[nc] === gen && dist[nc] <= ng) continue;
        seen[nc] = gen; dist[nc] = ng; prev[nc] = s; dirIn[nc] = k;
        push(ng + guess(nx, ny), nc);
      }
    }
    if (seen[FIN] !== gen) return null;
    const cellsOn = [];
    for (let s = prev[FIN]; s !== -1; s = prev[s]) cellsOn.push(s);
    cellsOn.reverse();
    return [starts.get(cellsOn[0]), ...cellsOn.map((c) => [(c % W) + 0.5, Math.floor(c / W) + 0.5]), ends.get(cellsOn.at(-1))[2]];
  }

  // The busiest first, so the rest can share their cells.
  const order = trunks.map((_, k) => k).sort((p, q) => trunks[q].count - trunks[p].count || p - q);
  const out = trunks.map((t) => ({ a: t.a, b: t.b, count: t.count, back: t.back, implied: t.implied }));
  const take = (pts) => cellsAlong(pts, (x, y) => { if (inside(x, y) && !blocked[y * W + x]) used[y * W + x] = 1; });
  const way = (k, pa, pb) => { const t = trunks[k], A = items[t.a], B = items[t.b]; return drawn(A, B, A.parent, pa, pb) ?? searched(A, B, A.parent, pa, pb); };
  for (const k of order) {
    const pts = way(k);
    if (!pts) continue;
    out[k].pts = pts;
    take(pts);
  }

  // Gathering: the gates on each side of each folder, in order along it; a run of them each within `gather` of
  // the last is one gate, at the busiest of them.
  const near = gather / (layout.cell ?? 7), at = new Map(); // "folder|side" -> [{ k, end, t, count }]
  out.forEach((h, k) => {
    if (!h.pts) return;
    for (const [end, i, p] of [["b", h.b, h.pts[0]], ["a", h.a, h.pts.at(-1)]]) {
      const F = items[i];
      if (F.kind !== "folder" || !onWall(F, p)) continue; // a cut corner is a gate of its own
      const side = sideAt(F, p), key = `${i}|${side}`;
      at.set(key, [...(at.get(key) || []), { k, end, t: side < 2 ? Math.floor(p[0]) : Math.floor(p[1]), count: h.count }]);
    }
  });
  const pins = new Map(); // highway -> { a, b }: the gates it must use
  for (const [key, gates] of at) {
    const [i, side] = key.split("|").map(Number), F = items[i], s = sides(F)[side], first = side < 2 ? F.gx : F.gy;
    gates.sort((p, q) => p.t - q.t);
    for (let g = 0; g < gates.length;) {
      let e = g + 1;
      while (e < gates.length && gates[e].t - gates[e - 1].t <= near) e++;
      const run = gates.slice(g, e);
      g = e;
      if (run.length < 2 || run.every((r) => r.t === run[0].t)) continue;
      // Where the most links already cross (the busiest gate's highways stay as they are), the nearer the middle
      // of the run on a tie.
      const carried = new Map();
      for (const r of run) carried.set(r.t, (carried.get(r.t) || 0) + r.count);
      const middle = (run[0].t + run.at(-1).t) / 2;
      const t = [...carried].filter(([u]) => !inCut(F, side, u, ch)).reduce((b, u) => (u[1] > b[1] || (u[1] === b[1] && Math.abs(u[0] - middle) < Math.abs(b[0] - middle)) ? u : b))[0];
      for (const r of run) if (r.t !== t) pins.set(r.k, { ...pins.get(r.k), [r.end]: { side, t } });
    }
  }
  if (pins.size) {
    // The highways through a gathered gate are found again, busiest first, the others kept where they are.
    used.fill(0);
    out.forEach((h, k) => { if (h.pts && !pins.has(k)) take(h.pts); });
    for (const k of order) {
      const pin = pins.get(k);
      if (!pin) continue;
      // The end of it that was not gathered keeps its gate, so that no new gate opens beside another.
      const h = out[k], kept = (i, p) => { if (!onWall(items[i], p)) return undefined; const side = sideAt(items[i], p); return { side, t: side < 2 ? Math.floor(p[0]) : Math.floor(p[1]) }; };
      const pts = way(k, pin.a ?? kept(h.a, h.pts.at(-1)), pin.b ?? kept(h.b, h.pts[0]));
      if (pts) out[k].pts = pts;
      take(out[k].pts);
    }
  }
  return out;
}

// Whether cell t along side k of item n (as `sides`) is within a folder's cut corner, `ch` cells deep: no way
// ends there, where the wall is cut away.
function inCut(n, k, t, ch) {
  if (n.kind !== "folder") return false;
  const lo = k < 2 ? n.gx : n.gy, hi = lo + (k < 2 ? n.w : n.h);
  return t + 0.5 - lo < ch || hi - (t + 0.5) < ch;
}

// A folder's four cut corners: the cell outside it at 45 degrees from the corner, the cell inside, the way out
// (an index into DX and DY), and the middle of the cut, where a way through the corner meets it square.
function corners(n, ch) {
  if (n.kind !== "folder") return [];
  return [[n.gx, n.gy, 1, 1, 5], [n.gx + n.w, n.gy, -1, 1, 7], [n.gx + n.w, n.gy + n.h, -1, -1, 1], [n.gx, n.gy + n.h, 1, -1, 3]].map(([cx, cy, sx, sy, dir]) => ({
    out: [Math.floor(cx - sx * 0.5), Math.floor(cy - sy * 0.5)], in: [Math.floor(cx + sx * 0.5), Math.floor(cy + sy * 0.5)], dir, pt: [cx + (sx * ch) / 2, cy + (sy * ch) / 2],
  }));
}

// Whether a point lies on one of item F's four walls (not in a cut corner's middle).
function onWall(F, [x, y]) {
  const near = (p, q) => Math.abs(p - q) < 1e-6;
  return ((near(x, F.gx) || near(x, F.gx + F.w)) && y >= F.gy - 1e-6 && y <= F.gy + F.h + 1e-6) || ((near(y, F.gy) || near(y, F.gy + F.h)) && x >= F.gx - 1e-6 && x <= F.gx + F.w + 1e-6);
}

// The side of item F a point on its wall is on: 0 top, 1 bottom, 2 left, 3 right (as `sides`).
function sideAt(F, [x, y]) {
  const near = (p, q) => Math.abs(p - q) < 1e-6;
  return near(y, F.gy) ? 0 : near(y, F.gy + F.h) ? 1 : near(x, F.gx) ? 2 : 3;
}

// Each cell a path in cells crosses, to `visit` (x, y).
function cellsAlong(pts, visit) {
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let s = 0; s <= n; s++) visit(Math.floor(x0 + ((x1 - x0) * s) / n), Math.floor(y0 + ((y1 - y0) * s) / n));
  }
}

export const FEEDER_COSTS = { turn45: 1.5, turn90: 3, diag: 1.3, hug: 1, centre: 1, join: 0.5, cross: 1, haste: 1.5, hasteNote: 4 };

/** The highways' feeders, shaped as layout.js `feeders` (which says what one is), searched as the highways are:
 *  a step costs its length (a diagonal `diag` more), `hug` for each cell short of `reach` from a wall or a note,
 *  and the turns; a feeder leaves its item near the middle of a side (`centre` a cell from it) and keeps to its
 *  folder's own floor. It ends at the highway's foot, or joins a branch already running there, and the way left
 *  along that branch counts at `join` off, so branches that start near each other run together as one rather
 *  than side by side. Joining costs the turn into the branch, so branches meet at 45 degrees where they can.
 *  A cell a highway takes costs `cross` more, so a feeder does not run along one it does not belong to. */
export function highwayFeeders(layout, trunks, cells = buildCells(layout), o = {}) {
  const { turn45, turn90, diag, hug, centre, join, cross, haste, hasteNote } = { ...FEEDER_COSTS, ...o };
  const { items, links } = layout, { W, H, blocked, owner } = cells, N = W * H;
  const reach = Math.max(2, Math.round(28 / (layout.cell ?? 7))), room = clearance(cells, reach), ch = CORNER / (layout.cell ?? 7);
  const busy = new Uint8Array(N);
  for (const t of trunks) if (t.pts) cellsAlong(t.pts, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) busy[y * W + x] = 1; });
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const childIn = (i, f) => { while (items[i].parent !== f) i = items[i].parent; return i; };
  const outward = (F, [x, y]) => { // the cell just inside F's wall at a point on it, and the way out through the wall
    const near = (p, q) => Math.abs(p - q) < 1e-6;
    if (!onWall(F, [x, y])) { const c = corners(F, ch).find((k) => near(k.pt[0], x) && near(k.pt[1], y)); if (c) return [...c.in, c.dir]; } // a cut corner
    return near(x, F.gx) ? [F.gx, Math.floor(y), 4] : near(x, F.gx + F.w) ? [F.gx + F.w - 1, Math.floor(y), 0] : near(y, F.gy) ? [Math.floor(x), F.gy, 6] : [Math.floor(x), F.gy + F.h - 1, 2];
  };
  const step = (k, nc) => (DX[k] && DY[k] ? Math.SQRT2 * diag : 1) + hug * (reach - room[nc]);
  const turn = (d, k) => { if (d === NONE || d === k) return 0; const t = Math.min((k - d + 8) % 8, (d - k + 8) % 8); return t === 1 ? turn45 : turn90 * (t >= 3 ? 2 : 1); };

  // A search's state is a cell and the direction it was entered by (9 to a cell), so turns are counted exactly.
  const dist = new Float32Array(N * 9 + 1), prev = new Int32Array(N * 9 + 1), seen = new Uint32Array(N * 9 + 1), FIN = N * 9;
  let gen = 0;
  // A binary heap of [estimate, cost so far, state] in typed arrays; a popped entry whose cost is not the best
  // known for its state is stale.
  let hf = new Float64Array(4096), hg = new Float64Array(4096), hs = new Int32Array(4096), hn = 0, topF = 0, topG = 0, topS = 0;
  const push = (f, g, s) => {
    if (hn === hf.length) { const grow = (a, T) => { const b = new T(a.length * 2); b.set(a); return b; }; hf = grow(hf, Float64Array); hg = grow(hg, Float64Array); hs = grow(hs, Int32Array); }
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hg[i] = hg[p]; hs[i] = hs[p]; i = p; }
    hf[i] = f; hg[i] = g; hs[i] = s;
  };
  const pop = () => {
    topF = hf[0]; topG = hg[0]; topS = hs[0];
    const f = hf[--hn], g = hg[hn], s = hs[hn];
    let i = 0;
    for (;;) { let m = 2 * i + 1; if (m >= hn) break; if (m + 1 < hn && hf[m + 1] < hf[m]) m++; if (hf[m] >= f) break; hf[i] = hf[m]; hg[i] = hg[m]; hs[i] = hs[m]; i = m; }
    hf[i] = f; hg[i] = g; hs[i] = s;
  };
  // From item n's sides to one of `ends` (cell -> { dir, rest, pt }), over `region`'s floor; `toward`, the foot,
  // which the search heads for, the distance left overstated by `rush` (`haste`; at 1 rdstudio's layout took
  // 15 s). A note's feeder, never drawn at rest but only traced when it is lit, is searched more greedily still
  // (`hasteNote`): there are hundreds of them in a big folder.
  function search(n, ends, region, toward, rush) {
    gen++; hn = 0;
    const free = (x, y) => inside(x, y) && !blocked[y * W + x] && owner[y * W + x] === region;
    const tx = toward % W, ty = (toward / W) | 0;
    const guess = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return rush * (1 - join) * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
    const starts = new Map();
    if (n.kind === "folder") for (const c of corners(n, ch)) { // its cut corners, left at 45 degrees
      const [x, y] = c.out;
      if (!free(x, y)) continue;
      const cc = y * W + x, st = cc * 9 + c.dir, g = Math.fround(centre * Math.min(n.w, n.h) / 2 + hug * (reach - room[cc]));
      if (seen[st] === gen && dist[st] <= g) continue;
      seen[st] = gen; dist[st] = g; prev[st] = -1; starts.set(cc, c.pt);
      push(g + guess(x, y), g, st);
    }
    sides(n).forEach((s, k) => s.cells.forEach(([x, y]) => {
      if (!free(x, y) || inCut(n, k, s.dir === 6 || s.dir === 2 ? x : y, ch)) return;
      const t = s.dir === 6 || s.dir === 2 ? x : y, c = y * W + x, st = c * 9 + s.dir, g = Math.fround(centre * Math.abs(t + 0.5 - s.mid) + hug * (reach - room[c]));
      if (seen[st] === gen && dist[st] <= g) return;
      seen[st] = gen; dist[st] = g; prev[st] = -1; starts.set(c, s.wall(t));
      push(g + guess(x, y), g, st);
    }));
    while (hn) {
      pop();
      const s = topS, g = topG;
      if (s === FIN) break;
      if (g !== dist[s]) continue; // stale
      const c = (s / 9) | 0, d = s % 9, x = c % W, y = (c / W) | 0;
      const e = ends.get(c);
      if (e) { const ng = g + e.rest + turn(d, e.dir); if (seen[FIN] !== gen || ng < dist[FIN]) { seen[FIN] = gen; dist[FIN] = ng; prev[FIN] = s; push(ng, ng, FIN); } }
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (!free(nx, ny)) continue;
        if (DX[k] && DY[k] && (!free(nx, y) || !free(x, ny))) continue;
        const nc = ny * W + nx, ns = nc * 9 + k, ng = Math.fround(g + step(k, nc) + (busy[nc] ? cross : 0) + turn(d, k));
        if (seen[ns] === gen && dist[ns] <= ng) continue;
        seen[ns] = gen; dist[ns] = ng; prev[ns] = s;
        push(ng + guess(nx, ny), ng, ns);
      }
    }
    if (seen[FIN] !== gen) return null;
    const on = [];
    for (let s = prev[FIN]; s !== -1; s = prev[s]) on.push((s / 9) | 0);
    on.reverse();
    return { cells: on, pts: [starts.get(on[0]), ...on.map((c) => [(c % W) + 0.5, Math.floor(c / W) + 0.5]), ends.get(on.at(-1)).pt] };
  }

  // Each end of a highway on a folder is a stem to feed (as layout.js `feeders`).
  const stems = [];
  trunks.forEach((t, k) => {
    if (!t.pts) return;
    const level = items[t.a].parent, mine = links.filter((l) => l.s >= 2 && l.level === level && childIn(l.a, level) === t.a && childIn(l.b, level) === t.b);
    if (items[t.a].kind === "folder") stems.push({ folder: t.a, at: t.pts[t.pts.length - 1], notes: mine.map((l) => l.a), trunk: k });
    if (items[t.b].kind === "folder") stems.push({ folder: t.b, at: t.pts[0], notes: mine.map((l) => l.b), trunk: k });
  });
  // The highways through one gate (highwayTrunks gathers them) share its feeders: one tree to each foot, and an
  // item already fed to it leaves the same way again, so a subfolder has one gate to it too.
  const out = [], isNote = (i) => items[i].kind === "note", trees = new Map();
  for (let s = 0; s < stems.length; s++) {
    const { folder, at, notes, trunk } = stems[s];
    const [fx, fy, dir] = outward(items[folder], at);
    if (!inside(fx, fy) || blocked[fy * W + fx]) continue;
    const footCell = fy * W + fx, foot = { dir, rest: 0, pt: at };
    if (!trees.has(footCell)) trees.set(footCell, { ends: new Map([[footCell, foot]]), endsAny: new Map([[footCell, foot]]), owners: new Map([[footCell, -1]]), exits: new Map() });
    const { ends, endsAny, owners, exits } = trees.get(footCell);
    const by = new Map();
    for (const n of notes) { const c = childIn(n, folder); by.set(c, [...(by.get(c) || []), n]); }
    for (const [item, held] of [...by].sort((a, b) => isNote(a[0]) - isNote(b[0]) || b[1].length - a[1].length || a[0] - b[0])) {
      const leaf = isNote(item), was = exits.get(item), pool = leaf ? endsAny : ends;
      const r = was && pool.has(was.cell)
        ? { cells: [was.cell], pts: [was.wall, pool.get(was.cell).pt, pool.get(was.cell).pt] }
        : search(items[item], pool, folder, footCell, leaf ? hasteNote : haste);
      if (!r) continue;
      if (!was) exits.set(item, { cell: r.cells[0], wall: r.pts[0] });
      const me = out.length, last = r.cells.at(-1);
      out.push({ item, folder, trunk, count: held.length, pts: r.pts, cells: r.cells, leaf, via: owners.get(last) ?? -1 });
      // The way left from each of its cells to the foot, at `join` off, and the way it runs there.
      const rest = new Float32Array(r.cells.length);
      rest[rest.length - 1] = endsAny.get(last).rest;
      for (let k = r.cells.length - 2; k >= 0; k--) {
        const p = r.cells[k], q = r.cells[k + 1], diagonal = p % W !== q % W && Math.floor(p / W) !== Math.floor(q / W);
        rest[k] = rest[k + 1] + (1 - join) * ((diagonal ? Math.SQRT2 * diag : 1) + hug * (reach - room[q]));
      }
      for (const [k, c] of r.cells.entries()) {
        if (endsAny.has(c)) continue;
        const q = r.cells[k + 1];
        const way = q === undefined ? endsAny.get(last).dir : dirOf(q % W - c % W, Math.floor(q / W) - Math.floor(c / W));
        const end = { dir: way, rest: rest[k], pt: [(c % W) + 0.5, Math.floor(c / W) + 0.5] };
        endsAny.set(c, end); owners.set(c, me);
        if (!leaf) ends.set(c, end);
      }
      if (!leaf) stems.push({ folder: item, at: r.pts[0], notes: held, trunk });
    }
  }
  lanes(out, N);
  return out.map(({ item, folder, trunk, count, pts, lane, leaf, via }) => ({ item, folder, trunk, count, pts, lane, leaf, via }));
}

const dirOf = (dx, dy) => DX.findIndex((x, k) => x === Math.sign(dx) && DY[k] === Math.sign(dy));

// The four sides of an item: the cells just outside each, its outward direction, its middle, and the point on
// its wall by a cell.
function sides(n) {
  return [
    { dir: 6, cells: range(n.gx, n.gx + n.w).map((x) => [x, n.gy - 1]), mid: n.gx + n.w / 2, wall: (x) => [x + 0.5, n.gy] },
    { dir: 2, cells: range(n.gx, n.gx + n.w).map((x) => [x, n.gy + n.h]), mid: n.gx + n.w / 2, wall: (x) => [x + 0.5, n.gy + n.h] },
    { dir: 4, cells: range(n.gy, n.gy + n.h).map((y) => [n.gx - 1, y]), mid: n.gy + n.h / 2, wall: (y) => [n.gx, y + 0.5] },
    { dir: 0, cells: range(n.gy, n.gy + n.h).map((y) => [n.gx + n.w, y]), mid: n.gy + n.h / 2, wall: (y) => [n.gx + n.w, y + 0.5] },
  ];
}

// Each free cell's distance (8-way, to `reach`) from the nearest cell it cannot share a way with: a note, or
// ground of another folder (a wall).
function clearance({ W, H, blocked, owner }, reach) {
  const N = W * H, d = new Uint8Array(N).fill(reach), queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let c = 0; c < N; c++) {
    if (blocked[c]) { d[c] = 0; continue; }
    const x = c % W, y = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (blocked[n] || owner[n] !== owner[c]) { d[c] = 1; queue[tail++] = c; break; }
    }
  }
  while (head < tail) {
    const c = queue[head++], x = c % W, y = (c / W) | 0;
    if (d[c] + 1 >= reach) continue;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (d[n] > d[c] + 1 && !blocked[n] && owner[n] === owner[c]) { d[n] = d[c] + 1; queue[tail++] = n; }
    }
  }
  return d;
}

const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);

/** How far a folder's corners are cut, in units (a cell is `layout.cell` units): drawn so in the app (AtlasFolder),
 *  10 at zoom 1 as on the boards, and growing and shrinking with the map. */
export const CORNER = 10;

/** A route that ends on a folder's wall within a cut corner ends in the middle of the cut instead, its last step
 *  square to it (at 45 degrees): from the cell it came by, straight on to the cut's square line, then along it.
 *  Both ends of each route; `routes` are changed in place. The same point for a highway and the feeder meeting
 *  it, so a link traced through them stays joined. */
export function cornerEnds(layout, routes) {
  const ch = CORNER / (layout.cell ?? 7), folders = layout.items.filter((n) => n.kind === "folder"), near = (p, q) => Math.abs(p - q) < 1e-6;
  const fix = (E, P) => {
    for (const F of folders) {
      const onX = near(E[0], F.gx) || near(E[0], F.gx + F.w), onY = near(E[1], F.gy) || near(E[1], F.gy + F.h);
      if (!(onX && E[1] >= F.gy - 1e-6 && E[1] <= F.gy + F.h + 1e-6) && !(onY && E[0] >= F.gx - 1e-6 && E[0] <= F.gx + F.w + 1e-6)) continue;
      // The corner it is cut from, and which way is inward from it.
      const sx = E[0] - F.gx < F.w / 2 ? 1 : -1, sy = E[1] - F.gy < F.h / 2 ? 1 : -1;
      const cx = sx > 0 ? F.gx : F.gx + F.w, cy = sy > 0 ? F.gy : F.gy + F.h;
      if (Math.abs(E[0] - cx) + Math.abs(E[1] - cy) >= ch - 1e-6) return null; // outside the cut
      const M = [cx + (sx * ch) / 2, cy + (sy * ch) / 2];
      // Square to the cut, toward P: outward from the corner where P is outside the folder, inward where inside.
      const inside = P[0] > F.gx && P[0] < F.gx + F.w && P[1] > F.gy && P[1] < F.gy + F.h, d = inside ? [sx, sy] : [-sx, -sy];
      const dx = P[0] - M[0], dy = P[1] - M[1];
      if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6 && dx * d[0] > 0) return [M]; // already on the square line
      const tries = [dx / d[0], dy / d[1]].filter((s) => s > 1e-6).sort((a, b) => a - b);
      return tries.length ? [M, [M[0] + d[0] * tries[0], M[1] + d[1] * tries[0]]] : null;
    }
    return null;
  };
  for (const r of routes) {
    if (!r.pts || r.pts.length < 2) continue;
    const head = fix(r.pts[0], r.pts[1]);
    if (head) r.pts = [...head, ...r.pts.slice(1)];
    const tail = fix(r.pts.at(-1), r.pts.at(-2));
    if (tail) r.pts = [...r.pts.slice(0, -1), ...tail.reverse()];
  }
  return routes;
}
