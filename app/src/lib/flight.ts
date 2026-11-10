// What a hold does once let go (M33), seen happen: a note sent to the agent flies to it, one carried is put down where
// it lands (or back where it was), one asked about shudders, one deleted goes. Each flight is an element of its own over
// the page, gone when it lands. Under reduced motion nothing flies: the change is simply made.

const quiet = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2, .7, .2, 1)";

/** The middle of a box. */
const mid = (r: DOMRect): { x: number; y: number } => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Something in view on the page: an element whose box has a size and is on the screen. */
function shown(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight ? r : null;
}

/** Where a note sent to the agent goes: its pane's Context (what it has in hand), or on a phone its tab. */
function agentAt(): DOMRect | null {
  return shown(document.querySelector('[data-pane="agent"] button[aria-label="Context"]')) ?? shown(document.querySelector('.tabs button[aria-label="Agent"]'));
}

/** A note sent to the agent: a gold diamond from the note, in an arc, to what the agent has in hand, which rings once. */
export function sendFlight(from: DOMRect | null): void {
  const to = agentAt();
  if (quiet() || !from || !to) return;
  const a = mid(from), b = mid(to);
  const el = document.createElement("div");
  el.className = "flight-send";
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  // Up and over, as a thing thrown: the middle of the way, lifted by a third of its length, and kept on the screen
  // (the agent's Context is at the top of its pane).
  const lift = Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) / 3);
  const at = (x: number, y: number, s: number, o = 1) => ({ transform: `translate(${x}px, ${y}px) rotate(45deg) scale(${s})`, opacity: o });
  const flight = el.animate([at(a.x, a.y, 0.6, 0), at(a.x, a.y, 1.2), at((a.x + b.x) / 2, Math.max(16, Math.min(a.y, b.y) - lift), 1), at(b.x, b.y, 0.7)], { duration: 560, easing: EASE });
  flight.onfinish = () => { el.remove(); ring(b); };
}

/** A ring of gold where something arrived. */
function ring(at: { x: number; y: number }): void {
  const el = document.createElement("div");
  el.className = "flight-ring";
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  document.body.append(el);
  el.animate([{ transform: "translate(-50%, -50%) rotate(45deg) scale(.4)", opacity: 0.9 }, { transform: "translate(-50%, -50%) rotate(45deg) scale(2.2)", opacity: 0 }], { duration: 600, easing: "ease-out" }).onfinish = () => el.remove();
}

/** A carried note let go: its card put down into `to` (the folder it was over, `placed`), or taken back to where it was
 *  picked up (`to` the note's own place). The card is a copy of the one carried, which goes as the carrying ends. */
