// Press and hold on a note or a folder's heading (M33): three tags appear, and the one the pointer goes to, and is
// let go on, is what happens: move (blue: the item is picked up and carried to a folder), delete (red: asked first)
// or send (gold: put in the tray for Iso). On a mouse, pulling the item at once carries it, as before. On a touch
// screen a single finger that moves scrolls the list; one held still starts this.

export type Item = { kind: "note" | "folder"; id: string; title: string };
export type Tag = "move" | "delete" | "send";

export const HOLD = 380; // ms held still before the tags appear
const DWELL = 140; // ms on the move tag before the item is picked up
const SLOP = 6; // px a pointer may drift and still be "held"

export type Done = {
  /** Carried to a folder (`""` is the top of the base). */
  move: (item: Item, dir: string) => void;
  /** Let go on the red tag: ask first. */
  remove: (item: Item) => void;
  /** Let go on the gold tag. */
  send: (item: Item) => void;
};

export class Gesture {
  item = $state.raw<Item | null>(null);
  phase = $state<"idle" | "held" | "moving">("idle");
  tag = $state<Tag | null>(null);
  /** The folder under a carried item. */
  over = $state<string | null>(null);
  x = $state(0);
  y = $state(0);
  /** Where the press began. */
  origin = $state({ x: 0, y: 0 });

  private timer: ReturnType<typeof setTimeout> | undefined;
  private from = { x: 0, y: 0 };
  private touch = false;
  private cleanup: (() => void) | undefined;
  private frame = 0;
  private dwell: ReturnType<typeof setTimeout> | undefined;
  private node: HTMLElement | null = null;

  /** Where the item held was, on screen, as it was held: the tags stand by it. */
  rect = $state.raw<DOMRect | null>(null);

  /** `dropAt`: the folder under a point (`""` the top of the base), or null where nothing can be dropped (the list's rows
   *  are in sections; the Atlas finds it by the map). `drift`: what a mouse moving before the hold does, `carry` (the list:
   *  the item is picked up at once) or `cancel` (the Atlas: it carries to Iso, or moves the map, as it always did). */
  constructor(private done: Done, private opts: { dropAt?: (x: number, y: number) => string | null; drift?: "carry" | "cancel"; scroll?: boolean } = {}) {}
  private dropAt = (x: number, y: number): string | null => (this.opts.dropAt ?? dirAt)(x, y);

  /** An action for a row or heading: `use:g.press={() => item}`. */
  press = (node: HTMLElement, item: () => Item) => {
    const down = (e: PointerEvent): void => {
      if ((e.target as HTMLElement).closest("button, input, .menu")) return;
      const it = item();
      if (it.kind === "folder" && !it.id) return; // the top of the base is not a folder to hold
      this.begin(it, e, node);
    };
    node.addEventListener("pointerdown", down);
    return { destroy: () => node.removeEventListener("pointerdown", down) };
  };

  /** A press on `node` (the item's face) has begun: held still, the tags appear. */
  begin(it: Item, e: PointerEvent, node: HTMLElement): void {
    if (this.phase !== "idle" || this.timer || (e.pointerType === "mouse" && e.button !== 0)) return;
    this.touch = e.pointerType !== "mouse";
    this.from = { x: e.clientX, y: e.clientY };
    this.x = e.clientX; this.y = e.clientY;
    this.origin = { x: e.clientX, y: e.clientY };
    this.node = node;
    this.timer = setTimeout(() => this.reveal(it), HOLD);
    const move = (m: PointerEvent): void => this.moved(m, it);
    const up = (): void => this.release();
    const cancel = (): void => this.stop();
    const key = (k: KeyboardEvent): void => { if (k.key === "Escape") this.stop(); };
    // Once held, a touch must not scroll the list under the finger.
    const block = (t: TouchEvent): void => { if (this.phase !== "idle" && t.cancelable) t.preventDefault(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("touchmove", block, { passive: false });
    this.cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("touchmove", block);
    };
  }

  private reveal(it: Item): void {
    this.timer = undefined;
    this.item = it;
    this.rect = this.node?.getBoundingClientRect() ?? null;
    this.phase = "held";
    try { navigator.vibrate?.(10); } catch { /* none */ }
  }

  private moved(e: PointerEvent, it: Item): void {
    this.x = e.clientX; this.y = e.clientY;
    if (this.phase === "idle") {
      if (Math.hypot(e.clientX - this.from.x, e.clientY - this.from.y) <= SLOP) return;
      // Drifting before the hold: a mouse carries the item; a finger is scrolling.
      if (this.touch || this.opts.drift === "cancel") { this.stop(); return; }
      clearTimeout(this.timer); this.timer = undefined;
      this.item = it; this.phase = "moving"; this.tag = "move";
    }
    if (this.phase === "held") {
      const t = tagAt(e.clientX, e.clientY);
      // Crossing the move tag on the way to another must not pick the item up: it takes a moment on it.
      if (t === "move" && this.tag !== "move") this.dwell = setTimeout(() => { if (this.phase === "held" && this.tag === "move") { this.phase = "moving"; this.over = this.dropAt(this.x, this.y); this.scrolling(); } }, DWELL);
      if (t !== "move") { clearTimeout(this.dwell); this.dwell = undefined; }
      this.tag = t;
    }
    if (this.phase === "moving") { this.over = this.dropAt(e.clientX, e.clientY); this.scrolling(); }
  }

  /** A long list scrolls while an item is carried near its top or bottom edge. */
  private scrolling(): void {
    if (this.frame || this.opts.scroll === false) return;
    const step = (): void => {
      this.frame = 0;
      if (this.phase !== "moving") return;
      let el: HTMLElement | null = this.node;
      while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
      if (el) {
        const r = el.getBoundingClientRect(), edge = 56;
        const dy = this.y < r.top + edge ? -Math.ceil((r.top + edge - this.y) / 4) : this.y > r.bottom - edge ? Math.ceil((this.y - (r.bottom - edge)) / 4) : 0;
        if (dy) { el.scrollTop += dy; this.over = this.dropAt(this.x, this.y); }
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private release(): void {
    const { item, phase, tag, over } = this;
    const acted = phase !== "idle";
    this.stop();
    // The click that follows the pointer going up must not open the note.
    if (acted) {
      const eat = (c: Event): void => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0);
    }
    if (!item) return;
    if (phase === "moving" && over !== null) this.done.move(item, over);
    else if (phase === "held" && tag === "delete") this.done.remove(item);
    else if (phase === "held" && tag === "send") this.done.send(item);
  }

  stop(): void {
    clearTimeout(this.timer); this.timer = undefined;
    clearTimeout(this.dwell); this.dwell = undefined;
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.cleanup?.(); this.cleanup = undefined;
    this.item = null; this.rect = null; this.phase = "idle"; this.tag = null; this.over = null;
  }
}

function tagAt(x: number, y: number): Tag | null {
  const t = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-tag]")?.dataset.tag;
  return t === "move" || t === "delete" || t === "send" ? t : null;
}

function dirAt(x: number, y: number): string | null {
  const d = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-dir]")?.dataset.dir;
  return d === undefined ? null : d;
}

/** Carried out to the page, so a pane that clips what is inside it does not cut short what is carried over it. */
export function toBody(node: HTMLElement): { destroy: () => void } {
  document.body.append(node);
  return { destroy: () => node.remove() };
}
