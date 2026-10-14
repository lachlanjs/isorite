<script lang="ts">
  // The Atlas: the base as a map. The layout is the core's, worked out in a worker; this holds the view (pan,
  // zoom, what is open at this zoom) and what is chosen, and hands each folder, block and route its place and
  // its marks. The marks are plain maps from a note to a mark, looked up while drawing.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { reach } from "@isorite/core";
  import type { Layout, Point } from "@isorite/core/atlas";
  import type { MapReport, NoteSource } from "@isorite/engine";
  import { linkedIn, place, titleIn, withLink, withoutLink } from "$lib/atlas/picks.ts";
  import AtlasDock from "./AtlasDock.svelte";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { CELL, LABELS_AT, fit, gatedLit, gatedRest, indexLayout, withHighways, linePath, litRoutes, mergeRoutes, openAt, restRoutes, zoomAbout, type Lit, type LitKind, type View } from "$lib/atlas/geometry.ts";
  import { layoutOf, routesOf } from "$lib/atlas/layout.ts";
  import AtlasBlock from "./AtlasBlock.svelte";
  import AtlasFolder from "./AtlasFolder.svelte";
  import AtlasGrid from "./AtlasGrid.svelte";
  import AtlasRoutes from "./AtlasRoutes.svelte";
  import AtlasStudyFolder from "./AtlasStudyFolder.svelte";
  import AtlasStudyItem from "./AtlasStudyItem.svelte";

  let { pick = "" }: {
    /** A note for Iso (`@draft/…`) that notes are being picked for: a click then links a note to it. */
    pick?: string;
  } = $props();

  /** The most of the linked notes that is sent with a note for Iso (the engine's LINKED_BUDGET). */
  const LINKED_BUDGET = 8000;

  let report = $state.raw<MapReport | null>(null);
  let laid = $state.raw<{ key: string; layout: Layout } | null>(null);
  let failed = $state("");
  let view = $state.raw<View>({ x: 0, y: 0, k: 1 });
  let size = $state.raw({ w: 0, h: 0 });
  /** The note pointed at, and the notes walked: the one first chosen, then each requirement stepped back to.
   *  The last is the note chosen. Their names in the model. */
  let pointed = $state("");
  let walk = $state.raw<string[]>([]);
  const chosen = $derived(walk.at(-1) ?? "");
  /** Every link down the chain of what the note requires is drawn, not only its own. */
  let chain = $state(false);
  let viewport = $state<HTMLDivElement>();
  /** A debugging view: the router's grid of points over the map (key g). Remembered in this browser. */
  let grid = $state(stored("isorite.atlas.grid") === "on");
  /** Which routes are drawn, while they are compared (key r): the highways (core's highways.js), through the
   *  gates (gates.js), or the layout's trunks; the highways and the trunks are fed the same way. */
  type Routes = "highways" | "gates" | "trunks";
  const ROUTES: Routes[] = ["highways", "gates", "trunks"];
  let routes = $state<Routes>(ROUTES.find((r) => r === stored("isorite.atlas.routes")) ?? "highways");
  const gated = $derived(routes === "gates");
  /** The grid the map is laid on (key c): the fine one, or the coarse one, cells twice the size and folders further apart. */
  let coarse = $state(stored("isorite.atlas.grain") === "coarse");
  /** How folders holding folders are laid out (key b): as blocks (core's floorplan.js), or in layers as a folder of notes is. */
  let blocks = $state(stored("isorite.atlas.layout") !== "layers");
  let moved = false; // the map was moved by hand: a new layout then leaves the view alone

  // The top level runs the long way of the screen: what is required at the left of a wide one, at the foot of a tall one.
  const flow: "up" | "right" = window.innerWidth >= window.innerHeight ? "right" : "up";

  function stored(name: string): string | null {
    try { return localStorage.getItem(name); } catch { return null; }
  }
  function showGrid(on: boolean): void {
    grid = on;
    try { localStorage.setItem("isorite.atlas.grid", on ? "on" : "off"); } catch { /* storage unavailable: not remembered */ }
  }

  function nextRoutes(): void {
    routes = ROUTES[(ROUTES.indexOf(routes) + 1) % ROUTES.length]!;
    try { localStorage.setItem("isorite.atlas.routes", routes); } catch { /* storage unavailable: not remembered */ }
  }
  function useCoarse(on: boolean): void {
    coarse = on; moved = false; // a new grid is a new map: framed afresh
    try { localStorage.setItem("isorite.atlas.grain", on ? "coarse" : "fine"); } catch { /* storage unavailable: not remembered */ }
    void load();
  }
  function useBlocks(on: boolean): void {
    blocks = on; moved = false; // a new layout is a new map: framed afresh
    try { localStorage.setItem("isorite.atlas.layout", on ? "blocks" : "layers"); } catch { /* storage unavailable: not remembered */ }
    void load();
  }

  async function load(): Promise<void> {
    try {
      const next = await app.api.map();
      const next_laid = await layoutOf(next.model, { gridFlow: flow, coarse, blocks });
      const first = !laid || (laid.key !== next_laid.key && !moved);
      report = next; laid = next_laid; failed = "";
      if (first && size.w) view = whole();
    } catch (e) { failed = (e as Error).message; }
  }

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

  // With the highways chosen, the layout's trunks and feeders are the highways' (one object a layout, kept).
  const L = $derived(laid ? (routes === "highways" ? withHighways(laid.layout) : laid.layout) : null);
  const idx = $derived(L ? indexLayout(L) : null);
  const open = $derived(L ? openAt(L, view.k) : "");
  // The whole map: what is on it, and half the margin round it, where the ways round the outside run.
  const whole = (): View => { const m = (L?.margin ?? 0) / 2; return fit({ gx: m, gy: m, w: (L?.W ?? 1) - 2 * m, h: (L?.H ?? 1) - 2 * m }, size.w, size.h, 1, L?.cell); };

  // The viewport's size; the first time it is known, the whole map is framed.
  $effect(() => {
    if (!viewport) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry!.contentRect, first = !size.w;
      size = { w, h };
      if (first && L) view = whole();
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  });

  const folders = $derived(L ? L.items.flatMap((item, i) => (item.kind === "folder" && open[i] !== "-" ? [{ item, i, open: open[i] === "o" }] : [])) : []);
  const notes = $derived(L ? L.items.flatMap((item, i) => (item.kind === "note" && open[i] === "s" ? [{ item, i }] : [])) : []);
  // The routes at rest, merged where they overlap. A line between folders is labelled with its count, as on the boards,
  // where it is long enough to carry it (5 cells); one inside a folder, only where it is long (30 cells).
  const rest = $derived(L ? mergeRoutes(gated ? gatedRest(L, open) : restRoutes(L, open, idx!.strong)).map((r) => ({ key: r.key, pts: r.pts, d: linePath(r.pts, 0, L.cell), count: r.count, study: r.study, strong: r.strong, trunk: r.trunk, ...countAt(r) })).map((r, i, all) => ({ ...r, label: r.label && !all.some((o, j) => j !== i && o.label && o.count === r.count && Math.hypot(o.mid[0] - r.mid[0], o.mid[1] - r.mid[1]) < 10 && (o.length > r.length || (o.length === r.length && j < i))) })) : []);
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
    return [...walked, ...lit.links.filter((l) => (l.kind === "requires" ? (chain ? !l.spare : l.from === at) : !(l.kind === "builds" && l.from === last)))];
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
  let hot = $state.raw<{ key: string; d: string; kind: LitKind; count: number; still: boolean }[]>([]);
  /** The lit links of each kind, however their lines merge. */
  let litCount = $state.raw<Record<LitKind, number>>({ requires: 0, builds: 0, uses: 0 });
  $effect(() => {
    if (!links.length || !L || !idx || !laid) { hot = []; litCount = { requires: 0, builds: 0, uses: 0 }; return; }
    const ends = links.flatMap((l) => { const a = idx.at.get(l.from), b = idx.at.get(l.to); return a === undefined || b === undefined ? [] : [{ a, b, kind: l.kind }]; });
    const { fixed, asks } = (gated ? gatedLit : litRoutes)(L, idx, open, ends);
    // Merged where they overlap, as at rest.
    const drawn = (lits: Lit[]) => {
      litCount = { requires: lits.filter((l) => l.kind === "requires").length, builds: lits.filter((l) => l.kind === "builds").length, uses: lits.filter((l) => l.kind === "uses").length };
      return mergeRoutes(lits, true).map((r) => ({ key: r.key, kind: r.kind, d: linePath(r.pts, 0, L!.cell), count: r.count, still: !r.flow }));
    };
    hot = drawn(fixed);
    if (!asks.length) return;
    let stale = false;
    // The router's way runs from the note requiring to the one required: turned round, so every lit route runs the same way.
    void routesOf(laid.key, L, asks.map(({ a, b }) => ({ a, b }))).then((found) => {
      if (!stale) hot = drawn([...fixed, ...asks.flatMap((m, k) => (found[k] ? [{ key: m.key, kind: m.kind, pts: [...found[k]].reverse() }] : []))]);
    }).catch(() => undefined);
    return () => { stale = true; };
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

  // ------------------------------------------------------------ holding, to start a note for Iso

  const HOLD_SHOWN = 180, HOLD = 650;
  /** What is held: a note, or a place on open ground (in cells). Shown as a marching box until the note is made. */
  let grasp = $state.raw<{ note: string; gx: number; gy: number; w: number; h: number } | null>(null);
  let holdShow: ReturnType<typeof setTimeout> | undefined, holdDone: ReturnType<typeof setTimeout> | undefined;
  function unhold(): void { clearTimeout(holdShow); clearTimeout(holdDone); holdShow = holdDone = undefined; grasp = null; }
  function holding(e: PointerEvent, at: { x: number; y: number }): void {
    unhold();
    if (pick || !L || !idx || !(e.target instanceof Element) || e.target.closest("button, .dock")) return;
    const on = e.target.closest<HTMLElement>("[data-note]")?.dataset.note ?? "";
    if (on.startsWith("@")) return; // a study item is not a note to start from
    const item = on ? L.items[idx.at.get(on) ?? -1] : undefined, u = L.cell * view.k;
    const w = Math.round(126 / L.cell), h = Math.round(35 / L.cell); // a note's size in cells: 18 by 5, or 9 by 3 on the coarse grid
    const what = item ? { note: on, gx: item.gx, gy: item.gy, w: item.w, h: item.h } : { note: "", gx: Math.round((at.x - view.x) / u) - Math.floor(w / 2), gy: Math.round((at.y - view.y) / u) - Math.ceil(h / 2), w, h };
    holdShow = setTimeout(() => { grasp = what; }, HOLD_SHOWN);
    holdDone = setTimeout(() => { dragged = true; void begin(what); }, HOLD);
  }
  /** A note for Iso, begun where the map was held: blank, or linking the note held. It opens as any does. */
  async function begin(what: { note: string; gx: number; gy: number }): Promise<void> {
    try {
      const made = await app.api.createDraft();
      if (what.note) await app.api.saveNote(made.id, { base: made.version, text: withLink(made.text, what.note, title(what.note)) });
      place(made.id, { gx: (what.gx * L!.cell) / CELL, gy: (what.gy * L!.cell) / CELL }); // kept in cells of the fine grid, whichever is shown
      await goto(resolve("/draft/[id]", { id: made.id.slice("@draft/".length) }));
    } catch (e) { notice = (e as Error).message; unhold(); }
  }

  const title = (ref: string): string => report?.notes[ref]?.title ?? ref.split("/").at(-1) ?? ref;
  const folderName = (ref: string): string => (ref.startsWith("@study") ? ref.replace(/^@study\/?/, "").split("/").at(-1) || app.session?.name || "the base" : ref.split("/").at(-1) ?? ref);

  // ------------------------------------------------------------ moving about

  let flying = 0;
  /** Go to a view, over a moment unless motion is unwanted. */
  function fly(to: View): void {
    cancelAnimationFrame(flying);
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

  function down(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelAnimationFrame(flying);
    if (!pointers.size) dragged = false;
    pointers.set(e.pointerId, local(e));
    regrip();
    if (pointers.size === 1) holding(e, local(e)); else unhold();
  }
  function move(e: PointerEvent): void {
    if (!pointers.has(e.pointerId) || !grip) return;
    pointers.set(e.pointerId, local(e));
    const ps = [...pointers.values()];
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    if (!dragged && ps.length === 1 && Math.hypot(x - grip.x, y - grip.y) < 5) return;
    if (!dragged) { dragged = moved = true; unhold(); viewport!.setPointerCapture(e.pointerId); }
    const span = ps.length > 1 ? Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y) : 0;
    const zoomed = grip.span && span ? zoomAbout(grip.view, span / grip.span, grip.x, grip.y) : grip.view;
    view = { k: zoomed.k, x: zoomed.x + x - grip.x, y: zoomed.y + y - grip.y };
  }
  function up(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return;
    if (holdDone !== undefined) unhold(); // let go before the note was made
    regrip();
  }
  function wheel(e: WheelEvent): void {
    e.preventDefault();
    cancelAnimationFrame(flying);
    moved = true;
    const p = local(e), unit = e.deltaMode === 1 ? 16 : 1;
    // A pinch on a trackpad arrives as a wheel with ctrl held, in finer steps.
    view = zoomAbout(view, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
  }
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
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // a new tab is the browser's
    e.preventDefault();
    e.stopPropagation();
    if (dragged) return;
    if (pick) { toggle(ref); return; }
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
    if (chosen === ref) { void goto(noteHref(ref)); return; }
    const back: string[] = [];
    if (lit && at === chosen && lit.depth[ref]) for (let r: string | undefined = ref; r && r !== chosen; r = lit.via[r]) back.unshift(r);
    walk = walk.includes(ref) ? walk.slice(0, walk.indexOf(ref) + 1) : back.length ? [...walk, ...back] : [ref];
  }
  /** A click on a folder frames it; on one already framed, the folder it is in. */
  function enter(i: number): void {
    if (dragged || !L) return;
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
    else if (folder && L) enter(L.items.findIndex((n) => n.kind === "folder" && n.ref === folder.dataset.folder));
    else fly(whole());
  }
  function key(e: KeyboardEvent): void {
    if (e.key === "Escape") { walk = []; pointed = ""; return; }
    if (e.key === "w" && chosen && !e.metaKey && !e.ctrlKey && !e.altKey) { chain = !chain; return; }
    if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) { showGrid(!grid); return; }
    if (e.key === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) { nextRoutes(); return; }
    if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) { useCoarse(!coarse); return; }
    if (e.key === "b" && !e.metaKey && !e.ctrlKey && !e.altKey) { useBlocks(!blocks); return; }
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

  const labels = $derived(view.k >= LABELS_AT);
  const count = $derived(L ? L.items.filter((n) => n.kind === "note" && n.ref.startsWith("@study")).length : 0);
  $effect(() => {
    app.atlas = { items: count, chosen: chosen ? title(chosen) : "", steps: walk.length - 1, chain, whole: () => { chain = !chain; }, pick: !!pick };
    return () => { app.atlas = null; };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="atlas dots" class:lit={!!lit} bind:this={viewport} role="application" aria-label="The atlas: the map of the base" tabindex="0"
  style="background-position: {view.x}px {view.y}px"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={ground} onkeydown={key}
  oncontextmenu={(e) => { if (grasp || holdShow !== undefined) e.preventDefault(); }}>
  {#if failed}
    <p class="said">The map could not be drawn: {failed}</p>
  {:else if L && report}
    {#if !L.items.length}<p class="said faint">There are no notes yet. The map draws itself as you write them.</p>{/if}
    <div class="atlas-world" class:labels data-open={open} style="transform: translate({view.x}px, {view.y}px); --u: {(L?.cell ?? 7) * view.k}px; --k: {view.k}; --fs: {(10.5 * Math.min(1.5, Math.max(0.8, view.k))).toFixed(2)}px; --lines: {view.k < 0.9 ? 1 : 2}">
      {#each folders as f (f.item.id)}
        {#if f.item.ref.startsWith("@study")}
          <AtlasStudyFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} onpick={() => enter(f.i)} />
        {:else}
          <AtlasFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} held={holds(f.i, f.open)} dim={!!lit && !f.open && !held.has(f.i)} onpick={() => enter(f.i)} />
        {/if}
      {/each}
      <AtlasRoutes k={view.k} {rest} {hot} counts={litCount} />
      {#if labels}
        {#each rest as r (r.key)}
          {#if r.label}<span class="count {r.side}" style="--x:{r.mid[0]};--y:{r.mid[1]}">{r.count}</span>{/if}
        {/each}
      {/if}
      {#each notes as n (n.item.id)}
        {@const m = marks.get(n.item.ref)}
        {@const mark = m?.mark ?? ""}
        {#if n.item.ref.startsWith("@study")}
          <AtlasStudyItem item={n.item} title={title(n.item.ref)} kind={report.notes[n.item.ref]?.kind ?? "note"} {mark} dim={!!lit && !mark} href={noteHref(n.item.ref)}
            onpick={(e) => choose(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; }} />
        {:else}
          <AtlasBlock item={n.item} title={title(n.item.ref)} step={report.notes[n.item.ref]?.step ?? 0} {mark} far={m?.far ?? 0} num={picked.indexOf(n.item.ref) + 1} dim={!!lit && !mark} href={noteHref(n.item.ref)}
            onpick={(e) => choose(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; }} />
        {/if}
      {/each}
      {#if grasp}
        <div class="grasp" class:on-note={!!grasp.note} style="--x:{grasp.gx};--y:{grasp.gy};--w:{grasp.w};--h:{grasp.h}">
          <svg aria-hidden="true"><rect x="1" y="1" width="100%" height="100%" /></svg>
          {#if !grasp.note && labels}<span><i class="dia" aria-hidden="true"></i>a new note</span>{/if}
        </div>
      {/if}
    </div>
    {#if grid}<AtlasGrid layout={L} {view} {size} rested={rest.map((r) => r.pts)} {routes} {coarse} {blocks} onhide={() => showGrid(false)} onroutes={nextRoutes} ongrain={() => useCoarse(!coarse)} onlayout={() => useBlocks(!blocks)} />{/if}
    {#if pick}
      <AtlasDock title={draft ? titleIn(draft.text) : ""} picked={picked.map((id) => ({ id, title: title(id), tokens: report!.notes[id]?.tokens ?? 0 }))} budget={LINKED_BUDGET} {notice}
        href={resolve("/draft/[id]", { id: pick.slice("@draft/".length) })} />
    {:else if notice}
      <p class="notice" role="alert">{notice}</p>
    {/if}
  {/if}
</div>

<style>
  .atlas { position: relative; height: 100%; overflow: hidden; touch-action: none; user-select: none; cursor: grab; outline-offset: -2px; }
  .atlas:active { cursor: grabbing; }
  .atlas-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .said { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-4); text-align: center; }
  /* What is held, until its note is made: a gold box whose dots march (Desktop-Atlas). */
  .grasp { position: absolute; left: calc(var(--x) * var(--u) - 4px); top: calc(var(--y) * var(--u) - 4px); width: calc(var(--w) * var(--u) + 8px); height: calc(var(--h) * var(--u) + 8px); display: flex; align-items: center; padding: 0 12px; gap: 8px; font-size: 11px; pointer-events: none; z-index: 1; }
  .grasp svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .grasp rect { width: calc(100% - 2px); height: calc(100% - 2px); fill: var(--growth-soft); stroke: var(--growth); stroke-width: 2; stroke-dasharray: 2 3; animation: march .6s linear infinite; }
  .grasp.on-note rect { fill: none; }
  .grasp span { position: relative; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  @keyframes march { to { stroke-dashoffset: -5; } }
  @media (prefers-reduced-motion: reduce) { .grasp rect { animation: none; } }
  .notice { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--rose); color: var(--rose); font-size: 12px; z-index: 2; }
  .count { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); font-size: 12px; line-height: 18px; color: var(--text-faint); pointer-events: none; }
  .count.right { transform: translate(7px, -50%); }
  .count.above { transform: translate(-50%, calc(-100% - 3px)); }
</style>
