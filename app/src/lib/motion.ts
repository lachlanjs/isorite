// Motion shared by the shell's parts (design audit 2026-11, (d)): the two durations of taste.md in milliseconds for
// Svelte's transitions, wrapped so that with reduced motion they take no time (the information stays, the movement
// goes), and a note's title carried from the list to its heading by the View Transitions API where there is one.
import { flip as svelteFlip } from "svelte/animate";
import { fade as svelteFade, fly as svelteFly, slide as svelteSlide } from "svelte/transition";
import { cubicIn, cubicOut } from "svelte/easing";
import { tick } from "svelte";

/** Acknowledge (a press, hover, focus) and change (open, close, swap), as `--dur-1` and `--dur-2` in app.css. */
export const DUR_1 = 120;
export const DUR_2 = 260;

/** Whether the person asked for less motion (read each time: it can change while the page is open). */
export const reduced = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Fade = Parameters<typeof svelteFade>[1];
type Fly = Parameters<typeof svelteFly>[1];
type Slide = Parameters<typeof svelteSlide>[1];
type Flip = Parameters<typeof svelteFlip>[2];

/** Words and items arrive by opacity alone, in the time of a change (taste: nothing slides in from nowhere). */
export function fadeIn(node: Element, o: Fade = {}) { return svelteFade(node, { duration: DUR_2, easing: cubicOut, ...o, ...(reduced() ? { duration: 0, delay: 0 } : {}) }); }
/** What floats (a menu, a popover) leaves quickly: down a few pixels and out, ease-in. */
export function flyOut(node: Element, o: Fly = {}) { return svelteFly(node, { y: 4, duration: DUR_1, easing: cubicIn, ...o, ...(reduced() ? { duration: 0, delay: 0 } : {}) }); }
/** What leaves the flow folds away: its height to nothing, ease-in, so what is below follows it. */
export function foldAway(node: Element, o: Slide = {}) { return svelteSlide(node, { duration: DUR_2, easing: cubicIn, ...o, ...(reduced() ? { duration: 0, delay: 0 } : {}) }); }
/** What opens in the flow grows to its height, ease-out. */
export function growOpen(node: Element, o: Slide = {}) { return svelteSlide(node, { duration: DUR_2, easing: cubicOut, ...o, ...(reduced() ? { duration: 0, delay: 0 } : {}) }); }
/** Items of a list glide to their new places when it is reordered; off when `o.duration` is 0 (a list narrowed by typing). */
export function glide(node: Element, from: { from: DOMRect; to: DOMRect }, o: Flip = {}) { return svelteFlip(node, from, { duration: DUR_2, easing: cubicOut, ...o, ...(reduced() ? { duration: 0 } : {}) }); }

// ------------------------------------------------------------ the title carried to the note, and a view swapped

type Transition = { finished: Promise<void> };
type Transitioning = Document & { startViewTransition?: (cb: () => Promise<void>) => Transition };

/** One view of a thing in place of another (a note's edit, read and source): the two crossfade, so the page never
 *  blanks between them. Where the browser cannot, or with reduced motion, it is simply changed. */
export function swap(update: () => void): void {
  const doc = document as Transitioning;
  if (!doc.startViewTransition || reduced()) { update(); return; }
  doc.startViewTransition(async () => { update(); await tick(); });
}

/** Until the note's heading is there (the note reads its file once the route has changed), for at most `ms`. By timers:
 *  no frame is drawn while a transition's update runs, so a frame callback would never come. */
function headed(ms: number): Promise<void> {
  return new Promise((done) => {
    const t0 = performance.now();
    const look = (): void => { if (document.querySelector(".note.ready .title") || performance.now() - t0 > ms) done(); else setTimeout(look, 16); };
    look();
  });
}

/** A navigation to a note from `from` (a list row's title, a link): with the View Transitions API, `from` is the old
 *  snapshot of `note-title` and the new note's heading the new one (app.css names it while `data-carrying` is on the
 *  root), so the title moves from where it was to the heading while the rest crossfades. `complete` resolves when the
 *  route has changed. Returns the promise SvelteKit's `onNavigate` waits on, or nothing where it cannot be done. */
export function carryTitle(from: HTMLElement | null, complete: Promise<void>): Promise<void> | undefined {
  const doc = document as Transitioning;
  if (!doc.startViewTransition || reduced() || !from?.isConnected) return undefined;
  return new Promise<void>((started) => {
    from.style.viewTransitionName = "note-title";
    const root = document.documentElement;
    const t = doc.startViewTransition!(async () => {
      from.style.viewTransitionName = "";
      root.dataset.carrying = "";
      started();
      await complete;
      await headed(160);
    });
    void t.finished.finally(() => { delete root.dataset.carrying; });
  });
}
