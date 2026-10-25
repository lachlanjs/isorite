// Floorplanning (as in chip design): placing blocks of different sizes so that the blocks joined by links stand
// close, in little room, and with what is required before what requires it. Used for a folder's items where
// some are folders, in place of the layered layout (nested.js), which suits notes but not blocks of very
// different sizes.
//
//   Sequence pair  A placement is two orders of the blocks (Murata et al., 1995): i is left of j where i comes
//                  before j in both, and above j where it comes before j in the first and after it in the
//                  second. Each block then stands as far left and up as those relations allow, with the room
//                  between that `space` asks for. Every pair of orders is a placement without overlaps, and
//                  every compact placement is some pair.
//   Annealing      The pair is changed at random (two blocks swapped in one order or both), and a change kept if
//                  it costs less, or by chance if it costs more, the chance shrinking as the search goes on.
//   Cost           For each join, the room between its two blocks (the length of the way across, as a highway
//                  draws it: straight where they face each other, with a run at 45 degrees where they are
//                  offset, and `bend` more then), times its links; `flow` for each cell a block required stands
//                  past the block requiring it, along the folder's direction, times its links; and `area` for
//                  each cell of the whole, made dearer the further its shape is from `shape` wide to tall.
//
// The search is seeded from the blocks and joins, so the same folder is always placed the same way. Given `pair`
// (the two orders a search found), the blocks are packed in that arrangement again without searching: with
// other room between them, say. Given `start` (the arrangement a layout before this one found, say), the search
// begins there and cools from a low temperature, and each pair of blocks it turns round costs `stay`: it improves
// on where things stood, but does not wander from it (M12: with taller blocks, a low temperature alone let one new
// note turn a third of the top level round).

export const PLAN_COSTS = { bend: 4, flow: 1, area: 0.01, aspect: 1, shape: 1.0, effort: 1000, seed: 0, cross: 20, stay: 5 };

/**
 * @param sizes [[w, h], ...] in cells
 * @param joins [[p, q, count], ...]: block q requires block p
 * @param space (i, j) => cells to keep between blocks i and j
 * @param way "right": what requires stands right of what it requires; "up": above it
 * @returns { x: [], y: [], w, h }
 */
