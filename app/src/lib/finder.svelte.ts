// Ctrl+K: find a note by a few words, on the Atlas. What matches is lit on the map as you type, by its words (dashed)
// and by its meaning (dotted), both (solid), and the rest steps back. Notes that are hidden are listed too, last.

import type { FindHit } from "@isorite/engine";
import { app } from "./app.svelte.ts";

class Finder {
  open = $state(false);
  query = $state("");
  hits = $state.raw<FindHit[]>([]);
  /** Where search by meaning stands: not on this device, still making its vectors, or ready. */
  meaning = $state<"on" | "pending" | "off">("on");
  /** The result the arrows are on. */
  at = $state(0);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private run = 0;

  /** The results, those on the map first, then those hidden (not prioritised). */
  get results(): (FindHit & { hidden: boolean })[] {
    const all = this.hits.map((h) => ({ ...h, hidden: app.isHidden(h.id) }));
    return [...all.filter((h) => !h.hidden), ...all.filter((h) => h.hidden)];
  }
  /** What the map lights: the notes found that are on it, and how. */
  get lit(): Map<string, FindHit["by"]> {
    return this.open && this.hits.length ? new Map(this.hits.filter((h) => !app.isHidden(h.id)).map((h) => [h.id, h.by])) : new Map();
  }
  /** The map is being searched. */
  get active(): boolean { return this.open && this.query.trim().length > 0; }

  show(): void { this.open = true; }
  hide(): void { this.open = false; this.query = ""; this.hits = []; this.at = 0; this.timers.forEach(clearTimeout); this.timers = []; this.run++; }

  /** Ask as typing goes: the words at once (they are quick), then words and meaning together. */
  ask(text: string): void {
    this.query = text;
    this.timers.forEach(clearTimeout); this.timers = [];
    const q = text.trim(), run = ++this.run;
    if (!q) { this.hits = []; this.at = 0; return; }
    this.timers.push(setTimeout(() => {
      void app.api.search(q).then((found) => { if (run === this.run) { this.hits = found.map((h) => ({ ...h, by: "words" as const })); this.at = 0; } }, () => undefined);
    }, 60));
    this.timers.push(setTimeout(() => {
      void app.api.find(q).then((f) => { if (run === this.run) { this.hits = f.hits; this.meaning = f.meaning; this.at = Math.min(this.at, Math.max(0, f.hits.length - 1)); } }, () => undefined);
    }, 220));
  }
}

export const finder = new Finder();
