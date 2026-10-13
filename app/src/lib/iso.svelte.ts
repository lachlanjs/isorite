// Iso in one note: what it has offered that is not kept yet, what it is
// writing now, and the prompt being written to it. Everything here comes from
// the note's journal and the engine's events, so a second tab, or this one
// reopened, shows the same.

import { blocks, insertAt, locate, pending, splitSource, type Entry, type Proposal } from "@isorite/core";
import type { EngineEvent, Step, Tier } from "@isorite/engine";
import { app } from "./app.svelte.ts";
import type { NoteSession } from "./note.svelte.ts";

/** A request that is running. */
export interface Asking { request: string; asked: string; line: number; text: string; steps: Step[] }

const TIERS: Tier[] = ["low", "mid", "max"];
function remembered(): Tier {
  try { const t = localStorage.getItem("isorite.tier") as Tier | null; if (t && TIERS.includes(t)) return t; } catch { /* the usual one */ }
  return "mid";
}

export class NoteIso {
  private readonly note: NoteSession;
  private entries = $state.raw<Entry[]>([]);
  /** The line (of the whole file) a prompt is being written for, or null. */
  prompt = $state<number | null>(null);
  asking = $state<Asking | null>(null);
  /** Why the last request came to nothing. */
  failed = $state<{ line: number; message: string } | null>(null);
  tier = $state<Tier>(remembered());
  /** The line of the whole file the cursor was last on: where the phone's prompt field asks. */
  cursor = $state<number | null>(null);
  /** A proposal being kept or removed: its buttons wait. */
  busy = $state("");
  private stop: (() => void) | null = null;

  constructor(note: NoteSession) { this.note = note; }

  /** What Iso has offered here that is neither kept nor removed, oldest first. */
  readonly proposals = $derived(pending(this.entries));

  /** How many lines of the file are frontmatter: the editor shows the text under it. */
  readonly head = $derived.by(() => {
    try { return splitSource(this.note.text)[0].split("\n").length - 1; } catch { return 0; }
  });

  /** The line of the whole file a proposal sits before, as the note now is; at the note's foot when its place is gone. */
  lineOf(p: Proposal): number {
    const at = locate(this.note.text, p);
    return at?.form === "insert" ? at.line : this.note.text.split("\n").length;
  }
  placed(p: Proposal): boolean { return locate(this.note.text, p) !== null; }

  async open(): Promise<void> {
    this.stop = app.on((e) => this.hear(e));
    try { this.entries = await app.api.journal(this.note.id); } catch { /* shown when the next event comes */ }
  }
  close(): void { this.stop?.(); }

  private hear(e: EngineEvent): void {
    if (e.type === "journal") { if (e.id === this.note.id && !this.entries.some((x) => x.id === e.entry.id)) this.entries = [...this.entries, e.entry]; return; }
    if (e.type === "note-changed" || e.note !== this.note.id) return;
    if (e.type === "iso-start") {
      const at = locate(this.note.text, { form: "insert", after: e.after, before: e.before } as Proposal);
      this.asking = { request: e.request, asked: e.asked, line: at?.form === "insert" ? at.line : this.note.text.split("\n").length, text: "", steps: [] };
      this.failed = null;
      this.prompt = null;
      return;
    }
    const a = this.asking;
    if (!a || a.request !== e.request) return;
    if (e.type === "iso-text") this.asking = { ...a, text: e.again ? e.delta : a.text + e.delta };
    else if (e.type === "iso-step") this.asking = { ...a, text: "", steps: [...a.steps, e.step] };
    else if (e.type === "iso-failed") { this.failed = { line: a.line, message: e.message }; this.asking = null; }
    else this.asking = null; // done (the proposal has arrived by the journal) or stopped
  }

  /** Open the prompt line under the block the given line of the file is in. */
  promptAt(line: number): void {
    const inside = blocks(this.note.text).find((b) => b.from <= line && line < b.to);
    this.prompt = inside ? inside.to : line;
    this.failed = null;
  }

  /** Open the prompt line where the cursor last was, or at the note's foot. */
  promptHere(): void { this.promptAt(this.cursor ?? this.note.text.split("\n").length); }

  setTier(tier: Tier): void {
    this.tier = tier;
    try { localStorage.setItem("isorite.tier", tier); } catch { /* not kept */ }
  }

  /** Send the prompt. The note is saved first: Iso reads the file. */
  async ask(asked: string): Promise<void> {
    const line = this.prompt;
    if (line === null || !asked.trim() || this.asking) return;
    try {
      await this.note.save();
      await app.api.ask({ note: this.note.id, ...insertAt(this.note.text, line), asked, tier: this.tier });
    } catch (e) {
      this.failed = { line, message: (e as Error).message };
      this.prompt = null;
    }
  }

  halt(): void { if (this.asking) void app.api.stop(this.asking.request); }

  async keep(p: Proposal, edited?: string): Promise<void> {
    this.busy = p.id;
    try {
      await this.note.save();
      if (edited !== undefined && p.form === "insert" && edited !== p.text) await app.api.revise(this.note.id, p.id, edited);
      this.note.adopt(await app.api.keep(this.note.id, p.id));
    } catch (e) { this.failed = { line: this.lineOf(p), message: (e as Error).message }; } finally { this.busy = ""; }
  }

  async revise(p: Proposal, text: string): Promise<void> {
    try { await app.api.revise(this.note.id, p.id, text); } catch (e) { this.failed = { line: this.lineOf(p), message: (e as Error).message }; }
  }

  async discard(p: Proposal): Promise<void> {
    this.busy = p.id;
    try { await app.api.discard(this.note.id, p.id); } catch (e) { this.failed = { line: this.lineOf(p), message: (e as Error).message }; } finally { this.busy = ""; }
  }
}
