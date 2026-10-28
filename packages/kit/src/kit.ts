// isorite kit 1, the core every artifact gets (docs/plan-m23.md §3.1). Built to one script that the host inlines into
// the artifact; the chart (chart.ts) and 3D (model.ts) parts are added only when the artifact uses them.
//   iso.data(path), iso.text(path)  a file the manifest names: from the host in isorite, from the page itself in a
//                                   standalone export, or beside the file when it's opened on its own
//   iso.state, iso.watch(fn)        one shared state; every control writes to it by its name
//   iso.tokens(), iso.on("theme")   the theme's colours and fonts for drawing, and when they change
//   iso.loop(fn)                    an animation loop, paused when hidden or under reduced motion
//   iso.open(note)                  ask isorite to open a note
//   iso.complain(message)           the kit's own complaints (a column not in the data), reported like errors
// Errors and complaints go to the host, which hands them to Iso.

import { columnsOf, parseData, type Row } from "./data.ts";
import { aggregate, format } from "./numbers.ts";

type Fn = () => void;
interface Iso {
  version: 1;
  text(path: string): Promise<string>;
  bytes(path: string): Promise<ArrayBuffer>;
  data(path: string): Promise<Row[]>;
  state: Record<string, unknown>;
  watch(fn: (name: string) => void): void;
  tokens(): Tokens;
  on(event: "theme", fn: Fn): void;
  loop(fn: (dt: number, t: number) => void): () => void;
  open(note: string): void;
  complain(message: unknown): void;
  setLook(look: string): void;
  format: typeof format;
  /** For the kit's own parts built separately (chart, 3D), so they share this state. */
  _: { rowsFor: typeof rowsFor; live: typeof live; define: typeof define };
}
export interface Tokens {
  ground0: string; ground1: string; ground2: string; ground3: string; line: string; lineStrong: string;
  text: string; soft: string; faint: string; lattice: string; growth: string; malachite: string; rose: string;
  series: string[]; ui: string; serif: string; display: string; radius: number; chamfer: boolean; dark: boolean;
}
declare global { interface Window { iso: Iso } }

const inFrame = window.parent !== window;
const pending = new Map<number, { resolve: (t: never) => void; reject: (e: Error) => void }>();
let seq = 0;
const themeFns: Fn[] = [];
const post = (m: object) => window.parent.postMessage({ isorite: 0, ...m }, "*");
const ask = <T = string>(type: string, body: object) => new Promise<T>((resolve, reject) => { const id = ++seq; pending.set(id, { resolve: resolve as (t: never) => void, reject }); post({ type, id, ...body }); });

addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.isorite !== 0) return;
  if (m.type === "reply" && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve((m.bytes ?? m.text) as never); }
  else if (m.type === "ground") { document.documentElement.dataset.ground = m.ground; themeChanged(); }
  else if (m.type === "look") setLook(m.look);
});

/** The theme sheets carry data-look; the one asked for is on, the rest off. */
function setLook(look: string): void {
  for (const el of document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("[data-look]")) el.disabled = el.dataset.look !== look;
  document.documentElement.dataset.look = look;
  themeChanged();
}
let themeQueued = false;
function themeChanged(): void {
  if (themeQueued) return;
  themeQueued = true;
  requestAnimationFrame(() => { themeQueued = false; themeFns.forEach((f) => f()); });
}
matchMedia("(prefers-color-scheme: light)").addEventListener("change", themeChanged);

const texts = new Map<string, Promise<string>>();
function text(path: string): Promise<string> {
  if (!texts.has(path)) texts.set(path, (async () => {
    const inline = document.querySelector(`script[type="text/plain"][data-path="${CSS.escape(path)}"]`);
    if (inline) return inline.textContent ?? "";
    if (inFrame) return ask("file", { path });
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.text();
  })());
  return texts.get(path)!;
}
/** A binary file (a 3D model): from the host, or beside the page. */
async function bytes(path: string): Promise<ArrayBuffer> {
  if (inFrame) return ask<ArrayBuffer>("bytes", { path });
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.arrayBuffer();
}
const datas = new Map<string, Promise<Row[]>>();
/** A data file as rows: CSV, TSV, JSON (an array, or an object holding one) or JSON lines; numbers as numbers. */
function data(path: string): Promise<Row[]> {
  if (!datas.has(path)) datas.set(path, text(path).then((t) => parseData(path, t)));
  return datas.get(path)!;
}

