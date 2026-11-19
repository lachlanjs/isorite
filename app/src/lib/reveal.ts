// Where a pointer came from, shown: a passage of the agent's conversation found again in the session by its words,
// scrolled to and lit for a moment. The words are matched with their spacing ignored, since a selection's text and the
// rendered page's differ in it (paragraph breaks, wrapped lines). The light is a custom highlight, so no element is
// added to the words; where the browser has none, the bloom alone marks it, and under reduced motion it is the
// highlight alone, held a little while, with nothing moving.

import { flash } from "./flight.ts";

const quiet = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const HOLD_MS = 1800;

/** The words of `quote` in `root`, spacing aside, as a range over its text (a pointer's chip is not text). */
export function findPassage(root: Element, quote: string): Range | null {
  const want = quote.replace(/\s+/g, "");
  if (!want) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(".pt") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  // Every character but spacing, with the text node and offset it is at.
  const at: { node: Text; i: number }[] = [];
  let flat = "";
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const t = n.nodeValue ?? "";
    for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i]!)) { flat += t[i]; at.push({ node: n, i }); }
  }
  const k = flat.lastIndexOf(want);
  if (k < 0) return null;
  const a = at[k]!, b = at[k + want.length - 1]!;
  const r = document.createRange();
  r.setStart(a.node, a.i);
  r.setEnd(b.node, b.i + 1);
  return r;
}

/** Scroll an element into view and wait until it is there: by the promise scrolling gives where the browser has it,
 *  else by `scrollend` (or a quiet moment, where there is none, or nothing had to move). */
function scrolled(el: Element, scroller: Element | null): Promise<void> {
  const got = el.scrollIntoView({ block: "center", behavior: quiet() ? "auto" : "smooth" }) as unknown;
  if (got instanceof Promise) return got.then(() => undefined);
  const on = scroller ?? window;
  return new Promise((done) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (): void => { clearTimeout(timer); on.removeEventListener("scrollend", finish); on.removeEventListener("scroll", moving); done(); };
    const moving = (): void => { clearTimeout(timer); timer = setTimeout(finish, 120); };
    on.addEventListener("scrollend", finish, { once: true });
    on.addEventListener("scroll", moving, { passive: true });
    timer = setTimeout(finish, 120);
  });
}

let current = 0;
/** Light a range for a moment: a bloom over its lines, and its words tinted while it is held. */
export function light(r: Range): void {
  const n = ++current;
  if (!quiet()) flash([...r.getClientRects()], "var(--lattice)");
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
  CSS.highlights.set("revealed", new Highlight(r));
  setTimeout(() => { if (n === current) CSS.highlights.delete("revealed"); }, HOLD_MS);
}

/** The passage of the conversation a pointer took, shown: the turn it is in scrolled to and its words lit. `before`, a
 *  turn: only what came before it is looked in (a sent pointer's passage was there when it was sent). Whether it was found. */
export async function revealPassage(quote: string, before: Element | null = null): Promise<boolean> {
  const log = document.querySelector('[data-pane="agent"] [role="log"]');
  if (!log) return false;
  let turns = [...log.querySelectorAll(".turn")];
  if (before) { const k = turns.indexOf(before); if (k >= 0) turns = turns.slice(0, k); }
  for (const t of turns.reverse()) {
    const r = findPassage(t, quote);
    if (!r) continue;
    const el = r.startContainer.parentElement ?? t;
    const n = ++current;
    await scrolled(el, log);
    if (n !== current) return true; // another was asked for while this one scrolled
    light(r);
    return true;
  }
  return false;
}
