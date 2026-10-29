// The states every control shares (M24, P): touched is a band of light across its face, dithered in whole cells (C′
// 1 · Ordered); where the keyboard is, corner brackets round it. Both are drawn over the page, at the screen's own
// pixels, so no control has to make room for them: a canvas for the lustre, four corners for the brackets.

/** What takes the lustre when touched. A control with its own reason not to (a field, a disabled button) is left out. */
const TOUCHED = ".btn:not(:disabled), .chip, [data-lustre]";
/** What takes text: the keyboard is plainly there already, and a bracket round an editor is noise. */
const TYPING = "input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit]), textarea, select, [contenteditable], [contenteditable] *";

/** A Bayer matrix n by n (n a power of two), each value the threshold of its cell, in (0, 1). */
function bayer(n: number): number[][] {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length, k: number[][] = [];
    for (let y = 0; y < 2 * s; y++) { k.push([]); for (let x = 0; x < 2 * s; x++) k[y]!.push(4 * m[y % s]![x % s]! + [[0, 2], [3, 1]][Math.floor(y / s)]![Math.floor(x / s)]!); }
    m = k;
  }
  return m.map((r) => r.map((v) => (v + 0.5) / (n * n)));
}
const B4 = bayer(4);
/** Cells of 2 px, and how long the band takes to cross: quick, as an acknowledgement is (Lachlan, 2026-10-29: twice as fast as 640 ms). */
const CELL = 2, DUR = 320, FPS = 24;

const still = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
const runs = new WeakMap<Element, HTMLCanvasElement>();

/** The part of a box not cut away by what it scrolls or clips in, as insets from its own edges. */
function clipped(el: Element, box: DOMRect): [number, number, number, number] | null {
  let [t, r, b, l] = [box.top, box.right, box.bottom, box.left];
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (o.overflowX === "visible" && o.overflowY === "visible") continue;
    const c = p.getBoundingClientRect();
    t = Math.max(t, c.top); r = Math.min(r, c.right); b = Math.min(b, c.bottom); l = Math.max(l, c.left);
  }
  return t < b && l < r ? [t - box.top, box.right - r, box.bottom - b, l - box.left] : null;
}

/** One band of light across el, in whole cells and whole frames, leaning as the chamfer does (u = x + y/2). A touch
 *  while one crosses lets it finish; a choice (again) starts it over, on the face it chose. */
export function lustre(el: HTMLElement, again = false): void {
  if (still() || (runs.has(el) && !again)) return;
  runs.get(el)?.remove();
  const box = el.getBoundingClientRect(), keep = clipped(el, box);
  if (!keep || box.width < 8) return;
  const W = Math.ceil(box.width / CELL), H = Math.ceil(box.height / CELL);
  const cs = getComputedStyle(el), [R, G, B] = cs.getPropertyValue("--sheen").trim().split(/\s+/).map(Number);
  // A quarter fainter than first built (Lachlan, 2026-10-29: "very strong").
  const peak = Math.min(1, (parseFloat(cs.getPropertyValue("--glint")) || 0.4) * 1.05 * (parseFloat(cs.getPropertyValue("--sheen-k")) || 1));
  // A chamfered part (--cut) loses the cells in its cut corners: top left and bottom right.
  const cut = (parseFloat(cs.getPropertyValue("--cut")) || 0) / CELL;
  const c = document.createElement("canvas");
  c.className = "lustre";
  c.width = W; c.height = H;
  Object.assign(c.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${W * CELL}px`, height: `${H * CELL}px`, clipPath: `inset(${keep.map((v) => `${v}px`).join(" ")})` });
  document.body.append(c);
  const ctx = c.getContext("2d")!, img = ctx.createImageData(W, H), d = img.data;
  const bw = Math.max(4, Math.round(W * 0.1)), t0 = performance.now();
  runs.set(el, c);
  let last = -1;
  const step = (now: number): void => {
    const f = Math.floor(((now - t0) / 1000) * FPS), t = (f * 1000) / FPS / DUR;
    if (runs.get(el) !== c) return;
    if (t >= 1 || !el.isConnected) { c.remove(); runs.delete(el); return; }
    if (f !== last) {
      last = f;
      const p = Math.round(-bw + t * (W + H / 2 + 2 * bw));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, a = Math.max(0, 1 - Math.abs(x + y / 2 - p) / bw);
        const out = cut > 0 && (x + y < cut || (W - 1 - x) + (H - 1 - y) < cut);
        d[i] = R!; d[i + 1] = G!; d[i + 2] = B!; d[i + 3] = !out && a > B4[y % 4]![x % 4]! ? peak * 255 : 0;
      }
      ctx.putImageData(img, 0, 0);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Corner brackets round where the keyboard is, kept on it as the page scrolls. */
function brackets(): { at: (el: Element | null) => void; place: () => void } {
  const b = document.createElement("div");
  b.className = "brackets";
  b.setAttribute("aria-hidden", "true");
  document.body.append(b);
  let on: Element | null = null;
  const place = (): void => {
    const box = on?.isConnected ? on.getBoundingClientRect() : null;
    b.hidden = !box || !box.width;
    if (!box || b.hidden) return;
    Object.assign(b.style, { left: `${Math.round(box.left) - 4}px`, top: `${Math.round(box.top) - 4}px`, width: `${Math.round(box.width) + 8}px`, height: `${Math.round(box.height) + 8}px` });
  };
  return { at: (el) => { on = el; place(); }, place };
}

/** Puts both in place over the document. Returns what takes them away. */
export function install(): () => void {
  const ring = brackets();
  const over = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element).closest?.<HTMLElement>(TOUCHED);
    if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) lustre(el);
  };
  const focus = (e: FocusEvent): void => {
    const el = e.target as HTMLElement;
    if (!el.matches?.(":focus-visible") || el.matches(TYPING)) { ring.at(null); return; }
    ring.at(el);
    const touched = el.closest<HTMLElement>(TOUCHED);
    if (touched) lustre(touched);
  };
  const blur = (): void => ring.at(null);
  let queued = 0;
  const moved = (): void => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; ring.place(); }); };
  document.addEventListener("pointerover", over);
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", blur);
  addEventListener("scroll", moved, true);
  addEventListener("resize", moved);
  // A control can move with nothing scrolling (a pane opening, the Atlas panning): keep up while it has the keyboard.
  const tick = setInterval(moved, 250);
  return () => {
    document.removeEventListener("pointerover", over);
    document.removeEventListener("focusin", focus);
    document.removeEventListener("focusout", blur);
    removeEventListener("scroll", moved, true);
    removeEventListener("resize", moved);
    clearInterval(tick);
    document.querySelector(".brackets")?.remove();
  };
}