const watchers: ((name: string) => void)[] = [];
const state: Record<string, unknown> = new Proxy({}, {
  set(o: Record<string, unknown>, k: string, v) { if (o[k] === v) return true; o[k] = v; watchers.forEach((f) => f(k)); return true; },
});

function tokens(): Tokens {
  const cs = getComputedStyle(document.documentElement), v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    ground0: v("--ground-0"), ground1: v("--ground-1"), ground2: v("--ground-2"), ground3: v("--ground-3"), line: v("--line"), lineStrong: v("--line-strong"),
    text: v("--text"), soft: v("--text-soft"), faint: v("--text-faint"), lattice: v("--lattice"), growth: v("--growth"), malachite: v("--malachite"), rose: v("--rose"),
    series: [1, 2, 3, 4, 5, 6].map((i) => v(`--series-${i}`)).filter(Boolean),
    ui: v("--font-ui"), serif: v("--font-text"), display: v("--font-display"), radius: parseFloat(v("--radius")) || 0, chamfer: v("--chamfer") !== "none",
    dark: cs.colorScheme.includes("dark"),
  };
}

function loop(fn: (dt: number, t: number) => void): () => void {
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let last = performance.now(), id = 0, t = 0;
  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden && !still.matches) { t += dt; try { fn(dt, t); } catch (e) { report(e); return; } }
    id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}

function open(note: string): void { if (inFrame) post({ type: "open", note }); else console.info("would open", note); }

const said = new Set<string>();
function report(e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  if (said.has(message)) return;
  said.add(message);
  console.error(message);
  if (inFrame) post({ type: "error", message });
}
addEventListener("error", (e) => report(e.error ?? e.message));
addEventListener("unhandledrejection", (e) => report(e.reason));


// ------------------------------------------------------------------ elements

const attr = (el: Element, name: string, fallback = "") => el.getAttribute(name) ?? fallback;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Its rows, or a complaint naming what's missing: a file not given, or a column not in it. */
/** Its rows: set by a script (el.rows = […]), or read from its data="…" file. Several files (data="a.csv b.csv") are
 *  one table, each row with a `file` column naming the file it came from ("a"), to compare them by="file". */
async function rowsFor(el: Element, columns: string[]): Promise<Row[] | null> {
  const given = (el as Element & { rows?: Row[] }).rows;
  const path = el.getAttribute("data");
  if (!path && !given) { report(`<${el.localName}> has no data="…" attribute (or set its rows from a script)`); return null; }
  let rows: Row[];
  if (given) rows = given;
  else {
    const paths = path!.split(/[\s,]+/).filter(Boolean);
    try {
      rows = paths.length === 1 ? await data(paths[0]!) : (await Promise.all(paths.map(async (p) => (await data(p)).map((r) => ({ ...r, file: p.split("/").pop()!.replace(/\.[^.]+$/, "") }))))).flat();
    } catch (e) { report(`<${el.localName} data="${path}">: ${(e as Error).message}`); return null; }
  }
  if (given && !given.length) return [];
  const have = columnsOf(rows), missing = columns.filter((c) => c && !have.includes(c));
  if (missing.length) { report(`<${el.localName} data="${path ?? "rows"}">: no column ${missing.map((c) => `"${c}"`).join(", ")} (the columns are ${have.join(", ")})`); return null; }
  return applyWhere(el, rows);
}
/** where="integrator=leapfrog", where="t<=$t" (a $name is iso.state's value): the rows it keeps. */
function applyWhere(el: Element, rows: Row[]): Row[] {
  const where = el.getAttribute("where");
  if (!where) return rows;
  const tests = where.split(/\s*(?:,|\band\b)\s*/).map((part) => {
    const m = part.match(/^\s*([\w.-]+)\s*(<=|>=|!=|=|<|>)\s*(.+?)\s*$/);
    if (!m) { report(`where="${where}": "${part}" isn't column=value`); return () => true; }
    const [, col, op, raw] = m as unknown as [string, string, string, string];
    return (r: Row) => {
      const want = raw.startsWith("$") ? state[raw.slice(1)] : raw, got = r[col];
      const n = typeof got === "number" ? got : NaN, w = typeof want === "number" ? want : +String(want);
      switch (op) {
        case "=": return String(got) === String(want);
        case "!=": return String(got) !== String(want);
        case "<": return n < w; case "<=": return n <= w; case ">": return n > w; default: return n >= w;
      }
    };
  });
  return rows.filter((r) => tests.every((t) => t(r)));
}
/** Runs fn now and whenever the theme changes, or a state it names (by $name in its attributes, or `at`) changes. */
function live(el: Element, fn: () => void): void {
  const names = new Set([...el.attributes].flatMap((a) => [...a.value.matchAll(/\$(\w+)/g)].map((m) => m[1]!)));
  if (el.getAttribute("at")) names.add(el.getAttribute("at")!);
  themeFns.push(fn);
  watchers.push((n) => { if (names.has(n)) fn(); });
  fn();
}

