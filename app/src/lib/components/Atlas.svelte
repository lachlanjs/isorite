<script lang="ts">
  // The Atlas: the base as a map. The layout is the core's, worked out in a worker; this holds the view (pan,
  // zoom, what is open at this zoom) and what is chosen, and hands each folder, block and route its place and
  // its marks. The marks are plain maps from a note to a mark, looked up while drawing.
  import { goto } from "$app/navigation";
  import { reach } from "@isorite/core";
  import type { Layout } from "@isorite/core/atlas";
  import type { MapReport } from "@isorite/engine";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { CELL, LABELS_AT, fit, indexLayout, linePath, litRoutes, openAt, restRoutes, zoomAbout, type Lit, type LitKind, type View } from "$lib/atlas/geometry.ts";
  import { layoutOf, routesOf } from "$lib/atlas/layout.ts";
  import AtlasBlock from "./AtlasBlock.svelte";
  import AtlasFolder from "./AtlasFolder.svelte";
  import AtlasRoutes from "./AtlasRoutes.svelte";
  import AtlasStudyFolder from "./AtlasStudyFolder.svelte";
  import AtlasStudyItem from "./AtlasStudyItem.svelte";

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
  let moved = false; // the map was moved by hand: a new layout then leaves the view alone

  // The top level runs the long way of the screen: what is required at the left of a wide one, at the foot of a tall one.
  const flow: "up" | "right" = window.innerWidth >= window.innerHeight ? "right" : "up";

  async function load(): Promise<void> {
    try {
      const next = await app.api.map();
      const next_laid = await layoutOf(next.model, { gridFlow: flow });
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

  const L = $derived(laid?.layout ?? null);
  const idx = $derived(L ? indexLayout(L) : null);
  const open = $derived(L ? openAt(L, view.k) : "");
  const whole = (): View => fit({ gx: 0, gy: 0, w: L?.W ?? 1, h: L?.H ?? 1 }, size.w, size.h, 1);

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
  const rest = $derived(L ? restRoutes(L, open, idx!.strong).map((r) => ({ key: r.key, d: linePath(r.pts, r.lane), count: r.count, study: r.study, strong: r.strong, feed: r.feed, mid: r.pts[r.pts.length >> 1]! })) : []);

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
  let hot = $state.raw<{ key: string; d: string; kind: LitKind }[]>([]);
  $effect(() => {
    if (!links.length || !L || !idx || !laid) { hot = []; return; }
    const ends = links.flatMap((l) => { const a = idx.at.get(l.from), b = idx.at.get(l.to); return a === undefined || b === undefined ? [] : [{ a, b, kind: l.kind }]; });
    const { fixed, asks } = litRoutes(L, idx, open, ends);
    const drawn = (r: Lit) => ({ key: r.key, kind: r.kind, d: linePath(r.pts) });
    hot = fixed.map(drawn);
    if (!asks.length) return;
    let stale = false;
    // The router's way runs from the note requiring to the one required: turned round, so every lit route runs the same way.
    void routesOf(laid.key, L, asks.map(({ a, b }) => ({ a, b }))).then((found) => {
      if (!stale) hot = [...fixed, ...asks.flatMap((m, k) => (found[k] ? [{ key: m.key, kind: m.kind, pts: [...found[k]].reverse() }] : []))].map(drawn);
    }).catch(() => undefined);
    return () => { stale = true; };
  });

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
  }
  function move(e: PointerEvent): void {
    if (!pointers.has(e.pointerId) || !grip) return;
    pointers.set(e.pointerId, local(e));
    const ps = [...pointers.values()];
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    if (!dragged && ps.length === 1 && Math.hypot(x - grip.x, y - grip.y) < 5) return;
    if (!dragged) { dragged = moved = true; viewport!.setPointerCapture(e.pointerId); }
    const span = ps.length > 1 ? Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y) : 0;
    const zoomed = grip.span && span ? zoomAbout(grip.view, span / grip.span, grip.x, grip.y) : grip.view;
    view = { k: zoomed.k, x: zoomed.x + x - grip.x, y: zoomed.y + y - grip.y };
  }
  function up(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return;
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
  function pick(e: MouseEvent, ref: string): void {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // a new tab is the browser's
    e.preventDefault();
    e.stopPropagation();
    if (dragged) return;
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
    const to = fit(L.items[i]!, size.w, size.h, 1.5), there = Math.abs(to.k - view.k) < 0.01 * to.k && Math.hypot(to.x - view.x, to.y - view.y) < 4;
    const parent = L.items[i]!.parent;
    fly(there ? (parent < 0 ? whole() : fit(L.items[parent]!, size.w, size.h, 1.5)) : to);
  }
  /** A click on open ground lets go of the note chosen, or else steps out to the whole map. */
  function ground(e: MouseEvent): void {
    if (dragged || !(e.target instanceof Element)) return;
    const folder = e.target.closest<HTMLElement>("[data-folder]");
    if (e.target.closest("a, button")) return;
    if (chosen) walk = [];
    else if (folder && L) enter(L.items.findIndex((n) => n.kind === "folder" && n.ref === folder.dataset.folder));
    else fly(whole());
  }
  function key(e: KeyboardEvent): void {
    if (e.key === "Escape") { walk = []; pointed = ""; return; }
    if (e.key === "w" && chosen && !e.metaKey && !e.ctrlKey && !e.altKey) { chain = !chain; return; }
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
    app.atlas = { items: count, chosen: chosen ? title(chosen) : "", steps: walk.length - 1, chain, whole: () => { chain = !chain; } };
    return () => { app.atlas = null; };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="atlas dots" class:lit={!!lit} bind:this={viewport} role="application" aria-label="The atlas: the map of the base" tabindex="0"
  style="background-position: {view.x}px {view.y}px"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={ground} onkeydown={key}>
  {#if failed}
    <p class="said">The map could not be drawn: {failed}</p>
  {:else if L && report}
    {#if !L.items.length}<p class="said faint">There are no notes yet. The map draws itself as you write them.</p>{/if}
    <div class="atlas-world" class:labels data-open={open} style="transform: translate({view.x}px, {view.y}px); --u: {CELL * view.k}px; --fs: {(10.5 * Math.min(1.5, Math.max(0.8, view.k))).toFixed(2)}px; --lines: {view.k < 0.9 ? 1 : 2}">
      {#each folders as f (f.item.id)}
        {#if f.item.ref.startsWith("@study")}
          <AtlasStudyFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} onpick={() => enter(f.i)} />
        {:else}
          <AtlasFolder item={f.item} name={folderName(f.item.ref)} count={idx!.noteCount[f.i]!} open={f.open} held={holds(f.i, f.open)} dim={!!lit && !f.open && !held.has(f.i)} onpick={() => enter(f.i)} />
        {/if}
      {/each}
      <AtlasRoutes k={view.k} {rest} {hot} />
      {#if labels}
        {#each rest as r (r.key)}
          {#if r.count > 1 && !r.feed}<span class="count" style="--x:{r.mid[0]};--y:{r.mid[1]}">{r.count}</span>{/if}
        {/each}
      {/if}
      {#each notes as n (n.item.id)}
        {@const m = marks.get(n.item.ref)}
        {@const mark = m?.mark ?? ""}
        {#if n.item.ref.startsWith("@study")}
          <AtlasStudyItem item={n.item} title={title(n.item.ref)} kind={report.notes[n.item.ref]?.kind ?? "note"} {mark} dim={!!lit && !mark} href={noteHref(n.item.ref)}
            onpick={(e) => pick(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; }} />
        {:else}
          <AtlasBlock item={n.item} title={title(n.item.ref)} step={report.notes[n.item.ref]?.step ?? 0} {mark} far={m?.far ?? 0} dim={!!lit && !mark} href={noteHref(n.item.ref)}
            onpick={(e) => pick(e, n.item.ref)} onpoint={(on) => { pointed = on ? n.item.ref : pointed === n.item.ref ? "" : pointed; }} />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .atlas { position: relative; height: 100%; overflow: hidden; touch-action: none; user-select: none; cursor: grab; outline-offset: -2px; }
  .atlas:active { cursor: grabbing; }
  .atlas-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .said { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-4); text-align: center; }
  .count { position: absolute; left: calc(var(--x) * var(--u) + 8px); top: calc(var(--y) * var(--u) - 9px); font-size: 12px; line-height: 18px; color: var(--text-faint); pointer-events: none; }
</style>
