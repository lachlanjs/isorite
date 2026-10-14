// The Atlas's arithmetic, apart from its drawing: what a layout (core's, in cells) means on the screen. Which
// folders are open at a zoom, which routes are drawn at rest, the way a link runs from note to note, and the
// view that frames an item. Carried over from rdstudio's gridmap.js; nothing here touches the page.

import type { Gate, Layout, Point } from "@isorite/core/atlas";

/** A cell's side at zoom 1, as the boards draw it: a note's block is 18 by 5 cells, 126 by 35 px. */
export const CELL = 7;
/** A folder opens when it is this many pixels across on screen, and a cell at least this big. 53, not 60: a folder's
 *  padding went from 8 cells to 6, so a folder of one note is 30 cells across, not 34, and opens at the same zoom. */
export const OPEN_AT = 53, MIN_CELL = 1.2;
/** Notes carry their titles from this zoom up. */
export const LABELS_AT = 0.55;
export const MIN_ZOOM = 0.04, MAX_ZOOM = 3;

export interface View { x: number; y: number; k: number }

/** What is worked out once for a layout. */
export interface Index {
  /** Each item's folders, nearest first. */
  up: number[][];
  /** The notes in each folder, however deep. */
  noteCount: number[];
  /** A note's item, by its name in the model. */
  at: Map<string, number>;
  trunkAt: Map<string, number>;
  feederAt: Map<string, number>;
  /** The path the layout drew between two items of one folder: from the one required to the one requiring it. */
  ownPath: Map<string, Point[]>;
  /** Each trunk: whether a link of the strongest kind the base rates ("requires", where it rates any) runs along it. */
  strong: boolean[];
}

export function indexLayout(L: Layout): Index {
  const up = L.items.map((n) => { const out: number[] = []; for (let p = n.parent; p >= 0; p = L.items[p]!.parent) out.push(p); return out; });
  const noteCount = L.items.map(() => 0);
  L.items.forEach((n, i) => { if (n.kind === "note") for (const p of up[i]!) noteCount[p]!++; });
  // The trunk a link runs along joins the two items that hold its ends in the lowest folder holding both.
  const under = (i: number, level: number): number => { while (L.items[i]!.parent !== level) i = L.items[i]!.parent; return i; };
  const trunkAt = new Map(L.trunks.map((t, k) => [`${t.a}|${t.b}`, k]));
  const most = L.links.some((l) => l.s >= 3 && !L.items[l.a]!.ref.startsWith("@study")) ? 3 : 2, strong = L.trunks.map(() => false);
  for (const l of L.links) {
    const t = l.s >= most ? trunkAt.get(`${under(l.a, l.level)}|${under(l.b, l.level)}`) : undefined;
    if (t !== undefined) strong[t] = true;
  }
  return {
    up, noteCount, strong,
    at: new Map(L.items.flatMap((n, i) => (n.kind === "note" ? [[n.ref, i] as const] : []))),
    trunkAt,
    feederAt: new Map(L.feeders.map((f, k) => [`${f.trunk}|${f.folder}|${f.item}`, k])),
    ownPath: new Map(L.trunks.flatMap((t) => (t.pts ? [[`${t.a}|${t.b}`, t.pts] as const] : []))),
  };
}

const highwayed = new WeakMap<Layout, Layout>();
/** The layout with the highways (core's highways.js) for its trunks and feeders: everything drawn from those
 *  then draws them. The same object each time for one layout, so what is worked out for it is kept. */
export function withHighways(L: Layout): Layout {
  let H = highwayed.get(L);
  if (!H) highwayed.set(L, (H = { ...L, trunks: L.highways.trunks, feeders: L.highways.feeders }));
  return H;
}

/** What is open at a zoom: a folder big enough on screen whose own folder is open. One character an item:
 *  "o" open, "s" shown and closed (or a note), "-" inside a closed folder. A string, so that a zoom which
 *  opens nothing changes nothing. */
export function openAt(L: Layout, k: number): string {
  const out: string[] = [];
  L.items.forEach((n, i) => {
    const shown = n.parent < 0 || out[n.parent] === "o";
    out[i] = !shown ? "-" : n.kind === "folder" && L.cell * k >= MIN_CELL && Math.max(n.w, n.h) * L.cell * k >= OPEN_AT ? "o" : "s";
  });
  return out.join("");
}

