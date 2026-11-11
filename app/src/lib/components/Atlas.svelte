<script lang="ts">
  // The Atlas: the base as a map. The layout is the core's, worked out in a worker; this holds the view (pan,
  // zoom, what is open at this zoom) and what is chosen, and hands each folder, block and route its place and
  // its marks. The marks are plain maps from a note to a mark, looked up while drawing.
  import { page } from "$app/state";
  import { ghostOf, isIslandRef, islandTitles, lensModel, reach, STRENGTH } from "@isorite/core";
  import type { Grain, Layout, Point } from "@isorite/core/atlas";
  import type { How, MapReport } from "@isorite/engine";
  import { skillText, untitled } from "$lib/make.ts";
  import { tick, untrack } from "svelte";
  import { app, codeHref, noteHref } from "$lib/app.svelte.ts";
  import { pictureSrc } from "$lib/pictures.ts";
  import { globalPage } from "$lib/here.ts";
  import { dirOf, keep, linkTo, refused } from "$lib/images.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { tray, type Part } from "$lib/tray.svelte.ts";
  import { pointers as prompt } from "$lib/pointers.svelte.ts";
  import { whole as wholePointer } from "$lib/pointers.ts";
  import { pointing } from "$lib/pointing.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { CELL, MAX_ZOOM, MIN_ZOOM, TITLE_UNITS, TITLE_PX, fit, indexLayout, withHighways, linePath, litRoutes, mergeRoutes, openAt, restRoutes, shownAs, zoomAbout, type Lit, type LitKind, type View } from "$lib/atlas/geometry.ts";
  import { satellites, withoutHidden, withoutNotes, withProspects, type Prospect } from "$lib/atlas/kinds.ts";
  import { layoutOf, routesOf } from "$lib/atlas/layout.ts";
  import { Gesture, toBody, type Item } from "$lib/gesture.svelte.ts";
  import { vanish } from "$lib/flight.ts";
  import AtlasBlock from "./AtlasBlock.svelte";
  import HoldTags from "./HoldTags.svelte";
  import SpotTags from "./SpotTags.svelte";
  import HiddenPicker from "./HiddenPicker.svelte";
  import { finder } from "$lib/finder.svelte.ts";
  import AtlasFolder from "./AtlasFolder.svelte";
  import AtlasRoutes from "./AtlasRoutes.svelte";

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
  /** The map moving (panned or zoomed): its layer is the compositor's while it moves, and painted again, at whole
   *  pixels, once it rests a moment. Kept the compositor's at rest, its names stayed a blur of the zoom they were
   *  painted at until something over them was painted again (a hover). */
  let moving = $state(false);
  let settling: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void view.x; void view.y; void view.k;
    moving = true;
    clearTimeout(settling);
    settling = setTimeout(() => (moving = false), 200);
    return () => clearTimeout(settling);
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
  /** The shape the map is laid out for, wide to tall: the Atlas's own when it was last laid out afresh, so the whole map
   *  fills it when framed. Kept until the map is laid out afresh (a new grid, the relayout button, a reload): a note
   *  opened beside the Atlas narrows it, and that must not reshuffle the map. 0 until first known. */
  let shapeFor = 0;
  function shapeNow(): number {
    const r = viewport?.getBoundingClientRect(), w = size.w || r?.width || 0, h = size.h || r?.height || 0;
    return w > 0 && h > 0 ? w / h : window.innerWidth / Math.max(1, window.innerHeight);
  }
  function nextGrain(): void {
    shapeFor = 0;
    grain = GRAINS[(GRAINS.indexOf(grain) + 1) % GRAINS.length]!; moved = false; // a new grid is a new map: framed afresh
    try { localStorage.setItem("isorite.atlas.grain", grain); } catch { /* storage unavailable: not remembered */ }
    void load();
  }
  function useLeaves(on: boolean): void {
    leaves = on;
    try { localStorage.setItem("isorite.atlas.leaves", on ? "on" : "off"); } catch { /* storage unavailable: not remembered */ }
  }
  /** The questions the agent asked back in its session shown (M25), or the agent in a conversation of its own being read,
   *  and you have not kept (M24, R), while questions are on the map. */
  const prospects = $derived.by((): Prospect[] => {
    if (!panes.on.questions) return [];
    const out: Prospect[] = [];
    for (const t of terminal.session?.turns ?? []) for (const i of t.items) if (i.kind === "question" && !i.made) out.push({ ref: `?${i.id}`, title: i.title, about: i.about });
    return out;
  });
  /** The lens the map in view is of, null for the folders. */
  let lensIn = $state.raw<import("@isorite/core").ResolvedLens | null>(null);
  const titles = $derived(lensIn ? islandTitles(lensIn) : new Map<string, string>());
  let fresh = false; // the next layout is worked out from nothing, not from where things stood (M37)
  async function load(): Promise<void> {
    try {
      const got = await app.api.map(), asked = untrack(() => prospects);
      // A lens other than the folders (docs/lenses.md): its islands are the map's folders, each note drawn at its home.
      const lens = await app.loadLens();
      lensIn = lens;
      const base = lens ? lensModel(got.model, lens) : got.model;
      const notes: MapReport["notes"] = { ...got.notes };
      for (const p of asked) notes[p.ref] = { title: p.title, tokens: 0, kind: "question" };
      const all = { ...got, model: withProspects(base, asked), notes };
      // The kinds switched off are not on the map (M12), and a resolved question leaves it.
      // Files beside the notes (M23: pictures, artifacts, data, documents, others) are on it when its switch is on; code files
      // in the base (docs/files.md) when the code switch is.
      const next = { ...all, model: withoutHidden(withoutNotes(all.model, (ref) => {
        // A ghost goes with the note it stands for.
        if (ghostOf(ref)) { const n = all.notes[ghostOf(ref)!]; return n?.kind === "question" ? !panes.on.questions : n?.kind === "problem" ? !panes.on.problems : false; }
        const f = all.files?.[ref];
        if (f) return f.kind === "artifact" ? !panes.on.artifacts : f.kind === "code" ? !panes.on.code : !panes.on.pictures;
        const n = all.notes[ref];
        return n?.kind === "question" ? !panes.on.questions : n?.kind === "problem" ? !panes.on.problems : false;
      }), (id) => { const h = ghostOf(id) ?? id; return !h.startsWith("?") && app.isHidden(h); }) };
      // A changed base is laid out from where things stood (V5), on the same grid and the same way.
      const on = `${flow}|${grain}|${lens?.name ?? ""}`, from = laid && laidOn === on && !fresh ? laid.layout.orders ?? null : null;
      if (!shapeFor || fresh || !laid) shapeFor = shapeNow();
      fresh = false;
      const next_laid = await layoutOf(next.model, { gridFlow: flow, grain, blocks: true, from, aspect: shapeFor, ...(lens ? { lens: lens.name } : {}) });
      laidOn = on;
      const changed = !!laid && laid.key !== next_laid.key;
      const was = laid && L ? { refs: new Set(L.items.map((n) => n.ref)), edges: new Set(report!.model.edges.map(([a, b]) => `${a}>${b}`)) } : null;
      const first = !laid || (laid.key !== next_laid.key && !moved);
      // A new layout in three beats (V7): the lines drawn now retract, then notes and folders move, then the new
      // lines draw out. Nothing is drawn while anything moves.
      const run = ++beats, quiet = matchMedia("(prefers-reduced-motion: reduce)").matches, staged = !!was && changed && !quiet;
      // A load that is not staged (the layout already changed under it by an earlier one, still mid-beat) ends that one's
      // beats, which would have put the lines back: it must, or the lines stay hidden until a reload.
      if (!staged) { beat = ""; retracting = []; }
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

  // A note moved or deleted never sees the pointer leave it: what was pointed at goes with it.
  $effect(() => { if (pointed && L && !L.items.some((x) => x.ref === pointed)) pointed = ""; });
  // A question the agent asks, or one kept or gone, lays the map out again: the dotted node comes, or the note takes its place.
  let askedWere = "";
  $effect(() => {
    const now = prospects.map((p) => p.ref).join(" ");
    if (now !== askedWere) { const first = askedWere === "" && now === ""; askedWere = now; if (!first) void load(); }
  });
  // A kind switched on or off lays the map out again, from where things stood (V5).
  let kindsWere = "";
  $effect(() => {
    const now = `${panes.on.questions}|${panes.on.problems}|${panes.on.pictures}|${panes.on.artifacts}|${panes.on.code}`;
    if (kindsWere && kindsWere !== now) void load();
    kindsWere = now;
  });
  // Another lens chosen is a new map: laid out on its own and framed afresh. A lens file that changed, or a note moved, comes
  // by the events and the refresh that follow them.
  let lensWere = app.lensName;
  $effect(() => {
    const now = app.lensName;
    if (now === lensWere) return;
    lensWere = now;
    untrack(() => { moved = false; shapeFor = 0; fresh = true; void load(); });
  });
  $effect(() => { const now = app.lens; untrack(() => { if (now && lensIn && now !== lensIn && JSON.stringify(now) !== JSON.stringify(lensIn)) void load(); }); });
  // Hiding or showing a note or a folder lays the map out again, from where things stood.
  let hiddenWere = "";
  $effect(() => {
    const now = app.hidden.join("\n");
    if (now !== hiddenWere) { const first = hiddenWere === "" && now === ""; hiddenWere = now; if (!first) void load(); }
  });
  $effect(() => {
    void load();
    let again: ReturnType<typeof setTimeout> | undefined;
    const off = app.on((e) => {
      if (e.type !== "note-changed") return;
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
  const whole = (): View => {
    const m = (L?.margin ?? 0) / 2, box = { gx: m, gy: m, w: (L?.W ?? 1) - 2 * m, h: (L?.H ?? 1) - 2 * m };
    return fit(box, size.w, size.h, 1, L?.cell);
  };

  const RETRACT = 220, MOVE = 450, DRAW = 340;
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
    setTimeout(() => (shifting = false), MOVE + 50);
    await tick();
    if (!L || !idx || !report) return;
    const quiet = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const item of L.items) {
      if (was.refs.has(item.ref) || item.ref.startsWith("@")) continue;
      const el = viewport?.querySelector(item.kind === "folder" ? `[data-folder="${CSS.escape(item.ref)}"]` : `[data-note="${CSS.escape(item.ref)}"]`);
      // In while the others make room, and there before the lines to it draw.
      el?.animate([{ opacity: 0 }, { opacity: 0, offset: quiet ? 0 : 0.4 }, { opacity: 1 }], { duration: quiet ? 200 : MOVE, easing: "ease-out" });
    }
    const fresh = report.model.edges.filter(([a, b]) => !was.edges.has(`${a}>${b}`) && !a.startsWith("@") && !b.startsWith("@") && was.refs.has(a) && was.refs.has(b));
    // A pulse runs along the way the link is drawn at rest (the same route the lit links take), not a line of its own.
    stopGrown?.();
    stopGrown = light(fresh.map(([a, b]) => ({ from: a, to: b, kind: "uses" as const })), (h) => { grown = h.map((r) => ({ key: r.key, d: r.d })); });
    if (fresh.length) { clearTimeout(grownTimer); grownTimer = setTimeout(() => { grown = []; stopGrown?.(); stopGrown = undefined; }, 1600); }
  }
  let stopGrown: (() => void) | undefined, grownTimer: ReturnType<typeof setTimeout> | undefined;
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

  // The background's dots are the map's own lattice, one a cell (or every second, fourth… cell, or half, where that keeps them
  // between 14 and 28 px apart), so they zoom with the folders and stay where the cells are.
  const dot = $derived.by(() => { let s = (L?.cell ?? CELL) * view.k; if (!(s > 0)) return 24; while (s < 14) s *= 2; while (s >= 28) s /= 2; return s; });
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
  const at = $derived(chosen || pointed);
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
  let litCount = $state.raw<Record<Exclude<LitKind, "agent">, number>>({ requires: 0, builds: 0, uses: 0 });
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
  /** A pulse for each link lit, once: along the link's own way from end to end, not along the merged lines, which are cut
   *  wherever routes part and would each carry a pulse of their own; and a link lit twice (chosen, and pointed at in the
   *  Note pane) carries one. */
  type Pulse = { key: string; d: string; kind: LitKind };
  const pulsesOf = (lits: Lit[]): Pulse[] => lits.filter((l) => l.kind !== "agent").map((l) => ({ key: l.key, kind: l.kind, d: linePath(l.pts, 0, L!.cell) }));
  const pairOf = (key: string): string => key.slice(key.indexOf(":") + 1).split("|").sort().join("|");
  let chosenPulses = $state.raw<Pulse[]>([]), therePulses = $state.raw<Pulse[]>([]);
  const pulses = $derived.by(() => {
    const seen = new Set<string>();
    return [...chosenPulses, ...therePulses].filter((p) => { const k = pairOf(p.key); if (seen.has(k)) return false; seen.add(k); return true; });
  });
  $effect(() => light(links, (h, lits) => {
    hot = h;
    chosenPulses = pulsesOf(lits);
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
  $effect(() => light(thereLinks, (h, lits) => { thereHot = h.map((r) => ({ ...r, key: `there:${r.key}` })); therePulses = pulsesOf(lits); }));

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
  const herePip = $derived(pipFor(hereAt));
  const therePip = $derived(thereAt === hereAt ? null : pipFor(thereAt));
  function bringIn(i: number): void {
    if (!L) return;
    const n = L.items[i]!, u = L.cell * view.k;
    moved = true;
    fly({ k: view.k, x: size.w / 2 - (n.gx + n.w / 2) * u, y: size.h / 2 - (n.gy + n.h / 2) * u });
  }

  // ------------------------------------------------------------ the agent's path (Desktop-Think)

  /** An agent's latest turn, from whichever session it is in. */
  const run = $derived(app.agent);
  const running = $derived(run?.state === "reading" || run?.state === "writing");
  /** Each note it opened, and how it got there: by its words, by its meaning, along a link, or named outright. */
  const reached = $derived.by(() => {
    const out = new Map<string, How>();
    for (const s of run?.steps ?? []) if (s.opened && !s.failed && !out.has(s.opened)) out.set(s.opened, s.how);
    return out;
  });
  // The agent lens (M10, the agent's since M25): what is in the tray, what the session shown read and changed, and the
  // order it read in during its last turn. The agent's path is drawn only in this lens.
  const agentLens = $derived(panes.on.context);
  const givenNotes = $derived(new Set(prompt.inPrompt.filter((p) => p.kind === "note" && wholePointer(p)).map((p) => p.ref)));
  const givenFolders = $derived(new Set(prompt.inPrompt.filter((p) => p.kind === "folder").map((p) => p.ref)));
  const CHANGES = /(^|[_:./-])(edit_note|write_note|edit|write|patch)$/;
  /** The notes the session shown read, and changed. */
  const readNotes = $derived(new Set((terminal.session?.turns ?? []).flatMap((t) => t.items.flatMap((i) => (i.kind === "tool" && i.note && !i.base && i.status !== "failed" && !CHANGES.test(i.name) ? [i.note] : [])))));
  const changedByAgent = $derived(new Set((terminal.session?.turns ?? []).flatMap((t) => t.items.flatMap((i) => (i.kind === "tool" && i.note && !i.base && i.status !== "failed" && CHANGES.test(i.name) ? [i.note] : [])))));
  const readOrder = $derived.by(() => {
    const out = new Map<string, number>();
    for (const i of terminal.session?.turns.at(-1)?.items ?? []) if (i.kind === "tool" && i.note && !i.base && i.status !== "failed" && !CHANGES.test(i.name) && !out.has(i.note)) out.set(i.note, out.size + 1);
    return out;
  });
  /** A ghost's dotted line to its home, drawn while either is lit (the note chosen or pointed at is the home). */
  const ghostLines = $derived.by(() => {
    if (!L || !idx || !at || !lensIn) return [];
    const home = idx.at.get(at);
    if (home === undefined || open[home] !== "s") return [];
    const mid = (i: number): Point => { const n = L.items[i]!; return [(n.gx + n.w / 2) * L.cell, (n.gy + n.h / 2) * L.cell]; };
    return L.items.flatMap((n, i) => (ghostOf(n.ref) === at && open[i] === "s" ? [{ key: `ghost:${i}`, d: `M${mid(i)[0]} ${mid(i)[1]}L${mid(home)[0]} ${mid(home)[1]}` }] : []));
  });
  /** The note it is reading now. */
  const reading = $derived(running ? (run!.steps.findLast((s) => s.opened && !s.failed)?.opened ?? "") : "");
  // Its steps along links, drawn as the map draws a link: from the note in hand to the one it led to.
  const agentLinks = $derived((run?.steps ?? []).flatMap((s) => (s.how === "link" && s.from && s.opened && !s.failed ? [{ from: s.from, to: s.opened, kind: "agent" as const }] : [])));
  let agentHot = $state.raw<Hot[]>([]);
  // Keyed apart from the chosen note's lit routes, which may run the same way.
  $effect(() => light(agentLinks, (h) => { agentHot = h.map((r) => ({ ...r, key: `agent:${r.key}` })); }));
  /** How a note is outlined for the agent's path: by keyword, by meaning, along a link (or named outright), or being read now. */
  const agentMark = (ref: string): "" | "key" | "sem" | "link" | "used" => {
    if (!agentLens) return "";
    if (ref === reading) return "used";
    const how = reached.get(ref);
    return how === "keyword" ? "key" : how === "meaning" ? "sem" : how ? "link" : "";
  };

  // ------------------------------------------------------------ holding, to make a note or a folder (V6)
  //
  // Hold still on open ground, and a new note is marked where you hold; let go, and it is made, "Untitled note", and
  // opens in the Note pane with its title chosen, to type over. Hold, then drag a little way, and it is a new folder
  // instead, "Untitled folder", made with a first note in it, since a folder is made when a note is put in it. Either
  // goes in the folder gripped in, numbered if the name is taken. Nothing is asked for on the map: the name was asked
  // for away from where you held (Lachlan, on V6). What is marked is a note's or a folder's icon, not an area. Held on a note, the note is given to the agent
  // (M10): it goes into what the agent is sent.

  const HOLD = 650, SPOT_HOLD = 400;
  /** What a hold on open ground is of: a place (in cells) and the folder it is in. */
  type Place = { dir: string; gx: number; gy: number; folder: boolean };
  /** The two tags stood out from the spot held (SpotTags), where it is on the map's surface, the pointer, and the one it is on. */
  let spot = $state.raw<{ x: number; y: number; px: number; py: number; choice: "note" | "folder" | "hidden" | null; what: Place } | null>(null);
  /** The finder of what is hidden, open at a place on the map's surface. */
  let finding = $state.raw<{ x: number; y: number } | null>(null);
  /** Held long enough: the gesture is ours until the pointer is let go. Where it began, on the screen. */
  let gripped: { x: number; y: number } | null = null;
  /** Let go: the note being made. */
  let making = false;
  let holdDone: ReturnType<typeof setTimeout> | undefined;
  // Press and hold on a note or a folder (M33), as in the list: tags to move it (carried to a folder of the map), delete it
  // (asked first) or send it to the agent. A finger that moves before the hold pans the map; one let go with the tags out but
  // on none of them is offered the rest (below).
  const g = new Gesture({
    move: (item, dir) => void moveHeld(item, dir),
    remove: (item) => void askRemove(item),
    send: (item) => give(item.id, item.kind),
    rename: (item) => { renamingRef = item.id; },
    hide: (item) => { void app.hide(item.id).then(() => { given = `${item.kind === "folder" ? folderName(item.id) : title(item.id)} is hidden`; clearTimeout(givenTimer); givenTimer = setTimeout(() => (given = ""), 2200); }, (e: Error) => { notice = e.message; }); },
    unchosen: (item, x, y) => {
      if (item.kind !== "note" || !viewport) return;
      const r = viewport.getBoundingClientRect();
      offered = { ref: item.id, x: x - r.left, y: y - r.top };
    },
  }, { drift: "cancel", scroll: false, dropAt: (x, y) => folderUnder(x, y), targetOf: (dir) => viewport?.querySelector(`[data-folder="${CSS.escape(dir)}"]`) ?? null });
  /** The folder whose name is being typed over, asked for by its hold tag. */
  let renamingRef = $state("");
  let asking = $state.raw<{ item: Item; text: string } | null>(null);
  /** The folder of the map under a point of the screen: the deepest one shown, not the one carried nor inside it. */
  function folderUnder(x: number, y: number): string | null {
    if (!L || !viewport) return null;
    const r = viewport.getBoundingClientRect(), u = L.cell * view.k, gx = (x - r.left - view.x) / u, gy = (y - r.top - view.y) / u;
    const carried = g.item?.kind === "folder" ? g.item.id : null;
    let best: { ref: string; depth: number } | null = null;
    L.items.forEach((n, i) => {
      if (n.kind !== "folder" || open[i] === "-" || !n.ref || n.ref.startsWith("@") || isIslandRef(n.ref) || gx < n.gx || gx >= n.gx + n.w || gy < n.gy || gy >= n.gy + n.h) return;
      const ref = n.ref.replace(/\/$/, "");
      if (carried !== null && (ref === carried || ref.startsWith(`${carried}/`))) return;
      if (!best || n.depth > best.depth) best = { ref, depth: n.depth };
    });
    // On the map but in no folder: the top of the base (M37), where a note could not be put before.
    return (best as { ref: string } | null)?.ref ?? (!app.lens && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? "" : null);
  }
  async function moveHeld(item: Item, dir: string): Promise<void> {
    const from = item.id.replace(/\/$/, ""), name = from.split("/").at(-1)!, to = dir ? `${dir}/${name}` : name;
    if (to === from) return;
    try {
      if (item.kind === "folder") await app.api.moveFolder(from, to);
      else await app.api.moveNote(from, to, (await app.api.readNote(from)).version);
      await app.refresh();
      void load();
    } catch (e) { notice = (e as Error).message; }
  }
  async function askRemove(item: Item): Promise<void> {
    try {
      if (item.kind === "folder") {
        const n = app.listing.notes.filter((x) => x.dir === item.id || x.dir.startsWith(`${item.id}/`)).length;
        if (n) { notice = `${item.id} holds ${n} ${n === 1 ? "note" : "notes"}: move or delete ${n === 1 ? "it" : "them"} first.`; return; }
        asking = { item, text: `Delete the empty island ${item.id}?` };
        return;
      }
      const map = await app.api.map();
      const linked = [...new Set(map.model.edges.filter(([from, to]) => to === item.id && from !== item.id && !from.startsWith("@")).map(([from]) => map.notes[from]?.title || from))];
      asking = { item, text: `Delete “${item.title}”? ${linked.length ? `${linked.length === 1 ? "One note links" : `${linked.length} notes link`} to it (${linked.join(", ")}); ${linked.length === 1 ? "its link is" : "their links are"} left broken.` : "No note links to it."} Its history stays.` };
    } catch (e) { notice = (e as Error).message; }
  }
  async function confirmRemove(): Promise<void> {
    const a = asking;
    asking = null;
    if (!a) return;
    // It goes before it is gone: folded away where it stands, then deleted (put back if that fails).
    const back = await vanish(viewport?.querySelector(a.item.kind === "folder" ? `[data-folder="${CSS.escape(a.item.id)}"]` : `[data-note="${CSS.escape(a.item.id)}"]`) ?? null);
    try {
      if (a.item.kind === "folder") await app.api.deleteFolder(a.item.id);
      else await app.api.deleteNote(a.item.id, (await app.api.readNote(a.item.id)).version);
      await app.refresh();
      void load();
    } catch (e) { back(); notice = (e as Error).message; }
  }
  /** A folder holding a note Ctrl+K found. */
  const foundIn = (ref: string): boolean => { const d = ref.replace(/\/$/, ""); for (const id of finder.lit.keys()) if (!d || id.startsWith(`${d}/`)) return true; return false; };
  // The held item and the folder it is over wear what letting go would do, on the map's own elements.
  $effect(() => {
    const phase = g.phase, tag = g.tag, item = g.item, over = g.over;
    if (!viewport || !item || phase === "idle") return;
    const held = viewport.querySelector<HTMLElement>(item.kind === "folder" ? `[data-folder="${CSS.escape(item.id)}"]` : `[data-note="${CSS.escape(item.id)}"]`);
    const target = phase === "moving" && over ? viewport.querySelector<HTMLElement>(`[data-folder="${CSS.escape(over)}"]`) : null;
    // An attribute, not a class: a note's class is written whole whenever any part of it changes (dimmed as the pointer
    // goes by), which took a class put on by hand off with it, and the note carried flashed back to full strength.
    const mark = phase === "moving" ? "lifted" : tag === "delete" ? "doomed" : tag === "send" ? "sending" : "";
    if (mark) held?.setAttribute("data-g", mark);
    target?.setAttribute("data-g", "over");
    return () => { held?.removeAttribute("data-g"); target?.removeAttribute("data-g"); };
  });
  // Pointing stands still while something is held (the tags pass under the pointer as they come out); once let go, the
  // note pointed at is the one under the pointer now, if any.
  let holdWas = "idle";
  $effect(() => {
    const phase = g.phase;
    if (phase === "idle" && holdWas !== "idle") {
      const under = document.elementFromPoint(g.x, g.y)?.closest<HTMLElement>(".atlas [data-note]")?.dataset.note ?? "";
      pointed = under; pointing.onAtlas = under;
    }
    holdWas = phase;
  });
  function unhold(): void { g.stop(); clearTimeout(holdDone); holdDone = undefined; gripped = null; if (!making) spot = null; }
  /** The deepest folder of the base holding a place on the map (in cells): "" for the top. */
  function folderAt(gx: number, gy: number): string {
    let best: { ref: string; depth: number } | null = null;
    for (const n of L!.items) if (n.kind === "folder" && !n.ref.startsWith("@") && !isIslandRef(n.ref) && gx >= n.gx && gx < n.gx + n.w && gy >= n.gy && gy < n.gy + n.h && (!best || n.depth > best.depth)) best = { ref: n.ref, depth: n.depth };
    return best?.ref ?? "";
  }
  function holding(e: PointerEvent, at: { x: number; y: number }): void {
    unhold();
    if (offered && !(e.target instanceof Element && e.target.closest(".offer"))) offered = null;
    if (making || !L || !idx || !(e.target instanceof Element)) return;
    // A note or a folder held: the tags. (A folder's rename field takes the press itself.)
    if (!e.target.closest("input, .dock, .offer")) {
      const part = pressed(e);
      const face = e.target.closest<HTMLElement>(part?.kind === "folder" ? "[data-folder]" : "[data-note]");
      if (part && face && !part.id.startsWith("?") && !report?.files?.[part.id]) { g.begin({ kind: part.kind as "note" | "folder", id: part.id.replace(/\/$/, ""), title: part.title }, e, face); return; }
    }
    if (e.target.closest("button, .dock")) return;
    const on = e.target.closest<HTMLElement>("[data-note]")?.dataset.note ?? "";
    if (on.startsWith("@")) return; // a note for the agent is not a place in the base
    if (on) {
      // A mouse gives it straight away; a finger is offered a choice there, since a phone has no the agent beside the map (Q16).
      const touch = e.pointerType !== "mouse";
      holdDone = setTimeout(() => { holdDone = undefined; dragged = true; if (touch) offered = { ref: on, x: at.x, y: at.y }; else give(on); }, HOLD);
      return;
    }
    if (app.lens) return; // a lens's islands are not folders: nothing is made, or moved, on its map
    const u = L.cell * view.k, gx = Math.round((at.x - view.x) / u), gy = Math.round((at.y - view.y) / u);
    const what: Place = { dir: folderAt(gx, gy), gx, gy, folder: false };
    holdDone = setTimeout(() => { holdDone = undefined; dragged = true; gripped = at; spot = { x: at.x, y: at.y, px: at.x, py: at.y, choice: null, what }; viewport?.setPointerCapture(e.pointerId); }, SPOT_HOLD);
  }
  /** While gripped: the pointer moves over the tags, and the one it is on is the one that will be made. */
  function drawHeld(e: PointerEvent, at: { x: number; y: number }): void {
    if (!spot) return;
    const on = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-spot]")?.dataset.spot;
    spot = { ...spot, px: at.x, py: at.y, choice: on === "note" || on === "folder" || on === "hidden" ? on : null };
  }
  /** A note held with a finger: what can be done with it, offered where it was held. */
  let offered = $state.raw<{ ref: string; x: number; y: number } | null>(null);
  /** Why a note or folder could not be made here. */
  let notice = $state("");
  /** Images dropped on the map (a file of the machine, not a note carried): on a note, saved beside it and linked at the end of
   *  its text; on a region or its empty ground, saved in that folder alone. Said for a moment, in the map's own plain words. */
  let said = $state("");
  let saidTimer: ReturnType<typeof setTimeout> | undefined;
  const tell = (text: string) => { said = text; clearTimeout(saidTimer); saidTimer = setTimeout(() => (said = ""), 3200); };
  const filesOver = (e: DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  function dragOver(e: DragEvent): void { if (filesOver(e)) e.preventDefault(); }
  async function dropImages(e: DragEvent): Promise<void> {
    if (!filesOver(e)) return;
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) { notice = "Only images can be dropped here."; return; }
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".atlas [data-note]");
    const onNote = target && !target.classList.contains("file") ? target.dataset.note ?? "" : "";
    const dir = onNote ? dirOf(onNote) : target?.dataset.note ? dirOf(target.dataset.note) : folderUnder(e.clientX, e.clientY);
    if (dir === null) return;
    notice = "";
    try {
      const links: string[] = [];
      for (const file of files) {
        const why = refused(file);
        if (why) { notice = why; continue; }
        const kept = await keep(app.api, dir, file);
        if (onNote) links.push(linkTo(onNote, kept.path));
      }
      if (onNote && links.length) {
        const now = await app.api.readNote(onNote);
        await app.api.saveNote(onNote, { base: now.version, text: `${now.text.replace(/\n*$/, "")}\n\n${links.join("\n\n")}\n` });
        tell(links.length === 1 ? `Added to ${title(onNote)}` : `${links.length} images added to ${title(onNote)}`);
      } else if (!onNote && files.length) tell(files.length === 1 ? `Saved in ${dir || "the top of the base"}` : `${files.length} images saved in ${dir || "the top of the base"}`);
      void app.refresh();
    } catch (err) { notice = (err as Error).message; }
  }
  /** A note given to the agent: into the tray, said on the map for a moment. */
  let given = $state("");
  let givenTimer: ReturnType<typeof setTimeout> | undefined;
  function give(ref: string, kind: "note" | "folder" = "note"): void {
    const name = kind === "note" ? title(ref) : folderName(ref);
    const put = !prompt.holds(kind, ref);
    if (put) prompt.toggle(kind, ref, name);
    given = put ? `${name} is in your message` : `${name} is in your message already`;
    clearTimeout(givenTimer);
    givenTimer = setTimeout(() => (given = ""), 2200);
  }
  /** Given to the agent if it isn't, else taken back. */
  function giveOrTake(ref: string, kind: "note" | "folder" = "note"): void {
    if (!prompt.holds(kind, ref)) { give(ref, kind); return; }
    const name = kind === "note" ? title(ref) : folderName(ref);
    prompt.toggle(kind, ref, name);
    given = `${name} is out of your message`;
    clearTimeout(givenTimer);
    givenTimer = setTimeout(() => (given = ""), 2200);
  }
  /** Let go while gripped: on a tag, what it says is made and opened; anywhere else, nothing. */
  function letGo(): void {
    if (!gripped) return;
    gripped = null;
    const s = spot;
    if (s?.choice === "hidden") { finding = { x: s.x, y: s.y }; spot = null; }
    else if (s?.choice) void make({ ...s.what, folder: s.choice === "folder" });
    else spot = null;
  }
  async function make(g: Place): Promise<void> {
    making = true;
    const ids = app.listing.notes.map((n) => n.id);
    // In the skills base an island is a skill: made with its SKILL.md, at the top.
    if (g.folder && app.session?.special === "skills") {
      const t = untitled("", "new-skill", (d) => !ids.some((id) => id.startsWith(`${d}/`)));
      const id = `${t.slug}/SKILL`;
      try {
        await app.api.createNote(id, skillText(t.slug));
        await app.refresh();
        panes.fresh = id;
        await panes.open(id);
      } catch (err) { notice = (err as Error).message; }
      finally { making = false; spot = null; }
      return;
    }
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
    finally { making = false; spot = null; }
  }

  /** What an item opens: a note, a file, or for a folder of pictures, the note they were pasted into (M22). */
  const opens = (ref: string): string => (ref.endsWith("/") ? ref.slice(0, -1) : ref);
  const title = (ref: string): string => report?.notes[ghostOf(ref) ?? ref]?.title ?? report?.files?.[ref]?.title ?? ref.split("/").at(-1) ?? ref;
  /** A folder renamed where it is: its place in the one it is in, under the new name. */
  async function rename(ref: string, name: string): Promise<void> {
    const from = ref.replace(/\/$/, ""), parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
    const to = [parent, name.replace(/^\/+|\/+$/g, "")].filter(Boolean).join("/");
    try { await app.api.moveFolder(from, to); await app.refresh(); void load(); } catch (e) { given = (e as Error).message; }
  }
  const folderName = (ref: string): string => (isIslandRef(ref) ? titles.get(ref) ?? ref : ref.split("/").at(-1) || app.session?.name || "the base");

  // ------------------------------------------------------------ moving about

  let flying = 0;
  /** Go to a view, over a moment unless motion is unwanted. */
  function fly(to: View): void {
    cancelAnimationFrame(flying);
    still();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { view = to; return; }
    const from = view, t0 = performance.now(), ms = 320, dk = to.k - from.k;
    // Between two views at different zooms one point of the screen stays put. About it the map only grows or shrinks:
    // everything on it moves in a straight line, all at one pace on screen, the same pace in as out (eased as a ratio,
    // a zoom out would leap in its first frame). With barely a zoom, the map glides.
    const p = Math.abs(dk) > from.k * 0.02 ? { x: (from.k * to.x - to.k * from.x) / -dk, y: (from.k * to.y - to.k * from.y) / -dk } : null;
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 3, k = from.k + dk * e, f = k / from.k;
      view = t === 1 ? to : p ? { k, x: p.x - (p.x - from.x) * f, y: p.y - (p.y - from.y) * f } : { k, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
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
  // carried, and let go over the Agent pane it is given to the agent; let go anywhere else, it is put back. A drag from anywhere
  // else, inside a folder or on open ground, moves the map. A touch screen holds instead (the agent is not beside the map).
  let press: Part | null = null;
  let carryAt = $state({ x: 0, y: 0 });
  function pressed(e: PointerEvent): Part | null {
    if (!(e.target instanceof Element)) return null;
    const n = e.target.closest<HTMLElement>("[data-note]")?.dataset.note;
    if (n) return n.startsWith("@") ? null : { kind: "note", id: n, title: title(n) };
    // An open folder by its title; a closed one is a block, picked up anywhere on it.
    const f = (e.target.closest(".frame-title")?.closest<HTMLElement>("[data-folder]") ?? e.target.closest<HTMLElement>("button[data-folder]"))?.dataset.folder;
    return f && !f.startsWith("@") && !isIslandRef(f) ? { kind: "folder", id: f, title: folderName(f) } : null;
  }
  function carry(e: PointerEvent): void {
    if (!press || e.pointerType !== "mouse") return;
    carryAt = { x: e.clientX, y: e.clientY };
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pane="agent"]') != null;
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
    if (!pointers.has(e.pointerId) || !grip || g.phase !== "idle" && g.item) return;
    pointers.set(e.pointerId, local(e));
    if (gripped) { drawHeld(e, local(e)); return; }
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
    // A question the agent asked and not kept is kept, or not, in the Agent pane.
    if (ref.startsWith("?")) { panes.to("agent"); return; }
    // Shift+click gives a note to the agent, or takes it back, with the agent's context shown or not (M14).
    if (e.shiftKey) { if (!ref.startsWith("@")) giveOrTake(ref); return; }
    // Chosen already: open it, beside the Atlas on a desktop (V1). A code file has no routes to light: it opens at once.
    if (chosen === ref || report?.files?.[ref]?.kind === "code") { void panes.open(opens(ref)); return; }
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
    else if (run && !running) app.agent = null; // The agent's path is let go once it has ended
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
  /** The notes whose links out of the base are all shown, not the first few and a count of the rest (M37). */
  let spread = $state.raw<ReadonlySet<string>>(new Set());
  const sats = $derived(L && report ? satellites(notes.map((n) => n.item), report.notes, { web: panes.on.web, code: panes.on.code }, spread) : []);
  /** A picture satellite's thumbnail (M22), set once it's had. */
  function thumb(img: HTMLImageElement, p: { path: string; from: "notes" | "code" }) {
    const src = pictureSrc(app.api, p);
    if (typeof src === "string") img.src = src; else void src.then((s) => { if (s) img.src = s; });
  }
  /** What a note's block stands on: its folder's inside, which a kind's glyph in its top edge cuts the edge with. */
  const behind = (parent: number): string => (parent >= 0 && L!.items[parent]!.depth % 2 ? "var(--ground-1)" : "var(--ground-0)");
  $effect(() => {
    app.atlas = { chosen: chosen ? title(chosen) : "", chosenId: chosen, steps: walk.length - 1, here: inside < 0 ? "" : folderName(L!.items[inside]!.ref), out, fit: () => { moved = false; fly(whole()); }, relayout: () => { fresh = true; moved = false; void load(); } };
    return () => { app.atlas = null; };
  });
</script>

<!-- A pointer let go off the map (over the tags of a hold, which stand over the page, or past the pane): the map lets go
     of it too, or it would take the next press for part of this one. -->
<svelte:window onpointerup={(e) => { if (!(e.target instanceof Node && viewport?.contains(e.target))) up(e); }} onpointercancel={(e) => { if (!(e.target instanceof Node && viewport?.contains(e.target))) up(e); }} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="atlas" class:lit={!!lit} bind:this={viewport} role="application" aria-label="The atlas: the map of the base" tabindex="0"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={ground} onkeydown={key}
  ondragstart={(e) => e.preventDefault()} ondragover={dragOver} ondrop={(e) => void dropImages(e)}
  oncontextmenu={(e) => { if (spot || holdDone !== undefined || offered) e.preventDefault(); }}>
  <div class="ground dots" aria-hidden="true" style="background-size: {dot}px {dot}px; transform: translate({(((view.x + 56 + dot / 2) % dot) + dot) % dot}px, {(((view.y + 56 + dot / 2) % dot) + dot) % dot}px)"></div>
  {#if failed}
    <p class="said">The map could not be drawn: {failed}</p>
  {:else if L && report}
    {#if !L.items.length}<p class="said faint">There are no notes yet. The map draws itself as you write them.</p>{/if}
    <!-- One move for the whole map (M12): the folders and the notes are scaled as they stand, in the map's units;
         what is drawn round them (routes, counts, the agent's note) is placed at the zoom. -->
    <div class="atlas-world" class:labels class:shifting class:moving data-open={open} style="transform: translate({moving ? view.x : Math.round(view.x)}px, {moving ? view.y : Math.round(view.y)}px) scale({view.k / drawnK}); --u: {(L?.cell ?? 7) * drawnK}px; --k: {drawnK}">
      <div class="scaled" style="transform: scale({drawnK}); --u: {L.cell}px; --px: {1 / drawnK}px; --ik: {1 / drawnK}">
      {#each folders as f (f.item.id)}
          <AtlasFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} titled={f.item.parent < 0 || (f.item.gy - L.items[f.item.parent]!.gy) * L.cell * drawnK >= 18} held={holds(f.i, f.open)} bare={f.open && !L.items.some((x) => x.parent === f.i)} dim={(!!lit && !f.open && !held.has(f.i)) || (finder.lit.size > 0 && !f.open && !foundIn(f.item.ref))} given={agentLens && givenFolders.has(f.item.ref)} here={!f.open && hereAt === f.i} moment={thereAt === f.i ? there!.who : ""} onpick={(e) => enter(f.i, e)} renaming={renamingRef === f.item.ref} onstop={() => { if (renamingRef === f.item.ref) renamingRef = ""; }} onrename={f.item.ref.startsWith("@") || !f.item.ref || isIslandRef(f.item.ref) ? undefined : (name) => void rename(f.item.ref, name)} />
      {/each}
      </div>
      <AtlasRoutes k={drawnK} ghosts={ghostLines} {rest} pointed={!chosen && !!pointed} hot={[...(agentLens ? agentHot : []), ...hot, ...thereHot]} {pulses} counts={litCount} {grown} {beat} {retracting} />
      <!-- The count of a merged route is not drawn (M37): the width of the line says enough. -->
      <div class="scaled" style="transform: scale({drawnK}); --u: {L.cell}px; --px: {1 / drawnK}px; --ik: {1 / drawnK}">
      {#each notes as n (n.item.id)}
        <!-- A ghost (a lens's note at home in another island) stands for that note: it is lit, chosen and opened as it is. -->
        {@const ref = ghostOf(n.item.ref) ?? n.item.ref}
        {@const m = marks.get(ref)}
        {@const mark = m?.mark ?? ""}
          <AtlasBlock item={n.item} ghost={ref !== n.item.ref} conflicted={!!report.notes[ref]?.conflicted} title={title(ref)} kind={report.notes[ref]?.kind ?? ""} done={!!report.notes[ref]?.done} behind={behind(n.item.parent)} {mark} far={m?.far ?? 0} agent={agentMark(ref)} file={report.files?.[ref]?.kind ?? ""} prospect={ref.startsWith("?")} given={agentLens && givenNotes.has(ref)} held={agentLens && !givenNotes.has(ref) && readNotes.has(ref) ? "on" : ""} changed={agentLens && changedByAgent.has(ref)} order={agentLens ? (readOrder.get(ref) ?? 0) : 0} moment={thereAt === n.i ? there!.who : ""} here={hereAt === n.i} dim={(!!lit && !mark) || (finder.lit.size > 0 && !finder.lit.has(ref))} found={finder.lit.get(ref) ?? ""} href={noteHref(opens(ref))}
            onpick={(e) => choose(e, ref)} onpoint={(on) => { if ((on && dragged) || g.phase !== "idle") return; pointed = on ? ref : pointed === ref ? "" : pointed; pointing.onAtlas = pointed; }} />
      {/each}
      {#each sats as s (s.key)}
        {#if s.kind === "web"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an address on the web, not in the app -->
          <a class="sat web" href={s.href} target="_blank" rel="noopener noreferrer" title={`${s.text} · ${s.href}`} aria-label={s.text} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" onclick={(e) => { if (dragged) e.preventDefault(); e.stopPropagation(); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c-2 2.8-2 8.2 0 11M8 2.5c2 2.8 2 8.2 0 11" /></svg></a>
        {:else if s.kind === "global"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
          <a class="sat global" class:broken={s.broken} href={globalPage(s.href)} data-sveltekit-reload title={`${s.text} · ${s.href}${s.broken ? " · not in the global base" : " · opens the global base"}`} aria-label={`${s.text}${s.broken ? ", not in the global base" : ", in the global base"}`} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" onclick={(e) => { if (dragged) e.preventDefault(); e.stopPropagation(); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5h-3v9h9v-3M8 8l5-5M9.5 3H13v3.5" /></svg></a>
        {:else if s.kind === "more"}
          <button class="sat more" type="button" data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" title={s.text === "fewer" ? "Fold them again" : `${s.text}: show them all`} aria-label={s.text} aria-expanded={s.text === "fewer"} onclick={() => { const next = new Set(spread); if (!next.delete(s.note)) next.add(s.note); spread = next; }}>{s.text === "fewer" ? "−" : `+${s.text.split(" ")[0]}`}</button>
        {:else if s.kind === "picture"}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
          <a class="sat picture" class:broken={s.broken} href={noteHref(s.note)} title={`${s.text} · ${s.picture!.from === "code" ? "code:" : ""}${s.picture!.path}${s.broken ? (s.picture!.from === "code" ? " · not in the repository" : " · not in the notes") : ""}`} aria-label={`${s.text}${s.broken ? ", missing" : ""}`} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" onclick={(e) => { if (dragged) e.preventDefault(); e.stopPropagation(); }}>
            {#if s.broken}<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" /><path d="M2.5 11l3.5-3.5 3 3 1.5-1.5 3 3" /></svg>{:else}<img alt="" loading="lazy" draggable="false" use:thumb={s.picture!} />{/if}</a>
        {:else}
          {#snippet brackets()}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10" /></svg>{/snippet}
          <!-- A code link into the repository (M12) opens its file in the code reader, in the Note pane; one not there only says so. -->
          {#if s.broken}
            <span class="sat code broken" role="img" title={`${s.text} · ${s.href.slice(5)} · not in the repository`} aria-label={`${s.text}, not in the repository`} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}">{@render brackets()}</span>
          {:else}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- codeHref resolves -->
            <a class="sat code" href={codeHref(s.href)} title={`${s.text} · ${s.href.slice(5)}`} aria-label={`${s.text}, in the repository`} data-sat={s.key} style="--x:{s.gx};--y:{s.gy}" onclick={(e) => { e.stopPropagation(); if (dragged) { e.preventDefault(); return; } panes.to("note"); }}>{@render brackets()}</a>
          {/if}
        {/if}
      {/each}
      </div>
    </div>
    {#each [{ p: herePip, i: hereAt, who: "here" }, { p: therePip, i: thereAt, who: there?.who ?? "you" }] as q (q.who === "here" ? "here" : "there")}
      {#if q.p}
        <button type="button" class="pip {q.who}" style="left:{q.p.x}px;top:{q.p.y}px;--a:{q.p.angle}rad" data-pip={q.who === "here" ? "here" : "there"}
          aria-label="Bring {title(L.items[q.i]!.ref)} into view" title="{title(L.items[q.i]!.ref)}{q.who === "here" ? ": open in the Note pane" : ""}"
          onclick={(e) => { e.stopPropagation(); bringIn(q.i); }}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2l8 4-8 4z" /></svg></button>
      {/if}
    {/each}
    {#if spot && viewport}
      <SpotTags x={spot.x} y={spot.y} w={viewport.clientWidth} h={viewport.clientHeight} choice={spot.choice} px={spot.px} py={spot.py} hidden={app.hidden.length > 0} />
    {/if}
    {#if finding && viewport}
      <HiddenPicker x={finding.x} y={finding.y} w={viewport.clientWidth} h={viewport.clientHeight} onclose={() => (finding = null)} />
    {/if}
    {#if notice}
      <p class="notice" role="alert">{notice}</p>
    {/if}
    {#if said}<p class="saved" role="status">{said}</p>{/if}
    {#if given}<p class="given" role="status">◆ {given}</p>{/if}
    <HoldTags {g} mode="point" bounds={viewport?.getBoundingClientRect() ?? null} />
    <HoldTags {g} mode="ghost" />
    {#if asking}
      <div class="frame asking" role="alertdialog" aria-label="Delete">
        <span>{asking.text}</span>
        <span class="row"><button class="btn danger" type="button" onclick={() => void confirmRemove()}>{asking.item.kind === "folder" ? `delete ${asking.item.id}` : "delete"}</button><button class="btn quiet" type="button" onclick={() => (asking = null)}>keep it</button></span>
      </div>
    {/if}
    {#if panes.on.context && !given && panes.settings === "atlas"}
      <p class="legend" aria-hidden="true"><span><i class="k g"></i>you gave it</span><span><i class="k h"></i>the agent read it</span><span><i class="k d"></i>the agent changed it</span><span><i class="k n">1</i>read, in order</span></p>
    {/if}
    {#if offered}
      {@const o = offered}
      <div class="offer frame" role="menu" aria-label={title(o.ref)} style="left:{Math.min(o.x, size.w - 170)}px;top:{o.y + 14}px">
        {#if prompt.holds("note", o.ref)}
          <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); giveOrTake(o.ref); offered = null; }}><i aria-hidden="true">◇</i>Take out of the message</button>
        {:else}
          <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); give(o.ref); offered = null; }}><i aria-hidden="true">◆</i>Put in the message</button>
        {/if}
        <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); offered = null; void panes.open(o.ref, true); }}><i aria-hidden="true">▣</i>Open</button>
      </div>
    {/if}
    {#if tray.carrying}
      <div class="carried" use:toBody class:over={tray.carrying.over} style="left:{carryAt.x}px;top:{carryAt.y}px" aria-hidden="true">{tray.carrying.part.kind === "folder" ? "▭" : "▣"} {tray.carrying.part.title}</div>
    {/if}
  {/if}
</div>

<style>
  /* A long press is the Atlas's own (a hold): not the browser's menu, nor iOS's preview of a link. */
  .atlas { position: relative; isolation: isolate; height: 100%; overflow: clip; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: grab; outline-offset: -2px; }
  .atlas:active { cursor: grabbing; }
  .atlas-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .atlas-world.moving { will-change: transform; }
  /* The dot grid, moved with the map by a transform a cell at most, so that a pan paints nothing. */
  .asking { position: absolute; z-index: 30; left: 50%; top: 24px; transform: translateX(-50%); filter: var(--lift-drop); animation: appear var(--t-change) var(--ease-out); width: min(380px, calc(100% - 24px)); display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); font-size: 0.8125rem; line-height: 1.45; user-select: text; }
  .asking .row { display: flex; gap: var(--space-2); }
  /* What a held item shows (M33), on the map's own elements. */
  :global([data-g="lifted"]) { opacity: .45; transition: opacity var(--t-ack) var(--ease-out); }
  /* Aimed at delete, the item trembles; at send, it glows the agent's gold. */
  :global([data-g="doomed"]) { animation: tremble .32s ease-in-out infinite; }
  :global([data-g="sending"]) { box-shadow: var(--glow-growth); }
  @keyframes -global-tremble { 0%, 100% { translate: 0 0; } 25% { translate: calc(-.8 * var(--px, 1px)) 0; } 75% { translate: calc(.8 * var(--px, 1px)) 0; } }
  @media (prefers-reduced-motion: reduce) { :global([data-g="doomed"]) { animation: none; } }
  :global([data-g="doomed"]) { outline: calc(2.5 * var(--px, 1px)) solid var(--rose); outline-offset: calc(2 * var(--px, 1px)); background: var(--rose-soft); }
  :global([data-g="sending"]) { outline: calc(2.5 * var(--px, 1px)) solid var(--growth); outline-offset: calc(2 * var(--px, 1px)); }
  :global([data-g="over"]) { outline: calc(2 * var(--px, 1px)) dashed var(--lattice); outline-offset: calc(3 * var(--px, 1px)); }
  .ground { position: absolute; inset: -56px; opacity: .5; z-index: -1; pointer-events: none; will-change: transform; }
  .scaled { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  /* A link out of the base (M12): a small block beside its note, in the map's units. */
  .sat { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(3 * var(--u)); height: calc(3 * var(--u)); display: grid; place-items: center; background: var(--ground-1); border: var(--px) solid var(--line-strong); color: var(--lattice); }
  .sat svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .sat.web:hover, .sat.web:focus-visible, .sat.global:hover, .sat.global:focus-visible, .sat.picture:hover, .sat.picture:focus-visible, .sat.code:hover, .sat.code:focus-visible { border-color: var(--lattice); }
  .sat.picture { overflow: hidden; }
  .sat.more { font: 600 0.75rem var(--font-ui); color: var(--text-soft); cursor: pointer; padding: 0; }
  .sat.more:hover, .sat.more:focus-visible { color: var(--text); border-color: var(--lattice); }
  .sat.picture img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sat.broken { color: var(--rose); border-color: var(--rose); border-style: dashed; }
  /* Only while a changed base settles (K3), as long as its MOVE beat: at any other time, a zoom changes the same places and must not ease. */
  .shifting :global(:is(.n, .sn, .folder)) { transition: left 450ms var(--ease-out), top 450ms var(--ease-out), width 450ms var(--ease-out), height 450ms var(--ease-out); }
  @media (prefers-reduced-motion: reduce) { .shifting :global(:is(.n, .sn, .folder)) { transition: none; } }
  .said { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-4); text-align: center; }
  /* What a hold will make: a note's or a folder's icon where it was held, and what it is (V6). */
  .offer { --inside: var(--ground-2); position: absolute; z-index: 8; min-width: 150px; padding: 6px; display: grid; gap: 2px; }
  .offer button { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 10px; background: none; border: 0; color: var(--text); font: 0.8125rem var(--font-ui); text-align: left; cursor: pointer; }
  .offer button:hover, .offer button:focus-visible { background: var(--ground-3); }
  .offer i { font-style: normal; width: 12px; color: var(--growth); font-size: 0.6875rem; }
  .saved { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--lattice); font-size: 0.75rem; z-index: 2; animation: appear var(--dur-1) var(--ease-out); }
  @media (prefers-reduced-motion: reduce) { .saved { animation: none; } }
  .given { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--growth); font-size: 0.75rem; z-index: 2; }
  .given::first-letter { color: var(--growth); }
  .legend { position: absolute; left: 12px; bottom: 10px; right: 12px; margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.6875rem; color: var(--text-soft); pointer-events: none; z-index: 2; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; background: var(--ground-0); padding: 0 4px; }
  .legend .k { width: 10px; height: 10px; display: inline-grid; place-items: center; font-style: normal; }
  .legend .g { background: var(--growth-soft); border: 1px solid var(--growth); }
  .legend .h { background: var(--lattice-soft); border: 1px solid var(--lattice); }
  .legend .d { width: 7px; height: 7px; background: var(--growth); transform: rotate(45deg); }
  .legend .n { width: 14px; height: 14px; background: var(--growth); color: var(--ground-0); font-size: 0.5625rem; font-weight: 700; }
  /* A note carried out of the Atlas towards the Agent pane. */
  .carried { position: fixed; z-index: 50; pointer-events: none; transform: translate(10px, 10px); padding: 3px 8px; background: var(--ground-2); border: 1px solid var(--line-strong); font: 0.75rem var(--font-ui); color: var(--text); white-space: nowrap; box-shadow: var(--lift); animation: appear var(--t-ack) var(--ease-out); }
  .carried.over { border-color: var(--growth); }
  .notice { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--rose); color: var(--rose); font-size: 0.75rem; z-index: 2; }
  /* A pip at the edge (M17): towards the open note (the text's colour), or what is pointed at elsewhere. */
  .pip { position: absolute; z-index: 4; width: 22px; height: 22px; margin: -11px 0 0 -11px; display: grid; place-items: center; padding: 0; background: var(--ground-1); border: 1px solid var(--line-strong); color: var(--text); cursor: pointer; }
  .pip svg { transform: rotate(var(--a)); fill: currentColor; }
  .pip:hover, .pip:focus-visible { border-color: var(--text); }
  .pip.you { color: var(--lattice); border-color: var(--lattice); }
  .pip.agent { color: var(--growth); border-color: var(--growth); }
  .count { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); font-size: 0.75rem; line-height: 1.125rem; color: var(--text-faint); pointer-events: none; }
  .count.right { transform: translate(7px, -50%); }
  .count.above { transform: translate(-50%, calc(-100% - 3px)); }
</style>
