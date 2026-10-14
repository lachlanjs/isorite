// The grid Atlas's layout (T64): each folder is laid out on its own as a
// layered DAG of its items, and is then one item in its parent's.
//
//   Items     A folder's notes, and its subfolders, each already laid out and
//             now a single block. A link belongs to the lowest folder holding
//             both ends, and there joins the two items that hold them; links
//             between the same two items are one trunk with a count.
//   The DAG   An order of the items with as much weight of link as possible
//             running from what is required to what requires it (Eades, Lin
//             and Smyth). Trunks against it are back trunks: laid out the
//             other way round.
//   Flow      The top level runs from the bottom up (or, with flow "right",
//             from left to right), its folders' contents the other way, theirs
//             the first way again, and so on, so a chain of folders is a
//             column of rows, not a tower.
//   Layers    An item sits one layer after the last thing it requires; one
//             that requires nothing sits just before the first item needing
//             it. A layer too long for its folder wraps.
//   Order     Within layers, by sweeps that put each item at the mean place of
//             its neighbours in the layer before; then each is drawn level
//             with what it is joined to.
//   Room      Neighbours and layers stand 6 cells apart; a trunk's track or
//             lane keeps 2 clear of every item it passes.
//   Routes    A trunk leaves the late side of the item required, runs along a
//             track of its own between two layers, and enters the early side
//             of the item requiring it. Trunks from one item share their way
//             (a bus). One that passes layers keeps a free lane in each. A
//             trunk that turns by a few cells, with nothing else near, goes
//             across in one run at 45 degrees and takes no track.
//
// The result is plain data, and nothing after it knows how it was made:
//   { W, H, flow,                the grid, in cells, and the top level's direction
//     items: [{ id, ref, kind,   "note" or "folder"; the root is not an item;
//                                a parent comes before its children
//               parent, depth,   the parent's index (-1 at the top), 1 at the top
//               gx, gy, w, h }], a block of cells; a folder's is its whole region,
//                                and its title sits on its top edge
//     links: [{ a, b, s,         note to note: item indices (a links to b), the rating,
//               level, placed }] the lowest folder holding both ends (-1: the root),
//                                and false when the link runs against the layout
//     trunks: [{ a, b, count,    item to item, at one level: a requires b, for
//                back, implied,  `count` links; against the order; implied by a
//                pts }] }        longer way; and its path from b to a in cells
//                                (none for an implied trunk, which the router
//                                finds a way for when it is wanted)

import { KEEP } from "./cells.js";
import { floorplan, PLAN_COSTS } from "./floorplan.js";

export const NOTE_W = 18, NOTE_H = 5; // room for a whole title, on two or three lines, before the map is zoomed far in
// Room: 6 cells between neighbours and between layers, half as much again as the first grid's 4. A route
// keeps KEEP (2) clear of what it passes, so a third of each gap is left for routes to run in.
// Folders stand 8 apart, a quarter more again: feeders run between them and never through them (T72).
const FINE = {
  cell: 7, // units a cell, at zoom 1 (the app's CELL)
  note: [NOTE_W, NOTE_H],
  gap: 6, gapFolders: 8, // clear cells between neighbours in a layer
  channel: 6, channelFolders: 8, // free cells between two layers, at least; between layers with folders in them
  pad: 6, // cells between a folder's wall and its contents: room for the routes that run inside the wall
  head: 2, // free rows under a folder's top edge, where its title sits: they keep a subfolder's title clear of it
  margin: 8, // free cells around the whole map: as much as between folders, for the ways round the outside
  minFolder: 12, // a folder is at least this wide, for its title
  slant: 8, // a slant goes at most this far across: further, and its channel must grow more than the run is worth (this base: 13 trunks at 4 with no growth, 25 at 8 for 2% more map, 32 at 18 for 6%)
  keep: KEEP,
};
// The coarse grid (the Atlas's `c`): cells twice the size, so a route has half as many places to bend, and
// folders half as far apart again as on the fine grid (84 units against 56). A note is 126 by 42 units, not 35.
const COARSE = { cell: 14, note: [9, 3], gap: 3, gapFolders: 6, channel: 3, channelFolders: 6, pad: 3, head: 1, margin: 6, minFolder: 6, slant: 4, keep: 1 };
// The coarser grid: cells of 18 units, so a note is 7 by 2 of them (126 by 36 units, the boards' 126 by 35), and
// the room between things about as on the coarse grid, in fewer cells.
const COARSER = { cell: 18, note: [7, 2], gap: 2, gapFolders: 5, channel: 2, channelFolders: 5, pad: 2, head: 1, margin: 5, minFolder: 5, slant: 3, keep: 1 };
const ROOMS = { fine: FINE, coarse: COARSE, coarser: COARSER };
export const PAD = FINE.pad;
const SHAPE = 1.4; // a folder's contents aim to be this much wider than tall
const SWEEPS = 8, PULLS = 12;
// The room of the layout being made: set from FINE, COARSE or COARSER as each begins (a layout is made in one go).
let NOTE = FINE.note, GAP = 0, GAP_FOLDERS = 0, CHANNEL = 0, CHANNEL_FOLDERS = 0, HEAD = 0, MARGIN = 0, MIN_FOLDER = 0, SLANT = 0, ROOM_PAD = 0, KEEP_ = KEEP;
let REACH = 0; // a node moves no further than one note's place across to stand in line with a neighbour: further, and the folder grows by a third
let LANE_REACH = 0; // a lane goes three times as far to keep a passing trunk in one line: at that, no trunk on this base has more than four bends
function useRoom(r) {
  ({ note: NOTE, gap: GAP, gapFolders: GAP_FOLDERS, channel: CHANNEL, channelFolders: CHANNEL_FOLDERS, head: HEAD, margin: MARGIN, minFolder: MIN_FOLDER, slant: SLANT, pad: ROOM_PAD, keep: KEEP_ } = r);
  REACH = NOTE[0] + GAP; LANE_REACH = 3 * REACH;
}

