// The Atlas's gated routes: every link routed note to note, crossing a folder's wall only at one of its gates.
// Beside the trunks and feeders of nested.js and layout.js, to be judged against them.
//
//   Gates     A folder has sixteen: each corner, and on each side its middle and a quarter of the way from
//             each end. A note has four: the middle of each side. A route enters and leaves a block only there, and crosses a wall only there.
//   Choice    Each link takes the gates that make its whole way cheapest, all the walls at once: one search
//             over the cells, in which a wall can be crossed only by stepping through a gate.
//   Stretches The way between two gates in one folder (or between a gate and a note, or two notes) is kept the
//             first time a link takes it, and every later link through the same two gates takes the same way.
//             So links through the same gates share their line exactly, and it is drawn once, with a count.
//
// A step costs its length (a diagonal 1.414), less by `share` (a fraction) on a cell a stretch already uses, more within
// the clearance of a note or a wall (`hug`), and a turn costs as in router.js.

import { buildCells } from "./cells.js";

const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
const START = 8; // the direction of a search's first cell: none yet
const dirOf = (dx, dy) => DX.findIndex((x, k) => x === Math.sign(dx) && DY[k] === Math.sign(dy));

export const GATE_COSTS = { turn45: 1.5, turn90: 3, hug: 2.5, share: 0.35, haste: 1.5, diag: 1.3 };

/**
 * Routes for every link rated 2 or more ("requires", "uses").
 * Returns { gates, stretches, paths }:
 *   gates: [{ item, cell, inner, wall: [x, y] }]: the cell a gate is entered by from outside, the cell inside
 *     (folders only, else -1), and the point on the wall it crosses.
 *   stretches: [{ region, a, b, pts, links, strong, rest, ends }]: the folder it runs in (-1: the top level),
 *     the cells at its two ends, its path in cells, the links along it (indices into layout.links), whether
 *     one of them is rated 3, whether it is drawn at rest (gate to gate, or note to note for a link no longer
 *     way makes), and what its ends are ("gate" or "note", each).
 *   paths: one per link: [[stretch, reversed]...] from link.a to link.b, or null.
 */
