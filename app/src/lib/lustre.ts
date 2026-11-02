// The states every control shares (M24, P; the pulse, M30): touched is a pulse of light that runs round the outside of
// its face, from the top left both ways to the bottom right, with a fading tail; where the keyboard is, corner brackets
// round it. Both are drawn over the page, at the screen's own pixels, so no control has to make room for them: a canvas
// for the pulse, four corners for the brackets. (Until M30 touched was a dithered band across the face; Lachlan,
// 2026-11-02: "a bit less overt, maybe an electrical pulse around the outside instead of the dithered flash".)

/** What takes the pulse when touched. A control with its own reason not to (a field, a disabled button) is left out. */
const TOUCHED = ".btn:not(:disabled), .chip, [data-lustre]";
/** What takes text: the keyboard is plainly there already, and a bracket round an editor is noise. */
const TYPING = "input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit]), textarea, select, [contenteditable], [contenteditable] *";

/** How long the pulse takes to run round, how far its glow reaches beyond the edge, and how much of the way its tail is. */
const DUR = 420, PAD = 3, TAIL = 0.28;

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

/** The outline of a face as points, the chamfer's cut corners (top left and bottom right) cut as the face is. */
function outline(w: number, h: number, cut: number): [number, number][] {
  const c = Math.min(cut, w / 2, h / 2);
  return c > 0 ? [[c, 0], [w, 0], [w, h - c], [w - c, h], [0, h], [0, c]] : [[0, 0], [w, 0], [w, h], [0, h]];
}

/** One pulse of light round el, from where its outline starts both ways to the other side (u = distance along it). A touch
 *  while one runs lets it finish; a choice (again) starts it over, on the face it chose. */
export function lustre(el: HTMLElement, again = false): void {
  if (still() || (runs.has(el) && !again)) return;
  runs.get(el)?.remove();
  const box = el.getBoundingClientRect(), keep = clipped(el, box);
  if (!keep || box.width < 8) return;
  const cs = getComputedStyle(el), [R, G, B] = cs.getPropertyValue("--sheen").trim().split(/\s+/).map(Number);
  const peak = Math.min(1, (parseFloat(cs.getPropertyValue("--glint")) || 0.4) * 1.6 * (parseFloat(cs.getPropertyValue("--sheen-k")) || 1));
  const cut = parseFloat(cs.getPropertyValue("--cut")) || 0;
  const w = box.width, h = box.height, pts = outline(w, h, cut), n = pts.length;
  // The outline as segments, and a point at a distance along it (the line closed).
  const seg = pts.map((p, i) => { const q = pts[(i + 1) % n]!; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  const total = seg.reduce((a, b) => a + b, 0);
  const at = (u: number): [number, number] => {
    u = ((u % total) + total) % total;
    for (let i = 0; i < n; i++) {
      if (u <= seg[i]!) { const p = pts[i]!, q = pts[(i + 1) % n]!, f = seg[i]! ? u / seg[i]! : 0; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; }
      u -= seg[i]!;
    }
    return pts[0]!;
  };
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement("canvas");
  c.className = "lustre";
  c.width = Math.ceil((w + 2 * PAD) * dpr); c.height = Math.ceil((h + 2 * PAD) * dpr);
  // Not drawn beyond what the face is cut off by (a scrolled list), but free outside it.
  const [kt, kr, kb, kl] = keep.map((v) => (v > 0 ? v + PAD : 0));
  Object.assign(c.style, { left: `${box.left - PAD}px`, top: `${box.top - PAD}px`, width: `${w + 2 * PAD}px`, height: `${h + 2 * PAD}px`, clipPath: `inset(${kt}px ${kr}px ${kb}px ${kl}px)` });
  document.body.append(c);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const t0 = performance.now(), tail = total * TAIL, travel = total / 2 + tail;
  runs.set(el, c);
  const step = (now: number): void => {
    const t = (now - t0) / DUR;
    if (runs.get(el) !== c) return;
    if (t >= 1 || !el.isConnected) { c.remove(); runs.delete(el); return; }
    ctx.clearRect(0, 0, w + 2 * PAD, h + 2 * PAD);
    // Quick off the mark, easing out; the whole fades over its last third.
    const head = travel * (1 - (1 - t) ** 2), fade = Math.min(1, (1 - t) * 3);
    // Two sparks, one each way; each a bright head with a tail that fades as the square of its length.
    for (const dir of [1, -1]) {
      for (let k = 0; k <= tail; k += 1) {
        const u = head - k;
        if (u < 0 || u > total / 2) continue;
        const [x, y] = at(dir * u);
        const a = peak * fade * (1 - k / tail) ** 2;
        ctx.fillStyle = `rgb(${R} ${G} ${B} / ${a})`;
        // The core one pixel wide, a fainter one either side: a line with a little glow, not a bar.
        ctx.fillRect(x + PAD - 0.5, y + PAD - 0.5, 1, 1);
        ctx.fillStyle = `rgb(${R} ${G} ${B} / ${a * 0.35})`;
        ctx.fillRect(x + PAD - 1.5, y + PAD - 1.5, 3, 3);
      }
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
