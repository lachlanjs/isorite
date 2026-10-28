// <iso-chart>: a chart from a data file, in markup (plan-m23 §3.7: most artifacts need no script). On Observable Plot,
// themed from the kit's tokens, drawn again when the theme, its size or a state it names changes.
//
//   <iso-chart data="runs.csv" type="line" x="t" y="energy" by="body"></iso-chart>
//   type     line (default), dot, bar, area, step
//   x, y     columns; y may name several ("kinetic potential total"), each its own series; abs(col) for a size
//   by       a column whose values are the series
//   x-scale, y-scale   linear (default), log, or $name for iso.state's value
//   x-label, y-label   the axes' names, with units (default: the column)
//   where    rows kept: "integrator=leapfrog", "t<=$t"
//   at       a state name: a rule where x is iso.state[at], or, when x is another column, a dot on each series at the
//            row whose column `at` is nearest iso.state[at]
//   height   in pixels (default 260)
// A script can draw anything else with Plot itself: el.plot = (Plot, rows, tokens) => Plot.plot({...}).

import * as Plot from "@observablehq/plot";
import type { Tokens } from "./kit.ts";
import type { Row } from "./data.ts";

const attr = (el: Element, name: string, fallback = "") => el.getAttribute(name) ?? fallback;
const words = (s: string) => s.split(/[\s,]+/).filter(Boolean);
/** A column, or abs(column). */
const column = (spec: string) => { const m = spec.match(/^abs\((.+)\)$/); return m ? { name: m[1]!.trim(), abs: true } : { name: spec, abs: false }; };
const pretty = (spec: string) => spec.replace(/^abs\((.+)\)$/, "|$1|").replaceAll("_", " ");
const stateOf = (v: string) => (v.startsWith("$") ? String(window.iso.state[v.slice(1)] ?? "linear") : v);

/** Plot's look from the tokens: the kit's fonts and lines, no background, the accents as series. */
function plotStyle(t: Tokens, width: number, height: number) {
  return {
    width, height, marginLeft: 56, marginBottom: 40, marginTop: 24, marginRight: 18,
    style: { background: "transparent", color: t.soft, fontFamily: t.ui, fontSize: "11px", overflow: "visible" },
    color: { range: t.series.length ? t.series : [t.lattice, t.growth, t.malachite, t.rose] },
  };
}