export function gatedRoutes(layout, o = {}) {
  const { turn45, turn90, hug, share, haste, diag } = { ...GATE_COSTS, ...o };
  const { items, links, trunks } = layout;
  const { W, H, blocked, owner, close } = buildCells(layout), N = W * H, TOP = items.length;
  const region = (c) => (owner[c] < 0 ? TOP : owner[c]); // the folder a cell is ground of, the top level as TOP
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // ---- gates
  const gates = [], gatesOf = items.map(() => []), jumps = new Map(), gateAt = new Map();
  const jump = (from, to, cost) => {
    const dir = dirOf((to % W) - (from % W), Math.floor(to / W) - Math.floor(from / W));
    if (!jumps.has(from)) jumps.set(from, []);
    jumps.get(from).push({ to, cost, dir });
  };
  items.forEach((n, i) => {
    const outside = n.parent < 0 ? TOP : n.parent, mx = n.gx + Math.floor(n.w / 2), my = n.gy + Math.floor(n.h / 2);
    const x1 = n.gx + n.w - 1, y1 = n.gy + n.h - 1;
    // [outer x, outer y, inner x, inner y, wall x, wall y]: a folder's corners are crossed on the diagonal of
    // their cut, into the cell one in from the corner.
    // A folder's sides also have a gate a quarter of the way from each end, between the middle and the corners.
    const along = (g, w, mid) => (n.kind === "folder" && w >= 8 ? [g + Math.floor(w / 4), mid, g + w - 1 - Math.floor(w / 4)] : [mid]);
    const sides = [
      ...along(n.gx, n.w, mx).flatMap((x) => [[x, n.gy - 1, x, n.gy, x + 0.5, n.gy], [x, y1 + 1, x, y1, x + 0.5, y1 + 1]]),
      ...along(n.gy, n.h, my).flatMap((y) => [[n.gx - 1, y, n.gx, y, n.gx, y + 0.5], [x1 + 1, y, x1, y, x1 + 1, y + 0.5]]),
    ];
    const corners = [
      [n.gx - 1, n.gy - 1, n.gx + 1, n.gy + 1], [x1 + 1, n.gy - 1, x1 - 1, n.gy + 1],
      [n.gx - 1, y1 + 1, n.gx + 1, y1 - 1], [x1 + 1, y1 + 1, x1 - 1, y1 - 1],
    ].map(([ox, oy, ix, iy]) => [ox, oy, ix, iy, (ox + ix + 1) / 2, (oy + iy + 1) / 2]);
    for (const [ox, oy, ix, iy, wx, wy] of n.kind === "folder" ? [...sides, ...corners] : sides) {
      if (!inside(ox, oy)) continue;
      const outer = oy * W + ox;
      if (blocked[outer] || region(outer) !== outside || gateAt.has(outer)) continue;
      let inner = -1;
      if (n.kind === "folder") {
        if (!inside(ix, iy)) continue;
        inner = iy * W + ix;
        if (blocked[inner] || owner[inner] !== i || gateAt.has(inner)) continue;
        const cost = Math.hypot(ix - ox, iy - oy);
        jump(outer, inner, cost); jump(inner, outer, cost);
        gateAt.set(inner, gates.length);
      }
      gateAt.set(outer, gates.length);
      gatesOf[i].push(gates.length);
      gates.push({ item: i, cell: outer, inner, wall: [wx, wy] });
    }
  });

  // ---- the search
  const use = new Uint8Array(N); // stretches on each cell, to 3: only whether there are any counts now
  // One state a cell, with the direction it was best entered by: a turn is charged against that. Not exact (a
  // dearer way in, better aimed, can be the cheaper way on), but nine states a cell took four times as long.
  const dist = new Float32Array(N), prev = new Int32Array(N), seen = new Uint32Array(N), dirIn = new Uint8Array(N);
  const allow = new Uint32Array(TOP + 1);
  let gen = 0;
  let hf = new Float32Array(4096), hg = new Float32Array(4096), hs = new Int32Array(4096), hn = 0, topG = 0, topS = 0;
  const push = (f, g, s) => {
    if (hn === hf.length) {
      const grow = (old, Type) => { const next = new Type(old.length * 2); next.set(old); return next; };
      hf = grow(hf, Float32Array); hg = grow(hg, Float32Array); hs = grow(hs, Int32Array);
    }
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hg[i] = hg[p]; hs[i] = hs[p]; i = p; }
    hf[i] = f; hg[i] = g; hs[i] = s;
  };
  const pop = () => {
    topG = hg[0]; topS = hs[0];
    const f = hf[--hn], g = hg[hn], s = hs[hn];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1;
      if (m >= hn) break;
      if (m + 1 < hn && hf[m + 1] < hf[m]) m++;
      if (hf[m] >= f) break;
      hf[i] = hf[m]; hg[i] = hg[m]; hs[i] = hs[m]; i = m;
    }
    hf[i] = f; hg[i] = g; hs[i] = s;
  };
  const turnCost = (d, k) => {
    if (d === START || d === k) return 0;
    const t = Math.min((k - d + 8) % 8, (d - k + 8) % 8);
    return t === 1 ? turn45 : turn90 * (t >= 3 ? 2 : 1);
  };

  /** The cheapest way from a gate of note a to a gate of note b, through the folders between them: its cells. */
  function search(a, b, level) {
    gen++; hn = 0;
    const top = level < 0 ? TOP : level;
    for (const n of [a, b]) for (let p = items[n].parent; ; p = items[p].parent) { allow[p < 0 ? TOP : p] = gen; if (p === level || p < 0) break; }
    allow[top] = gen;
    const ends = new Set(gatesOf[b].map((g) => gates[g].cell)), B = items[b];
    const bx0 = B.gx - 1, bx1 = B.gx + B.w, by0 = B.gy - 1, by1 = B.gy + B.h;
    const oct = (dx, dy) => { dx = Math.abs(dx); dy = Math.abs(dy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const toB = (x, y) => oct(Math.max(bx0 - x, x - bx1, 0), Math.max(by0 - y, y - by1, 0));
    // What is left at least, by way of the gates still to pass: out through each folder of a's below the level,
    // and in through each of b's. Aimed straight at b, the search ran at the wall of b's folder, far from any
    // gate, and flooded the open ground beside it.
    const chainOf = (n) => { const out = []; for (let p = items[n].parent; p !== level && p >= 0; p = items[p].parent) out.push(p); return out; };
    const ac = chainOf(a), bc = chainOf(b), place = new Map(); // folder -> [side, its place in the chain]
    ac.forEach((f, j) => place.set(f, [0, j])); bc.forEach((f, k) => place.set(f, [1, k]));
    const via = (list, x, y) => { let best = Infinity; for (const [gx, gy, v] of list) best = Math.min(best, oct(x - gx, y - gy) + v); return best; };
    const cellXY = (c) => [(c % W) + 0.5, Math.floor(c / W) + 0.5];
    // In, from the outside of each of b's folders: [outer x, outer y, the least from there to b].
    const inB = [];
    bc.forEach((f, k) => {
      inB[k] = gatesOf[f].map((g) => {
        const [ox, oy] = cellXY(gates[g].cell), [ix, iy] = cellXY(gates[g].inner);
        return [ox, oy, oct(ix - ox, iy - oy) + (k === 0 ? toB(ix, iy) : via(inB[k - 1], ix, iy))];
      });
    });
    const atLevel = (x, y) => (bc.length ? via(inB[bc.length - 1], x, y) : toB(x, y));
    // Out, from the inside of each of a's folders, outermost first: [inner x, inner y, the least from there to b].
    const outA = [];
    for (let j = ac.length - 1; j >= 0; j--) {
      outA[j] = gatesOf[ac[j]].map((g) => {
        const [ox, oy] = cellXY(gates[g].cell), [ix, iy] = cellXY(gates[g].inner);
        return [ix, iy, oct(ix - ox, iy - oy) + (j === ac.length - 1 ? atLevel(ox, oy) : via(outA[j + 1], ox, oy))];
      });
    }
    const guess = (x, y) => {
      const r = region(y * W + x), at = place.get(r);
      x += 0.5; y += 0.5;
      const left = !at ? atLevel(x, y) : at[0] === 0 ? via(outA[at[1]], x, y) : at[1] === 0 ? toB(x, y) : via(inB[at[1] - 1], x, y);
      return haste * left;
    };
    for (const g of gatesOf[a]) {
      const c = gates[g].cell, s = c;
      seen[s] = gen; dist[s] = 0; prev[s] = -1; dirIn[s] = START;
      push(guess(c % W, (c / W) | 0), 0, s);
    }
    let end = -1;
    while (hn) {
      pop();
      const s = topS, g = topG;
      if (g !== dist[s]) continue;
      const c = s, d = dirIn[s];
      if (ends.has(c)) { end = s; break; }
      const cx = c % W, cy = (c / W) | 0, here = region(c);
      const step = (nc, k, base) => {
        const ng = Math.fround(g + base + turnCost(d, k)), ns = nc;
        if (seen[ns] === gen && dist[ns] <= ng) return;
        seen[ns] = gen; dist[ns] = ng; prev[ns] = s; dirIn[ns] = k;
        push(ng + guess(nc % W, (nc / W) | 0), ng, ns);
      };
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (!inside(nx, ny)) continue;
        const nc = ny * W + nx;
        if (blocked[nc] || region(nc) !== here) continue; // a wall is crossed only through a gate
        if (DX[k] && DY[k]) { const c1 = cy * W + nx, c2 = ny * W + cx; if (blocked[c1] || blocked[c2] || region(c1) !== here || region(c2) !== here) continue; }
        step(nc, k, (DX[k] && DY[k] ? Math.SQRT2 * diag : 1) * (use[nc] ? 1 - share : 1) + (close[nc] ? hug : 0));
      }
      for (const j of jumps.get(c) || []) if (allow[region(j.to)] === gen) step(j.to, j.dir, j.cost);
    }
    if (end < 0) return null;
    const path = [];
    for (let s = end; s !== -1; s = prev[s]) path.push(s);
    return path.reverse();
  }

  // ---- stretches
  const stretches = [], stretchAt = new Map();
  const kindOf = (c) => (gates[gateAt.get(c)].inner < 0 ? "note" : "gate");
  const pointOf = (c) => { // where a stretch ending at cell c is drawn to: the wall it crosses, or the note's edge
    const g = gates[gateAt.get(c)];
    return g.wall;
  };
  const implied = new Set(trunks.filter((t) => t.implied).map((t) => t.a + "|" + t.b));
  const under = (i, level) => { while (items[i].parent !== level) i = items[i].parent; return i; };
  const paths = links.map((l, li) => {
    if (l.s < 2 || l.a === l.b) return null;
    const cells = search(l.a, l.b, l.level);
    if (!cells) return null;
    const ua = under(l.a, l.level), ub = under(l.b, l.level), byLonger = implied.has(ua + "|" + ub) || implied.has(ub + "|" + ua);
    // Cut where the way jumps a wall: each piece is a stretch, from one gate (or note) to the next.
    const pieces = [];
    let from = 0;
    for (let k = 1; k <= cells.length; k++) {
      const p = cells[k - 1], q = cells[k];
      if (k === cells.length || Math.max(Math.abs((q % W) - (p % W)), Math.abs(Math.floor(q / W) - Math.floor(p / W))) > 1 || region(q) !== region(p)) { pieces.push(cells.slice(from, k)); from = k; }
    }
    return pieces.map((piece) => {
      const a = piece[0], b = piece[piece.length - 1], key = a < b ? a + "|" + b : b + "|" + a;
      let k = stretchAt.get(key);
      if (k === undefined) {
        k = stretches.length;
        stretchAt.set(key, k);
        for (const c of piece) if (use[c] < 3) use[c]++;
        const pts = [pointOf(a), ...[...piece].map((c) => [(c % W) + 0.5, Math.floor(c / W) + 0.5]), pointOf(b)];
        const ends = [kindOf(a), kindOf(b)];
        stretches.push({ region: owner[a], a, b, pts, links: [], strong: false, rest: false, ends });
      }
      const st = stretches[k];
      st.links.push(li);
      if (l.s >= 3) st.strong = true;
      if ((st.ends[0] === "gate" && st.ends[1] === "gate") || (st.ends[0] === "note" && st.ends[1] === "note" && !byLonger)) st.rest = true;
      return [k, st.a !== a];
    });
  });
  return { gates, stretches, paths };
}