export function floorplan(sizes, joins, space, way, o = {}) {
  const { bend, flow, area, aspect, shape, effort, seed: salt, cross, stay } = { ...PLAN_COSTS, ...o };
  const n = sizes.length, w = sizes.map((s) => s[0]), h = sizes.map((s) => s[1]);
  if (!n) return { x: [], y: [], w: 0, h: 0 };
  const gap = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => space(i, j)));
  const x = new Float64Array(n), y = new Float64Array(n);
  const A = [...Array(n).keys()], B = [...A], at = new Int32Array(n), bt = new Int32Array(n);

  // Placement: blocks in the first order's sequence, each after every block left of (or above) it.
  let W = 0, H = 0;
  const pack = () => {
    A.forEach((v, k) => { at[v] = k; });
    B.forEach((v, k) => { bt[v] = k; });
    W = 0; H = 0;
    for (let k = 0; k < n; k++) {
      const j = A[k];
      let px = 0, py = 0;
      for (let m = 0; m < k; m++) {
        const i = A[m];
        if (bt[i] < bt[j]) px = Math.max(px, x[i] + w[i] + gap[i][j]);
        else py = Math.max(py, y[i] + h[i] + gap[i][j]);
      }
      x[j] = px; y[j] = py;
      W = Math.max(W, px + w[j]); H = Math.max(H, py + h[j]);
    }
  };
  const mid = (i) => [x[i] + w[i] / 2, y[i] + h[i] / 2];
  const cost = () => {
    pack();
    let c = 0;
    for (const [p, q, count] of joins) {
      const dx = Math.max(0, x[q] - x[p] - w[p], x[p] - x[q] - w[q]), dy = Math.max(0, y[q] - y[p] - h[p], y[p] - y[q] - h[q]);
      c += count * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy) + (dx > 0 && dy > 0 ? bend : 0));
      const back = way === "right" ? x[p] + w[p] / 2 - (x[q] + w[q] / 2) : y[q] + h[q] / 2 - (y[p] + h[p] / 2);
      if (back > 0) c += flow * count * back;
    }
    // Crossings, as the straight lines between the middles of joined blocks cross (`cross` each, times the
    // fewer links of the two): the highways follow them closely enough to count.
    if (cross) for (let a = 0; a < joins.length; a++) for (let b = a + 1; b < joins.length; b++) {
      const [p, q, m] = joins[a], [r, t, k] = joins[b];
      if (p === r || p === t || q === r || q === t) continue;
      if (crosses(mid(p), mid(q), mid(r), mid(t))) c += cross * Math.min(m, k);
    }
    // From a layout before (`start`): `stay` for each pair of blocks no longer the same way round in either order,
    // so the search improves on where things stood without wandering from it (V5).
    if (was) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if ((at[i] < at[j]) !== (was[0][i] < was[0][j]) || (bt[i] < bt[j]) !== (was[1][i] < was[1][j])) c += stay;
    }
    const off = Math.log(W / H / shape);
    return c + area * W * H * (1 + aspect * off * off);
  };

  // A first placement: one row along the folder's direction, in an order with the joins running forwards.
  const order = forwards(n, joins);
  A.sort((p, q) => order[p] - order[q]);
  B.splice(0, n, ...A);
  if (way === "up") A.reverse(); // later first in the first order and last in the second: later above
  if (o.pair) { A.splice(0, n, ...o.pair[0]); B.splice(0, n, ...o.pair[1]); pack(); return { x: [...x], y: [...y], w: W, h: H, pair: o.pair }; } // packed again as it was
  let was = null;
  if (o.start) {
    A.splice(0, n, ...o.start[0]); B.splice(0, n, ...o.start[1]);
    was = [new Int32Array(n), new Int32Array(n)];
    A.forEach((v, k) => { was[0][v] = k; }); B.forEach((v, k) => { was[1][v] = k; });
  }
  let now = cost(), best = now, bestA = [...A], bestB = [...B];
  if (n < 2) { pack(); return { x: [...x], y: [...y], w: W, h: H, pair: [[...A], [...B]] }; }

  const random = mulberry(seed(sizes, joins) ^ salt), steps = effort * n;
  let T = o.start ? Math.max(0.5, now * 0.002) : Math.max(1, now * 0.05);
  const cool = Math.pow(0.001, 1 / steps); // to a thousandth of the start
  for (let s = 0; s < steps; s++, T *= cool) {
    const i = Math.floor(random() * n), j = (i + 1 + Math.floor(random() * (n - 1))) % n, move = random();
    const swap = (L) => { const t = L[i]; L[i] = L[j]; L[j] = t; };
    if (move < 0.4) swap(A); else if (move < 0.8) swap(B); else { // both: the two blocks trade places outright
      const a = A.indexOf(B[i]), b = A.indexOf(B[j]); swap(B); const t = A[a]; A[a] = A[b]; A[b] = t;
    }
    const next = cost();
    if (next <= now || random() < Math.exp((now - next) / T)) {
      now = next;
      if (now < best) { best = now; bestA = [...A]; bestB = [...B]; }
    } else if (move < 0.4) swap(A); else if (move < 0.8) swap(B); else {
      const a = A.indexOf(B[i]), b = A.indexOf(B[j]); swap(B); const t = A[a]; A[a] = A[b]; A[b] = t;
    }
  }
  A.splice(0, n, ...bestA); B.splice(0, n, ...bestB);
  pack();
  return { x: [...x], y: [...y], w: W, h: H, cost: best, pair: [bestA, bestB] };
}

// Places in an order with as many joins as can be running from what is required to what requires it (by the
// most links out over in, as nested.js's greedyOrder).
function forwards(n, joins) {
  const score = new Array(n).fill(0);
  for (const [p, q, c] of joins) { score[p] += c; score[q] -= c; }
  const order = [...Array(n).keys()].sort((a, b) => score[b] - score[a] || a - b), pos = new Array(n);
  order.forEach((v, k) => { pos[v] = k; });
  return pos;
}

function crosses(a, b, c, d) {
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function seed(sizes, joins) {
  let s = 2166136261;
  for (const v of [...sizes.flat(), ...joins.flat()]) { s ^= v | 0; s = Math.imul(s, 16777619); }
  return s >>> 0;
}
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
