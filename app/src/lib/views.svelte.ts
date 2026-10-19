// Which views stand on the screen (V1): the Atlas, the note, or both side by side on a desktop, Atlas left and note
// right. The address says whether a note is open; `beside` says whether the Atlas stands beside it. The header's
// two buttons move between them by Lachlan's table (2026-10-19):
//
//   shown        atlas pressed   note pressed
//   note         both            atlas
//   atlas        note            both
//   both         note            atlas
//
// On a phone there is room for one, and the buttons switch between them. Remembered per browser: whether the Atlas
// stands beside a note, the note last open (what note opens from the Atlas alone, Q5), and where the divider is.

import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { noteHref } from "./app.svelte.ts";

const read = (key: string, fallback: string): string => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const keep = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* not kept */ } };

export type Shown = "atlas" | "note" | "both" | "";

class Views {
  /** The Atlas stands beside an open note (desktop only). */
  beside = $state(read("isorite.beside", "1") === "1");
  /** The note last open: what note opens to when none is. */
  last = $state(read("isorite.last", ""));
  /** The Atlas's share of the width when both stand, 0.2 to 0.8. */
  split = $state(Math.min(0.8, Math.max(0.2, Number(read("isorite.split", "0.45")) || 0.45)));
  /** A phone's width: one view at a time. */
  narrow = $state(false);

  setBeside(on: boolean): void { this.beside = on; keep("isorite.beside", on ? "1" : "0"); }
  setLast(id: string): void { if (id && !id.startsWith("@")) { this.last = id; keep("isorite.last", id); } }
  setSplit(share: number): void { this.split = Math.min(0.8, Math.max(0.2, share)); keep("isorite.split", String(this.split)); }

  /** What stands, from the route: a note's page, the Atlas's, or another (the list, study). */
  shown(route: string | null): Shown {
    if (route === "/atlas") return "atlas";
    if (route === "/n/[...id]" || route === "/draft/[id]") return this.beside && !this.narrow ? "both" : "note";
    return "";
  }

  /** The header's atlas button. `note` is what to open when the table asks for a note and none is open. */
  async atlas(now: Shown, note: string): Promise<void> {
    if (this.narrow) { if (now !== "atlas") await goto(resolve("/atlas")); return; }
    if (now === "note") this.setBeside(true);
    else if (now === "both") this.setBeside(false);
    else if (now === "atlas") { if (note) { this.setBeside(false); await this.open(note); } }
    else await goto(resolve("/atlas"));
  }

  /** The header's note button. */
  async note(now: Shown, note: string): Promise<void> {
    if (this.narrow) { if (now !== "note" && note) await this.open(note); return; }
    if (now === "note" || now === "both") await goto(resolve("/atlas"));
    else if (now === "atlas") { if (note) { this.setBeside(true); await this.open(note); } }
    else if (note) await this.open(note);
  }

  /** A note opened from the Atlas opens beside it (the table's atlas, then note). */
  async openFromAtlas(id: string): Promise<void> {
    if (!this.narrow) this.setBeside(true);
    await this.open(id);
  }

  // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
  private async open(id: string): Promise<void> { await goto(noteHref(id)); }
}

export const views = new Views();
