<script lang="ts">
  // The Atlas: the base as a map. The layout is the core's, worked out in a worker; this holds the view (pan,
  // zoom, what is open at this zoom) and what is chosen, and hands each folder, block and route its place and
  // its marks. The marks are plain maps from a note to a mark, looked up while drawing.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { reach } from "@isorite/core";
  import type { Grain, Layout, Point } from "@isorite/core/atlas";
  import type { How, MapReport, NoteSource } from "@isorite/engine";
  import { linkedIn, placeOf, testsIn, titleIn, withLink, withoutLink, withTest } from "$lib/atlas/picks.ts";
  import { tick } from "svelte";
  import AtlasDock from "./AtlasDock.svelte";
  import { app, noteHref, slug } from "$lib/app.svelte.ts";
  import { views } from "$lib/views.svelte.ts";
  import { CELL, LABELS_AT, directLine, fit, indexLayout, withHighways, linePath, litRoutes, mergeRoutes, openAt, restRoutes, shownAs, zoomAbout, type Lit, type LitKind, type View } from "$lib/atlas/geometry.ts";
  import { layoutOf, routesOf } from "$lib/atlas/layout.ts";
  import AtlasBlock from "./AtlasBlock.svelte";
  import AtlasFolder from "./AtlasFolder.svelte";
  import AtlasRoutes from "./AtlasRoutes.svelte";
  import AtlasStudyFolder from "./AtlasStudyFolder.svelte";
  import AtlasStudyItem from "./AtlasStudyItem.svelte";

  let { pick = "", moment = null }: {
    /** A note for Iso (`@draft/…`) that notes are being picked for: a click then links a note to it. */
    pick?: string;
    /** The note a moment of the session's timeline touched, while it is pointed at: outlined. */
    moment?: { note: string; who: "you" | "iso" } | null;
  } = $props();

  /** The most of the linked notes that is sent with a note for Iso (the engine's LINKED_BUDGET). */
  const LINKED_BUDGET = 8000;

  let report = $state.raw<MapReport | null>(null);
  let laid = $state.raw<{ key: string; layout: Layout } | null>(null);
  /** The way and grid `laid` was made on: a changed base starts from it only on the same (V5). */
  let laidOn = "";
  let failed = $state("");
  let view = $state.raw<View>({ x: 0, y: 0, k: 1 });
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
      const next = await app.api.map();
      // A changed base is laid out from where things stood (V5), on the same grid and the same way.
      const on = `${flow}|${grain}`, from = laid && laidOn === on ? laid.layout.orders ?? null : null;
      const next_laid = await layoutOf(next.model, { gridFlow: flow, grain, blocks: true, from });
      laidOn = on;
      const changed = !!laid && laid.key !== next_laid.key;
      const was = laid && L ? { refs: new Set(L.items.map((n) => n.ref)), edges: new Set(report!.model.edges.map(([a, b]) => `${a}>${b}`)) } : null;
      const first = !laid || (laid.key !== next_laid.key && !moved);
      report = next; laid = next_laid; failed = "";
      if (was && changed) void arrive(was);
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

  // The layout's trunks and feeders are drawn as the highways (one object a layout, kept).
  const L = $derived(laid ? withHighways(laid.layout) : null);
  const idx = $derived(L ? indexLayout(L) : null);
  const open = $derived(L ? openAt(L, view.k) : "");
  // The whole map: what is on it, and half the margin round it, where the ways round the outside run.
  // With a note for Iso being answered, its block beside the map is framed too.
  const whole = (): View => {
    const m = (L?.margin ?? 0) / 2, box = { gx: m, gy: m, w: (L?.W ?? 1) - 2 * m, h: (L?.H ?? 1) - 2 * m }, d = origin?.draft ? origin : null;
    // With room under it and to its right for what Iso is doing.
    if (d && L) { const x1 = Math.max(box.gx + box.w, d.gx + Math.max(d.w, 240 / L.cell) + 2), y1 = Math.max(box.gy + box.h, d.gy + d.h + 70 / L.cell); box.gx = Math.min(box.gx, d.gx - 2); box.gy = Math.min(box.gy, d.gy - 2); box.w = x1 - box.gx; box.h = y1 - box.gy; }
    return fit(box, size.w, size.h, 1, L?.cell);
  };

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
    const dx = n.gx + n.w / 2 - (o.gx + o.w / 2), dy = n.gy + n.h / 2 - (o.gy + o.h / 2), across = Math.abs(dx) * (5 / 18) >= Math.abs(dy);
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
      if (first && L) view = whole();
      else if (!first && w && h) view = { ...view, x: view.x + (w - was.w) / 2, y: view.y + (h - was.h) / 2 };
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  });

  const folders = $derived(L ? L.items.flatMap((item, i) => (item.kind === "folder" && open[i] !== "-" ? [{ item, i, open: open[i] === "o" }] : [])) : []);
  const notes = $derived(L ? L.items.flatMap((item, i) => (item.kind === "note" && open[i] === "s" ? [{ item, i }] : [])) : []);
  // The routes at rest, merged where they overlap. A line between folders is labelled with its count, as on the boards,
  // where it is long enough to carry it (5 cells); one inside a folder, only where it is long (30 cells).
  const rest = $derived(L ? mergeRoutes(restRoutes(L, open, idx!.strong, leaves)).map((r) => ({ key: r.key, pts: r.pts, d: linePath(r.pts, 0, L.cell), count: r.count, study: r.study, strong: r.strong, trunk: r.trunk, ...countAt(r) })).map((r, i, all) => ({ ...r, label: r.label && !all.some((o, j) => j !== i && o.label && o.count === r.count && Math.hypot(o.mid[0] - r.mid[0], o.mid[1] - r.mid[1]) < 10 && (o.length > r.length || (o.length === r.length && j < i))) })) : []);
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
  /** The note it is reading now. */
  const reading = $derived(running ? (run!.steps.findLast((s) => s.opened && !s.failed)?.opened ?? "") : "");
  // Its steps along links, drawn as the map draws a link: from the note in hand to the one it led to.
  const isoLinks = $derived((run?.steps ?? []).flatMap((s) => (s.how === "link" && s.from && s.opened && !s.failed ? [{ from: s.opened, to: s.from, kind: "iso" as const }] : [])));
  let isoHot = $state.raw<Hot[]>([]);
  $effect(() => light(isoLinks, (h) => { isoHot = h; }));

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
    const w = Math.round(126 / L.cell), h = Math.round(35 / L.cell), name = asking ? titleIn(asking.text) || "a new note" : "";
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
  const picked = $derived(draft ? (testsIn(draft.text) ?? linkedIn(draft.text)).filter((id) => report?.notes[id] && !id.startsWith("@")) : []);
  let writing: Promise<void> = Promise.resolve();
  /** Link a note to the draft, or take away a link picked here. One at a time, each on the file as the last left it. */
  function toggle(ref: string): void {
    writing = writing.then(async () => {
      if (!draft || ref.startsWith("@")) return;
      // A request for an exercise is picked for what it tests; any other note for Iso, for what it links.
      const change = (text: string): string | null => (testsIn(text) ? withTest(text, ref) : linkedIn(text).includes(ref) ? withoutLink(text, ref) : withLink(text, ref, title(ref)));
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
  // Hold still, and a new note is marked where you hold; let go, and its title is asked for there. Hold, then drag a
  // little way, and it is a new folder instead: its name is asked for, then its first note's, since a folder is made
  // when a note is put in it. Either goes in the folder gripped in (on a note, that note's folder), and opens beside
  // the Atlas.

  const HOLD_SHOWN = 180, HOLD = 650, FOLDER_DRAG = 24;
  /** What is gripped: a place (in cells), the folder it is in, and whether a drag has made it a folder. */
  let grasp = $state.raw<{ dir: string; gx: number; gy: number; w: number; h: number; folder: boolean } | null>(null);
  /** Held long enough: the gesture is ours until the pointer is let go. Where it began, on the screen. */
  let gripped: { x: number; y: number } | null = null;
  /** Let go: the name being asked for, on the map where it was gripped. */
  let naming = $state.raw<{ dir: string; gx: number; gy: number; w: number; h: number; folder: boolean; named: string } | null>(null);
  let holdShow: ReturnType<typeof setTimeout> | undefined, holdDone: ReturnType<typeof setTimeout> | undefined;
  function unhold(): void { clearTimeout(holdShow); clearTimeout(holdDone); holdShow = holdDone = undefined; gripped = null; if (!naming) grasp = null; }
  /** The deepest folder of the base holding a place on the map (in cells): "" for the top. */
  function folderAt(gx: number, gy: number): string {
    let best: { ref: string; depth: number } | null = null;
    for (const n of L!.items) if (n.kind === "folder" && !n.ref.startsWith("@") && gx >= n.gx && gx < n.gx + n.w && gy >= n.gy && gy < n.gy + n.h && (!best || n.depth > best.depth)) best = { ref: n.ref, depth: n.depth };
    return best?.ref ?? "";
  }
  function holding(e: PointerEvent, at: { x: number; y: number }): void {
    unhold();
    naming = null;
    if (pick || !L || !idx || !(e.target instanceof Element) || e.target.closest("button, .dock, .naming")) return;
    const on = e.target.closest<HTMLElement>("[data-note]")?.dataset.note ?? "";
    if (on.startsWith("@")) return; // a study item is not a place in the base
    const u = L.cell * view.k, gx = Math.round((at.x - view.x) / u), gy = Math.round((at.y - view.y) / u);
    const w = Math.round(126 / L.cell), h = Math.round(35 / L.cell); // a note's size in cells: 18 by 5, 9 by 3 on the coarse grid, 7 by 2 on the coarser
    const dir = on ? on.split("/").slice(0, -1).join("/") : folderAt(gx, gy);
    const what = { dir, gx: gx - Math.floor(w / 2), gy: gy - Math.ceil(h / 2), w, h, folder: false };
    holdShow = setTimeout(() => { grasp = what; }, HOLD_SHOWN);
    holdDone = setTimeout(() => { holdDone = undefined; dragged = true; gripped = at; grasp = what; viewport?.setPointerCapture(e.pointerId); }, HOLD);
  }
  /** While gripped: a drag far enough makes it a folder, drawn from where the hold began to the pointer. */
  function drawHeld(at: { x: number; y: number }): void {
    if (!gripped || !grasp || !L) return;
    const far = Math.hypot(at.x - gripped.x, at.y - gripped.y) >= FOLDER_DRAG;
    if (!far && !grasp.folder) return;
    const u = L.cell * view.k, x0 = (gripped.x - view.x) / u, y0 = (gripped.y - view.y) / u, x1 = (at.x - view.x) / u, y1 = (at.y - view.y) / u;
    const w = Math.max(Math.round(160 / L.cell), Math.round(Math.abs(x1 - x0))), h = Math.max(Math.round(70 / L.cell), Math.round(Math.abs(y1 - y0)));
    grasp = { ...grasp, folder: true, gx: Math.round(Math.min(x0, x1)), gy: Math.round(Math.min(y0, y1)), w, h };
  }
  /** Let go while gripped: ask for the name there. */
  function letGo(): void {
    if (!gripped || !grasp) return;
    gripped = null;
    naming = { ...grasp, named: "" };
  }
  async function named(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const n = naming, input = (e.currentTarget as HTMLFormElement).querySelector("input")!, value = input.value.trim();
    if (!n || !value) return;
    // A folder: its name first, then its first note's title.
    if (n.folder && !n.named) { naming = { ...n, named: slug(value) || value }; input.value = ""; return; }
    const dir = [n.dir, n.folder ? n.named : ""].filter(Boolean).join("/"), id = [dir, slug(value)].filter(Boolean).join("/");
    try {
      await app.api.createNote(id, `---\ntype: Concept\ntitle: ${JSON.stringify(value)}\n---\n\n`);
      naming = null; grasp = null;
      await app.refresh();
      await views.openFromAtlas(id);
    } catch (err) { notice = (err as Error).message; }
  }
  function cancelNaming(): void { naming = null; grasp = null; }

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
    if (gripped) { drawHeld(local(e)); return; }
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
    if (gripped) letGo();
    else if (holdDone !== undefined) unhold(); // let go before the hold was long enough
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
    // Chosen already: open it, beside the Atlas on a desktop (V1).
    if (chosen === ref) { void views.openFromAtlas(ref); return; }
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
    else if (run && !running) app.iso = null; // Iso's path is let go once it has ended
    else if (folder && L) enter(L.items.findIndex((n) => n.kind === "folder" && n.ref === folder.dataset.folder));
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

  const labels = $derived(view.k >= LABELS_AT);
  const count = $derived(L ? L.items.filter((n) => n.kind === "note" && n.ref.startsWith("@study")).length : 0);
  $effect(() => {
    app.atlas = { items: count, chosen: chosen ? title(chosen) : "", chosenId: chosen, steps: walk.length - 1, pick: !!pick, here: inside < 0 ? "" : folderName(L!.items[inside]!.ref), out };
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
    <div class="atlas-world" class:labels class:shifting data-open={open} style="transform: translate({view.x}px, {view.y}px); --u: {(L?.cell ?? 7) * view.k}px; --k: {view.k}; --fs: {(10.5 * Math.min(1.5, Math.max(0.8, view.k))).toFixed(2)}px; --lines: {view.k < 0.9 ? 1 : 2}">
      {#each folders as f (f.item.id)}
        {#if f.item.ref.startsWith("@study")}
          <AtlasStudyFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} passes={L.items.filter((x) => x.parent === f.i && report?.notes[x.ref]?.passed).length} onpick={() => enter(f.i)} />
        {:else}
          <AtlasFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} titled={f.item.parent < 0 || (f.item.gy - L.items[f.item.parent]!.gy) * L.cell * view.k >= 18} held={holds(f.i, f.open)} dim={!!lit && !f.open && !held.has(f.i)} onpick={() => enter(f.i)} />
        {/if}
      {/each}
      <AtlasRoutes k={view.k} {rest} hot={[...isoHot, ...hot]} counts={litCount} sent={sentLines} {grown} />
      {#if labels}
        {#each rest as r (r.key)}
          {#if r.label}<span class="count {r.side}" style="--x:{r.mid[0]};--y:{r.mid[1]}">{r.count}</span>{/if}
        {/each}
      {/if}
      {#each notes as n (n.item.id)}
        {@const m = marks.get(n.item.ref)}
        {@const mark = m?.mark ?? ""}
        {#if n.item.ref.startsWith("@study")}
          <AtlasStudyItem item={n.item} title={title(n.item.ref)} kind={report.notes[n.item.ref]?.kind ?? "note"} {mark} moment={moment?.note === n.item.ref ? moment.who : ""} dim={!!lit && !mark} href={noteHref(n.item.ref)}
            onpick={(e) => choose(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; }} />
        {:else}
          <AtlasBlock item={n.item} title={title(n.item.ref)} step={report.notes[n.item.ref]?.step ?? 0} {mark} far={m?.far ?? 0} num={picked.indexOf(n.item.ref) + 1} iso={isoMark(n.item.ref)} linked={sent.includes(n.item.ref)} moment={moment?.note === n.item.ref ? moment.who : ""} dim={!!lit && !mark} href={noteHref(n.item.ref)}
            onpick={(e) => choose(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; }} />
        {/if}
      {/each}
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
        <div class="grasp" class:folder={grasp.folder} style="--x:{grasp.gx};--y:{grasp.gy};--w:{grasp.w};--h:{grasp.h}">
          <svg aria-hidden="true"><rect x="1" y="1" width="100%" height="100%" /></svg>
          {#if !naming}<span>{grasp.folder ? "a new folder" : "a new note"}{grasp.dir ? ` in ${grasp.dir}` : ""}</span>{/if}
        </div>
      {/if}
      {#if naming}
        <form class="naming" style="--x:{naming.gx};--y:{naming.gy + naming.h}" onsubmit={named}>
          <!-- svelte-ignore a11y_autofocus -->
          <input autofocus aria-label={naming.folder && !naming.named ? "the new folder's name" : "the new note's title"} autocomplete="off"
            placeholder={naming.folder && !naming.named ? `a new folder${naming.dir ? ` in ${naming.dir}` : ""}` : `a new note${naming.dir || naming.named ? ` in ${[naming.dir, naming.named].filter(Boolean).join("/")}` : ""}`}
            onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); cancelNaming(); } }} />
          <button class="btn primary" type="submit">{naming.folder && !naming.named ? "next" : "make it"}</button>
        </form>
      {/if}
    </div>
    {#if pick}
      <AtlasDock title={draft ? (testsIn(draft.text) ? "an exercise" : titleIn(draft.text)) : ""} tests={draft ? testsIn(draft.text) !== null : false} picked={picked.map((id) => ({ id, title: title(id), tokens: report!.notes[id]?.tokens ?? 0 }))} budget={LINKED_BUDGET} {notice}
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
  /* Only while a changed base settles (K3): at any other time, a zoom changes the same places and must not ease. */
  .shifting :global(:is(.n, .sn, .folder)) { transition: left 0.45s ease, top 0.45s ease, width 0.45s ease, height 0.45s ease; }
  @media (prefers-reduced-motion: reduce) { .shifting :global(:is(.n, .sn, .folder)) { transition: none; } }
  .said { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-4); text-align: center; }
  /* What is held, until its note is made: a gold box whose dots march (Desktop-Atlas). */
  .grasp { position: absolute; left: calc(var(--x) * var(--u) - 4px); top: calc(var(--y) * var(--u) - 4px); width: calc(var(--w) * var(--u) + 8px); height: calc(var(--h) * var(--u) + 8px); display: flex; align-items: center; padding: 0 12px; gap: 8px; font-size: 11px; pointer-events: none; z-index: 1; }
  .grasp svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .grasp rect { width: calc(100% - 2px); height: calc(100% - 2px); fill: var(--growth-soft); stroke: var(--growth); stroke-width: 2; stroke-dasharray: 2 3; animation: march .6s linear infinite; }
  /* A folder being drawn: a frame's outline, its name asked for when let go. */
  .grasp.folder { align-items: flex-start; padding-top: 8px; }
  .grasp.folder rect { fill: none; stroke-dasharray: 6 4; }
  .naming { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u) + 8px); z-index: 3; display: flex; gap: 8px; align-items: center; padding: 8px; background: var(--ground-2); border: 1px solid var(--growth); }
  .naming input { width: 220px; background: var(--ground-1); border: 0; border-bottom: 1px solid var(--line-strong); padding: 4px 6px; font: 14px/1.4 var(--font-text); color: var(--text); }
  .naming input:focus-visible { outline: none; border-bottom-color: var(--growth); }
  .naming .btn { height: 28px; font-size: 12px; }
  .grasp span { position: relative; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  @keyframes march { to { stroke-dashoffset: -5; } }
  @media (prefers-reduced-motion: reduce) { .grasp rect { animation: none; } }
  .notice { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 6px 10px; background: var(--ground-1); border: 1px solid var(--rose); color: var(--rose); font-size: 12px; z-index: 2; }
  /* Iso's note while it is answered (Desktop-Think): the draft's block, dotted gold, and under it (or under the
     note asking) a marching gold line and what Iso is doing. */
  .asker { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u)); pointer-events: none; z-index: 1; }
  .eph { position: absolute; inset: 0; display: flex; align-items: center; padding: 0 min(7px, calc(var(--u) * .8)); overflow: hidden; font-size: var(--fs); line-height: 1.2; color: var(--text); text-decoration: none; background: var(--growth-soft); border: 1.5px dotted var(--growth); pointer-events: auto; }
  .eph .t { display: none; overflow: hidden; -webkit-line-clamp: var(--lines, 2); line-clamp: var(--lines, 2); -webkit-box-orient: vertical; }
  :global(.atlas-world.labels) .eph .t { display: -webkit-box; }
  .loader { position: absolute; left: 0; top: calc(100% + 10px); width: 100%; height: 2px; overflow: hidden; }
  .loader path { stroke: var(--growth); stroke-width: 2.5; stroke-dasharray: 2 3; animation: march .6s linear infinite; }
  .doing { position: absolute; left: 0; top: calc(100% + 20px); width: max(100%, 240px); margin: 0; font-size: 12px; line-height: 18px; color: var(--text-soft); }
  .doing .dia { margin: 0 8px 0 3px; }
  .c-gold { color: var(--growth); }
  @media (prefers-reduced-motion: reduce) { .loader path { animation: none; } }
  .count { position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); font-size: 12px; line-height: 18px; color: var(--text-faint); pointer-events: none; }
  .count.right { transform: translate(7px, -50%); }
  .count.above { transform: translate(-50%, calc(-100% - 3px)); }
</style>
