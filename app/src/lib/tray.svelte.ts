// What Iso is sent (M10, §7): the tray above Iso's box. Notes, folders and passages are put there by dragging or
// holding on the Atlas, by tapping in the Atlas's Iso lens, and by "send to Iso" on a selection in a note. Each can
// be taken out again. Nothing is put there that you did not put there, except the mode's own parts (Understand
// mode's Understanding notes), which are shown and can be taken out too.

import { app } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";

export type Part =
  | { kind: "note"; id: string; title: string }
  | { kind: "folder"; id: string; title: string }
  | { kind: "passage"; id: string; title: string; text: string }
  /** A note's Understanding note: put in by Understand mode itself, for each note in hand (M10). */
  | { kind: "understanding"; id: string; title: string };

const key = (p: Part): string => (p.kind === "passage" ? `passage:${p.id}:${p.text}` : `${p.kind}:${p.id}`);

class Tray {
  parts = $state.raw<Part[]>([]);
  /** The part last put in, for a moment: the tray shows it arriving. */
  fresh = $state("");
  /** A note or folder being carried from the Atlas, and whether it is over Iso's pane. */
  carrying = $state.raw<{ part: Part; over: boolean } | null>(null);

  has(kind: Part["kind"], id: string): boolean { return this.parts.some((p) => p.kind === kind && p.id === id); }
  /** Put a part in. Said where it came from, so a phone's Iso tab can count what it has not seen. */
  add(part: Part): boolean {
    if (this.parts.some((p) => key(p) === key(part))) return false;
    this.parts = [...this.parts, part];
    this.fresh = key(part);
    if (panes.focus !== "iso") panes.unseen++;
    return true;
  }
  remove(part: Part): void {
    if (part.kind === "understanding") { this.unwant(part.id); return; }
    this.parts = this.parts.filter((p) => key(p) !== key(part));
  }
  /** In if out, out if in: the Atlas's Iso lens. */
  toggle(part: Part): boolean {
    if (this.parts.some((p) => key(p) === key(part))) { this.remove(part); return false; }
    this.add(part);
    return true;
  }
  clear(): void { this.parts = []; }

  /** Understanding notes taken out while in Understand mode: not put back until the mode is left. */
  private notWanted = $state.raw<string[]>([]);
  /** Understand mode's own parts: the Understanding note of each note in the tray, and of the note open. */
  get modeParts(): Part[] {
    if (panes.mode !== "understand") return [];
    const ids = [...new Set([...this.parts.flatMap((p) => (p.kind === "note" || p.kind === "passage" ? [p.id] : [])), ...(app.open && !app.open.startsWith("@") ? [app.open] : [])])];
    return ids.filter((id) => !this.notWanted.includes(id)).map((id) => ({ kind: "understanding" as const, id, title: app.listing.notes.find((n) => n.id === id)?.title ?? id }));
  }
  /** Everything a turn is sent: what you put in, and the mode's own. */
  get sent(): Part[] { return [...this.parts, ...this.modeParts]; }
  /** Take one of the mode's own parts out. */
  unwant(id: string): void { this.notWanted = [...this.notWanted, id]; }
  /** Leaving Understand mode puts them all back for next time. */
  modeChanged(): void { this.notWanted = []; }
  keyOf = key;
}

export const tray = new Tray();
panes.onMode = () => tray.modeChanged();