/** @param model { root, edges }: the map's plain model (layout.js `plainModel`) @param flow "up" or "right": the top level's direction
 *  @param plan a folder holding folders placed as blocks (floorplan.js), not in layers; `planCosts` its weights */
export function nestedLayout(model, { flow = "up", grain = "fine", plan = false, planCosts = {}, planned: again = null } = {}) {
  const room = ROOMS[grain] ?? FINE;
  useRoom(room);
  const isDir = (n) => n.kind === "dir";
  const parent = new Map(), byRef = new Map(), dirs = [model.root];
  for (let k = 0; k < dirs.length; k++) for (const c of dirs[k].children || []) { parent.set(c, dirs[k]); if (isDir(c)) dirs.push(c); else byRef.set(c.ref, c); }
  const pathTo = (n) => { const out = []; for (let p = n; p; p = parent.get(p)) out.push(p); return out.reverse(); };

  // Each requires- or uses-link at its level: folder -> "required|requiring" -> { p, q, weight, count }.
  const joins = new Map(dirs.map((d) => [d, new Map()]));
  const number = new Map(); // a number for every note and folder, for keys
  for (const d of dirs) { number.set(d, number.size); for (const c of d.children || []) if (!isDir(c)) number.set(c, number.size); }
  // On the code map a link may end on a folder (a file imports a file, a test tests a class).
  const ends = new Map(byRef);
  if (model.code) for (const d of dirs) if (d !== model.root && !ends.has(d.ref)) ends.set(d.ref, d);
  for (const [from, to, s] of model.edges) {
    if (s < 2) continue;
    const a = ends.get(from), b = ends.get(to);
    if (!a || !b || a === b) continue;
    const pa = pathTo(a), pb = pathTo(b);
    let k = 0;
    while (pa[k + 1] && pa[k + 1] === pb[k + 1]) k++;
    if (!pa[k + 1] || !pb[k + 1]) continue; // one end holds the other
    const at = joins.get(pa[k]), p = pb[k + 1], q = pa[k + 1], key = number.get(p) + "|" + number.get(q);
    const j = at.get(key) || { p, q, weight: 0, count: 0 };
    j.weight += s; j.count++;
    at.set(key, j);
  }

  const box = new Map(); // node -> { w, h, x, y (in its folder's contents) }
  const pairs = new Map(); // a floorplanned folder's ref -> the arrangement found for it (floorplan.js `pair`)
  const trunksIn = new Map(); // folder -> [{ p, q, count, back, implied, pts (in its contents) }]
  const other = (f) => (f === "up" ? "right" : "up");
  const arrange = (folder, way) => {
    const kids = folder.children || [];
    for (const c of kids) { if (isDir(c)) arrange(c, other(way)); else box.set(c, { w: NOTE[0], h: NOTE[1] }); }
    const inner = kids.length ? place(folder, kids, way) : { w: 0, h: 0 };
    box.set(folder, folder === model.root ? inner
      : kids.length ? { w: Math.max(MIN_FOLDER, inner.w + 2 * ROOM_PAD), h: inner.h + ROOM_PAD + HEAD + ROOM_PAD }
      : { w: MIN_FOLDER, h: HEAD + 2 * ROOM_PAD });
  };

  // Lay out one folder's items along `way`. Items joined to each other, directly or through others, are a
  // group, and each group is a diagram of its own (T117); the items joined to nothing are one more. The
  // diagrams stand in shelves, largest first, so a big folder reads as several small maps and not one wide one.
  function place(folder, kids, way) {
    if (plan && kids.some(isDir)) return planned(folder, kids, way);
    const group = new Map(kids.map((c) => [c, c])), find = (c) => { while (group.get(c) !== c) c = group.get(c); return c; };
    for (const j of joins.get(folder).values()) { const a = find(j.p), b = find(j.q); if (a !== b) group.set(b, a); }
    const parts = new Map(), tied = new Set([...joins.get(folder).values()].flatMap((j) => [j.p, j.q]));
    for (const c of kids) { const key = tied.has(c) ? find(c) : null; parts.set(key, [...(parts.get(key) || []), c]); }
    if (parts.size < 2) { const d = diagram(folder, kids, way); trunksIn.set(folder, d.out); return { w: d.w, h: d.h }; }
    const made = [...parts].map(([key, list], k) => ({ list, loose: key === null, k, ...diagram(folder, list, way) }));
    made.sort((a, b) => a.loose - b.loose || b.w * b.h - a.w * a.h || a.k - b.k);
    const gap = kids.some(isDir) ? GAP_FOLDERS : GAP, area = made.reduce((t, d) => t + (d.w + gap) * (d.h + gap), 0);
    const wide = Math.max(Math.ceil(Math.sqrt(area * SHAPE)), ...made.map((d) => d.w));
    let x = 0, y = 0, shelf = 0, w = 0;
    const out = [];
    for (const d of made) {
      if (x && x + d.w > wide) { x = 0; y += shelf + gap; shelf = 0; }
      for (const c of d.list) { const b = box.get(c); b.x += x; b.y += y; }
      for (const t of d.out) out.push({ ...t, pts: t.pts && t.pts.map(([px, py]) => [px + x, py + y]) });
      w = Math.max(w, x + d.w); shelf = Math.max(shelf, d.h);
      x += d.w + gap;
    }
    trunksIn.set(folder, out);
    return { w, h: y + shelf };
  }

  // A folder holding folders (`plan`): its items placed as blocks by floorplan.js, the joins between them left to
  // the highways (no path is planned here).
  function planned(folder, kids, way) {
    const index = new Map(kids.map((c, i) => [c, i]));
    const all = [...joins.get(folder).values()].filter((j) => index.has(j.p) && index.has(j.q));
    // `again` (a layout made before, its highways counted): this folder's arrangement then, packed again with
    // each gutter between two blocks widened by what the highways along it need.
    const name = folder === model.root ? "" : folder.ref, before = again?.get(name), wider = (i, j) => before?.wider.get([kids[i].ref, kids[j].ref].sort().join("|")) ?? 0;
    const gap = (i, j) => (isDir(kids[i]) || isDir(kids[j]) ? GAP_FOLDERS : GAP) + wider(i, j);
    const sizes = kids.map((c) => [box.get(c).w, box.get(c).h]);
    // The whole map takes the screen's shape: wide where the top level runs right, tall where it runs up (a phone).
    const shape = folder === model.root && way === "up" ? 1 / PLAN_COSTS.shape : PLAN_COSTS.shape;
    const r = floorplan(sizes, all.map((j) => [index.get(j.p), index.get(j.q), j.count]), gap, way, { shape, ...planCosts, pair: before?.pair });
    pairs.set(name, r.pair);
    kids.forEach((c, i) => Object.assign(box.get(c), { x: r.x[i], y: r.y[i] }));
    // A join is back where what is required stands past what requires it; implied, between notes, where a
    // longer way joins them.
    const along = (i) => (way === "right" ? r.x[i] + sizes[i][0] / 2 : -(r.y[i] + sizes[i][1] / 2));
    const next = new Map();
    for (const j of all) next.set(j.p, [...(next.get(j.p) || []), j.q]);
    const reaches = (from, to) => { const seen = new Set(), todo = (next.get(from) || []).filter((m) => m !== to); while (todo.length) { const v = todo.pop(); if (v === to) return true; if (!seen.has(v)) { seen.add(v); todo.push(...(next.get(v) || [])); } } return false; };
    trunksIn.set(folder, all.map((j) => ({ p: j.p, q: j.q, count: j.count, back: along(index.get(j.p)) > along(index.get(j.q)), implied: !isDir(j.p) && !isDir(j.q) && reaches(j.p, j.q), pts: null })));
    return { w: r.w, h: r.h };
  }

  // One diagram: some of a folder's items, and the joins among them. Along the way is "main", across it "cross".
  function diagram(folder, kids, way) {
    const n = kids.length, index = new Map(kids.map((c, i) => [c, i])), up = way === "up";
    const gap = kids.some(isDir) ? GAP_FOLDERS : GAP;
    const main = kids.map((c) => (up ? box.get(c).h : box.get(c).w)), cross = kids.map((c) => (up ? box.get(c).w : box.get(c).h));
    const all = [...joins.get(folder).values()].filter((j) => index.has(j.p) && index.has(j.q)).map((j) => ({ ...j, p: index.get(j.p), q: index.get(j.q) }));
    const pos = greedyOrder(n, all.map((j) => [j.p, j.q, j.weight]));
    // A join against the order is a back trunk. It is laid out the other way round (T117), from what requires
    // to what is required, so it has rows to pass, a lane and a track like the rest: u is the end it starts from.
    for (const j of all) { j.back = pos[j.p] > pos[j.q]; j.u = j.back ? j.q : j.p; j.v = j.back ? j.p : j.q; }
    const forward = all.filter((j) => !j.back);

    // Layers: one after the last thing required; what requires nothing, just before the first that needs it.
    const layer = new Array(n).fill(0), needs = kids.map(() => []), neededBy = kids.map(() => []);
    for (const j of all) { needs[j.v].push(j.u); neededBy[j.u].push(j.v); }
    const requiredBy = kids.map(() => []); // the joins that run with the order only
    for (const j of forward) requiredBy[j.p].push(j.q);
    for (const q of [...Array(n).keys()].sort((x, y) => pos[x] - pos[y])) for (const p of needs[q]) layer[q] = Math.max(layer[q], layer[p] + 1);
    for (let v = 0; v < n; v++) if (!needs[v].length && neededBy[v].length) layer[v] = Math.min(...neededBy[v].map((q) => layer[q])) - 1;
    // A trunk between two notes is implied when a longer way joins them.
    const reaches = (from, to, skip) => { const seen = new Set(), todo = requiredBy[from].filter((m) => m !== skip); while (todo.length) { const v = todo.pop(); if (v === to) return true; if (!seen.has(v)) { seen.add(v); todo.push(...requiredBy[v]); } } return false; };
    for (const j of forward) j.implied = !isDir(kids[j.p]) && !isDir(kids[j.q]) && reaches(j.p, j.q, j.q);
    const drawn = all.filter((j) => !j.implied).sort((x, y) => y.weight - x.weight || x.p - y.p || x.q - y.q);

    // Rows: a layer wraps when it is longer than the folder should be across.
    const area = kids.reduce((t, _, i) => t + (cross[i] + gap) * (main[i] + CHANNEL), 0);
    const widest = Math.max(Math.ceil(Math.sqrt(up ? area * SHAPE : area / SHAPE)), ...cross);
    // An item joined to nothing here stands apart, in rows after the rest (T117): among the others it only
    // lengthens their rows. A layer that must wrap is cut into rows of even length, what only requires
    // first and what is only required last, so its steps to the layers either side pass the fewest rows.
    const rows = [], row = new Array(n), tied = new Array(n).fill(false);
    for (const j of all) { tied[j.p] = true; tied[j.q] = true; }
    const apartToo = tied.some(Boolean) && tied.some((t) => !t);
    const fill = (list) => {
      const total = list.reduce((t, i) => t + cross[i] + gap, 0), cuts = Math.max(1, Math.ceil((total - gap) / widest)), each = total / cuts;
      let cur = null, used = 0;
      for (const i of list) {
        if (!cur || (used + cross[i] > widest) || (rows.length - from < cuts && used >= each)) { cur = []; rows.push(cur); used = 0; }
        row[i] = rows.length - 1;
        cur.push(i);
        used += cross[i] + gap;
      }
    };
    let from = 0;
    const part = (i) => (needs[i].length ? (neededBy[i].length ? 1 : 0) : 2), mean = (list) => (list.length ? list.reduce((t, v) => t + pos[v], 0) / list.length : 0);
    for (let l = 0; l <= Math.max(...layer); l++) {
      const list = [...Array(n).keys()].filter((i) => layer[i] === l && (tied[i] || !apartToo));
      const total = list.reduce((t, i) => t + cross[i] + gap, 0) - gap;
      if (total > widest) list.sort((x, y) => part(x) - part(y) || mean(needs[x]) - mean(needs[y]) || x - y);
      from = rows.length;
      fill(list);
    }
    if (apartToo) { from = rows.length; fill([...Array(n).keys()].filter((i) => !tied[i])); }

    // Nodes: the items, then the lanes trunks keep in the rows they pass; the trunks from one item share theirs.
    const size = [...cross], before = kids.map(() => []), after = kids.map(() => []); // neighbours in the rows next to a node's own
    const lane = new Map(), lanesOf = new Map(), steps = [], stepped = new Set(), chains = new Map();
    for (const j of drawn) {
      const chain = [j.u];
      for (let r = row[j.u] + 1; r < row[j.v]; r++) {
        const key = j.u + "|" + r;
        if (!lane.has(key)) { lane.set(key, size.length); lanesOf.set(size.length, j.u); size.push(1); before.push([]); after.push([]); row.push(r); rows[r].push(size.length - 1); }
        chain.push(lane.get(key));
      }
      chain.push(j.v);
      for (let k = 1; k < chain.length; k++) {
        const u = chain[k - 1], v = chain[k];
        if (stepped.has(u + "|" + v)) continue;
        stepped.add(u + "|" + v);
        steps.push([u, v]);
        after[u].push(v); before[v].push(u);
      }
      chains.set(j, chain);
    }
    const passing = (v) => v >= n;

    // Order within rows.
    const at = new Array(size.length);
    rows.forEach((r) => r.forEach((v, k) => { at[v] = k; }));
    const sweep = (r, near) => {
      const key = new Map(rows[r].map((v) => [v, near[v].length ? near[v].reduce((t, u) => t + at[u], 0) / near[v].length : at[v]]));
      rows[r].sort((x, y) => key.get(x) - key.get(y) || at[x] - at[y]);
      rows[r].forEach((v, k) => { at[v] = k; });
    };
    // Crossings between a row and the next: pairs of steps whose ends are in opposite order.
    const crossed = () => {
      let total = 0;
      for (let r = 0; r < rows.length - 1; r++) {
        const ends = [];
        for (const u of rows[r]) for (const v of after[u]) ends.push([at[u], at[v]]);
        for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) if ((ends[i][0] - ends[j][0]) * (ends[i][1] - ends[j][1]) < 0) total++;
      }
      return total;
    };
    // Two neighbours in a row change places where that uncrosses more of their steps than it crosses.
    const swaps = () => {
      const worse = (u, v, near) => { let t = 0; for (const x of near[u]) for (const y of near[v]) t += at[x] > at[y] ? 1 : at[x] < at[y] ? -1 : 0; return t; };
      for (let again = true, pass = 0; again && pass < SWEEPS; pass++) {
        again = false;
        for (const r of rows) for (let k = 0; k + 1 < r.length; k++) {
          const u = r[k], v = r[k + 1];
          if (worse(u, v, before) + worse(u, v, after) > 0) { r[k] = v; r[k + 1] = u; at[u] = k + 1; at[v] = k; again = true; }
        }
      }
    };
    // The sweeps from several first orders, and the order with fewest crossings kept (T117): the last was kept before, whatever it was.
    const first = rows.map((r) => [...r]), byOrder = (x, y) => (passing(x) ? pos[lanesOf.get(x)] : pos[x]) - (passing(y) ? pos[lanesOf.get(y)] : pos[y]) || x - y;
    let best = null, fewest = Infinity;
    for (const start of [(r) => r, (r) => [...r].sort(byOrder), (r) => [...r].reverse()]) {
      rows.forEach((r, k) => { r.splice(0, r.length, ...start(first[k])); r.forEach((v, i) => { at[v] = i; }); });
      let least = Infinity, since = 0;
      for (let it = 0; it < 3 * SWEEPS && since < 4 && fewest > 0; it++, since++) {
        if (it % 2 === 0) for (let r = 1; r < rows.length; r++) sweep(r, before);
        else for (let r = rows.length - 2; r >= 0; r--) sweep(r, after);
        swaps();
        const now = crossed();
        if (now < least) { least = now; since = 0; }
        if (now < fewest) { fewest = now; best = rows.map((r) => [...r]); }
      }
    }
    if (best) rows.forEach((r, k) => { r.splice(0, r.length, ...best[k]); r.forEach((v, i) => { at[v] = i; }); });

    // Across: each row packed in order and centred, then every node drawn level with its neighbours, keeping order and gaps.
    const space = (u, v) => (passing(u) && passing(v) ? 1 : passing(u) || passing(v) ? KEEP_ : gap); // a lane keeps its clearance from an item
    const c = new Array(size.length).fill(0);
    for (const r of rows) { let x = 0; r.forEach((v, k) => { if (k) x += space(r[k - 1], v); c[v] = x; x += size[v]; }); }
    const end = (r) => (r.length ? c[r[r.length - 1]] + size[r[r.length - 1]] : 0);
    const span = Math.max(...rows.map(end));
    for (const r of rows) { const shift = (span - end(r)) / 2; for (const v of r) c[v] += shift; }
    const mid = (v) => c[v] + size[v] / 2;
    for (let it = 0; it < PULLS; it++) {
      for (const r of it % 2 ? [...rows].reverse() : rows) {
        if (!r.length) continue;
        const want = r.map((v) => { const near = [...before[v], ...after[v]]; return (near.length ? near.reduce((t, u) => t + mid(u), 0) / near.length : mid(v)) - size[v] / 2; });
        const lo = [], hi = [];
        r.forEach((v, k) => { lo[k] = k ? Math.max(want[k], lo[k - 1] + size[r[k - 1]] + space(r[k - 1], v)) : want[k]; });
        for (let k = r.length - 1; k >= 0; k--) hi[k] = k < r.length - 1 ? Math.min(want[k], hi[k + 1] - size[r[k]] - space(r[k], r[k + 1])) : want[k];
        r.forEach((v, k) => { c[v] = (lo[k] + hi[k]) / 2; });
      }
    }
    // In line (T117): a node is joined to one neighbour in the row before, the
    // middle one where it can be, and the two then stand with their middle cells
    // level, so the step between them is straight. Joins never cross, so chains
    // of them are columns (Brandes and Köpf, 2001). A lane's joins are made
    // first: a trunk passing several rows keeps one line. Only neighbours the
    // pulls left within REACH of each other are joined. Each column is then
    // put as near where the pulls left it as its neighbours allow.
    const anchor = (v) => Math.floor((size[v] - 1) / 2);
    const upTo = new Array(size.length).fill(-1), downTo = new Array(size.length).fill(-1);
    for (const lanesOnly of [true, false]) for (let r = 1; r < rows.length; r++) {
      const joined = rows[r].filter((v) => upTo[v] >= 0).map((v) => [at[upTo[v]], at[v]]);
      for (const v of rows[r]) {
        if (upTo[v] >= 0 || !before[v].length) continue;
        const ups = [...before[v]].sort((a, b) => at[a] - at[b]), middle = (ups.length - 1) / 2;
        const tries = ups.map((u, k) => [u, Math.abs(k - middle)]).filter(([u]) => downTo[u] < 0 && (!lanesOnly || (passing(u) && passing(v))) && Math.abs(c[u] + anchor(u) - c[v] - anchor(v)) <= (lanesOnly ? LANE_REACH : REACH)).sort((a, b) => a[1] - b[1] || at[a[0]] - at[b[0]]);
        for (const [u] of tries) {
          if (joined.some(([a, b]) => (a < at[u]) !== (b < at[v]))) continue;
          upTo[v] = u; downTo[u] = v;
          joined.push([at[u], at[v]]);
          break;
        }
      }
    }
    const col = new Array(size.length).fill(-1);
    let cols = 0;
    for (let v = 0; v < size.length; v++) if (upTo[v] < 0) { for (let u = v; u >= 0; u = downTo[u]) col[u] = cols; cols++; }
    const members = Array.from({ length: cols }, () => []);
    col.forEach((k, v) => members[k].push(v));
    const apart = (u, v) => size[u] - anchor(u) + space(u, v) + anchor(v); // from u's middle cell to that of v, next after it in a row
    const left = new Array(size.length).fill(-1), right = new Array(size.length).fill(-1);
    for (const r of rows) r.forEach((v, k) => { if (k) { left[v] = r[k - 1]; right[r[k - 1]] = v; } });
    // As far towards the start as the rows allow: the longest way through the columns.
    const X = new Array(cols).fill(0);
    let settled = false;
    for (let pass = 0; pass <= cols && !settled; pass++) {
      settled = true;
      for (const r of rows) for (let k = 1; k < r.length; k++) {
        const least = X[col[r[k - 1]]] + apart(r[k - 1], r[k]);
        if (X[col[r[k]]] < least) { X[col[r[k]]] = least; settled = false; }
      }
    }
    if (settled) {
      const want = members.map((m) => Math.round(m.reduce((t, v) => t + c[v] + anchor(v), 0) / m.length));
      const shift = Math.min(...want.map((w, k) => w - X[k])); // the pulls' places, moved so that none is before its column's first place
      const order = [...Array(cols).keys()].sort((a, b) => want[b] - want[a] || a - b);
      for (let pass = 0; pass < 2 * PULLS; pass++) {
        let moved = false;
        for (const k of pass % 2 ? [...order].reverse() : order) {
          let lo = -Infinity, hi = Infinity;
          for (const v of members[k]) {
            if (left[v] >= 0) lo = Math.max(lo, X[col[left[v]]] + apart(left[v], v));
            if (right[v] >= 0) hi = Math.min(hi, X[col[right[v]]] - apart(v, right[v]));
          }
          const x = Math.max(lo, Math.min(hi, want[k] - shift));
          if (x !== X[k]) { X[k] = x; moved = true; }
        }
        if (!moved) break;
      }
      for (let v = 0; v < size.length; v++) c[v] = X[col[v]] - anchor(v);
    } else for (const r of rows) r.forEach((v, k) => { c[v] = k ? Math.max(Math.round(c[v]), c[r[k - 1]] + size[r[k - 1]] + space(r[k - 1], v)) : Math.round(c[v]); });
    const c0 = Math.min(...c);
    for (let v = 0; v < c.length; v++) c[v] -= c0;
    const across = Math.max(...c.map((x, v) => x + size[v]));
    const centre = (v) => c[v] + Math.floor((size[v] - 1) / 2) + 0.5; // the middle cell

    // Ports: the steps into a node, in order across, each with a cell of its
    // own on its early side: the cell level with where the step comes from, if
    // the node reaches that far, so a step between two things in line is straight.
    const port = new Map();
    for (let v = 0; v < size.length; v++) {
      const list = [...before[v]].sort((a, b) => centre(a) - centre(b)), lo = c[v] + 0.5, hi = c[v] + size[v] - 0.5;
      if (list.length > size[v]) { list.forEach((u, k) => port.set(u + "|" + v, lo + Math.min(size[v] - 1, Math.floor((k * size[v]) / list.length)))); continue; }
      const x = list.map((u) => Math.max(lo, Math.min(hi, centre(u))));
      for (let k = 1; k < x.length; k++) x[k] = Math.max(x[k], x[k - 1] + 1);
      for (let k = x.length - 1; k >= 0; k--) x[k] = Math.min(x[k], k === x.length - 1 ? hi : x[k + 1] - 1);
      list.forEach((u, k) => port.set(u + "|" + v, x[k]));
    }
    // A step whose port the node reaches leaves from the cell level with it,
    // straight. The node's other steps leave together, from the cell level
    // with the middle one's port, as near as the node reaches.
    const direct = (u, v) => { const x = port.get(u + "|" + v); return x >= c[u] + 0.5 && x <= c[u] + size[u] - 0.5; };
    const stub = new Array(size.length);
    for (let u = 0; u < size.length; u++) {
      const to = after[u].filter((v) => !direct(u, v)).map((v) => port.get(u + "|" + v)).sort((a, b) => a - b);
      stub[u] = to.length ? Math.max(c[u] + 0.5, Math.min(c[u] + size[u] - 0.5, to[(to.length - 1) >> 1])) : centre(u);
    }
    const leaves = (u, v) => (direct(u, v) ? port.get(u + "|" + v) : stub[u]);
    // Slants (T117): a step that turns by a few cells goes across in one run at 45 degrees, where nothing
    // else in its channel comes within a cell of that run. Another step from the same node may share its stem.
    const reach = (u, v) => { const a = leaves(u, v), b = port.get(u + "|" + v); return [Math.min(a, b), Math.max(a, b)]; };
    const slant = new Set(), slants = rows.map(() => 0);
    for (const [u, v] of steps) {
      if (direct(u, v)) continue;
      const [lo, hi] = reach(u, v), right = port.get(u + "|" + v) > stub[u];
      if (hi - lo > SLANT) continue;
      const clear = steps.every(([a, b]) => {
        if (row[a] !== row[u] || (a === u && b === v)) return true;
        const [l, h] = reach(a, b);
        return a === u ? (right ? h <= lo : l >= hi) : h < lo - 1 || l > hi + 1;
      });
      if (clear) { slant.add(u + "|" + v); slants[row[u]] = Math.max(slants[row[u]], hi - lo); }
    }
    // Buses: the other steps on from one node that turn share a run across; runs between the same two rows take tracks, none on another.
    const bus = new Map();
    for (const [u, v] of steps) {
      if (direct(u, v) || slant.has(u + "|" + v)) continue;
      const x = port.get(u + "|" + v), b = bus.get(u) || { u, lo: stub[u], hi: stub[u], track: 0 };
      b.lo = Math.min(b.lo, x); b.hi = Math.max(b.hi, x);
      bus.set(u, b);
    }
    // Which track each takes (T117): of two runs that overlap, the nearer its own row is the one whose
    // stem and drops then cross the other least; an order that honours as much of that as it can, and
    // each run on the first track clear of the runs before it.
    const tracks = rows.map(() => 0);
    rows.forEach((_, r) => {
      const list = [...bus.values()].filter((b) => row[b.u] === r && b.hi > b.lo).sort((a, d) => a.lo - d.lo || a.hi - d.hi || a.u - d.u);
      const drops = list.map((b) => after[b.u].filter((v) => !direct(b.u, v) && !slant.has(b.u + "|" + v)).map((v) => port.get(b.u + "|" + v)));
      const meets = (a, b) => !(list[a].hi < list[b].lo - 1 || list[b].hi < list[a].lo - 1);
      const cost = (a, b) => (stub[list[b].u] > list[a].lo && stub[list[b].u] < list[a].hi ? 1 : 0) + drops[a].filter((x) => x > list[b].lo && x < list[b].hi).length; // a nearer the row than b
      const arcs = [];
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        if (!meets(a, b)) continue;
        const d = cost(b, a) - cost(a, b);
        if (d > 0) arcs.push([a, b, d]); else if (d < 0) arcs.push([b, a, -d]);
      }
      const place = greedyOrder(list.length, arcs), done = [];
      for (const a of [...list.keys()].sort((x, y) => place[x] - place[y])) {
        list[a].track = Math.max(0, ...done.filter((b) => meets(a, b)).map((b) => list[b].track + 1));
        done.push(a);
      }
      tracks[r] = Math.max(0, ...list.map((b) => b.track + 1));
    });

    // Along: rows one after another, with room between for the tracks.
    const thick = rows.map((r) => Math.max(0, ...r.filter((v) => !passing(v)).map((v) => main[v])));
    const start = [], track0 = [], slant0 = [];
    let m = 0;
    // The tracks sit in the middle of their channel, never nearer a row than the clearance; so does a slant, with a cell's run at each end.
    rows.forEach((_, r) => {
      start[r] = m; m += thick[r];
      const channel = Math.max(kids.some(isDir) ? CHANNEL_FOLDERS : CHANNEL, tracks[r] + 2 * KEEP_, slants[r] + 2);
      track0[r] = m + Math.max(KEEP_, Math.floor((channel - tracks[r]) / 2));
      const side = m;
      slant0[r] = (d) => side + Math.floor((channel - d) / 2);
      if (r < rows.length - 1) m += channel;
    });
    const along = m;
    const m0 = (v) => start[row[v]] + Math.floor((thick[row[v]] - main[v]) / 2); // an item's early side

    // To cells: flowing up, later is north; flowing right, later is east.
    const cell = (mm, cc) => (up ? [cc, along - mm] : [mm, cc]);
    kids.forEach((kid, i) => Object.assign(box.get(kid), up ? { x: c[i], y: along - m0(i) - main[i] } : { x: m0(i), y: c[i] }));
    const out = [];
    for (const j of all) {
      const chain = chains.get(j);
      let pts = null;
      if (chain) {
        pts = [cell(m0(j.u) + main[j.u], leaves(j.u, chain[1]))];
        for (let k = 1; k < chain.length; k++) {
          const u = chain[k - 1], v = chain[k], x = port.get(u + "|" + v);
          if (slant.has(u + "|" + v)) { const d = Math.abs(x - stub[u]), from = slant0[row[u]](d); pts.push(cell(from, stub[u]), cell(from + d, x)); continue; }
          const tm = track0[row[u]] + (bus.get(u)?.track || 0) + 0.5;
          pts.push(cell(tm, leaves(u, v)), cell(tm, x));
        }
        pts.push(cell(m0(j.v), port.get(chain[chain.length - 2] + "|" + j.v)));
        pts = pts.filter((p, k) => !k || p[0] !== pts[k - 1][0] || p[1] !== pts[k - 1][1]);
        if (j.back) pts.reverse(); // a trunk's path runs from what is required, whichever way it was laid out
      }
      out.push({ p: kids[j.p], q: kids[j.q], count: j.count, back: j.back, implied: !!j.implied, pts });
    }
    return up ? { w: across, h: along, out } : { w: along, h: across, out };
  }

  arrange(model.root, flow);

  // ---- the layout as plain data: parents before their children
  const items = [], index = new Map(), origin = new Map([[model.root, [MARGIN, MARGIN]]]);
  for (const d of dirs) {
    const [ox, oy] = origin.get(d), upIndex = d === model.root ? -1 : index.get(d), depth = pathTo(d).length;
    for (const c of d.children || []) {
      const b = box.get(c);
      index.set(c, items.length);
      items.push({ id: c.id, ref: c.ref, kind: isDir(c) ? "folder" : "note", parent: upIndex, depth, gx: ox + b.x, gy: oy + b.y, w: b.w, h: b.h });
      if (isDir(c)) origin.set(c, [ox + b.x + ROOM_PAD, oy + b.y + HEAD + ROOM_PAD]);
    }
  }
  const trunks = [], backward = new Set();
  for (const d of dirs) {
    const [ox, oy] = origin.get(d);
    for (const t of trunksIn.get(d) || []) {
      const a = index.get(t.q), b = index.get(t.p);
      if (t.back) backward.add(a + "|" + b);
      trunks.push({ a, b, count: t.count, back: t.back, implied: t.implied, pts: t.pts && t.pts.map(([x, y]) => [x + ox, y + oy]) });
    }
  }
  const links = levelled(items, model.edges, new Map([...byRef].map(([ref, n]) => [ref, index.get(n)])));
  const under = (i, level) => { while (items[i].parent !== level) i = items[i].parent; return i; };
  for (const l of links) l.placed = l.s >= 2 && !backward.has(under(l.a, l.level) + "|" + under(l.b, l.level));
  const root = box.get(model.root);
  return { W: root.w + 2 * MARGIN, H: root.h + 2 * MARGIN, flow, cell: room.cell, keep: room.keep, margin: MARGIN, items, links, trunks, pairs };
}