/** The item that stands for another on screen: itself, or the outermost closed folder holding it. */
export function shownAs(idx: Index, open: string, i: number): number {
  const up = idx.up[i]!;
  for (let k = up.length - 1; k >= 0; k--) if (open[up[k]!] !== "o") return up[k]!;
  return i;
}

/** A route at rest. `strong`: a "requires" runs along it; the rest carry only weaker links and are drawn lighter. */
export interface Route { key: string; pts: Point[]; lane: number; count: number; feed: boolean; study: boolean; strong: boolean }

/** The routes drawn at rest: each of the layout's trunks whose two ends are shown, and inside an open folder
 *  the branches from its subfolders to where a trunk arrives. A link a longer way already makes (an implied
 *  trunk: the highways give it a way, to be lit) is left out. A trunk between two folders is drawn heavy
 *  (`feed` false); one with a note at an end is drawn as the feeders are, as on the boards. */
export function restRoutes(L: Layout, open: string, strong: boolean[] = []): Route[] {
  const shown = (i: number): boolean => open[i] !== "-", study = (i: number): boolean => L.items[i]!.ref.startsWith("@study");
  const out: Route[] = [];
  L.trunks.forEach((t, k) => {
    const folders = L.items[t.a]!.kind === "folder" && L.items[t.b]!.kind === "folder";
    if (t.pts && !t.implied && shown(t.a) && shown(t.b)) out.push({ key: "t" + k, pts: t.pts, lane: 0, count: t.count, feed: !folders, study: study(t.a) || study(t.b), strong: strong[k] ?? true });
  });
  L.feeders.forEach((f, k) => {
    const t = L.trunks[f.trunk]!;
    if (!f.leaf && !t.implied && open[f.folder] === "o" && shown(f.item) && shown(t.a) && shown(t.b)) out.push({ key: "f" + k, pts: f.pts, lane: f.lane, count: f.count, feed: true, study: study(t.a) || study(t.b), strong: strong[f.trunk] ?? true });
  });
  return out;
}

const same = (p: Point, q: Point): boolean => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

/** A link between notes in different folders, the long way: from the note required (`b`), out along the
 *  feeders to its trunk, along the trunk, and in along the feeders at the other end. Null where some part of
 *  the way is not drawn: the router then finds the short way. */
export function tracePath(L: Layout, idx: Index, a: number, b: number): Point[] | null {
  const above = new Set(idx.up[b]!), level = idx.up[a]!.find((p) => above.has(p)) ?? -1;
  const chain = (n: number): number[] => { const out = [n]; for (const p of idx.up[n]!) { if (p === level) break; out.push(p); } return out; };
  const ca = chain(a), cb = chain(b), t = idx.trunkAt.get(`${ca.at(-1)}|${cb.at(-1)}`);
  if (t === undefined || !L.trunks[t]!.pts || (ca.length < 2 && cb.length < 2)) return null;
  const whole = (k: number, depth = 0): Point[] => {
    const f = L.feeders[k]!;
    if (f.via < 0 || depth > 40) return f.pts;
    const on = whole(f.via, depth + 1), j = on.findIndex((p) => same(p, f.pts.at(-1)!));
    return j < 0 ? f.pts : [...f.pts, ...on.slice(j + 1)];
  };
  const out = (c: number[]): Point[] | null => {
    let pts: Point[] = [];
    for (let k = 0; k + 1 < c.length; k++) {
      const f = idx.feederAt.get(`${t}|${c[k + 1]}|${c[k]}`);
      if (f === undefined) return null;
      pts = pts.concat(whole(f));
    }
    return pts;
  };
  const from = out(cb), to = out(ca);
  if (!from || !to) return null;
  const pts = [...from, ...L.trunks[t]!.pts!, ...to.reverse()];
  return pts.filter((p, k) => !k || !same(p, pts[k - 1]!));
}

// ------------------------------------------------------------ gated routes (core's gates.js), beside the above

const gatedIndex = new WeakMap<Layout, { gateAt: Map<number, Gate>; linkAt: Map<string, number>; most: number }>();
function gatedOf(L: Layout): { gateAt: Map<number, Gate>; linkAt: Map<string, number>; most: number } {
  let g = gatedIndex.get(L);
  if (!g) {
    const gateAt = new Map<number, Gate>();
    for (const gate of L.gated.gates) { gateAt.set(gate.cell, gate); if (gate.inner >= 0) gateAt.set(gate.inner, gate); }
    const linkAt = new Map<string, number>();
    L.links.forEach((l, k) => { if (L.gated.paths[k]) linkAt.set(`${l.a}|${l.b}`, k); });
    const most = L.links.some((l) => l.s >= 3 && !L.items[l.a]!.ref.startsWith("@study")) ? 3 : 2;
    gatedIndex.set(L, (g = { gateAt, linkAt, most }));
  }
  return g;
}
const seenIn = (L: Layout, open: string, region: number): boolean => region < 0 || open[region] === "o";