const define = (tag: string, c: CustomElementConstructor) => { if (!customElements.get(tag)) customElements.define(tag, c); };
for (const tag of ["iso-page", "iso-grid", "iso-panel", "iso-stats", "iso-row"]) define(tag, class extends HTMLElement {});

/** <iso-slider name label min max step value digits>: a labelled range bound to iso.state[name]. */
define("iso-slider", class extends HTMLElement {
  connectedCallback() {
    if (this.querySelector("input")) return;
    const name = attr(this, "name", "value"), digits = +attr(this, "digits", "-1"), id = `iso-${name}-${++seq}`;
    this.innerHTML = `<label for="${id}">${esc(attr(this, "label", name))}</label><input id="${id}" type="range" min="${attr(this, "min", "0")}" max="${attr(this, "max", "1")}" step="${attr(this, "step", "any")}" value="${attr(this, "value", attr(this, "min", "0"))}"><output></output>`;
    const input = this.querySelector("input")!, out = this.querySelector("output")!;
    const set = () => { state[name] = +input.value; out.textContent = digits >= 0 ? (+input.value).toFixed(digits) : format(+input.value); };
    input.addEventListener("input", set);
    watchers.push((n) => { if (n === name && +input.value !== state[name]) { input.value = String(state[name]); out.textContent = digits >= 0 ? (+input.value).toFixed(digits) : format(+input.value); } });
    set();
  }
});
/** <iso-toggle name label value?>: on or off, as iso.state[name] true or false. */
define("iso-toggle", class extends HTMLElement {
  connectedCallback() {
    if (this.querySelector("button")) return;
    const name = attr(this, "name", "on");
    this.innerHTML = `<button type="button" class="iso-button" aria-pressed="false">${esc(attr(this, "label", name))}</button>`;
    const b = this.querySelector("button")!;
    const show = () => { b.setAttribute("aria-pressed", String(!!state[name])); b.classList.toggle("on", !!state[name]); };
    b.addEventListener("click", () => { state[name] = !state[name]; });
    watchers.push((n) => { if (n === name) show(); });
    state[name] = this.hasAttribute("value") ? attr(this, "value") !== "false" : false;
    show();
  }
});
/** <iso-select name label options="linear log" value?>: one of several, as iso.state[name]. */
define("iso-select", class extends HTMLElement {
  connectedCallback() {
    if (this.querySelector("[role=radiogroup]")) return;
    const name = attr(this, "name", "choice"), options = attr(this, "options").split(/\s*,\s*|\s+/).filter(Boolean);
    this.innerHTML = `<span class="iso-label">${esc(attr(this, "label", name))}</span><span role="radiogroup">${options.map((o) => `<button type="button" class="iso-button" role="radio" data-v="${esc(o)}">${esc(o.replaceAll("_", " "))}</button>`).join("")}</span>`;
    const show = () => this.querySelectorAll<HTMLButtonElement>("button").forEach((b) => { const on = b.dataset.v === String(state[name]); b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
    this.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => { state[name] = b.dataset.v; }));
    watchers.push((n) => { if (n === name) show(); });
    state[name] = attr(this, "value", options[0] ?? "");
    show();
  }
});
/** <iso-play name="t" min max speed loop>: play and pause, moving iso.state[name] from min to max at speed per second. */
define("iso-play", class extends HTMLElement {
  connectedCallback() {
    if (this.querySelector("button")) return;
    const name = attr(this, "name", "t"), min = +attr(this, "min", "0"), max = +attr(this, "max", "1"), speed = +attr(this, "speed", String((max - min) / 10)), wrap = attr(this, "loop", "true") !== "false";
    this.innerHTML = `<button type="button" class="iso-button">${esc(attr(this, "label", "play"))}</button>`;
    const b = this.querySelector("button")!;
    let stop: (() => void) | null = null;
    const show = () => { b.classList.toggle("on", !!stop); b.textContent = stop ? "pause" : attr(this, "label", "play"); };
    b.addEventListener("click", () => {
      if (stop) { stop(); stop = null; show(); return; }
      if (typeof state[name] !== "number" || (state[name] as number) >= max) state[name] = min;
      stop = loop((dt) => {
        let v = (state[name] as number) + dt * speed;
        if (v > max) { if (wrap) v = min; else { v = max; stop?.(); stop = null; show(); } }
        state[name] = v;
      });
      show();
    });
    if (typeof state[name] !== "number") state[name] = +attr(this, "value", String(min));
  }
});
/** <iso-stat label tone value> or bound to data: <iso-stat data="f.csv" column="err" (or abs(err)) of="min|max|mean|sum|count|first|last" where digits>. */
define("iso-stat", class extends HTMLElement {
  connectedCallback() {
    if (!this.querySelector("b")) this.innerHTML = `<b>–</b><small>${esc(attr(this, "label"))}</small>`;
    if (this.hasAttribute("value")) this.value = attr(this, "value");
    else if (this.hasAttribute("data")) live(this, async () => {
      const spec = attr(this, "column"), abs = /^abs\((.+)\)$/.exec(spec), col = abs ? abs[1]!.trim() : spec, rows = await rowsFor(this, [col]);
      if (rows) this.value = format(aggregate(rows.map((r) => (abs && typeof r[col] === "number" ? Math.abs(r[col]) : r[col])), attr(this, "of", "last")), +attr(this, "digits", "-1"));
    });
  }
  set value(v: string | number) { if (!this.querySelector("b")) this.connectedCallback(); this.querySelector("b")!.textContent = typeof v === "number" ? format(v) : v; }
});
/** <iso-table data="f.csv" columns="a b c" digits limit where>: the rows as a table, numbers right-aligned. */
define("iso-table", class extends HTMLElement {
  connectedCallback() {
    live(this, async () => {
      const want = attr(this, "columns").split(/[\s,]+/).filter(Boolean), rows = await rowsFor(this, want);
      if (!rows) return;
      const cols = want.length ? want : columnsOf(rows), limit = +attr(this, "limit", "200"), digits = +attr(this, "digits", "-1");
      const num = cols.map((c) => rows.every((r) => typeof r[c] === "number" || r[c] === null));
      const cell = (v: unknown) => (typeof v === "number" ? format(v, digits) : esc(String(v ?? "")));
      this.innerHTML = `<div class="scroll-x"><table><thead><tr>${cols.map((c, i) => `<th${num[i] ? ' class="n"' : ""}>${esc(c.replaceAll("_", " "))}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, limit).map((r) => `<tr>${cols.map((c, i) => `<td${num[i] ? ' class="n"' : ""}>${cell(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${rows.length > limit ? `<p class="faint">${limit} of ${rows.length} rows</p>` : ""}`;
    });
  }
});
/** <iso-canvas height="300">: a canvas at the device's pixel ratio, its size kept to its panel. Give it
 *  el.draw = (ctx, width, height, tokens) => …; it's drawn again on resize, on theme and on iso.redraw(el). */
define("iso-canvas", class extends HTMLElement {
  draw: ((ctx: CanvasRenderingContext2D, w: number, h: number, t: Tokens) => void) | null = null;
  canvas = document.createElement("canvas");
  connectedCallback() {
    if (this.canvas.isConnected) return;
    this.canvas.style.height = `${attr(this, "height", "300")}px`;
    this.append(this.canvas);
    new ResizeObserver(() => this.redraw()).observe(this);
    themeFns.push(() => this.redraw());
  }
  redraw(): void {
    const c = this.canvas, dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    try { this.draw?.(ctx, w, h, tokens()); } catch (e) { report(e); }
  }
});
/** <iso-note href="physics/softening">softening</iso-note>: a link that opens the note in isorite. */
define("iso-note", class extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "link");
    this.tabIndex = 0;
    const go = () => open(attr(this, "href").replace(/^\/+/, "").replace(/\.md$/, ""));
    this.addEventListener("click", go);
    this.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }
});

window.iso = { version: 1, text, bytes, data, state, watch: (fn) => { watchers.push(fn); }, tokens, on: (ev, fn) => { if (ev === "theme") themeFns.push(fn); }, loop, open, complain: report, setLook, format, _: { rowsFor, live, define } };

// The isorite look until the host or the page asks for another.
setLook(document.documentElement.dataset.look || "isorite");
if (inFrame) {
  // In isorite the label above the frame carries the title and description, so the page's own header steps aside.
  document.documentElement.classList.add("iso-framed");
  post({ type: "ready" });
  // The host sizes its frame to the artifact, so the artifact never scrolls inside the note.
  const size = () => new ResizeObserver(() => post({ type: "height", height: document.documentElement.scrollHeight })).observe(document.body);
  if (document.body) size(); else addEventListener("DOMContentLoaded", size);
}