// The layout's links: each with the lowest folder that holds both its ends.
function levelled(items, edges, byRef) {
  const up = (i) => { const out = []; for (let p = items[i].parent; p >= 0; p = items[p].parent) out.push(p); return out; };
  const links = [];
  for (const [from, to, s] of edges) {
    const a = byRef.get(from), b = byRef.get(to);
    if (a === undefined || b === undefined || a === b) continue;
    const above = new Set(up(b));
    links.push({ a, b, s, level: up(a).find((p) => above.has(p)) ?? -1, placed: false });
  }
  return links;
}

// An order of n nodes in which as much weight of arc as possible points
// forwards (Eades, Lin and Smyth, 1993): nodes nothing points to are taken
// first and nodes pointing to nothing last, and otherwise the node with the
// most weight out over weight in is taken first. Ties go to the lower index,
// so the same graph gives the same order. Returns each node's place.
export function greedyOrder(n, arcs) {
  const out = Array.from({ length: n }, () => new Map()), into = Array.from({ length: n }, () => new Map());
  for (const [p, q, w] of arcs) { if (p === q) continue; out[p].set(q, (out[p].get(q) || 0) + w); into[q].set(p, (into[q].get(p) || 0) + w); }
  const sum = (m) => { let t = 0; for (const w of m.values()) t += w; return t; };
  const left = new Set([...Array(n).keys()]), first = [], last = [];
  const take = (v, list) => {
    left.delete(v);
    list.push(v);
    for (const q of out[v].keys()) into[q].delete(v);
    for (const p of into[v].keys()) out[p].delete(v);
  };
  while (left.size) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const v of [...left]) {
        if (!into[v].size) { take(v, first); moved = true; } // nothing left to wait for: includes nodes with no arcs
        else if (!out[v].size) { take(v, last); moved = true; }
      }
    }
    if (!left.size) break;
    let best = -1, score = -Infinity;
    for (const v of left) { const s = sum(out[v]) - sum(into[v]); if (s > score) { score = s; best = v; } }
    take(best, first);
  }
  const pos = new Array(n);
  [...first, ...last.reverse()].forEach((v, k) => { pos[v] = k; });
  return pos;
}