class IsoChart extends HTMLElement {
  plot: ((plot: typeof Plot, rows: Row[], t: Tokens) => Element) | null = null;
  #width = 0;
  connectedCallback() {
    if (this.dataset.on) return;
    this.dataset.on = "1";
    new ResizeObserver(() => { if (Math.abs(this.clientWidth - this.#width) > 2) this.render(); }).observe(this);
    window.iso._.live(this, () => this.render());
  }
  async render(): Promise<void> {
    const width = this.clientWidth;
    if (!width) return;
    this.#width = width;
    const t = window.iso.tokens(), height = +attr(this, "height", "260");
    const x = attr(this, "x"), ys = words(attr(this, "y")), by = attr(this, "by"), at = attr(this, "at");
    const needed = [x, ...ys, by].filter(Boolean).map((c) => column(c).name);
    if (this.plot) {
      const rows = this.hasAttribute("data") ? await window.iso._.rowsFor(this, needed) : [];
      if (!rows) return;
      try { this.replaceChildren(this.plot(Plot, rows, t)); } catch (e) { window.iso.complain(e); }
      return;
    }
    if (!x || !ys.length) { window.iso.complain(`<iso-chart data="${attr(this, "data")}"> needs x="…" and y="…"`); return; }
    const all = await window.iso._.rowsFor(this, needed);
    if (!all) return;
    const xc = column(x), val = (r: Row, c: { name: string; abs: boolean }) => { const v = r[c.name]; return c.abs && typeof v === "number" ? Math.abs(v) : v; };
    // One long table: a row per point, its series named by `by` or by which y it is.
    const series = ys.length > 1 ? "series" : by || null;
    const long = all.flatMap((r) => ys.map((y) => ({ x: val(r, xc), y: val(r, column(y)), series: ys.length > 1 ? pretty(y) : by ? r[by] : pretty(y), row: r })));
    const xScale = stateOf(attr(this, "x-scale", "linear")), yScale = stateOf(attr(this, "y-scale", "linear"));
    const usable = long.filter((p) => (xScale !== "log" || (typeof p.x === "number" && p.x > 0)) && (yScale !== "log" || (typeof p.y === "number" && p.y > 0)));
    if (usable.length < long.length && long.length) window.iso.complain(`<iso-chart data="${attr(this, "data")}">: ${long.length - usable.length} of ${long.length} points are zero or below, so a log scale leaves them out (abs(${ys[0]}) charts their size)`);
    const type = attr(this, "type", "line"), z = series ? "series" : undefined, colour = series ? "series" : t.series[0] ?? t.lattice;
    const xText = usable.some((p) => typeof p.x === "string"), few = usable.length / Math.max(1, new Set(usable.map((p) => p.series)).size) <= 40;
    const marks: Plot.Markish[] = [];
    if (type === "bar") marks.push(xText ? Plot.barY(usable, { x: "x", y: "y", fill: colour, fx: undefined, tip: true }) : Plot.barX(usable, { y: "x", x: "y", fill: colour, tip: true }));
    else if (type === "dot") marks.push(Plot.dot(usable, { x: "x", y: "y", fill: colour, r: 2.5, tip: true }));
    else if (type === "area") marks.push(Plot.areaY(usable, { x: "x", y: "y", z, fill: colour, fillOpacity: 0.25 }), Plot.lineY(usable, { x: "x", y: "y", z, stroke: colour, strokeWidth: 1.5 }));
    else {
      marks.push(Plot.line(usable, { x: "x", y: "y", z, stroke: colour, strokeWidth: 1.6, curve: type === "step" ? "step" : "linear" }));
      if (few) marks.push(Plot.dot(usable, { x: "x", y: "y", stroke: colour, fill: t.ground1, r: 3 }));
      marks.push(Plot.tip(usable, Plot.pointer({ x: "x", y: "y", stroke: t.lineStrong, fill: t.ground2, title: (p: { x: unknown; y: unknown; series: unknown }) => `${series ? `${p.series}\n` : ""}${pretty(x)} ${fmt(p.x)}\n${ys.length > 1 ? "" : `${pretty(ys[0]!)} `}${fmt(p.y)}` })));
    }
    if (at) {
      const now = window.iso.state[at];
      if (typeof now === "number") {
        if (column(x).name === at) marks.push(Plot.ruleX([now], { stroke: t.growth, strokeDasharray: "3,3" }));
        else {
          // The row nearest now, on each series.
          const nearest = new Map<unknown, (typeof usable)[number]>();
          for (const p of usable) { const v = p.row[at], best = nearest.get(p.series); if (typeof v === "number" && (!best || Math.abs(v - now) < Math.abs((best.row[at] as number) - now))) nearest.set(p.series, p); }
          marks.push(Plot.dot([...nearest.values()], { x: "x", y: "y", fill: colour, stroke: t.text, strokeWidth: 1.5, r: 5.5 }));
        }
      } else window.iso.complain(`<iso-chart at="${at}">: iso.state.${at} isn't a number yet (an iso-slider or iso-play named ${at} sets it)`);
    }
    marks.push(Plot.frame({ stroke: t.line, anchor: "bottom" }), Plot.frame({ stroke: t.line, anchor: "left" }));
    const legend = series && new Set(usable.map((p) => p.series)).size > 1;
    try {
      const svg = Plot.plot({
        ...plotStyle(t, width, height), marks,
        // Ticks read as the kit reads numbers (Plot's own log ticks say 3m for 0.003).
        x: { type: xScale as "linear", label: attr(this, "x-label", pretty(x)), grid: !xText, labelAnchor: "center", labelArrow: "none", nice: xScale !== "log", ...(xText ? {} : { tickFormat: fmtTick(xScale) }) },
        y: { type: yScale as "linear", label: attr(this, "y-label", ys.length > 1 ? "" : pretty(ys[0]!)), grid: true, labelArrow: "none", nice: yScale !== "log", tickFormat: fmtTick(yScale) },
        color: { ...plotStyle(t, 0, 0).color, ...(series ? { domain: [...new Set(usable.map((p) => p.series))] as string[] } : {}) },
      });
      for (const g of svg.querySelectorAll<SVGElement>("[aria-label$='grid'] line, [aria-label$='grid'] path")) g.setAttribute("stroke", t.line), g.setAttribute("stroke-opacity", "1");
      const key = legend ? `<div class="iso-legend">${(svg as unknown as { scale(n: string): { domain: unknown[]; range: string[] } }).scale("color").domain.map((d, i, a) => `<span><i style="background:${(svg as unknown as { scale(n: string): { range: string[] } }).scale("color").range[i % a.length]}"></i>${escape(String(d))}</span>`).join("")}</div>` : "";
      this.innerHTML = key;
      this.append(svg);
    } catch (e) { window.iso.complain(`<iso-chart data="${attr(this, "data")}">: ${(e as Error).message}`); }
  }
}
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Plot thins the ticks itself; this only says them as the kit says numbers. */
const fmtTick = (_scale: string) => (d: number) => (typeof d === "number" ? window.iso.format(d) : String(d));
const fmt = (v: unknown) => (typeof v === "number" ? window.iso.format(v) : String(v));

window.iso._.define("iso-chart", IsoChart);
(window as unknown as { Plot: typeof Plot }).Plot = Plot;