/** The gated routes drawn at rest: each stretch so marked, in a folder that is open, between items shown.
 *  Its count is the links along it; only a stretch between two sibling folders' gates is labelled with it. */
export function gatedRest(L: Layout, open: string): Route[] {
  const { gateAt, most } = gatedOf(L), study = (i: number): boolean => L.items[i]!.ref.startsWith("@study");
  const out: Route[] = [];
  L.gated.stretches.forEach((st, k) => {
    if (!st.rest || !seenIn(L, open, st.region)) return;
    const ga = gateAt.get(st.a)!, gb = gateAt.get(st.b)!;
    if (open[ga.item] === "-" || open[gb.item] === "-") return;
    const bridge = ga.inner >= 0 && gb.inner >= 0 && ga.cell === st.a && gb.cell === st.b;
    out.push({ key: "g" + k, pts: st.pts, lane: 0, count: st.links.length, feed: !bridge, study: study(ga.item) || study(gb.item), strong: most === 2 || st.strong });
  });
  return out;
}

/** As `litRoutes`, along the gated routes: a link's way is its stretches in folders that are open, so where a
 *  folder is closed it ends at the gate in its wall. */
export function gatedLit(L: Layout, idx: Index, open: string, links: { a: number; b: number; kind: LitKind }[]): { fixed: Lit[]; asks: LitAsk[] } {
  const { linkAt } = gatedOf(L), fixed: Lit[] = [], asks: LitAsk[] = [], seen = new Set<string>();
  for (const { a, b, kind } of links) {
    const sa = shownAs(idx, open, a), sb = shownAs(idx, open, b), key = `${kind}:${sa}|${sb}`;
    if (sa === sb || seen.has(key)) continue;
    seen.add(key);
    const forward = linkAt.get(`${a}|${b}`), k = forward ?? linkAt.get(`${b}|${a}`);
    if (k === undefined) { asks.push({ key, kind, a: sa, b: sb }); continue; }
    let pts: Point[] = [];
    for (const [s, back] of L.gated.paths[k]!) {
      const st = L.gated.stretches[s]!;
      if (seenIn(L, open, st.region)) pts = pts.concat(back ? [...st.pts].reverse() : st.pts);
    }
    pts = pts.filter((p, j) => !j || !same(p, pts[j - 1]!));
    // The way runs from link.a to link.b; a lit route runs from what is required (b) to what requires it (a).
    fixed.push({ key, kind, pts: forward !== undefined ? pts.reverse() : pts });
  }
  return { fixed, asks };
}

export type LitKind = "requires" | "builds" | "uses";
export interface Lit { key: string; kind: LitKind; pts: Point[] }

// ------------------------------------------------------------ routes merged where they overlap

/** A run of routes that overlap: drawn once, as thick as the links along it. `strong`: a "requires" runs
 *  along it; `trunk`: it runs between two folders (a route that is not a feeder, `feed` false). For lit runs, `kind` is the strongest along it and `flow` whether the links of that kind all run
 *  the way its points go (1), or both ways (0), when its dashes stand still. */
export interface Run { key: string; pts: Point[]; count: number; strong: boolean; study: boolean; trunk: boolean; kind: LitKind; flow: 0 | 1 }

const STRENGTH: LitKind[] = ["uses", "builds", "requires"];
interface Edge { a: string; b: string; A: Point; B: Point; count: number; strong: boolean; study: boolean; trunk: boolean; kind: number; fwd: number[]; back: number[] }

/**
 * Routes merged where they overlap. Each is cut into half-cell steps (every route runs through cell centres and
 * the points on walls between them); a step taken by several routes is one, counted for each. Steps then join
 * into runs, as long as the count, the kind and (for lit routes) the way the links run stay the same, and a
 * run stops where routes meet or part.
 */
