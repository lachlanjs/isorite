// The three panes (M10): Note, Atlas and Iso, "think, connect, build". On a desktop they stand side by side in one
// of three layouts; on a phone one stands at a time and the others are a swipe away. Each pane has switches in its
// header (M12, in place of M10's lenses and modes): what the Note pane and the Atlas show, and what Iso may do.
// Remembered per browser: the layout, which panes show, their widths, the switches, and the note last open (what
// the Note pane opens to when none is).

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
/** What Iso may do, as the engine names it: worked out from Iso's switches. */
export type Mode = "ask" | "write" | "build";

/** Each pane's switches (M12). Note: whose words are whose, and the timeline. Atlas: what Iso is sent and did.
 *  Iso: may it edit the notes, and with a terminal attached, the project's files, and run commands. */
export const SWITCHES = { note: ["provenance", "timeline"], atlas: ["questions", "problems", "web", "code", "context"], iso: ["notes", "files", "run"] } as const;
export type Switch = (typeof SWITCHES)[keyof typeof SWITCHES][number];
// The Atlas's kinds (M12): open questions and problems on the map from the first, links out of it when asked for.
const OFF: Record<Switch, boolean> = { provenance: false, timeline: false, questions: true, problems: true, web: false, code: false, context: false, notes: false, files: false, run: false };

/** The panes' relative widths when side by side. */
const WIDTHS = { note: 1.25, atlas: 1, iso: 1.05 };
const LIMIT = { min: 0.4, max: 3 };

class Panes {
  layout = $state<Layout>((LAYOUTS as readonly string[]).includes(read("isorite.layout", "")) ? read("isorite.layout", "") as Layout : "cols");
  show = $state<Record<Pane, boolean>>(json("isorite.show", { note: true, atlas: true, iso: true }));
  widths = $state<Record<Pane, number>>(json("isorite.widths", WIDTHS));
  on = $state<Record<Switch, boolean>>(json("isorite.switches", OFF));
  /** The Note pane shows the note's Understanding note in place of the note (the sprig in its header). */
  understanding = $state(read("isorite.understanding", "") === "1");
  /** The pane keys and new things go to. */
  focus = $state<Pane>("note");
  /** A phone's width: one pane at a time. */
  narrow = $state(false);
  /** Things sent to Iso from another pane since Iso's pane was last looked at (the phone's tab shows it). */
  unseen = $state(0);
  /** The notes, open over the note in the Note pane. */
  tree = $state(false);
  /** A note just made from the Atlas: it opens with its title chosen, to type over (V6). */
  fresh = $state("");
  /** The pane whose settings are open, under its header (M10b: the header's menu, split by pane). */
  settings = $state<Pane | null>(null);
  /** The note last open: what the Note pane opens to when none is. */
  last = $state(read("isorite.last", ""));

  /** Which panes stand: on a desktop the layout decides, on a phone all three are in the row. */
  get standing(): Pane[] {
    if (this.narrow) return [...PANES];
    const shown = PANES.filter((p) => this.show[p]);
    return this.layout === "one" ? [shown.includes(this.focus) ? this.focus : shown[0] ?? "note"] : shown;
  }

  /** How many times the layout has been changed (the tutorial watches it). */
  layoutChanges = 0;
  setLayout(l: Layout): void { if (l !== this.layout) this.layoutChanges++; this.layout = l; keep("isorite.layout", l); }
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

  flip(k: Switch, to = !this.on[k]): void {
    this.on[k] = to;
    keep("isorite.switches", JSON.stringify(this.on));
    if (k === "notes" || k === "files" || k === "run") this.onMode?.();
  }
  showUnderstanding(to = !this.understanding): void { this.understanding = to; keep("isorite.understanding", to ? "1" : ""); this.onMode?.(); }

  /** Whether you are working in a pane: typing in it. */
  busy(p: Pane): boolean {
    const el = typeof document === "undefined" ? null : document.activeElement;
    return !!el && !!el.closest(`[data-pane="${p}"]`) && (el.matches("input, textarea, [contenteditable=true]") || !!el.closest(".cm-editor"));
  }

  /** A terminal is attached (M11): Iso's files and run switches are offered, and with either on, what is asked
   *  goes to the terminal's session (Q47). */
  terminal = $state(false);
  setTerminal(on: boolean): void { this.terminal = on; }
  /** What Iso may do now. */
  get mode(): Mode { return this.terminal && (this.on.files || this.on.run) ? "build" : this.on.notes ? "write" : "ask"; }
  /** Set by the tray: what a change of what Iso may do, or of the Understanding note shown, does to what Iso is sent. */
  onMode: (() => void) | null = null;

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
