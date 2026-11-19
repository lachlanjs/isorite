// Ctrl+K: find a note by a few words, on the Atlas. What matches is lit on the map as you type, by its words (dashed)
// and by its meaning (dotted), both (solid), and the rest steps back. Notes that are hidden are listed too, last. With a
// lens chosen it looks in what the lens shows (or one island of it), unless widened to every note (docs/lenses.md).

import { FOLDERS_LENS } from "@isorite/core";
import type { FindHit, SearchScope } from "@isorite/engine";
import { app } from "./app.svelte.ts";

class Finder {
  open = $state(false);
  query = $state("");
  hits = $state.raw<FindHit[]>([]);
  /** Where search by meaning stands: not on this device, still making its vectors, or ready. */
  meaning = $state<"on" | "pending" | "off">("on");
  /** Where it looks with a lens chosen: the lens, one island of it (by its path of names), or every note. */
  within = $state<{ island: string; all: boolean }>({ island: "", all: false });
  /** The scope sent with a search: none for the folders. */
  get scope(): SearchScope | undefined {
    if (!app.lens || app.lensName === FOLDERS_LENS) return undefined;
    return this.within.all ? { lens: app.lensName, all: true } : { lens: app.lensName, ...(this.within.island ? { island: this.within.island } : {}) };
  }
  /** Look elsewhere, and ask again for what is typed. */
  narrow(island: string, all: boolean): void { this.within = { island, all }; if (this.query.trim()) this.ask(this.query); }
  /** The result the arrows are on. */
  at = $state(0);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private run = 0;

  /** The results, those on the map first, then those hidden (not prioritised). */
  get results(): (FindHit & { hidden: boolean })[] {
    const all = this.hits.map((h) => ({ ...h, hidden: h.hidden ?? app.isHidden(h.id) }));
    return [...all.filter((h) => !h.hidden), ...all.filter((h) => h.hidden)];
  }
  /** What the map lights: the notes found that are on it, and how. */
  get lit(): Map<string, FindHit["by"]> {
    return this.open && this.hits.length ? new Map(this.hits.filter((h) => !(h.hidden ?? app.isHidden(h.id))).map((h) => [h.id, h.by])) : new Map();
  }
  /** The map is being searched. */
  get active(): boolean { return this.open && this.query.trim().length > 0; }

  show(): void { this.open = true; }
  hide(): void { this.within = { island: "", all: false }; this.open = false; this.query = ""; this.hits = []; this.at = 0; this.timers.forEach(clearTimeout); this.timers = []; this.run++; }

  /** Ask as typing goes: the words at once (they are quick), then words and meaning together. */
  ask(text: string): void {
    this.query = text;
    this.timers.forEach(clearTimeout); this.timers = [];
    const q = text.trim(), run = ++this.run, scope = this.scope;
    if (!q) { this.hits = []; this.at = 0; return; }
    this.timers.push(setTimeout(() => {
      void app.api.search(q, scope).then((found) => { if (run === this.run) { this.hits = found.map((h) => ({ ...h, by: "words" as const })); this.at = 0; } }, () => undefined);
    }, 60));
    this.timers.push(setTimeout(() => {
      void app.api.find(q, scope).then((f) => { if (run === this.run) { this.hits = f.hits; this.meaning = f.meaning; this.at = Math.min(this.at, Math.max(0, f.hits.length - 1)); } }, () => undefined);
    }, 220));
  }
}

export const finder = new Finder();