export function land(card: HTMLElement | null, to: DOMRect | null, placed: boolean): void {
  if (quiet() || !card || !to) return;
  const from = card.getBoundingClientRect(), copy = card.cloneNode(true) as HTMLElement;
  copy.classList.add("landing");
  Object.assign(copy.style, { left: `${from.left}px`, top: `${from.top}px`, margin: "0", transform: "none" });
  document.body.append(copy);
  const end = placed ? mid(to) : { x: to.left + from.width / 2, y: to.top + from.height / 2 }, start = mid(from);
  const dx = end.x - start.x, dy = end.y - start.y;
  copy.animate(placed
    ? [{ transform: "rotate(-1.5deg) scale(1.04)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 }]
    : [{ transform: "rotate(-1.5deg) scale(1.04)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 0 }],
  { duration: placed ? 240 : 300, easing: placed ? "cubic-bezier(.5, 0, .75, 0)" : EASE }).onfinish = () => copy.remove();
}

/** Asked about before it is deleted: the note shudders, once. */
export function shudder(el: Element | null): void {
  if (quiet() || !el) return;
  el.animate([{ translate: "0 0" }, { translate: "-3px 0" }, { translate: "3px 0" }, { translate: "-2px 0" }, { translate: "1px 0" }, { translate: "0 0" }], { duration: 300, easing: "ease-in-out" });
}

/** Deleted: the note folds into itself, rose, and is gone; the change is made once it has. What it returns puts the
 *  note back, for a delete that then fails. */
export async function vanish(el: Element | null): Promise<() => void> {
  if (quiet() || !el) return () => undefined;
  const a = el.animate([{ scale: "1", opacity: 1, filter: "none" }, { scale: ".82", opacity: 0, filter: "drop-shadow(0 0 8px var(--rose))" }], { duration: 260, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" });
  await a.finished.catch(() => undefined);
  return () => a.cancel();
}

/** The words chosen, seen taken: a bloom over each line of them, in `tone`, which swells a little and fades. */
export function flash(rects: DOMRect[], tone: string, shrink = false): void {
  if (quiet()) return;
  for (const r of rects) {
    if (r.width < 2 || r.height < 2) continue;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: "70", pointerEvents: "none", background: `color-mix(in srgb, ${tone} 38%, transparent)`, boxShadow: `0 0 14px ${tone}`, borderRadius: "2px" });
    document.body.append(el);
    el.animate(shrink
      ? [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.6, .1)" }]
      : [{ opacity: 0.95, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.03, 1.35)" }], { duration: shrink ? 260 : 460, easing: shrink ? "cubic-bezier(.5, 0, .75, 0)" : "ease-out" }).onfinish = () => el.remove();
  }
}

/** A pointer put to the agent: its chip lifts from where the words were, in an arc, and sinks into the box, which rings. */
export function pointFlight(chip: HTMLElement, from: DOMRect | null, to: DOMRect | null): void {
  if (quiet() || !from || !to) return;
  const a = mid(from), b = { x: to.left + Math.min(60, to.width / 2), y: to.top + Math.min(20, to.height / 2) };
  chip.classList.add("pt-ghost"); // a copy in flight, not the pointer in the box
  Object.assign(chip.style, { position: "fixed", left: "0", top: "0", zIndex: "80", pointerEvents: "none", lineHeight: "0" });
  chip.setAttribute("aria-hidden", "true");
  document.body.append(chip);
  const at = (x: number, y: number, sc: number, o = 1) => ({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${sc})`, opacity: o });
  const lift = Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) / 3);
  chip.animate([at(a.x, a.y, 0.7, 0), at(a.x, a.y, 1.1), at((a.x + b.x) / 2, Math.min(a.y, b.y) - lift, 1), at(b.x, b.y, 0.8, 0.9)], { duration: 520, easing: EASE }).onfinish = () => { chip.remove(); lattice(b); };
}
/** A ring of blue where it landed. */
function lattice(at: { x: number; y: number }): void {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { position: "fixed", left: `${at.x}px`, top: `${at.y}px`, width: "26px", height: "26px", zIndex: "70", pointerEvents: "none", border: "2px solid var(--lattice)", borderRadius: "50%" });
  document.body.append(el);
  el.animate([{ transform: "translate(-50%, -50%) scale(.4)", opacity: 0.9 }, { transform: "translate(-50%, -50%) scale(2.4)", opacity: 0 }], { duration: 560, easing: "ease-out" }).onfinish = () => el.remove();
}

/** Copied: the clipboard's mark rises from where the words ended and fades, as the words bloom. */
export function copyFlight(from: DOMRect | null): void {
  if (quiet() || !from) return;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3" width="9" height="11" /><path d="M6 3V1.8h4V3M5.8 7h4.4M5.8 9.5h4.4" /></svg>';
  Object.assign(el.style, { position: "fixed", left: `${from.right}px`, top: `${from.bottom}px`, zIndex: "80", pointerEvents: "none", color: "var(--lattice)", lineHeight: "0", filter: "drop-shadow(0 0 6px var(--lattice))" });
  document.body.append(el);
  el.animate([{ transform: "translate(-50%, 0) scale(.6)", opacity: 0 }, { transform: "translate(-50%, -14px) scale(1.1)", opacity: 1, offset: 0.35 }, { transform: "translate(-50%, -34px) scale(1)", opacity: 0 }], { duration: 700, easing: "ease-out" }).onfinish = () => el.remove();
}
