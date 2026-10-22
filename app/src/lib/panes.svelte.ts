// The three panes (M10): Note, Atlas and Iso, "think, connect, build". On a desktop they stand side by side in one
// of three layouts; on a phone one stands at a time and the others are a swipe away. Note and Atlas each have a lens
// (what is shown); Iso's pane has a mode (what Iso may do). Remembered per browser: the layout, which panes show,
// their widths, each lens, Iso's mode, and the note last open (what the Note pane opens to when none is).

import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { noteHref } from "./app.svelte.ts";

const read = (key: string, fallback: string): string => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const keep = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* not kept */ } };
const json = <T>(key: string, fallback: T): T => { try { return { ...fallback, ...JSON.parse(read(key, "{}")) }; } catch { return fallback; } };

export const PANES = ["note", "atlas", "iso"] as const;
export type Pane = (typeof PANES)[number];
export const LAYOUTS = ["cols", "stack", "one"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LENSES = ["normal", "iso", "understand"] as const;
export type Lens = (typeof LENSES)[number];
export const MODES = ["ask", "write", "build", "understand"] as const;
export type Mode = (typeof MODES)[number];

/** What each of Iso's modes may do, in a line (shown above Iso's box). */
export const ALLOWS: Record<Mode, string> = {
  ask: "reads the knowledge base · changes nothing",
  write: "reads and writes the knowledge base · you see each change",
  build: "reads, writes and runs the project · reads and writes the knowledge base",
  understand: "reads the knowledge base · writes the study base",
};

/** The panes' relative widths when side by side. */
const WIDTHS = { note: 1.25, atlas: 1, iso: 1.05 };
const LIMIT = { min: 0.4, max: 3 };

class Panes {
  layout = $state<Layout>((LAYOUTS as readonly string[]).includes(read("isorite.layout", "")) ? read("isorite.layout", "") as Layout : "cols");
  show = $state<Record<Pane, boolean>>(json("isorite.show", { note: true, atlas: true, iso: true }));
  widths = $state<Record<Pane, number>>(json("isorite.widths", WIDTHS));
  lens = $state<Record<"note" | "atlas", Lens>>(json("isorite.lens", { note: "normal" as Lens, atlas: "normal" as Lens }));
  mode = $state<Mode>((MODES as readonly string[]).includes(read("isorite.mode", "")) ? read("isorite.mode", "") as Mode : "ask");
  /** The pane keys and new things go to. */
  focus = $state<Pane>("note");
  /** A phone's width: one pane at a time. */
  narrow = $state(false);
  /** A lens Iso would show in a pane you are working in: lit, not switched to (agreed 2026-10-22). */
  waiting = $state<Partial<Record<"note" | "atlas", Lens>>>({});
  /** Things sent to Iso from another pane since Iso's pane was last looked at (the phone's tab shows it). */
  unseen = $state(0);
  /** The note last open: what the Note pane opens to when none is. */
  last = $state(read("isorite.last", ""));

  /** Which panes stand: on a desktop the layout decides, on a phone all three are in the row. */
  get standing(): Pane[] {
    if (this.narrow) return [...PANES];
    const shown = PANES.filter((p) => this.show[p]);
    return this.layout === "one" ? [shown.includes(this.focus) ? this.focus : shown[0] ?? "note"] : shown;
  }

  setLayout(l: Layout): void { this.layout = l; keep("isorite.layout", l); }
  nextLayout(): void { this.setLayout(LAYOUTS[(LAYOUTS.indexOf(this.layout) + 1) % LAYOUTS.length]!); }
  toggle(p: Pane): void {
    // One pane always stands.
    if (this.show[p] && PANES.filter((x) => this.show[x]).length === 1) return;
    this.show[p] = !this.show[p];
    keep("isorite.show", JSON.stringify(this.show));
    if (!this.show[p] && this.focus === p) this.focus = PANES.find((x) => this.show[x])!;
  }
  setWidth(p: Pane, w: number): void { this.widths[p] = Math.min(LIMIT.max, Math.max(LIMIT.min, w)); keep("isorite.widths", JSON.stringify(this.widths)); }

  /** Focus a pane: shown if hidden, and on a phone scrolled to. */
  to(p: Pane): void {
    if (!this.narrow && !this.show[p]) this.toggle(p);
    this.focus = p;
    if (p === "iso") this.unseen = 0;
    this.scroll?.(p);
  }
  /** Set by the shell: brings a pane into view on a phone. */
  scroll: ((p: Pane) => void) | null = null;
  step(by: number): void {
    const s = this.narrow ? [...PANES] : PANES.filter((p) => this.show[p]);
    const i = s.indexOf(this.focus);
    this.to(s[(i + by + s.length) % s.length]!);
  }

  setLens(p: "note" | "atlas", l: Lens): void { this.lens[p] = l; delete this.waiting[p]; keep("isorite.lens", JSON.stringify(this.lens)); }
  stepLens(p: "note" | "atlas", by: number): void { this.setLens(p, LENSES[(LENSES.indexOf(this.lens[p]) + by + LENSES.length) % LENSES.length]!); }
  /** Iso wants a pane in a lens to show what it did. A pane you are working in is lit instead of switched. */
  want(p: "note" | "atlas", l: Lens, busy: boolean): void {
    if (this.lens[p] === l) return;
    if (busy) this.waiting[p] = l; else this.setLens(p, l);
  }

  /** Modes the base allows: Build needs a project (M11). */
  modes: Mode[] = ["ask", "write", "understand"];
  setMode(m: Mode): void { this.mode = m; keep("isorite.mode", m); }
  stepMode(by: number): void { const ms = this.modes; this.setMode(ms[(ms.indexOf(this.mode) + by + ms.length) % ms.length]!); }

  setLast(id: string): void { if (id && !id.startsWith("@")) { this.last = id; keep("isorite.last", id); } }

  /** Open a note in the Note pane; on a phone the Note pane comes into view. */
  async open(id: string, focus = this.narrow): Promise<void> {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
    await goto(noteHref(id));
    if (focus) this.to("note");
  }
  /** The Note pane's own start, when no note is open: the notes. */
  async home(): Promise<void> { await goto(resolve("/notes")); }
}

export const panes = new Panes();
