<script lang="ts">
  // The Atlas: the base as a map. The layout is the core's, worked out in a worker; this holds the view (pan,
  // zoom, what is open at this zoom) and what is chosen, and hands each folder, block and route its place and
  // its marks. The marks are plain maps from a note to a mark, looked up while drawing.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { reach, STRENGTH } from "@isorite/core";
  import type { Grain, Layout, Point } from "@isorite/core/atlas";
  import type { How, MapReport, NoteSource } from "@isorite/engine";
  import { linkedIn, placeOf, titleIn, withLink, withoutLink } from "$lib/atlas/picks.ts";
  import { makeKind as makeNew, untitled } from "$lib/make.ts";
  import { tick, untrack } from "svelte";
  import AtlasDock from "./AtlasDock.svelte";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { pictureSrc } from "$lib/pictures.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { tray, type Part } from "$lib/tray.svelte.ts";
  import { converse } from "$lib/converse.svelte.ts";
  import { pointing } from "$lib/pointing.svelte.ts";
  import { CELL, MAX_ZOOM, MIN_ZOOM, TITLE_UNITS, TITLE_PX, directLine, fit, indexLayout, withHighways, linePath, litRoutes, mergeRoutes, openAt, restRoutes, shownAs, zoomAbout, type Lit, type LitKind, type View } from "$lib/atlas/geometry.ts";
  import { satellites, withoutNotes } from "$lib/atlas/kinds.ts";
  import { layoutOf, routesOf } from "$lib/atlas/layout.ts";
  import AtlasBlock from "./AtlasBlock.svelte";
  import AtlasFolder from "./AtlasFolder.svelte";
  import AtlasRoutes from "./AtlasRoutes.svelte";

  let { pick = "" }: {
    /** A note for Iso (`@draft/…`) that notes are being picked for: a click then links a note to it. */
    pick?: string;
  } = $props();

  /** The most of the linked notes that is sent with a note for Iso (the engine's LINKED_BUDGET). */
  const LINKED_BUDGET = 8000;

  let report = $state.raw<MapReport | null>(null);
  let laid = $state.raw<{ key: string; layout: Layout } | null>(null);
  /** The way and grid `laid` was made on: a changed base starts from it only on the same (V5). */
  let laidOn = "";
  let failed = $state("");
  let view = $state.raw<View>({ x: 0, y: 0, k: 1 });
  /** How far a zoom under way goes from the drawn map before it is drawn again, as a log ratio (about 40%). */
  const REDRAW = 0.35;
  /** The zoom the map is drawn at: its borders, titles, open folders and lines. While a zoom is under way the drawn
   *  map is only scaled to the view, which the compositor does without painting it again; it is drawn at the view's
   *  zoom once the zoom rests, or once it has gone far enough from it that borders and folders would look wrong
   *  (a pinch had restyled and repainted every block at each frame). */
  let drawnK = $state(1);
  let resting: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const k = view.k;
    clearTimeout(resting);
    if (Math.abs(Math.log(k / drawnK)) > REDRAW) drawnK = k;
    else if (k !== drawnK) resting = setTimeout(() => (drawnK = k), 150);
  });
  /** A first view is drawn at once, not scaled into. */
  const begin = (to: View): void => { view = to; drawnK = to.k; };
  let size = $state.raw({ w: 0, h: 0 });
  /** The note pointed at, and the notes walked: the one first chosen, then each requirement stepped back to.
   *  The last is the note chosen. Their names in the model. */
  let pointed = $state("");
  let walk = $state.raw<string[]>([]);
  const chosen = $derived(walk.at(-1) ?? "");
  let viewport = $state<HTMLDivElement>();
  /** The grid the map is laid on (key c): fine, coarse or coarser. A bigger cell gives a route fewer places to bend. */
  const GRAINS: Grain[] = ["fine", "coarse", "coarser"];
  let grain = $state<Grain>(GRAINS.find((g) => g === stored("isorite.atlas.grain")) ?? "fine");
  /** Whether the branches from each note to its folder's wall are drawn at rest (key l), while that is judged. */
  let leaves = $state(stored("isorite.atlas.leaves") === "on");
  let moved = false; // the map was moved by hand: a new layout then leaves the view alone

  // The top level runs the long way of the screen: what is required at the left of a wide one, at the foot of a tall one.
  const flow: "up" | "right" = window.innerWidth >= window.innerHeight ? "right" : "up";

  function stored(name: string): string | null {
    try { return localStorage.getItem(name); } catch { return null; }
  }
  function nextGrain(): void {
    grain = GRAINS[(GRAINS.indexOf(grain) + 1) % GRAINS.length]!; moved = false; // a new grid is a new map: framed afresh
    try { localStorage.setItem("isorite.atlas.grain", grain); } catch { /* storage unavailable: not remembered */ }
    void load();
  }
  function useLeaves(on: boolean): void {
    leaves = on;
    try { localStorage.setItem("isorite.atlas.leaves", on ? "on" : "off"); } catch { /* storage unavailable: not remembered */ }
  }
  async function load(): Promise<void> {
    try {
      const all = await app.api.map();
      // The kinds switched off are not on the map (M12), and a resolved question leaves it.
      // Files beside the notes (M23: pictures, artifacts, data, documents, others) are on it when its switch is on.
      const next = { ...all, model: withoutNotes(all.model, (ref) => {
        const f = all.files?.[ref];
        if (f) return !panes.on.pictures;
        const n = all.notes[ref];
        return n?.kind === "question" ? !panes.on.questions || !!n.done : n?.kind === "problem" ? !panes.on.problems : false;
      }) };
      // A changed base is laid out from where things stood (V5), on the same grid and the same way.
      const on = `${flow}|${grain}`, from = laid && laidOn === on ? laid.layout.orders ?? null : null;
      const next_laid = await layoutOf(next.model, { gridFlow: flow, grain, blocks: true, from });
      laidOn = on;
      const changed = !!laid && laid.key !== next_laid.key;
      const was = laid && L ? { refs: new Set(L.items.map((n) => n.ref)), edges: new Set(report!.model.edges.map(([a, b]) => `${a}>${b}`)) } : null;
      const first = !laid || (laid.key !== next_laid.key && !moved);
      // A new layout in three beats (V7): the lines drawn now retract, then notes and folders move, then the new
      // lines draw out. Nothing is drawn while anything moves.
      const run = ++beats, quiet = matchMedia("(prefers-reduced-motion: reduce)").matches, staged = !!was && changed && !quiet;
      if (staged) {
        retracting = rest;
        beat = "retract";
        await wait(RETRACT);
        if (run !== beats) return;
        retracting = [];
        beat = "move";
      }
      report = next; laid = next_laid; failed = "";
      if (was && changed) void arrive(was);
      if (first && size.w) begin(whole());
      if (staged) {
        await wait(MOVE);
        if (run !== beats) return;
        beat = "draw";
        await wait(DRAW);
        if (run === beats) beat = "";
      }
    } catch (e) { failed = (e as Error).message; }
  }

  // A kind switched on or off lays the map out again, from where things stood (V5).
  let kindsWere = "";
  $effect(() => {
    const now = `${panes.on.questions}|${panes.on.problems}|${panes.on.pictures}`;
    if (kindsWere && kindsWere !== now) void load();
    kindsWere = now;
  });
  $effect(() => {
    void load();
    let again: ReturnType<typeof setTimeout> | undefined;
    const off = app.on((e) => {
      if (e.type !== "note-changed" && e.type !== "record") return;
      clearTimeout(again);
      again = setTimeout(() => { void load(); }, 400);
    });
    return () => { off(); clearTimeout(again); };
  });

  // The layout's trunks and feeders are drawn as the highways (one object a layout, kept).
  const L = $derived(laid ? withHighways(laid.layout) : null);
  const idx = $derived(L ? indexLayout(L) : null);
  const open = $derived(L ? openAt(L, drawnK) : "");
  // The whole map: what is on it, and half the margin round it, where the ways round the outside run.
  // With a note for Iso being answered, its block beside the map is framed too.
  const whole = (): View => {
    const m = (L?.margin ?? 0) / 2, box = { gx: m, gy: m, w: (L?.W ?? 1) - 2 * m, h: (L?.H ?? 1) - 2 * m }, d = origin?.draft ? origin : null;
    // With room under it and to its right for what Iso is doing.
    if (d && L) { const x1 = Math.max(box.gx + box.w, d.gx + Math.max(d.w, 240 / L.cell) + 2), y1 = Math.max(box.gy + box.h, d.gy + d.h + 70 / L.cell); box.gx = Math.min(box.gx, d.gx - 2); box.gy = Math.min(box.gy, d.gy - 2); box.w = x1 - box.gx; box.h = y1 - box.gy; }
    return fit(box, size.w, size.h, 1, L?.cell);
  };

  const RETRACT = 220, MOVE = 520, DRAW = 340;
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  /** Where a new layout is in its three beats (V7), and the lines retracting in the first. */
  let beat = $state<"" | "retract" | "move" | "draw">("");
  let retracting = $state.raw<typeof rest>([]);
  let beats = 0;

  // A changed base, seen happen (K3): the blocks move to the new layout, then what is new fades in where it now
  // stands, and a new link is drawn as a line growing from the note that has it to the note it links to.
  let shifting = $state(false);
  let grown = $state.raw<{ key: string; d: string }[]>([]);
  async function arrive(was: { refs: Set<string>; edges: Set<string> }): Promise<void> {
    shifting = true;
    setTimeout(() => (shifting = false), 700);
    await tick();
    if (!L || !idx || !report) return;
    const quiet = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const item of L.items) {
      if (was.refs.has(item.ref) || item.ref.startsWith("@")) continue;
      const el = viewport?.querySelector(item.kind === "folder" ? `[data-folder="${CSS.escape(item.ref)}"]` : `[data-note="${CSS.escape(item.ref)}"]`);
      el?.animate([{ opacity: 0 }, { opacity: 0, offset: quiet ? 0 : 0.45 }, { opacity: 1 }], { duration: quiet ? 200 : 1000, easing: "ease-out" });
    }
    const fresh = report.model.edges.filter(([a, b]) => !was.edges.has(`${a}>${b}`) && !a.startsWith("@") && !b.startsWith("@") && was.refs.has(a) && was.refs.has(b));
    grown = fresh.flatMap(([a, b]) => {
      const i = idx!.at.get(a), j = idx!.at.get(b);
      if (i === undefined || j === undefined) return [];
      return [{ key: `${a}>${b}`, d: between(L!.items[shownAs(idx!, open, i)]!, L!.items[shownAs(idx!, open, j)]!) }];
    });
    if (grown.length) setTimeout(() => (grown = []), 5600);
  }
  /** A straight way from one block's side to another's, as a note for Iso's lines are drawn. */
  function between(o: { gx: number; gy: number; w: number; h: number }, n: { gx: number; gy: number; w: number; h: number }): string {
    const dx = n.gx + n.w / 2 - (o.gx + o.w / 2), dy = n.gy + n.h / 2 - (o.gy + o.h / 2), across = Math.abs(dx) * (11 / 18) >= Math.abs(dy);
    const p: [number, number] = across ? [dx < 0 ? o.gx : o.gx + o.w, o.gy + o.h / 2] : [o.gx + o.w / 2, dy < 0 ? o.gy : o.gy + o.h];
    const q: [number, number] = across ? [dx < 0 ? n.gx + n.w : n.gx, n.gy + n.h / 2] : [n.gx + n.w / 2, dy < 0 ? n.gy + n.h : n.gy];
    return linePath(directLine(p, q, across), 0, L!.cell);
  }

  // The viewport's size; the first time it is known, the whole map is framed. After that, as a note opens beside the
  // Atlas or the divider moves (V1), what was in the middle stays in the middle.
  $effect(() => {
    if (!viewport) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry!.contentRect, first = !size.w, was = size;
      size = { w, h };
      if (first && L) begin(whole());
      else if (!first && w && h) view = { ...view, x: view.x + (w - was.w) / 2, y: view.y + (h - was.h) / 2 };
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  });

  const folders = $derived(L ? L.items.flatMap((item, i) => (item.kind === "folder" && open[i] !== "-" ? [{ item, i, open: open[i] === "o" }] : [])) : []);
  const notes = $derived(L ? L.items.flatMap((item, i) => (item.kind === "note" && open[i] === "s" ? [{ item, i }] : [])) : []);
  // The routes at rest, merged where they overlap. A line between folders is labelled with its count, as on the boards,
  // where it is long enough to carry it (5 cells); one inside a folder, only where it is long (30 cells).
  const rest = $derived(L ? mergeRoutes(restRoutes(L, open, idx!.strong, leaves)).map((r) => ({ key: r.key, pts: r.pts, d: linePath(r.pts, 0, L.cell), count: r.count, strong: r.strong, trunk: r.trunk, ...countAt(r) })).map((r, i, all) => ({ ...r, label: r.label && !all.some((o, j) => j !== i && o.label && o.count === r.count && Math.hypot(o.mid[0] - r.mid[0], o.mid[1] - r.mid[1]) < 10 && (o.length > r.length || (o.length === r.length && j < i))) })) : []);
  // A count: on a line between folders only, where it carries more than one link, once along its longest straight
  // stretch of 3 cells or more, beside the line (to the right of an upright one, above any other). Where a highway
  // is cut in two by a line joining it, the same count close by is shown once, on the longer piece.
  function countAt(r: { pts: Point[]; count: number; trunk: boolean }): { label: boolean; mid: Point; side: "right" | "above"; length: number } {
    // Stretches: runs of steps the same way (a merged run comes in half-cell steps).
    let a = r.pts[0]!, b = a, length = 0;
    for (let i = 1, from = 0; i < r.pts.length; i++) {
      const p = r.pts[i - 1]!, q = r.pts[i]!, n = r.pts[i + 1];
      const same = n && Math.abs((q[0] - p[0]) * (n[1] - q[1]) - (q[1] - p[1]) * (n[0] - q[0])) < 1e-6 && (q[0] - p[0]) * (n[0] - q[0]) + (q[1] - p[1]) * (n[1] - q[1]) > 0;
      if (same) continue;
      const s = r.pts[from]!, l = Math.hypot(q[0] - s[0], q[1] - s[1]);
      if (l > length) { length = l; a = s; b = q; }
      from = i;
    }
    return { label: r.trunk && r.count > 1 && length >= 3, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], side: Math.abs(a[0] - b[0]) < 1e-6 ? "right" : "above", length };
  }

  // What is lit: the note chosen, or with none chosen the one pointed at. Its own links are drawn, one step each
  // way; the rest of what it requires is outlined, fainter the further back, and drawn only when asked for.
  const at = $derived(pick ? "" : chosen || pointed); // while notes are picked, the marks are the picks alone
  const lit = $derived(at && report && idx?.at.has(at) ? reach(report.model, at) : null);
  type Mark = "at" | "req" | "bld" | "use" | "also";
  const marks = $derived.by(() => {
    const out = new Map<string, { mark: Mark; far: number }>();
    if (!lit) return out;
    for (const r of lit.also) out.set(r, { mark: "also", far: 0 });
    for (const r of lit.uses) out.set(r, { mark: "use", far: 0 });
    for (const r of lit.builds) out.set(r, { mark: "bld", far: 0 });
    for (const r of lit.requires) out.set(r, { mark: "req", far: lit.depth[r] ?? 1 });
    for (const r of walk) out.set(r, { mark: "req", far: 1 }); // the way walked stays lit behind you
    out.set(at, { mark: "at", far: 0 });
    return out;
  });
  const links = $derived.by(() => {
    if (!lit) return [];
    const walked = walk.slice(1).map((to, k) => ({ from: walk[k]!, to, kind: "requires" as const })), last = walk.at(-2);
    return [...walked, ...lit.links.filter((l) => (l.kind === "requires" ? l.from === at : !(l.kind === "builds" && l.from === last)))];
  });
  // A folder apart from the chosen note's own stands for the notes in it: how many of them it requires, and
  // how many build on it.
  const held = $derived.by(() => {
    const out = new Map<number, { req: number; bld: number }>();
    if (!lit || !idx) return out;
    const mine = new Set(idx.up[idx.at.get(at)!]);
    const count = (refs: string[], k: "req" | "bld"): void => {
      for (const r of refs) for (const p of idx.up[idx.at.get(r) ?? -1] ?? []) {
        if (mine.has(p)) break;
        const h = out.get(p) ?? { req: 0, bld: 0 };
        h[k]++; out.set(p, h);
      }
    };
    count(lit.requires, "req"); count(lit.builds, "bld");
    return out;
  });
  /** What a folder says it holds: a closed one always, an open one only where it is the outermost apart from the note's own. */
  const holds = (i: number, isOpen: boolean): { req: number; bld: number } => {
    const h = held.get(i), parent = L!.items[i]!.parent;
    return h && (!isOpen || parent < 0 || !held.has(parent)) ? h : { req: 0, bld: 0 };
  };

  // The lit routes: the layout's own ways at once, and the few it drew none for when the router has found them.
  type Hot = { key: string; d: string; kind: LitKind; count: number; still: boolean };
  let hot = $state.raw<Hot[]>([]);
  /** The lit links of each kind, however their lines merge. */
  let litCount = $state.raw<Record<Exclude<LitKind, "iso">, number>>({ requires: 0, builds: 0, uses: 0 });
  /** Light the links between notes (`a` requires `b`, by name), handing what is drawn to `set` now and again once
   *  the router has found the ways the layout has none for. Returns what stops a late answer. */
  function light(list: { from: string; to: string; kind: LitKind }[], set: (hot: Hot[], lits: Lit[]) => void): (() => void) | undefined {
    if (!list.length || !L || !idx || !laid) { set([], []); return; }
    const ends = list.flatMap((l) => { const a = idx.at.get(l.from), b = idx.at.get(l.to); return a === undefined || b === undefined ? [] : [{ a, b, kind: l.kind }]; });
    const { fixed, asks } = litRoutes(L, idx, open, ends);
    // Merged where they overlap, as at rest.
    const drawn = (lits: Lit[]): void => set(mergeRoutes(lits, true).map((r) => ({ key: r.key, kind: r.kind, d: linePath(r.pts, 0, L!.cell), count: r.count, still: !r.flow })), lits);
    drawn(fixed);
    if (!asks.length) return;
    let stale = false;
    // The router's way runs from the note requiring to the one required: turned round, so every lit route runs the same way.
    void routesOf(laid.key, L, asks.map(({ a, b }) => ({ a, b }))).then((found) => {
      if (!stale) drawn([...fixed, ...asks.flatMap((m, k) => (found[k] ? [{ key: m.key, kind: m.kind, pts: [...found[k]].reverse() }] : []))]);
    }).catch(() => undefined);
    return () => { stale = true; };
  }
  $effect(() => light(links, (h, lits) => {
    hot = h;
    litCount = { requires: lits.filter((l) => l.kind === "requires").length, builds: lits.filter((l) => l.kind === "builds").length, uses: lits.filter((l) => l.kind === "uses").length };
  }));

  // ------------------------------------------------------------ the open note, and what is pointed at elsewhere (M17)

  /** The note open in the Note pane. */
  const here = $derived(page.route.id === "/n/[...id]" ? (page.params.id ?? "") : "");
  /** The item on the map standing for a note or a folder: the note's block, or the closed folder it is in. */
  function standing(id: string, folder = false): number {
    if (!L || !idx || !id) return -1;
    const i = folder ? L.items.findIndex((n) => n.kind === "folder" && n.ref.replace(/\/$/, "") === id) : idx.at.get(id) ?? -1;
    return i < 0 ? -1 : shownAs(idx, open, i);
  }
  const hereAt = $derived(standing(here));
  /** What is pointed at outside the Atlas (Atlas-Timeline): its block, or the folder standing for it. */
  const there = $derived(pointing.elsewhere);
  const thereAt = $derived(there ? standing(there.id, there.folder) : -1);
  // The link from the open note to what is pointed at, lit in its kind whichever note holds it, and nothing dimmed.
  const thereLinks = $derived.by(() => {
    if (!there || there.folder || !here || there.id === here || !report) return [];
    const e = report.model.edges.find(([a, b]) => (a === here && b === there.id) || (a === there.id && b === here));
    return e ? [{ from: e[0], to: e[1], kind: (e[2] >= STRENGTH.requires ? "requires" : "uses") as LitKind }] : [];
  });
  let thereHot = $state.raw<Hot[]>([]);
  $effect(() => light(thereLinks, (h) => { thereHot = h.map((r) => ({ ...r, key: `there:${r.key}` })); }));

  // The choice follows the open note (Q79): with the note chosen open, following one of its links in the Note pane
  // moves the choice there, along the walk where it is a note the chosen one requires.
  let hereWas = "";
  $effect(() => {
    const now = here;
    untrack(() => {
      if (now && now !== hereWas && chosen && chosen === hereWas && idx?.at.has(now)) {
        const back: string[] = [];
        if (lit && lit.depth[now]) for (let r: string | undefined = now; r && r !== chosen; r = lit.via[r]) back.unshift(r);
        walk = walk.includes(now) ? walk.slice(0, walk.indexOf(now) + 1) : back.length ? [...walk, ...back] : [now];
      }
      hereWas = now;
    });
  });

  // Off the screen, the open note and what is pointed at are a pip at the Atlas's edge, towards them (Q82): the map
  // does not move unless asked. A click on the pip brings the note into the middle, at the same zoom.
  const PIP_IN = 14;
  function pipFor(i: number): { x: number; y: number; angle: number } | null {
    if (!L || i < 0 || !size.w) return null;
    const n = L.items[i]!, u = L.cell * view.k;
    const x0 = view.x + n.gx * u, y0 = view.y + n.gy * u, x1 = x0 + n.w * u, y1 = y0 + n.h * u;
    if (x1 > 0 && x0 < size.w && y1 > 0 && y0 < size.h) return null;
    const cx = size.w / 2, cy = size.h / 2, dx = (x0 + x1) / 2 - cx, dy = (y0 + y1) / 2 - cy;
    const t = Math.min((cx - PIP_IN) / Math.max(Math.abs(dx), 1e-6), (cy - PIP_IN) / Math.max(Math.abs(dy), 1e-6));
    return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
  }
  const herePip = $derived(pick ? null : pipFor(hereAt));
  const therePip = $derived(pick || thereAt === hereAt ? null : pipFor(thereAt));
  function bringIn(i: number): void {
    if (!L) return;
    const n = L.items[i]!, u = L.cell * view.k;
    moved = true;
    fly({ k: view.k, x: size.w / 2 - (n.gx + n.w / 2) * u, y: size.h / 2 - (n.gy + n.h / 2) * u });
  }

  // ------------------------------------------------------------ Iso's path (Desktop-Think)

  /** Iso's latest request, from whichever page sent it. */
  const run = $derived(pick ? null : app.iso);
  const running = $derived(run?.state === "reading" || run?.state === "writing");
  /** Each note Iso opened, and how it got there: by its words, by its meaning, along a link, or named outright. */
  const reached = $derived.by(() => {
    const out = new Map<string, How>();
    for (const s of run?.steps ?? []) if (s.opened && !s.failed && !out.has(s.opened)) out.set(s.opened, s.how);
    return out;
  });
  // The Iso lens (M10): what Iso is sent, what it changed in this conversation, what it points to, and the order
  // it read in during its last turn. Iso's path is drawn only in this lens.
  const isoLens = $derived(panes.on.context || !!pick);
  const givenNotes = $derived(new Set(tray.parts.filter((p) => p.kind === "note").map((p) => p.id)));
  const givenFolders = $derived(new Set(tray.parts.filter((p) => p.kind === "folder").map((p) => p.id)));
  /** The notes Iso read in this conversation (M15): in hand, or set aside. */
  const heldRows = $derived(new Map((converse.report?.rows ?? []).filter((r) => r.kind === "read").map((r) => [r.key.slice(2), r] as const)));
  const lastTurn = $derived(converse.turns.at(-1));
  const changedByIso = $derived(new Set(converse.turns.filter((t) => !t.items.some((i) => i.kind === "undone")).flatMap((t) => t.items.flatMap((i) => (i.kind === "change" && i.why !== "delete" ? [i.why === "move" ? i.to! : i.note] : [])))));
  const pointedTo = $derived(new Map((lastTurn?.items ?? []).flatMap((i) => (i.kind === "point" ? [[i.note, i.why] as const] : []))));
  const readOrder = $derived.by(() => {
    const out = new Map<string, number>();
    for (const i of lastTurn?.items ?? []) if (i.kind === "look" && i.step.opened && !i.step.failed && !out.has(i.step.opened)) out.set(i.step.opened, out.size + 1);
    return out;
  });
  /** The note it is reading now. */
  const reading = $derived(running ? (run!.steps.findLast((s) => s.opened && !s.failed)?.opened ?? "") : "");
  // Its steps along links, drawn as the map draws a link: from the note in hand to the one it led to.
  const isoLinks = $derived((run?.steps ?? []).flatMap((s) => (s.how === "link" && s.from && s.opened && !s.failed ? [{ from: s.from, to: s.opened, kind: "iso" as const }] : [])));
  let isoHot = $state.raw<Hot[]>([]);
  // Keyed apart from the chosen note's lit routes, which may run the same way.
  $effect(() => light(isoLinks, (h) => { isoHot = h.map((r) => ({ ...r, key: `iso:${r.key}` })); }));

  // A note for Iso is not in the base: its block stands where the map was held for it, or beside the map, with
  // a blue line to each note it links to. A note in the base asks from its own block.
  let asking = $state.raw<NoteSource | null>(null);
  $effect(() => {
    const id = run?.note ?? "";
    asking = null;
    if (!id.startsWith("@draft/")) return;
    let stale = false;
    app.api.readNote(id).then((d) => { if (!stale) asking = d; }, () => undefined);
    return () => { stale = true; };
  });
  const origin = $derived.by((): { gx: number; gy: number; w: number; h: number; draft: boolean; title: string } | null => {
    if (!run || !L || !idx) return null;
    if (!run.note.startsWith("@draft/")) {
      const i = idx.at.get(run.note);
      if (i === undefined) return null;
      const s = L.items[shownAs(idx, open, i)]!;
      return { gx: s.gx, gy: s.gy, w: s.w, h: s.h, draft: false, title: title(run.note) };
    }
    const w = Math.round(126 / L.cell), h = Math.round(77 / L.cell), name = asking ? titleIn(asking.text) || "a new note" : "";
    const held = placeOf(run.note), at = held ? { gx: Math.round((held.gx * CELL) / L.cell), gy: Math.round((held.gy * CELL) / L.cell) } : null;
    const clear = at && !L.items.some((n) => n.kind === "note" && at.gx < n.gx + n.w + 1 && n.gx < at.gx + w + 1 && at.gy < n.gy + n.h + 1 && n.gy < at.gy + h + 1);
    if (clear) return { ...at, w, h, draft: true, title: name };
    // Beside the map, the long way of the screen: at its right on a wide one, under it on a tall one.
    const tops = L.items.filter((n) => n.parent < 0), right = Math.max(...tops.map((n) => n.gx + n.w)), foot = Math.max(...tops.map((n) => n.gy + n.h)), gap = Math.round(84 / L.cell);
    return flow === "right" ? { gx: right + gap, gy: Math.round((L.H - h) / 2), w, h, draft: true, title: name } : { gx: Math.round((L.W - w) / 2), gy: foot + gap, w, h, draft: true, title: name };
  });
  /** The notes the note for Iso links to: what it was sent with. */
  const sent = $derived(asking ? linkedIn(asking.text).filter((id) => report?.notes[id]) : []);
  const sentLines = $derived.by(() => {
    if (!origin?.draft || !L || !idx) return [];
    return sent.flatMap((id) => {
      const i = idx.at.get(id);
      if (i === undefined) return [];
      return [{ key: id, d: between(origin!, L!.items[shownAs(idx!, open, i)]!) }];
    });
  });
  /** How a note is outlined for Iso's path: by keyword, by meaning, along a link (or named outright), or being read now. */
  const isoMark = (ref: string): "" | "key" | "sem" | "link" | "used" => {
    if (!isoLens) return "";
    if (ref === reading) return "used";
    const how = reached.get(ref);
    return how === "keyword" ? "key" : how === "meaning" ? "sem" : how ? "link" : "";
  };

  // A note for Iso sent to be watched here opens again when Iso is done with it (even if that was before the
  // map was up).
  $effect(() => {
    const r = run;
    if (!r || r.request !== app.watching || r.state === "reading" || r.state === "writing") return;
    app.watching = "";
    if (r.state === "done") void goto(resolve("/draft/[id]", { id: r.note.slice("@draft/".length) }));
  });
  // A note for Iso being answered is framed with the map when it begins.
  let framedFor = "";
  $effect(() => {
    if (!origin?.draft || !run || framedFor === run.request || !size.w) return;
    framedFor = run.request;
    if (!moved) view = whole();
  });

  // ------------------------------------------------------------ notes picked for a note for Iso

  let draft = $state.raw<NoteSource | null>(null);
  let notice = $state("");
  $effect(() => {
    draft = null; notice = "";
    if (!pick) return;
    let stale = false;
    app.api.readNote(pick).then((d) => { if (!stale) draft = d; }, () => { if (!stale) notice = "that note for Iso is not here any more"; });
    return () => { stale = true; };
  });
  const picked = $derived(draft ? linkedIn(draft.text).filter((id) => report?.notes[id] && !id.startsWith("@")) : []);
  let writing: Promise<void> = Promise.resolve();
  /** Link a note to the draft, or take away a link picked here. One at a time, each on the file as the last left it. */
  function toggle(ref: string): void {
    writing = writing.then(async () => {
      if (!draft || ref.startsWith("@")) return;
      // A request for an exercise is picked for what it tests; any other note for Iso, for what it links.
      const change = (text: string): string | null => (linkedIn(text).includes(ref) ? withoutLink(text, ref) : withLink(text, ref, title(ref)));
      const next = change(draft.text);
      if (next === null) { notice = "linked in what you wrote: take it out there"; return; }
      notice = "";
      try { draft = await app.api.saveNote(pick, { base: draft.version, text: next }); }
      catch {
        // It changed under us (the draft's own page was still saving): once more, on what is there now.
        try {
          const now = await app.api.readNote(pick), again = change(now.text);
          draft = again === null ? now : await app.api.saveNote(pick, { base: now.version, text: again });
        } catch (e) { notice = `not linked: ${(e as Error).message}`; }
      }
    });
  }

  // ------------------------------------------------------------ holding, to make a note or a folder (V6)
  //
  // Hold still on open ground, and a new note is marked where you hold; let go, and it is made, "Untitled note", and
  // opens in the Note pane with its title chosen, to type over. Hold, then drag a little way, and it is a new folder
  // instead, "Untitled folder", made with a first note in it, since a folder is made when a note is put in it. Either
  // goes in the folder gripped in, numbered if the name is taken. Nothing is asked for on the map: the name was asked
  // for away from where you held (Lachlan, on V6). What is marked is a note's or a folder's icon, not an area. Held on a note, the note is given to Iso
  // (M10): it goes into what Iso is sent.

  const HOLD_SHOWN = 180, HOLD = 650, FOLDER_DRAG = 24;
  /** What is gripped: a place (in cells), the folder it is in, and whether a drag has made it a folder. */
  let grasp = $state.raw<{ dir: string; gx: number; gy: number; w: number; h: number; folder: boolean } | null>(null);
  /** Held long enough: the gesture is ours until the pointer is let go. Where it began, on the screen. */
  let gripped: { x: number; y: number } | null = null;
  /** Let go: the note being made. */
  let making = false;
  let holdShow: ReturnType<typeof setTimeout> | undefined, holdDone: ReturnType<typeof setTimeout> | undefined;
  function unhold(): void { clearTimeout(holdShow); clearTimeout(holdDone); holdShow = holdDone = undefined; gripped = null; if (!making) grasp = null; }
  /** The deepest folder of the base holding a place on the map (in cells): "" for the top. */
  function folderAt(gx: number, gy: number): string {
    let best: { ref: string; depth: number } | null = null;
    for (const n of L!.items) if (n.kind === "folder" && !n.ref.startsWith("@") && gx >= n.gx && gx < n.gx + n.w && gy >= n.gy && gy < n.gy + n.h && (!best || n.depth > best.depth)) best = { ref: n.ref, depth: n.depth };
    return best?.ref ?? "";
  }
  function holding(e: PointerEvent, at: { x: number; y: number }): void {
    unhold();
    if (offered && !(e.target instanceof Element && e.target.closest(".offer"))) offered = null;
    if (pick || making || !L || !idx || !(e.target instanceof Element) || e.target.closest("button, .dock")) return;
    const on = e.target.closest<HTMLElement>("[data-note]")?.dataset.note ?? "";
    if (on.startsWith("@")) return; // a note for Iso is not a place in the base
    if (on) {
      // A mouse gives it straight away; a finger is offered a choice there, since a phone has no Iso beside the map (Q16).
      const touch = e.pointerType !== "mouse";
      holdDone = setTimeout(() => { holdDone = undefined; dragged = true; if (touch) offered = { ref: on, x: at.x, y: at.y }; else give(on); }, HOLD);
      return;
    }
    const u = L.cell * view.k, gx = Math.round((at.x - view.x) / u), gy = Math.round((at.y - view.y) / u);
    const what = { dir: folderAt(gx, gy), gx, gy, w: 0, h: 0, folder: false };
    holdShow = setTimeout(() => { grasp = what; }, HOLD_SHOWN);
    holdDone = setTimeout(() => { holdDone = undefined; dragged = true; gripped = at; grasp = what; viewport?.setPointerCapture(e.pointerId); }, HOLD);
  }
  /** While gripped: a drag far enough makes it a folder. Its icon stays where the hold began. */
  function drawHeld(at: { x: number; y: number }): void {
    if (!gripped || !grasp || grasp.folder) return;
    if (Math.hypot(at.x - gripped.x, at.y - gripped.y) >= FOLDER_DRAG) grasp = { ...grasp, folder: true };
  }
  /** A note held with a finger: what can be done with it, offered where it was held. */
  let offered = $state.raw<{ ref: string; x: number; y: number } | null>(null);
  /** A note given to Iso: into the tray, said on the map for a moment. */
  let given = $state("");
  let givenTimer: ReturnType<typeof setTimeout> | undefined;
  function give(ref: string, kind: "note" | "folder" = "note"): void {
    const put = tray.add({ kind, id: ref, title: kind === "note" ? title(ref) : folderName(ref) });
    given = put ? `${kind === "note" ? title(ref) : folderName(ref)} is in Iso's context` : `${kind === "note" ? title(ref) : folderName(ref)} is in Iso's context already`;
    clearTimeout(givenTimer);
    givenTimer = setTimeout(() => (given = ""), 2200);
  }
  /** Given to Iso if it isn't, else taken back. */
  function giveOrTake(ref: string, kind: "note" | "folder" = "note"): void {
    // A note Iso read and holds is set aside; one set aside is held again.
    const held = kind === "note" && !tray.has("note", ref) ? heldRows.get(ref) : undefined;
    if (held) {
      void converse.toggle(held);
      given = `${title(ref)} is ${held.on ? "set aside" : "in Iso's hand again"}`;
      clearTimeout(givenTimer);
      givenTimer = setTimeout(() => (given = ""), 2200);
      return;
    }
    if (!tray.has(kind, ref)) { give(ref, kind); return; }
    const name = kind === "note" ? title(ref) : folderName(ref);
    tray.remove({ kind, id: ref, title: name });
    given = `${name} is out of Iso's context`;
    clearTimeout(givenTimer);
    givenTimer = setTimeout(() => (given = ""), 2200);
  }
  /** Let go while gripped: made, and opened. */
  function letGo(): void {
    if (!gripped || !grasp) return;
    gripped = null;
    void make(grasp);
  }
  async function make(g: NonNullable<typeof grasp>): Promise<void> {
    making = true;
    const ids = app.listing.notes.map((n) => n.id);
    let dir = g.dir;
    if (g.folder) {
      const f = untitled(g.dir, "untitled-folder", (d) => !ids.some((id) => id.startsWith(`${d}/`)));
      dir = [g.dir, f.slug].filter(Boolean).join("/");
    }
    const t = untitled(dir, "untitled-note", (id) => !ids.includes(id));
    const id = [dir, t.slug].filter(Boolean).join("/"), name = t.n === 1 ? "Untitled note" : `Untitled note ${t.n}`;
    try {
      await app.api.createNote(id, `---\ntype: Concept\ntitle: ${JSON.stringify(name)}\n---\n\n`);
      await app.refresh();
      panes.fresh = id;
      await panes.open(id);
    } catch (err) { notice = (err as Error).message; }
    finally { making = false; grasp = null; }
  }

  /** A question about a note, or a problem using it (M12). */
  async function makeKind(kind: "question" | "problem", about: string): Promise<void> {
    try { await makeNew(kind, about); } catch (err) { notice = (err as Error).message; }
  }

  /** What an item opens: a note, a file, or for a folder of pictures, the note they were pasted into (M22). */
  const opens = (ref: string): string => (ref.endsWith("/") ? ref.slice(0, -1) : ref);
  const title = (ref: string): string => report?.notes[ref]?.title ?? report?.files?.[ref]?.title ?? ref.split("/").at(-1) ?? ref;
  const folderName = (ref: string): string => ref.split("/").at(-1) || app.session?.name || "the base";

  // ------------------------------------------------------------ moving about

  let flying = 0;
  /** Go to a view, over a moment unless motion is unwanted. */
  function fly(to: View): void {
    cancelAnimationFrame(flying);
    still();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { view = to; return; }
    const from = view, t0 = performance.now(), ms = 320;
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 3;
      // The zoom eases as a ratio, so the map grows evenly; the place follows it.
      const k = from.k * (to.k / from.k) ** e, cx = size.w / 2, cy = size.h / 2;
      const wx = ((cx - from.x) / from.k) * (1 - e) + ((cx - to.x) / to.k) * e, wy = ((cy - from.y) / from.k) * (1 - e) + ((cy - to.y) / to.k) * e;
      view = t === 1 ? to : { k, x: cx - wx * k, y: cy - wy * k };
      if (t < 1) flying = requestAnimationFrame(step);
    };
    flying = requestAnimationFrame(step);
  }

  let dragged = false; // the press that just ended moved the map: it is not a click
  const pointers = new Map<number, { x: number; y: number }>();
  let grip: { view: View; x: number; y: number; span: number } | null = null;

  function regrip(): void {
    const ps = [...pointers.values()];
    if (!ps.length) { grip = null; return; }
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    grip = { view, x, y, span: ps.length > 1 ? Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y) : 0 };
  }
  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => { const r = viewport!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // A drag that starts on a note, or on a folder's title, picks it up and never moves the map (V8): with a mouse it is
  // carried, and let go over Iso's pane it is given to Iso; let go anywhere else, it is put back. A drag from anywhere
  // else, inside a folder or on open ground, moves the map. A touch screen holds instead (Iso is not beside the map).
  let press: Part | null = null;
  let carryAt = $state({ x: 0, y: 0 });
  function pressed(e: PointerEvent): Part | null {
    if (pick || !(e.target instanceof Element)) return null;
    const n = e.target.closest<HTMLElement>("[data-note]")?.dataset.note;
    if (n) return n.startsWith("@") ? null : { kind: "note", id: n, title: title(n) };
    // An open folder by its title; a closed one is a block, picked up anywhere on it.
    const f = (e.target.closest(".frame-title")?.closest<HTMLElement>("[data-folder]") ?? e.target.closest<HTMLElement>("button[data-folder]"))?.dataset.folder;
    return f && !f.startsWith("@") ? { kind: "folder", id: f, title: folderName(f) } : null;
  }
  function carry(e: PointerEvent): void {
    if (!press || e.pointerType !== "mouse") return;
    carryAt = { x: e.clientX, y: e.clientY };
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pane="iso"]') != null;
    tray.carrying = { part: press, over };
  }
  function down(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelAnimationFrame(flying);
    still();
    if (!pointers.size) { dragged = false; press = pressed(e); }
    pointers.set(e.pointerId, local(e));
    regrip();
    if (pointers.size === 1) holding(e, local(e)); else unhold();
  }
  function move(e: PointerEvent): void {
    if (!pointers.has(e.pointerId) || !grip) return;
    pointers.set(e.pointerId, local(e));
    if (gripped) { drawHeld(local(e)); return; }
    const ps = [...pointers.values()];
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    if (!dragged && ps.length === 1 && Math.hypot(x - grip.x, y - grip.y) < 5) return;
    if (!dragged) { dragged = true; unhold(); viewport!.setPointerCapture(e.pointerId); }
    if (ps.length === 1 && press) { carry(e); return; }
    moved = true;
    const span = ps.length > 1 ? Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y) : 0;
    const zoomed = grip.span && span ? zoomAbout(grip.view, span / grip.span, grip.x, grip.y) : grip.view;
    view = { k: zoomed.k, x: zoomed.x + x - grip.x, y: zoomed.y + y - grip.y };
  }
  function up(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return;
    if (tray.carrying) {
      const { part, over } = tray.carrying;
      tray.carrying = null;
      if (over && (part.kind === "note" || part.kind === "folder")) give(part.id, part.kind);
    }
    press = null;
    if (gripped) letGo();
    else if (holdDone !== undefined) unhold(); // let go before the hold was long enough
    regrip();
  }
  // The wheel and a trackpad's pinch set a zoom to go to, about the pointer; each frame goes part of the way there,
  // as a ratio, so the map grows smoothly however the wheel ticks (M12).
  let goal: { k: number; x: number; y: number } | null = null, easing = 0;
  function wheel(e: WheelEvent): void {
    e.preventDefault();
    cancelAnimationFrame(flying);
    moved = true;
    const p = local(e), unit = e.deltaMode === 1 ? 16 : 1;
    // A pinch on a trackpad arrives as a wheel with ctrl held, in finer steps.
    const by = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (goal?.k ?? view.k) * by));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { view = zoomAbout(view, k / view.k, p.x, p.y); return; }
    goal = { k, x: p.x, y: p.y };
    if (!easing) easing = requestAnimationFrame(ease);
  }
  function ease(): void {
    easing = 0;
    if (!goal) return;
    const r = goal.k / view.k;
    if (Math.abs(Math.log(r)) < 0.004) { view = zoomAbout(view, r, goal.x, goal.y); goal = null; return; }
    view = zoomAbout(view, r ** 0.3, goal.x, goal.y);
    easing = requestAnimationFrame(ease);
  }
  function still(): void { cancelAnimationFrame(easing); easing = 0; goal = null; }
  // A wheel that zooms must be able to stop the page scrolling, which a listener added in the markup may not.
  $effect(() => {
    if (!viewport) return;
    const el = viewport;
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  /** A click on a note chooses it; on the chosen note, opens it. On a note the chosen one requires it steps
   *  back to it, the way there kept; on one already walked, returns to it. */
  function choose(e: MouseEvent, ref: string): void {
    if (e.metaKey || e.ctrlKey) return; // a new tab is the browser's
    e.preventDefault();
    e.stopPropagation();
    if (dragged) return;
    if (pick) { toggle(ref); return; }
    // Shift+click gives a note to Iso, or takes it back, with Iso's context shown or not (M14).
    if (e.shiftKey) { if (!ref.startsWith("@")) giveOrTake(ref); return; }
    // Chosen already: open it, beside the Atlas on a desktop (V1).
    if (chosen === ref) { void panes.open(opens(ref)); return; }
    const back: string[] = [];
    if (lit && at === chosen && lit.depth[ref]) for (let r: string | undefined = ref; r && r !== chosen; r = lit.via[r]) back.unshift(r);
    walk = walk.includes(ref) ? walk.slice(0, walk.indexOf(ref) + 1) : back.length ? [...walk, ...back] : [ref];
  }
  /** A click on a folder frames it; on one already framed, the folder it is in. */
  function enter(i: number, e?: MouseEvent): void {
    if (dragged || !L) return;
    const ref = L.items[i]!.ref;
    if (e?.shiftKey) { if (!ref.startsWith("@")) giveOrTake(ref, "folder"); return; }
    moved = true;
    const to = fit(L.items[i]!, size.w, size.h, 1.5, L.cell), there = Math.abs(to.k - view.k) < 0.01 * to.k && Math.hypot(to.x - view.x, to.y - view.y) < 4;
    const parent = L.items[i]!.parent;
    fly(there ? (parent < 0 ? whole() : fit(L.items[parent]!, size.w, size.h, 1.5, L.cell)) : to);
  }
  /** A click on open ground lets go of the note chosen, or else steps out to the whole map. */
  function ground(e: MouseEvent): void {
    if (dragged || !(e.target instanceof Element) || e.target.closest(".dock, .key")) return;
    const folder = e.target.closest<HTMLElement>("[data-folder]");
    if (e.target.closest("a, button")) return;
    if (chosen) walk = [];
    else if (run && !running) app.iso = null; // Iso's path is let go once it has ended
    else if (folder && L) enter(L.items.findIndex((n) => n.kind === "folder" && n.ref === folder.dataset.folder), e);
    else fly(whole());
  }
  function key(e: KeyboardEvent): void {
    if (e.key === "Escape") { walk = []; pointed = ""; return; }
    if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) { nextGrain(); return; }
    if (e.key === "l" && !e.metaKey && !e.ctrlKey && !e.altKey) { useLeaves(!leaves); return; }
    if (e.target !== viewport) return;
    const pan = 80, c = { x: size.w / 2, y: size.h / 2 };
    if (e.key === "+" || e.key === "=") view = zoomAbout(view, 1.25, c.x, c.y);
    else if (e.key === "-") view = zoomAbout(view, 0.8, c.x, c.y);
    else if (e.key === "0") fly(whole());
    else if (e.key === "ArrowLeft") view = { ...view, x: view.x + pan };
    else if (e.key === "ArrowRight") view = { ...view, x: view.x - pan };
    else if (e.key === "ArrowUp") view = { ...view, y: view.y + pan };
    else if (e.key === "ArrowDown") view = { ...view, y: view.y - pan };
    else return;
    e.preventDefault();
    moved = true;
  }

  /** The folder the screen is in: zoomed in past the whole map, the deepest whose frame holds the screen's middle
   *  and is most of the screen across. */
  const inside = $derived.by(() => {
    if (!L || !size.w || view.k <= whole().k * 1.05) return -1;
    const u = L.cell * view.k, cx = (size.w / 2 - view.x) / u, cy = (size.h / 2 - view.y) / u;
    let best = -1;
    L.items.forEach((n, i) => {
      if (n.kind !== "folder" || open[i] !== "o" || cx < n.gx || cx > n.gx + n.w || cy < n.gy || cy > n.gy + n.h) return;
      if ((n.w * u >= 0.6 * size.w || n.h * u >= 0.6 * size.h) && (best < 0 || L.items[best]!.depth < n.depth)) best = i;
    });
    return best;
  });
  /** Out of the folder the screen is in, to the one holding it (Mobile-Atlas's `↑ out`). */
  function out(): void {
    if (!L) return;
    moved = true;
    const parent = inside < 0 ? -1 : L.items[inside]!.parent;
    fly(parent < 0 ? whole() : fit(L.items[parent]!, size.w, size.h, 1.5, L.cell));
  }

  // Titles are set once, in the map's units (M12): shown while they are big enough on screen to read.
  const labels = $derived(TITLE_UNITS * drawnK >= TITLE_PX);
  /** The links out of the base switched on, beside their notes. */
  const sats = $derived(L && report ? satellites(notes.map((n) => n.item), report.notes, { web: panes.on.web, code: panes.on.code }) : []);
  /** A picture satellite's thumbnail (M22), set once it's had. */
  function thumb(img: HTMLImageElement, p: { path: string; from: "notes" | "code" }) {
    const src = pictureSrc(app.api, p);
    if (typeof src === "string") img.src = src; else void src.then((s) => { if (s) img.src = s; });
  }
  /** What a note's block stands on: its folder's inside, which a kind's glyph in its top edge cuts the edge with. */
  const behind = (parent: number): string => (parent >= 0 && L!.items[parent]!.depth % 2 ? "var(--ground-1)" : "var(--ground-0)");
  $effect(() => {
    app.atlas = { chosen: chosen ? title(chosen) : "", chosenId: chosen, steps: walk.length - 1, pick: !!pick, here: inside < 0 ? "" : folderName(L!.items[inside]!.ref), out, fit: () => { moved = false; fly(whole()); } };
    return () => { app.atlas = null; };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="atlas" class:lit={!!lit} bind:this={viewport} role="application" aria-label="The atlas: the map of the base" tabindex="0"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={ground} onkeydown={key}
  ondragstart={(e) => e.preventDefault()}
  oncontextmenu={(e) => { if (grasp || holdShow !== undefined || holdDone !== undefined || offered) e.preventDefault(); }}>
  <div class="ground dots" aria-hidden="true" style="transform: translate({((view.x % 24) + 24) % 24}px, {((view.y % 24) + 24) % 24}px)"></div>
  {#if failed}
    <p class="said">The map could not be drawn: {failed}</p>
  {:else if L && report}
    {#if !L.items.length}<p class="said faint">There are no notes yet. The map draws itself as you write them.</p>{/if}
    <!-- One move for the whole map (M12): the folders and the notes are scaled as they stand, in the map's units;
         what is drawn round them (routes, counts, Iso's note) is placed at the zoom. -->
    <div class="atlas-world" class:labels class:shifting data-open={open} style="transform: translate({view.x}px, {view.y}px) scale({view.k / drawnK}); --u: {(L?.cell ?? 7) * drawnK}px; --k: {drawnK}">
      <div class="scaled" style="transform: scale({drawnK}); --u: {L.cell}px; --px: {1 / drawnK}px; --ik: {1 / drawnK}">
      {#each folders as f (f.item.id)}
          <AtlasFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} titled={f.item.parent < 0 || (f.item.gy - L.items[f.item.parent]!.gy) * L.cell * drawnK >= 18} held={holds(f.i, f.open)} dim={!!lit && !f.open && !held.has(f.i)} given={isoLens && givenFolders.has(f.item.ref)} here={!f.open && hereAt === f.i} moment={thereAt === f.i ? there!.who : ""} onpick={(e) => enter(f.i, e)} />
      {/each}
      </div>
      <AtlasRoutes k={drawnK} {rest} pointed={!chosen && !!pointed} hot={[...(isoLens ? isoHot : []), ...hot, ...thereHot]} counts={litCount} sent={sentLines} {grown} {beat} {retracting} />
      {#if labels && !beat}
        {#each rest as r (r.key)}
          {#if r.label}<span class="count {r.side}" style="--x:{r.mid[0]};--y:{r.mid[1]}">{r.count}</span>{/if}
        {/each}
      {/if}
      <div class="scaled" style="transform: scale({drawnK}); --u: {L.cell}px; --px: {1 / drawnK}px; --ik: {1 / drawnK}">
      {#each notes as n (n.item.id)}
        {@const m = marks.get(n.item.ref)}
        {@const mark = m?.mark ?? ""}
          <AtlasBlock item={n.item} title={title(n.item.ref)} kind={report.notes[n.item.ref]?.kind ?? ""} done={!!report.notes[n.item.ref]?.done} behind={behind(n.item.parent)} {mark} far={m?.far ?? 0} num={picked.indexOf(n.item.ref) + 1} iso={isoMark(n.item.ref)} linked={sent.includes(n.item.ref)} file={report.files?.[n.item.ref]?.kind ?? ""} given={isoLens && givenNotes.has(n.item.ref)} held={isoLens && !givenNotes.has(n.item.ref) ? (heldRows.get(n.item.ref)?.on ? "on" : heldRows.has(n.item.ref) ? "aside" : "") : ""} changed={isoLens && changedByIso.has(n.item.ref)} pointed={isoLens ? (pointedTo.get(n.item.ref) ?? "") : ""} order={isoLens ? (readOrder.get(n.item.ref) ?? 0) : 0} moment={thereAt === n.i ? there!.who : ""} here={hereAt === n.i} dim={!!lit && !mark} href={noteHref(opens(n.item.ref))}
            onpick={(e) => choose(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; pointing.onAtlas = pointed; }} />
      {/each}
      {#each sats as s (s.key)}
        {#if s.kind === "web"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an address on the web, not in the app -->
          <a class="sat web" href={s.href} target="_blank" rel="noopener noreferrer" title={`${s.text} · ${s.href}`} aria-label={s.text} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" onclick={(e) => { if (dragged) e.preventDefault(); e.stopPropagation(); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c-2 2.8-2 8.2 0 11M8 2.5c2 2.8 2 8.2 0 11" /></svg></a>
        {:else if s.kind === "picture"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
          <a class="sat picture" class:broken={s.broken} href={noteHref(s.note)} title={`${s.text} · ${s.picture!.from === "code" ? "code:" : ""}${s.picture!.path}${s.broken ? (s.picture!.from === "code" ? " · not in the repository" : " · not in the notes") : ""}`} aria-label={`${s.text}${s.broken ? ", missing" : ""}`} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" onclick={(e) => { if (dragged) e.preventDefault(); e.stopPropagation(); }}>
            {#if s.broken}<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" /><path d="M2.5 11l3.5-3.5 3 3 1.5-1.5 3 3" /></svg>{:else}<img alt="" loading="lazy" draggable="false" use:thumb={s.picture!} />{/if}</a>
        {:else}
          <span class="sat code" class:broken={s.broken} role="img" title={`${s.text} · ${s.href.slice(5)}${s.broken ? " · not in the repository" : ""}`} aria-label={`${s.text}${s.broken ? ", not in the repository" : ""}`} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10" /></svg></span>
        {/if}
      {/each}
      </div>
      {#if origin}
        <div class="asker" class:draft={origin.draft} style="--x:{origin.gx};--y:{origin.gy};--w:{origin.w};--h:{origin.h}">
          {#if origin.draft}<a class="eph" href={resolve("/draft/[id]", { id: run!.note.slice("@draft/".length) })} aria-label="{origin.title}: your note for Iso"><span class="t">{origin.title}</span></a>{/if}
          {#if running}
            <svg class="loader" aria-hidden="true"><path d="M0 1H1000" /></svg>
            <p class="doing" role="status"><i class="dia" aria-hidden="true"></i>{#if run!.state === "writing"}Iso is writing{:else if reading}Iso is reading <span class="c-gold">{title(reading)}</span>{:else}Iso is thinking{/if}</p>
          {/if}
        </div>
      {/if}
      {#if grasp}
        <div class="grasp" class:folder={grasp.folder} style="--x:{grasp.gx};--y:{grasp.gy}">
          <svg viewBox="0 0 20 24" width="20" height="24" aria-hidden="true">{#if grasp.folder}<path d="M1.5 5.5h6l2 2.5h9v12.5h-17z" />{:else}<path d="M3.5 1.5h9l4.5 4.5v16.5h-13.5z M12.5 1.5v4.5h4.5" /><path class="ln" d="M6.5 11h7.5M6.5 14.5h7.5M6.5 18h5" />{/if}</svg>
          <span>{grasp.folder ? "a new folder" : "a new note"}{grasp.dir ? ` in ${grasp.dir}` : ""}</span>
        </div>
      {/if}
    </div>
    {#each [{ p: herePip, i: hereAt, who: "here" }, { p: therePip, i: thereAt, who: there?.who ?? "you" }] as q (q.who === "here" ? "here" : "there")}
      {#if q.p}
        <button type="button" class="pip {q.who}" style="left:{q.p.x}px;top:{q.p.y}px;--a:{q.p.angle}rad" data-pip={q.who === "here" ? "here" : "there"}
          aria-label="Bring {title(L.items[q.i]!.ref)} into view" title="{title(L.items[q.i]!.ref)}{q.who === "here" ? ": open in the Note pane" : ""}"
          onclick={(e) => { e.stopPropagation(); bringIn(q.i); }}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2l8 4-8 4z" /></svg></button>
      {/if}
    {/each}
    {#if pick}
      <AtlasDock title={draft ? titleIn(draft.text) : ""} picked={picked.map((id) => ({ id, title: title(id), tokens: report!.notes[id]?.tokens ?? 0 }))} budget={LINKED_BUDGET} {notice}
        href={resolve("/draft/[id]", { id: pick.slice("@draft/".length) })} />
    {:else if notice}
      <p class="notice" role="alert">{notice}</p>
    {/if}
    {#if given}<p class="given" role="status">◆ {given}</p>{/if}
    {#if panes.on.context && !pick && !given && panes.settings === "atlas"}
      <p class="legend" aria-hidden="true"><span><i class="k g"></i>you gave it</span><span><i class="k h"></i>Iso read it</span><span><i class="k d"></i>Iso changed it</span><span><i class="k p"></i>Iso points to it</span><span><i class="k n">1</i>read, in order</span></p>
    {/if}
    {#if offered}
      {@const o = offered}
      <div class="offer frame" role="menu" aria-label={title(o.ref)} style="left:{Math.min(o.x, size.w - 170)}px;top:{o.y + 14}px">
        {#if tray.has("note", o.ref)}
          <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); giveOrTake(o.ref); offered = null; }}><i aria-hidden="true">◇</i>Take back from Iso</button>
        {:else}
          <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); give(o.ref); offered = null; }}><i aria-hidden="true">◆</i>Give to Iso</button>
        {/if}
        <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); offered = null; void panes.open(o.ref, true); }}><i aria-hidden="true">▣</i>Open</button>
        <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); offered = null; void makeKind("question", o.ref); }}><i class="q" aria-hidden="true">?</i>A question about it</button>
        <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); offered = null; void makeKind("problem", o.ref); }}><i aria-hidden="true">△</i>A problem using it</button>
      </div>
    {/if}
    {#if tray.carrying}
      <div class="carried" class:over={tray.carrying.over} style="left:{carryAt.x}px;top:{carryAt.y}px" aria-hidden="true">{tray.carrying.part.kind === "folder" ? "▭" : "▣"} {tray.carrying.part.title}</div>
    {/if}
  {/if}
</div>

<style>
  /* A long press is the Atlas's own (a hold): not the browser's menu, nor iOS's preview of a link. */
  .atlas { position: relative; isolation: isolate; height: 100%; overflow: clip; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: grab; outline-offset: -2px; }
  .atlas:active { cursor: grabbing; }
  .atlas-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; }
  /* The dot grid, moved with the map by a transform a cell at most, so that a pan paints nothing. */
  .ground { position: absolute; inset: -24px; z-index: -1; pointer-events: none; will-change: transform; }
  .scaled { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  /* A link out of the base (M12): a small block beside its note, in the map's units. */
  .sat { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(3 * var(--u)); height: calc(3 * var(--u)); display: grid; place-items: center; background: var(--ground-1); border: var(--px) solid var(--line-strong); color: var(--lattice); }
  .sat svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .sat.web:hover, .sat.web:focus-visible, .sat.picture:hover, .sat.picture:focus-visible { border-color: var(--lattice); }
  .sat.picture { overflow: hidden; }
  .sat.picture img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sat.broken { color: var(--rose); border-color: var(--rose); border-style: dashed; }
  /* Only while a changed base settles (K3): at any other time, a zoom changes the same places and must not ease. */
  .shifting :global(:is(.n, .sn, .folder)) { transition: left 0.45s ease, top 0.45s ease, width 0.45s ease, height 0.45s ease; }
  @media (prefers-reduced-motion: reduce) { .shifting :global(:is(.n, .sn, .folder)) { transition: none; } }
  .said { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-4); text-align: center; }
  /* What a hold will make: a note's or a folder's icon where it was held, and what it is (V6). */
  .offer { --inside: var(--ground-2); position: absolute; z-index: 8; min-width: 150px; padding: 6px; display: grid; gap: 2px; }
  .offer button { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 10px; background: none; border: 0; color: var(--text); font: 13px var(--font-ui); text-align: left; cursor: pointer; }
  .offer button:hover, .offer button:focus-visible { background: var(--ground-3); }
  .offer i { font-style: normal; width: 12px; color: var(--growth); font-size: 11px; }
  .grasp { position: absolute; left: calc(var(--x) * var(--u) - 10px); top: calc(var(--y) * var(--u) - 12px); display: flex; align-items: center; gap: 6px; font-size: 11px; pointer-events: none; z-index: 1; }
  .grasp svg { flex: none; overflow: visible; }
  .grasp svg path { fill: var(--growth-soft); stroke: var(--growth); stroke-width: 1.5; stroke-linejoin: round; stroke-dasharray: 2 2.5; animation: march .6s linear infinite; }
  .grasp svg path.ln { fill: none; stroke-dasharray: none; animation: none; }
  .grasp span { white-space: nowrap; background: var(--ground-0); padding: 0 4px; }
  @media (prefers-reduced-motion: reduce) { .grasp svg path { animation: none; } }
  @keyframes march { to { stroke-dashoffset: -9; } }
  .given { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--growth); font-size: 12px; z-index: 2; }
  .given::first-letter { color: var(--growth); }
  .legend { position: absolute; left: 12px; bottom: 10px; right: 12px; margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11px; color: var(--text-soft); pointer-events: none; z-index: 2; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; background: var(--ground-0); padding: 0 4px; }
  .legend .k { width: 10px; height: 10px; display: inline-grid; place-items: center; font-style: normal; }
  .legend .g { background: var(--growth-soft); border: 1px solid var(--growth); }
  .legend .h { background: var(--lattice-soft); border: 1px solid var(--lattice); }
  .legend .d { width: 7px; height: 7px; background: var(--growth); transform: rotate(45deg); }
  .legend .p { border: 1.5px dashed var(--growth); }
  .legend .n { width: 14px; height: 14px; background: var(--growth); color: var(--ground-0); font-size: 9px; font-weight: 700; }
  /* A note carried out of the Atlas towards Iso's pane. */
  .carried { position: fixed; z-index: 50; pointer-events: none; transform: translate(10px, 10px); padding: 3px 8px; background: var(--ground-2); border: 1px solid var(--line-strong); font-size: 12px; white-space: nowrap; }
  .carried.over { border-color: var(--growth); }
  .notice { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--rose); color: var(--rose); font-size: 12px; z-index: 2; }
  /* Iso's note while it is answered (Desktop-Think): the draft's block, dotted gold, and under it (or under the
     note asking) a marching gold line and what Iso is doing. */
  .asker { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u)); pointer-events: none; z-index: 1; }
  .eph { position: absolute; inset: 0; display: flex; align-items: center; padding: 0 calc(11px * var(--k)); overflow: hidden; font-size: calc(12px * var(--k)); line-height: 1.25; color: var(--text); text-decoration: none; background: var(--growth-soft); border: 1.5px dotted var(--growth); pointer-events: auto; }
  .eph .t { display: none; overflow: hidden; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; }
  :global(.atlas-world.labels) .eph .t { display: -webkit-box; }
  .loader { position: absolute; left: 0; top: calc(100% + 10px); width: 100%; height: 2px; overflow: hidden; }
  .loader path { stroke: var(--growth); stroke-width: 2.5; stroke-dasharray: 2 3; animation: march .6s linear infinite; }
  .doing { position: absolute; left: 0; top: calc(100% + 20px); width: max(100%, 240px); margin: 0; font-size: 12px; line-height: 18px; color: var(--text-soft); }
  .doing .dia { margin: 0 8px 0 3px; }
  .c-gold { color: var(--growth); }
  @media (prefers-reduced-motion: reduce) { .loader path { animation: none; } }
  /* A pip at the edge (M17): towards the open note (the text's colour), or what is pointed at elsewhere. */
  .pip { position: absolute; z-index: 4; width: 22px; height: 22px; margin: -11px 0 0 -11px; display: grid; place-items: center; padding: 0; background: var(--ground-1); border: 1px solid var(--line-strong); color: var(--text); cursor: pointer; }
  .pip svg { transform: rotate(var(--a)); fill: currentColor; }
  .pip:hover, .pip:focus-visible { border-color: var(--text); }
  .pip.you { color: var(--lattice); border-color: var(--lattice); }
  .pip.iso { color: var(--growth); border-color: var(--growth); }
  .count { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); font-size: 12px; line-height: 18px; color: var(--text-faint); pointer-events: none; }
  .count.right { transform: translate(7px, -50%); }
  .count.above { transform: translate(-50%, calc(-100% - 3px)); }
</style>
