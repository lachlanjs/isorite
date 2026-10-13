// Iso in one note: what it has offered that is not kept yet, what it is
// writing now, and the prompt being written to it. Everything here comes from
// the note's journal and the engine's events, so a second tab, or this one
// reopened, shows the same.

import { anchorOf, blocks, findAnchor, insertAt, locate, pending, splitSource, type Anchor, type Entry, type Proposal } from "@isorite/core";
import type { EngineEvent, Step, Tier } from "@isorite/engine";
import { app } from "./app.svelte.ts";
import type { NoteSession } from "./note.svelte.ts";

/** Lines of the whole file, from `from` up to but not including `to`. */
export interface Lines { from: number; to: number }

/** A prompt being written: where Iso's block will sit, and, for a rewrite, the paragraphs chosen. */
export interface Prompt { line: number; picked: Lines[] }
/** A request that is running. */
export interface Asking { request: string; asked: string; line: number; picked: Lines[]; text: string; steps: Step[] }
/** One block Iso has laid over the note, before a line of the whole file. */
export interface Block { key: string; line: number }

const TIERS: Tier[] = ["low", "mid", "max"];
function remembered(): Tier {
  try { const t = localStorage.getItem("isorite.tier") as Tier | null; if (t && TIERS.includes(t)) return t; } catch { /* the usual one */ }
  return "mid";
}

export class NoteIso {
  private readonly note: NoteSession;
  private entries = $state.raw<Entry[]>([]);
  prompt = $state.raw<Prompt | null>(null);
  asking = $state.raw<Asking | null>(null);
  /** Why the last request came to nothing. */
  failed = $state.raw<{ line: number; message: string } | null>(null);
  tier = $state<Tier>(remembered());
  /** The lines of the whole file the cursor or selection was last on: where the phone's prompt field asks. */
  cursor = $state.raw<Lines | null>(null);
  /** A proposal being kept or removed: its buttons wait. */
  busy = $state("");
  /** A proposal being edited before it is kept: its text, or for a rewrite the text of each block. */
  editing = $state<{ id: string; texts: string[] } | null>(null);
  private stop: (() => void) | null = null;

  constructor(note: NoteSession) { this.note = note; }

  /** What Iso has offered here that is neither kept nor removed, oldest first. */
  readonly proposals = $derived(pending(this.entries));

  /** How many lines of the file are frontmatter: the editor shows the text under it. */
  readonly head = $derived.by(() => {
    try { return splitSource(this.note.text)[0].split("\n").length - 1; } catch { return 0; }
  });

  private get foot(): number { return this.note.text.split("\n").length; }

  /** For a rewrite: each block it changes, where the old one is now (null when its place is gone), in order. */
  changes(p: Proposal): { k: number; old: Lines | null; text: string }[] {
    if (p.form !== "rewrite") return [];
    const at = locate(this.note.text, p), all = blocks(this.note.text);
    return p.blocks.flatMap((b, k) => {
      const now = at?.form === "rewrite" ? at.blocks[k]! : null;
      const was = now ? all.find((x) => x.from === now.from)?.text : b.old.text;
      return b.new === was ? [] : [{ k, old: now ? { from: now.from, to: now.to } : null, text: b.new }];
    });
  }
  placed(p: Proposal): boolean { return locate(this.note.text, p) !== null; }

  /** Every block Iso has in the note, and the lines of the note it marks, as the note now stands. */
  readonly layout = $derived.by((): { blocks: Block[]; picked: Lines[]; old: Lines[] } => {
    const out: Block[] = [], old: Lines[] = [];
    for (const p of this.proposals) {
      if (p.form === "insert") {
        const at = locate(this.note.text, p);
        out.push({ key: `p:${p.id}`, line: at?.form === "insert" ? at.line : this.foot });
        continue;
      }
      // A rewrite: each new block sits under the block it would replace, which is struck through.
      for (const c of this.changes(p)) {
        out.push({ key: `p:${p.id}:${c.k}`, line: c.old ? c.old.to : this.foot });
        if (c.old) old.push(c.old);
      }
    }
    if (this.asking) out.push({ key: "asking", line: this.asking.line });
    if (this.failed) out.push({ key: "failed", line: this.failed.line });
    if (this.prompt) out.push({ key: "prompt", line: this.prompt.line });
    return { blocks: out, picked: this.prompt?.picked ?? this.asking?.picked ?? [], old };
  });

  async open(): Promise<void> {
    this.stop = app.on((e) => this.hear(e));
    try { this.entries = await app.api.journal(this.note.id); } catch { /* shown when the next event comes */ }
  }
  close(): void { this.stop?.(); }

  /** The lines the blocks named by these anchors are on now. */
  private linesOf(anchors: Anchor[]): Lines[] {
    const all = blocks(this.note.text);
    return anchors.flatMap((a) => { const k = findAnchor(all, a); return k < 0 ? [] : [{ from: all[k]!.from, to: all[k]!.to }]; });
  }

