// One note's journal as the page has it: its entries, oldest first, as they grow. They come from the engine and then
// from its events, so a second tab, or this one reopened, shows the same.

import type { Entry } from "@isorite/core";
import type { EngineEvent } from "@isorite/engine";
import { app } from "./app.svelte.ts";

export class NoteJournal {
  private readonly id: string;
  entries = $state.raw<Entry[]>([]);
  private stop: (() => void) | null = null;

  constructor(id: string) { this.id = id; }

  async open(): Promise<void> {
    this.stop = app.on((e) => this.hear(e));
    try { this.entries = await app.api.journal(this.id); } catch { /* shown when the next event comes */ }
  }
  close(): void { this.stop?.(); }

  private hear(e: EngineEvent): void {
    if (e.type !== "journal" || e.id !== this.id || this.entries.some((x) => x.id === e.entry.id)) return;
    this.entries = [...this.entries, e.entry];
  }
}