export function mergeRoutes(routes: { pts: Point[]; count?: number; strong?: boolean; study?: boolean; feed?: boolean; kind?: LitKind }[], lit = false): Run[] {
  // Points to a hundredth of a cell: routes share half-cell steps, and a route that ends in the middle of a cut
  // corner (core's cornerEnds) keeps its last fraction of a cell.
  const id = (p: Point): string => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const edges = new Map<string, Edge>(), at = new Map<string, string[]>();
  for (const r of routes) {
    const kind = STRENGTH.indexOf(r.kind ?? "requires"), taken = new Set<string>();
    for (let k = 1; k < r.pts.length; k++) {
      const [x0, y0] = r.pts[k - 1]!, [x1, y1] = r.pts[k]!, n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
      for (let s = 0; s < n; s++) {
        const P: Point = [x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n], Q: Point = [x0 + ((x1 - x0) * (s + 1)) / n, y0 + ((y1 - y0) * (s + 1)) / n];
        const p = id(P), q = id(Q), key = p < q ? p + "|" + q : q + "|" + p;
        if (p === q || taken.has(key)) continue; // a route counts once on a step, even where it doubles back
        taken.add(key);
        let e = edges.get(key);
        if (!e) {
          e = p < q ? { a: p, b: q, A: P, B: Q, count: 0, strong: false, study: false, trunk: false, kind: 0, fwd: [0, 0, 0], back: [0, 0, 0] } : { a: q, b: p, A: Q, B: P, count: 0, strong: false, study: false, trunk: false, kind: 0, fwd: [0, 0, 0], back: [0, 0, 0] };
          edges.set(key, e);
          for (const n of [e.a, e.b]) { const list = at.get(n); if (list) list.push(key); else at.set(n, [key]); }
        }
        e.count += r.count ?? 1;
        e.strong ||= r.strong ?? true;
        e.study ||= r.study ?? false;
        e.trunk ||= r.feed === false;
        e.kind = Math.max(e.kind, kind);
        (p === e.a ? e.fwd : e.back)[kind]! += 1;
      }
    }
  }
  const sig = (e: Edge): string => (lit ? `${e.kind}|${e.count}` : `${e.count}|${e.strong}|${e.study}|${e.trunk}`);
  // Which way the links of the step's kind run, seen walking it from node u: 1 the same way, -1 against, 0 both.
  // Only its kind counts: a "uses" running back along a "requires" leaves the requires' dashes moving.
  const flow = (e: Edge, u: string): number => {
    const f = e.fwd[e.kind]!, b = e.back[e.kind]!;
    return !lit || (f && b) ? 0 : (f ? 1 : -1) * (u === e.a ? 1 : -1);
  };
  const other = (e: Edge, u: string): string => (u === e.a ? e.b : e.a);
  const point = (e: Edge, u: string): Point => (u === e.a ? e.A : e.B);
  const goesOn = (e1: Edge, u: string, e2: Edge): boolean => { const v = other(e1, u); return sig(e1) === sig(e2) && flow(e1, u) === flow(e2, v); };
  const used = new Set<string>(), out: Run[] = [], keys = new Set<string>();
  const walk = (start: string, first: string): void => {
    let u = start, key = first, e = edges.get(key)!;
    const pts: Point[] = [point(e, u)], f = flow(e, u);
    for (;;) {
      used.add(key);
      const v = other(e, u);
      pts.push(point(e, v));
      const next = at.get(v)!.filter((k) => k !== key);
      if (next.length !== 1 || used.has(next[0]!) || !goesOn(e, u, edges.get(next[0]!)!)) break;
      u = v; key = next[0]!; e = edges.get(key)!;
    }
    if (f < 0) pts.reverse();
    let name = `${id(pts[0]!)}>${id(pts.at(-1)!)}:${sig(e)}`;
    for (let n = 2; keys.has(name); n++) name = `${name.split("#")[0]}#${n}`;
    keys.add(name);
    out.push({ key: name, pts, count: e.count, strong: e.strong, study: e.study, trunk: e.trunk, kind: STRENGTH[e.kind]!, flow: f ? 1 : 0 });
  };
  // A run starts where routes meet or part, or where what is along them changes; what is left are loops.
  for (const [n, list] of at) {
    const ends = list.length !== 2 || !goesOn(edges.get(list[0]!)!, other(edges.get(list[0]!)!, n), edges.get(list[1]!)!);
    if (ends) for (const k of list) if (!used.has(k)) walk(n, k);
  }
  for (const [key, e] of edges) if (!used.has(key)) walk(e.a, key);
  return out;
}
export interface LitAsk { key: string; kind: LitKind; a: number; b: number }

