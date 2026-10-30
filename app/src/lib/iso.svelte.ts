// Iso in one note: what it offered before M25 retired Iso's own loop, not kept yet, to keep or remove; and where the
// selection is, to send to the pane. Everything here comes from the note's journal and the engine's events, so a
// second tab, or this one reopened, shows the same. Places are lines and characters of the whole file.

import { blocks, findPassage, locate, pending, splitSource, type Entry, type Insert, type Rewrite } from "@isorite/core";
import type { EngineEvent } from "@isorite/engine";
import { app } from "./app.svelte.ts";
import type { NoteSession } from "./note.svelte.ts";

/** A stretch of the file, by character. */
export interface Span { from: number; to: number }

/** One block Iso has laid over the note, before a line. */
export interface Block { key: string; line: number }
/** One change a rewrite offers, where its passage is now. A change of more than one line (the old or the new) is
 *  shown as a block under its passage, since lines cannot be set inside a line; `code` says the passage is in a
 *  code block, so the new text is shown in the code's face with its indentation. */
export interface Change { key: string; proposal: Rewrite; k: number; at: Span | null; block: boolean; code: boolean }

export class NoteIso {
  private readonly note: NoteSession;
  /** The note's journal, oldest first, as it grows. */
  entries = $state.raw<Entry[]>([]);
  /** Why the last keep or removal came to nothing. */
  failed = $state.raw<{ line: number; message: string } | null>(null);
  /** Where the cursor or the selection last was: what is sent to the pane. */
  cursor = $state.raw<{ line: number; from: number; to: number } | null>(null);
  /** What is being kept or removed: its buttons wait. A proposal's id, or a change's key. */
  busy = $state("");
  /** Iso's text being edited before it is kept. */
  editing = $state<{ id: string; text: string } | null>(null);
  private stop: (() => void) | null = null;

  constructor(note: NoteSession) { this.note = note; }

