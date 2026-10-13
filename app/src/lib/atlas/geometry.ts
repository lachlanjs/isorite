// The Atlas's arithmetic, apart from its drawing: what a layout (core's, in cells) means on the screen. Which
// folders are open at a zoom, which routes are drawn at rest, the way a link runs from note to note, and the
// view that frames an item. Carried over from rdstudio's gridmap.js; nothing here touches the page.

import type { Layout, Point } from "@isorite/core/atlas";

/** A cell's side at zoom 1, as the boards draw it: a note's block is 18 by 5 cells, 126 by 35 px. */
export const CELL = 7;
/** A folder opens when it is this many pixels across on screen, and a cell at least this big. */
export const OPEN_AT = 60, MIN_CELL = 1.2;
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
}

export function indexLayout(L: Layout): Index {
  const up = L.items.map((n) => { const out: number[] = []; for (let p = n.parent; p >= 0; p = L.items[p]!.parent) out.push(p); return out; });
  const noteCount = L.items.map(() => 0);
  L.items.forEach((n, i) => { if (n.kind === "note") for (const p of up[i]!) noteCount[p]!++; });
  return {
    up, noteCount,
    at: new Map(L.items.flatMap((n, i) => (n.kind === "note" ? [[n.ref, i] as const] : []))),
    trunkAt: new Map(L.trunks.map((t, k) => [`${t.a}|${t.b}`, k])),
    feederAt: new Map(L.feeders.map((f, k) => [`${f.trunk}|${f.folder}|${f.item}`, k])),
    ownPath: new Map(L.trunks.flatMap((t) => (t.pts ? [[`${t.a}|${t.b}`, t.pts] as const] : []))),
  };
}

/** What is open at a zoom: a folder big enough on screen whose own folder is open. One character an item:
 *  "o" open, "s" shown and closed (or a note), "-" inside a closed folder. A string, so that a zoom which
 *  opens nothing changes nothing. */
export function openAt(L: Layout, k: number): string {
  const out: string[] = [];
  L.items.forEach((n, i) => {
    const shown = n.parent < 0 || out[n.parent] === "o";
    out[i] = !shown ? "-" : n.kind === "folder" && CELL * k >= MIN_CELL && Math.max(n.w, n.h) * CELL * k >= OPEN_AT ? "o" : "s";
  });
  return out.join("");
}

/** The item that stands for another on screen: itself, or the outermost closed folder holding it. */
export function shownAs(idx: Index, open: string, i: number): number {
  const up = idx.up[i]!;
  for (let k = up.length - 1; k >= 0; k--) if (open[up[k]!] !== "o") return up[k]!;
  return i;
}

export interface Route { key: string; pts: Point[]; lane: number; count: number; feed: boolean; study: boolean }

/** The routes drawn at rest: each of the layout's trunks whose two ends are shown, and inside an open folder
 *  the branches from its subfolders to where a trunk arrives. A link a longer way already makes has no path
 *  of its own and is left out. */
export function restRoutes(L: Layout, open: string): Route[] {
  const shown = (i: number): boolean => open[i] !== "-", study = (i: number): boolean => L.items[i]!.ref.startsWith("@study");
  const out: Route[] = [];
  L.trunks.forEach((t, k) => {
    if (t.pts && shown(t.a) && shown(t.b)) out.push({ key: "t" + k, pts: t.pts, lane: 0, count: t.count, feed: false, study: study(t.a) || study(t.b) });
  });
  L.feeders.forEach((f, k) => {
    const t = L.trunks[f.trunk]!;
    if (!f.leaf && open[f.folder] === "o" && shown(f.item) && shown(t.a) && shown(t.b)) out.push({ key: "f" + k, pts: f.pts, lane: f.lane, count: f.count, feed: true, study: study(t.a) || study(t.b) });
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

export interface Lit { key: string; kind: "requires" | "builds"; pts: Point[] }
export interface LitAsk { key: string; kind: "requires" | "builds"; a: number; b: number }

/** The lit routes of a note's reach: `a` requires `b`, as items. Those with a drawn way are given at once,
 *  each running from what is required to what requires it; the rest are to be asked of the router, between
 *  the items that stand for their ends on screen. */
export function litRoutes(L: Layout, idx: Index, open: string, links: { a: number; b: number; kind: "requires" | "builds" }[]): { fixed: Lit[]; asks: LitAsk[] } {
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

/** A route as an SVG path at zoom 1: straight runs, each corner cut at 45 degrees. */
export function linePath(cells: Point[], lane = 0): string {
  const P = offsetLine(cells.map(([x, y]): Point => [x * CELL, y * CELL]), lane * 2.2), d = CELL * 0.9;
  const Q = P.filter((p, i) => i === 0 || i === P.length - 1 || Math.abs((p[0] - P[i - 1]![0]) * (P[i + 1]![1] - p[1]) - (p[1] - P[i - 1]![1]) * (P[i + 1]![0] - p[0])) > 1e-3);
  const f = (v: number): string => String(Math.round(v * 10) / 10);
  let out = `M${f(Q[0]![0])} ${f(Q[0]![1])}`;
  for (let i = 1; i < Q.length - 1; i++) {
    const a = Q[i - 1]!, b = Q[i]!, c = Q[i + 1]!;
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1, r = Math.min(d, l1 / 2, l2 / 2);
    out += `L${f(b[0] - ((b[0] - a[0]) / l1) * r)} ${f(b[1] - ((b[1] - a[1]) / l1) * r)}L${f(b[0] + ((c[0] - b[0]) / l2) * r)} ${f(b[1] + ((c[1] - b[1]) / l2) * r)}`;
  }
  const z = Q.at(-1)!;
  return out + `L${f(z[0])} ${f(z[1])}`;
}

/** The view that frames a block of cells in a viewport, with a little room, no closer than `most`. */
export function fit(box: { gx: number; gy: number; w: number; h: number }, width: number, height: number, most = MAX_ZOOM): View {
  const room = 2;
  const k = Math.max(MIN_ZOOM, Math.min(most, 0.96 * Math.min(width / ((box.w + 2 * room) * CELL), height / ((box.h + 2 * room) * CELL))));
  return { k, x: width / 2 - k * (box.gx + box.w / 2) * CELL, y: height / 2 - k * (box.gy + box.h / 2) * CELL };
}

/** Zoom by a factor about a point of the viewport, which stays where it is. */
export function zoomAbout(v: View, factor: number, px: number, py: number): View {
  const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k * factor)), f = k / v.k;
  return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
}