/** The lit routes of a note's reach: `a` requires `b`, as items. Those with a drawn way are given at once,
 *  each running from what is required to what requires it; the rest are to be asked of the router, between
 *  the items that stand for their ends on screen. */
export function litRoutes(L: Layout, idx: Index, open: string, links: { a: number; b: number; kind: LitKind }[]): { fixed: Lit[]; asks: LitAsk[] } {
  const fixed: Lit[] = [], asks: LitAsk[] = [], seen = new Set<string>();
  for (const { a, b, kind } of links) {
    const sa = shownAs(idx, open, a), sb = shownAs(idx, open, b), key = `${kind}:${sa}|${sb}`;
    if (sa === sb || seen.has(key)) continue;
    seen.add(key);
    const own = sa === a && sb === b ? idx.ownPath.get(`${a}|${b}`) ?? tracePath(L, idx, a, b) : idx.ownPath.get(`${sa}|${sb}`) ?? null;
    if (own) fixed.push({ key, kind, pts: own });
    else asks.push({ key, kind, a: sa, b: sb });
  }
  return { fixed, asks };
}

// Shift a route sideways by `o` (its lane), with one normal per undirected direction, so routes running
// opposite ways do not collide.
function offsetLine(P: Point[], o: number): Point[] {
  if (!o) return P;
  const normal = (a: Point, b: Point): Point => {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    if (dx < -1e-6 || (Math.abs(dx) < 1e-6 && dy < 0)) { dx = -dx; dy = -dy; }
    return [-dy, dx];
  };
  return P.map((p, i) => {
    const n1 = i > 0 ? normal(P[i - 1]!, p) : normal(p, P[i + 1]!), n2 = i < P.length - 1 ? normal(p, P[i + 1]!) : n1;
    const d = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return d < 0.2 ? [p[0] + n1[0] * o, p[1] + n1[1] * o] : [p[0] + ((n1[0] + n2[0]) / d) * o, p[1] + ((n1[1] + n2[1]) / d) * o];
  });
}

/** A route as an SVG path at zoom 1: straight runs, each right-angled corner cut at 45 degrees. A 45 degree
 *  turn is left sharp: cutting it would draw a run at 22.5 degrees, off the grid's eight directions. */
export function linePath(cells: Point[], lane = 0, cell = CELL): string {
  const P = offsetLine(cells.map(([x, y]): Point => [x * cell, y * cell]), lane * 2.2), d = Math.min(cell, CELL * 1.5) * 0.9;
  const Q = P.filter((p, i) => i === 0 || i === P.length - 1 || Math.abs((p[0] - P[i - 1]![0]) * (P[i + 1]![1] - p[1]) - (p[1] - P[i - 1]![1]) * (P[i + 1]![0] - p[0])) > 1e-3);
  const f = (v: number): string => String(Math.round(v * 10) / 10);
  let out = `M${f(Q[0]![0])} ${f(Q[0]![1])}`;
  for (let i = 1; i < Q.length - 1; i++) {
    const a = Q[i - 1]!, b = Q[i]!, c = Q[i + 1]!;
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const square = Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 1e-3 * l1 * l2;
    if (!square) { out += `L${f(b[0])} ${f(b[1])}`; continue; }
    const r = Math.min(d, l1 / 2, l2 / 2);
    out += `L${f(b[0] - ((b[0] - a[0]) / l1) * r)} ${f(b[1] - ((b[1] - a[1]) / l1) * r)}L${f(b[0] + ((c[0] - b[0]) / l2) * r)} ${f(b[1] + ((c[1] - b[1]) / l2) * r)}`;
  }
  const z = Q.at(-1)!;
  return out + `L${f(z[0])} ${f(z[1])}`;
}

/** The view that frames a block of cells in a viewport, with a little room, no closer than `most`. */
export function fit(box: { gx: number; gy: number; w: number; h: number }, width: number, height: number, most = MAX_ZOOM, cell = CELL): View {
  const room = 2;
  const k = Math.max(MIN_ZOOM, Math.min(most, 0.96 * Math.min(width / ((box.w + 2 * room) * cell), height / ((box.h + 2 * room) * cell))));
  return { k, x: width / 2 - k * (box.gx + box.w / 2) * cell, y: height / 2 - k * (box.gy + box.h / 2) * cell };
}

/** Zoom by a factor about a point of the viewport, which stays where it is. */
export function zoomAbout(v: View, factor: number, px: number, py: number): View {
  const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k * factor)), f = k / v.k;
  return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
}