  /** What Iso has offered here that is neither kept nor removed, oldest first. */
  private readonly waiting = $derived(pending(this.entries));
  /** Text it has offered: a block each. */
  readonly proposals = $derived(this.waiting.filter((p): p is Insert => p.form === "insert"));
  /** The changes its rewrites offer that are still waiting, each where its passage is now, in the order of the text. */
  readonly changes = $derived.by((): Change[] => {
    const out: Change[] = [], all = blocks(this.note.text);
    for (const p of this.waiting) {
      if (p.form !== "rewrite") continue;
      for (const k of p.open ?? []) {
        const r = p.regions[k]!, at = findPassage(this.note.text, r.old);
        const line = at ? this.note.text.slice(0, at.from).split("\n").length - 1 : -1;
        const inside = all.find((b) => b.from <= line && line < b.to);
        out.push({ key: `r:${p.id}:${k}`, proposal: p, k, at, block: /\n/.test(r.old.text.trim()) || /\n/.test(r.new.trim()), code: Boolean(inside && /^\s*(```|~~~)/.test(inside.text)) });
      }
    }
    return out.sort((a, b) => (a.at?.from ?? Infinity) - (b.at?.from ?? Infinity));
  });

  /** How much of the file is frontmatter, in lines and in characters: the editor shows the text under it. */
  readonly head = $derived.by(() => {
    try { const prefix = splitSource(this.note.text)[0]; return { lines: prefix.split("\n").length - 1, chars: prefix.length }; } catch { return { lines: 0, chars: 0 }; }
  });

  private get foot(): number { return this.note.text.split("\n").length; }

  placed(p: Insert): boolean { return locate(this.note.text, p) !== null; }

  /** Everything Iso has over the note, as the note now stands. */
  readonly layout = $derived.by((): { blocks: Block[]; old: Span[]; inline: { key: string; at: number }[] } => {
    const out: Block[] = [];
    for (const p of this.proposals) {
      const at = locate(this.note.text, p);
      out.push({ key: `p:${p.id}`, line: at?.form === "insert" ? at.line : this.foot });
    }
    // Changes whose passages were edited away cannot be set in the text: they are told of at the note's foot.
    if (this.changes.some((c) => !c.at)) out.push({ key: "lost", line: this.foot });
    if (this.failed) out.push({ key: "failed", line: this.failed.line });
    const placed = this.changes.filter((c) => c.at);
    // A change of several lines is a block under the last line of its passage.
    for (const c of placed) if (c.block) out.push({ key: c.key, line: this.note.text.slice(0, c.at!.to).split("\n").length });
    return {
      blocks: out,
      old: placed.map((c) => c.at!),
      inline: placed.filter((c) => !c.block).map((c) => ({ key: c.key, at: c.at!.to })),
    };
  });

  async open(): Promise<void> {
    this.stop = app.on((e) => this.hear(e));
    try { this.entries = await app.api.journal(this.note.id); } catch { /* shown when the next event comes */ }
  }
  close(): void { this.stop?.(); }

  private hear(e: EngineEvent): void {
    if (e.type !== "journal" || e.id !== this.note.id || this.entries.some((x) => x.id === e.entry.id)) return;
    this.entries = [...this.entries, e.entry];
    const settled = e.entry.kind === "discard" || e.entry.kind === "change" ? e.entry.proposal : undefined;
    if (settled && this.editing?.id === settled) this.editing = null;
  }

  // ------------------------------------------------------------ keeping and removing

  private say(line: number | undefined, e: unknown): void {
    this.failed = { line: line ?? this.foot, message: (e as Error).message };
  }
  private lineOf(p: Insert): number | undefined { return this.layout.blocks.find((b) => b.key === `p:${p.id}`)?.line; }

  /** Start editing Iso's text in place. */
  edit(p: Insert): void { this.editing = { id: p.id, text: p.text }; }

  /** Enter the edit in the journal, so it is there after a reload, and stop editing. */
  async done(p: Insert): Promise<void> {
    const edit = this.editing;
    if (edit?.id !== p.id) return;
    try {
      await app.api.revise(this.note.id, p.id, edit.text);
      this.editing = null;
    } catch (e) { this.say(this.lineOf(p), e); }
  }

  /** Keep Iso's text: with an edit in hand, the edit is what is kept. */
  async keep(p: Insert): Promise<void> {
    this.busy = p.id;
    try {
      await this.note.save();
      if (this.editing?.id === p.id) await this.done(p);
      this.note.adopt(await app.api.keep(this.note.id, p.id));
    } catch (e) { this.say(this.lineOf(p), e); } finally { this.busy = ""; }
  }

  async discard(p: Insert): Promise<void> {
    this.busy = p.id;
    try { await app.api.discard(this.note.id, p.id); } catch (e) { this.say(this.lineOf(p), e); } finally { this.busy = ""; }
  }

  /** Keep one change of a rewrite: its passage becomes the new text, and nothing else moves. */
  async keepChange(c: Change): Promise<void> {
    this.busy = c.key;
    try {
      await this.note.save();
      this.note.adopt(await app.api.keep(this.note.id, c.proposal.id, c.k));
    } catch (e) { this.say(undefined, e); } finally { this.busy = ""; }
  }

  async discardChange(c: Change): Promise<void> {
    this.busy = c.key;
    try { await app.api.discard(this.note.id, c.proposal.id, c.k); } catch (e) { this.say(undefined, e); } finally { this.busy = ""; }
  }

  /** Every change still waiting, kept or removed at once. Kept one by one from the end of the note backwards, so
   *  one whose passage has been edited away stops only itself. */
  async settleAll(keep: boolean): Promise<void> {
    this.busy = "all";
    try {
      if (keep) await this.note.save();
      for (const c of [...this.changes].reverse()) {
        if (keep && !c.at) continue;
        if (keep) this.note.adopt(await app.api.keep(this.note.id, c.proposal.id, c.k));
        else await app.api.discard(this.note.id, c.proposal.id, c.k);
      }
    } catch (e) { this.say(undefined, e); } finally { this.busy = ""; }
  }
}
