// isorite kit 0 (a sketch of the kit in docs/plan-m23.md §3). An artifact includes this and its theme; everything
// else it needs comes through here:
//   iso.text(path), iso.data(path)  a file the artifact's manifest names: from the host (in isorite), from the page
//                                   itself (a standalone export inlines it), or fetched beside the file (opened alone)
//   iso.state, iso.watch(fn)        one shared state; <iso-slider name=…> writes to it, fn runs on every change
//   iso.tokens()                    the theme's colours and fonts, for canvas and SVG drawing
//   iso.on("theme", fn)             runs when the ground or the look changes
//   iso.loop(fn)                    an animation loop that stops while hidden and under reduced motion
//   iso.open(noteId)                ask isorite to open a note
// Errors are reported to the host, which can hand them to Iso.
(() => {
  const inFrame = window.parent !== window;
  const pending = new Map();
  let seq = 0;
  const themeFns = [];
  const post = (m) => window.parent.postMessage({ isorite: 0, ...m }, "*");
  const ask = (type, body) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); post({ type, id, ...body }); });

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.isorite !== 0) return;
    if (m.type === "reply" && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.text); }
    else if (m.type === "ground") { document.documentElement.dataset.ground = m.ground; themeChanged(); }
    else if (m.type === "look") { setLook(m.look); }
  });

  /** The theme sheets carry data-look; the one asked for is on, the rest off. Works for <link> and inlined <style>. */
  function setLook(look) {
    for (const el of document.querySelectorAll("[data-look]")) el.disabled = el.dataset.look !== look;
    requestAnimationFrame(themeChanged);
  }
  function themeChanged() { requestAnimationFrame(() => themeFns.forEach((f) => f())); }
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", themeChanged);

  async function text(path) {
    const inline = document.querySelector(`script[type="text/plain"][data-path="${CSS.escape(path)}"]`);
    if (inline) return inline.textContent;
    if (inFrame) return ask("file", { path });
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.text();
  }
  /** A CSV or JSON file, with a CSV's numbers as numbers. */
  async function data(path) {
    const t = await text(path);
    if (/\.json$/i.test(path)) return JSON.parse(t);
    const [head, ...lines] = t.trim().split(/\r?\n/), cols = head.split(",");
    return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v !== "" && !isNaN(+v) ? +v : v])));
  }

  const watchers = [];
  const state = new Proxy({}, { set(o, k, v) { if (o[k] === v) return true; o[k] = v; watchers.forEach((f) => f(k)); return true; } });

  function tokens() {
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    return { ground0: v("--ground-0"), ground1: v("--ground-1"), ground2: v("--ground-2"), ground3: v("--ground-3"), line: v("--line"), lineStrong: v("--line-strong"),
      text: v("--text"), soft: v("--text-soft"), faint: v("--text-faint"), lattice: v("--lattice"), growth: v("--growth"), malachite: v("--malachite"), rose: v("--rose"),
      ui: v("--font-ui"), serif: v("--font-text"), radius: parseFloat(v("--radius")) || 0, chamfer: v("--chamfer") !== "none" };
  }

  function loop(fn) {
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let last = performance.now(), id = 0;
    const step = (t) => { const dt = Math.min(.05, (t - last) / 1000); last = t; if (!document.hidden && !still.matches) fn(dt); id = requestAnimationFrame(step); };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }

  function open(note) { if (inFrame) post({ type: "open", note }); else console.info("would open", note); }

  const report = (message) => { if (inFrame) post({ type: "error", message: String(message) }); };
  window.addEventListener("error", (e) => report(e.message));
  window.addEventListener("unhandledrejection", (e) => report(e.reason?.message ?? e.reason));

  // <iso-slider name label min max step value>: a labelled range bound to iso.state[name].
  customElements.define("iso-slider", class extends HTMLElement {
    connectedCallback() {
      const name = this.getAttribute("name"), fmt = (x) => (+x).toFixed(+(this.getAttribute("digits") ?? 0));
      this.innerHTML = `<label for="s-${name}">${this.getAttribute("label") ?? name}</label><input id="s-${name}" type="range" min="${this.getAttribute("min") ?? 0}" max="${this.getAttribute("max") ?? 1}" step="${this.getAttribute("step") ?? .01}" value="${this.getAttribute("value") ?? 0}"><output></output>`;
      const input = this.querySelector("input"), out = this.querySelector("output");
      const set = () => { state[name] = +input.value; out.textContent = fmt(input.value); };
      input.addEventListener("input", set); set();
    }
  });
  // <iso-stat label tone>: a readout whose number is set by the artifact through .value.
  customElements.define("iso-stat", class extends HTMLElement {
    connectedCallback() { if (!this.querySelector("b")) this.innerHTML = `<b>–</b><small>${this.getAttribute("label") ?? ""}</small>`; }
    set value(v) { this.connectedCallback(); this.querySelector("b").textContent = v; }
  });
  for (const tag of ["iso-page", "iso-grid", "iso-panel", "iso-stats"]) customElements.define(tag, class extends HTMLElement {});

  window.iso = { text, data, state, watch: (fn) => watchers.push(fn), tokens, on: (ev, fn) => { if (ev === "theme") themeFns.push(fn); }, loop, open, setLook };
  // The isorite look until the host (or the page) asks for another. The kit is loaded after the theme sheets, so they're there.
  setLook(document.documentElement.dataset.look || "isorite");
  if (inFrame) {
    // In isorite the label above the frame carries the title and description, so the page's own header steps aside.
    document.documentElement.classList.add("iso-framed");
    post({ type: "ready" });
    // The host sizes its frame to the artifact, so the artifact never scrolls inside the note.
    addEventListener("DOMContentLoaded", () => new ResizeObserver(() => post({ type: "height", height: document.documentElement.scrollHeight })).observe(document.body));
  }
})();
