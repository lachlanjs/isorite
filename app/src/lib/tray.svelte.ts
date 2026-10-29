// What Iso is sent (M10, §7): the tray above Iso's box. Notes, folders and passages are put there by dragging or
// holding on the Atlas, by tapping in the Atlas's Iso lens, and by "send to Iso" on a selection in a note. Each can
// be taken out again. Nothing is put there that you did not put there.

import { app } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";

export type Part =
  | { kind: "note"; id: string; title: string }
  | { kind: "folder"; id: string; title: string }
  | { kind: "passage"; id: string; title: string; text: string };

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
    this.parts = this.parts.filter((p) => key(p) !== key(part));
  }
  /** In if out, out if in: the Atlas's Iso lens. */
  toggle(part: Part): boolean {
    if (this.parts.some((p) => key(p) === key(part))) { this.remove(part); return false; }
    this.add(part);
    return true;
  }
  clear(): void { this.parts = []; }

  /** Everything a turn is sent. */
  get sent(): Part[] { return this.parts; }
  keyOf = key;
}

export const tray = new Tray();