  private hear(e: EngineEvent): void {
    if (e.type === "journal") {
      if (e.id !== this.note.id || this.entries.some((x) => x.id === e.entry.id)) return;
      this.entries = [...this.entries, e.entry];
      const settled = e.entry.kind === "discard" || e.entry.kind === "change" ? e.entry.proposal : undefined;
      if (settled && this.editing?.id === settled) this.editing = null;
      return;
    }
    if (e.type === "note-changed" || e.type === "record" || e.note !== this.note.id) return;
    if (e.type === "iso-start") {
      // Sent from here: the block is up already and now learns its request's id. Sent from another tab: it is put up.
      if (this.asking && !this.asking.request) { this.asking = { ...this.asking, request: e.request }; return; }
      let line = this.foot, picked: Lines[] = [];
      if (e.place.form === "insert") {
        const at = locate(this.note.text, { form: "insert", after: e.place.after, before: e.place.before } as Proposal);
        if (at?.form === "insert") line = at.line;
      } else {
        picked = this.linesOf(e.place.blocks);
        if (picked.length) line = picked.at(-1)!.to;
      }
      this.asking = { request: e.request, asked: e.asked, line, picked, text: "", steps: [] };
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

  /** Open the prompt line. A bare cursor asks for new text under the block it is in; a selection asks for a
   *  rewrite of every block it touches. Lines are of the whole file, from 0, `to` included. */
  promptAt(from: number, to = from, selection = false): void {
    const all = blocks(this.note.text);
    this.failed = null;
    if (selection) {
      const picked = all.filter((b) => b.from <= to && from < b.to).map((b) => ({ from: b.from, to: b.to }));
      if (picked.length) { this.prompt = { line: picked.at(-1)!.to, picked }; return; }
    }
    const inside = all.find((b) => b.from <= to && to < b.to);
    this.prompt = { line: inside ? inside.to : to, picked: [] };
  }

  /** Open the prompt line where the cursor or the selection last was, or at the note's foot. */
  promptHere(): void {
    const c = this.cursor;
    if (!c) this.promptAt(this.foot);
    else if (c.to > c.from) this.promptAt(c.from, c.to - 1, true); // a selection: `to` is the line after its last
    else this.promptAt(c.from);
  }

  setTier(tier: Tier): void {
    this.tier = tier;
    try { localStorage.setItem("isorite.tier", tier); } catch { /* not kept */ }
  }

  /** Send the prompt. The note is saved first: Iso reads the file. */
  async ask(asked: string): Promise<void> {
    const prompt = this.prompt;
    if (!prompt || !asked.trim() || this.asking) return;
    // The prompt line gives way to Iso's block at once, before anything is awaited: a second Enter finds no
    // prompt to send. (Waiting for the engine's word that it had started let a prompt be sent twice.)
    this.prompt = null;
    this.failed = null;
    this.asking = { request: "", asked, line: prompt.line, picked: prompt.picked, text: "", steps: [] };
    try {
      await this.note.save();
      const text = this.note.text, all = blocks(text);
      const place = prompt.picked.length
        ? { form: "rewrite" as const, blocks: prompt.picked.flatMap((l) => { const k = all.findIndex((b) => b.from === l.from); return k < 0 ? [] : [anchorOf(all, k)]; }) }
        : insertAt(text, prompt.line);
      const { request } = await app.api.ask({ note: this.note.id, ...place, asked, tier: this.tier });
      if (this.asking && !this.asking.request) this.asking = { ...this.asking, request };
    } catch (e) {
      this.asking = null;
      this.failed = { line: prompt.line, message: (e as Error).message };
    }
  }

  /** Stop the request. One that has not been answered with its id yet is stopped as soon as it is. */
  halt(): void {
    const a = this.asking;
    if (!a) return;
    if (a.request) { void app.api.stop(a.request); return; }
    const stop = app.on((e) => { if (e.type === "iso-start" && e.note === this.note.id) { stop(); void app.api.stop(e.request); } });
  }

  private say(p: Proposal, e: unknown): void {
    const at = this.layout.blocks.find((b) => b.key.startsWith(`p:${p.id}`));
    this.failed = { line: at?.line ?? this.foot, message: (e as Error).message };
  }

  /** Start editing a proposal in place. */
  edit(p: Proposal): void {
    this.editing = { id: p.id, texts: p.form === "insert" ? [p.text] : p.blocks.map((b) => b.new) };
  }

  /** Enter the edit in the journal, so it is there after a reload, and stop editing. */
  async done(p: Proposal): Promise<void> {
    const edit = this.editing;
    if (edit?.id !== p.id) return;
    try {
      await app.api.revise(this.note.id, p.id, p.form === "insert" ? edit.texts[0]! : $state.snapshot(edit.texts));
      this.editing = null;
    } catch (e) { this.say(p, e); }
  }

  /** Keep a proposal: with an edit in hand, the edit is what is kept. */
  async keep(p: Proposal): Promise<void> {
    this.busy = p.id;
    try {
      await this.note.save();
      if (this.editing?.id === p.id) await this.done(p);
      this.note.adopt(await app.api.keep(this.note.id, p.id));
    } catch (e) { this.say(p, e); } finally { this.busy = ""; }
  }

  async discard(p: Proposal): Promise<void> {
    this.busy = p.id;
    try { await app.api.discard(this.note.id, p.id); } catch (e) { this.say(p, e); } finally { this.busy = ""; }
  }
}
