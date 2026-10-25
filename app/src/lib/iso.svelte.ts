// Iso in one note: what it has offered that is not kept yet, what it is
// writing now, and the prompt being written to it. Everything here comes from
// the note's journal and the engine's events, so a second tab, or this one
// reopened, shows the same. Places are lines and characters of the whole file.

import { blocks, findPassage, insertAt, locate, passageOf, pending, splitSource, type Entry, type Insert, type Passage, type Proposal, type Rewrite } from "@isorite/core";
import type { EngineEvent, Step, Tier } from "@isorite/engine";
import { app } from "./app.svelte.ts";
import { context } from "./context.svelte.ts";
import type { NoteSession } from "./note.svelte.ts";

/** A stretch of the file, by character. */
export interface Span { from: number; to: number }

/** A prompt being written: where Iso's block will sit, and whether it asks for new text there or for a rewrite
 *  of the passages chosen. */
export interface Prompt { line: number; mode: "insert" | "rewrite"; regions: Passage[] }
/** A request that is running. */
export interface Asking { request: string; asked: string; line: number; regions: Passage[]; text: string; steps: Step[] }
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
  prompt = $state.raw<Prompt | null>(null);
  asking = $state.raw<Asking | null>(null);
  /** Why the last request came to nothing. */
  failed = $state.raw<{ line: number; message: string } | null>(null);
  /** How able a model Iso is asked with: one choice for every note, made in the context panel (Q8). */
  get tier(): Tier { return context.tier; }
  /** Where the cursor or the selection last was: where the phone's prompt field asks. */
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
  private spans(regions: Passage[]): Span[] { return regions.flatMap((r) => { const at = findPassage(this.note.text, r); return at ? [at] : []; }); }

  placed(p: Insert): boolean { return locate(this.note.text, p) !== null; }

  /** Everything Iso has over the note, as the note now stands. */
  readonly layout = $derived.by((): { blocks: Block[]; picked: Span[]; old: Span[]; inline: { key: string; at: number }[] } => {
    const out: Block[] = [];
    for (const p of this.proposals) {
      const at = locate(this.note.text, p);
      out.push({ key: `p:${p.id}`, line: at?.form === "insert" ? at.line : this.foot });
    }
    // Changes whose passages were edited away cannot be set in the text: they are told of at the note's foot.
    if (this.changes.some((c) => !c.at)) out.push({ key: "lost", line: this.foot });
    if (this.asking) out.push({ key: "asking", line: this.asking.line });
    if (this.failed) out.push({ key: "failed", line: this.failed.line });
    if (this.prompt) out.push({ key: "prompt", line: this.prompt.line });
    const placed = this.changes.filter((c) => c.at);
    // A change of several lines is a block under the last line of its passage.
    for (const c of placed) if (c.block) out.push({ key: c.key, line: this.note.text.slice(0, c.at!.to).split("\n").length });
    return {
      blocks: out,
      picked: this.spans(this.prompt?.regions ?? this.asking?.regions ?? []),
      old: placed.map((c) => c.at!),
      inline: placed.filter((c) => !c.block).map((c) => ({ key: c.key, at: c.at!.to })),
    };
  });

  async open(): Promise<void> {
    this.stop = app.on((e) => this.hear(e));
    // A request still running here from before this page opened (back from the Atlas on a phone, say): taken up as
    // it stands, its steps and what it has written so far.
    const run = app.iso;
    if (run?.start && run.note === this.note.id && (run.state === "reading" || run.state === "writing")) {
      this.hear(run.start);
      if (this.asking) this.asking = { ...this.asking, text: run.text ?? "", steps: run.steps };
    }
    try { this.entries = await app.api.journal(this.note.id); } catch { /* shown when the next event comes */ }
  }
  close(): void { this.stop?.(); }

  private hear(e: EngineEvent): void {
    if (e.type === "journal") {
      if (e.id !== this.note.id || this.entries.some((x) => x.id === e.entry.id)) return;
      this.entries = [...this.entries, e.entry];
      const settled = e.entry.kind === "discard" || e.entry.kind === "change" ? e.entry.proposal : undefined;
      if (settled && this.editing?.id === settled) this.editing = null;
      return;
    }
    if (e.type === "note-changed" || e.type === "record" || e.type === "agent-sent" || !("note" in e) || e.note !== this.note.id) return;
    if (e.type === "iso-start") {
      // Sent from here: the block is up already and now learns its request's id. Sent from another tab: it is put up.
      if (this.asking && !this.asking.request) { this.asking = { ...this.asking, request: e.request }; return; }
      let line = this.foot;
      if (e.place.form === "insert" || e.place.form === "rewrite") {
        const at = locate(this.note.text, { form: "insert", after: e.place.after, before: e.place.before } as Proposal);
        if (at?.form === "insert") line = at.line;
      }
      this.asking = { request: e.request, asked: e.asked, line, regions: e.place.form === "rewrite" ? e.place.regions : [], text: "", steps: [] };
      this.failed = null;
      this.prompt = null;
      return;
    }
    const a = this.asking;
    if (!a || a.request !== e.request) return;
    if (e.type === "iso-text") this.asking = { ...a, text: e.again ? e.delta : a.text + e.delta };
    else if (e.type === "iso-step") this.asking = { ...a, text: "", steps: [...a.steps, e.step] };
    else if (e.type === "iso-failed") { this.failed = { line: a.line, message: e.message }; this.asking = null; }
    else this.asking = null; // done (what it offers has arrived by the journal) or stopped
  }

  // ------------------------------------------------------------ the prompt

  /** Open the prompt line under the block a line is in. With text selected, it opens asking for a rewrite of that. */
  promptAt(line: number, selected?: Span): void {
    const inside = blocks(this.note.text).find((b) => b.from <= line && line < b.to);
    this.failed = null;
    this.prompt = { line: inside ? inside.to : line, mode: "insert", regions: [] };
    if (selected && selected.to > selected.from) { this.setMode("rewrite"); this.pick([selected]); }
  }

  /** Open the prompt line where the cursor or the selection last was, or at the note's foot. */
  promptHere(): void {
    const c = this.cursor;
    if (!c) this.promptAt(this.foot);
    else this.promptAt(c.line, c);
  }

  /** Ask in the text (Q6): with text selected, a rewrite of it, asked how on one line. Otherwise the paragraph the
   *  line is in is the question, as you wrote it: Iso's answer goes under it, and the question stays yours. On an
   *  empty line the prompt line opens there, as before. */
  askAt(line: number, selected?: Span): void {
    if (selected && selected.to > selected.from) { this.promptAt(line, selected); return; }
    const block = blocks(this.note.text).find((b) => b.from <= line && line < b.to);
    const question = block?.text.trim() ?? "";
    // A code block, a formula or a table is not a question: there, the prompt line.
    if (!block || !question || /^(```|~~~|\$\$|\|)/.test(question)) { this.promptAt(line); return; }
    this.failed = null;
    this.prompt = { line: block.to, mode: "insert", regions: [] };
    void this.ask(question);
  }

  /** As askAt, where the cursor or the selection last was (a phone's ask Iso). */
  askHere(): void {
    const c = this.cursor;
    if (!c) this.promptAt(this.foot);
    else this.askAt(c.line, c);
  }

  /** New text here, or a rewrite of passages chosen in the note. What was chosen is kept while switching. */
  setMode(mode: Prompt["mode"]): void {
    if (this.prompt) this.prompt = { ...this.prompt, mode };
  }
  get picking(): boolean { return this.prompt?.mode === "rewrite"; }

  /** Choose passages for the rewrite. Space at either end is not part of a passage; one that touches another already
   *  chosen is joined to it. */
  pick(spans: Span[]): void {
    const prompt = this.prompt;
    if (!prompt) return;
    const text = this.note.text;
    let all = this.spans(prompt.regions);
    for (const s of spans) {
      let { from, to } = s;
      while (from < to && /\s/.test(text[from]!)) from++;
      while (to > from && /\s/.test(text[to - 1]!)) to--;
      if (to <= from || from < this.head.chars) continue; // nothing but space, or in the frontmatter
      const touching = all.filter((x) => x.from <= to && from <= x.to);
      all = [...all.filter((x) => !touching.includes(x)), { from: Math.min(from, ...touching.map((x) => x.from)), to: Math.max(to, ...touching.map((x) => x.to)) }];
    }
    all.sort((a, b) => a.from - b.from);
    this.prompt = { ...prompt, regions: all.map((x) => passageOf(text, x.from, x.to)) };
  }

  /** Drop the passage chosen at a character, if there is one. */
  unpick(at: number): void {
    const prompt = this.prompt;
    if (!prompt) return;
    const keep = prompt.regions.filter((r) => { const s = findPassage(this.note.text, r); return !s || at < s.from || at >= s.to; });
    if (keep.length !== prompt.regions.length) this.prompt = { ...prompt, regions: keep };
  }

  clearPicked(): void {
    if (this.prompt) this.prompt = { ...this.prompt, regions: [] };
  }

  setTier(tier: Tier): void { context.setTier(tier); }

  // ------------------------------------------------------------ asking

  /** Send the prompt. The note is saved first: Iso reads the file. */
  async ask(asked: string): Promise<void> {
    const prompt = this.prompt;
    if (!prompt || !asked.trim() || this.asking || (prompt.mode === "rewrite" && !prompt.regions.length)) return;
    // The prompt line gives way to Iso's block at once, before anything is awaited: a second Enter finds no
    // prompt to send. (Waiting for the engine's word that it had started let a prompt be sent twice.)
    const regions = prompt.mode === "rewrite" ? prompt.regions : [];
    this.prompt = null;
    this.failed = null;
    this.asking = { request: "", asked, line: prompt.line, regions, text: "", steps: [] };
    try {
      await this.note.save();
      const place = insertAt(this.note.text, prompt.line);
      // What you chose of Iso's context in the panel goes with it (I3).
      const choice = context.of(this.note.id), chosen = Object.keys(choice).length ? { choice } : {};
      const { request } = await app.api.ask(regions.length
        ? { note: this.note.id, form: "rewrite", regions, after: place.after, before: place.before, asked, tier: this.tier, ...chosen }
        : { note: this.note.id, ...place, asked, tier: this.tier, ...chosen });
      if (this.asking && !this.asking.request) this.asking = { ...this.asking, request };
    } catch (e) {
      this.asking = null;
      this.failed = { line: prompt.line, message: (e as Error).message };
    }
  }

  /** Send a note written for Iso, whole. The reply is a note to keep in its place. Returns the request, or "" when
   *  it was not sent. */
  async send(): Promise<string> {
    if (this.asking) return "";
    this.failed = null;
    this.asking = { request: "", asked: "", line: this.foot, regions: [], text: "", steps: [] };
    try {
      await this.note.save();
      const { request } = await app.api.ask({ note: this.note.id, form: "note", tier: this.tier });
      if (this.asking && !this.asking.request) this.asking = { ...this.asking, request };
      return request;
    } catch (e) {
      this.asking = null;
      this.failed = { line: this.foot, message: (e as Error).message };
      return "";
    }
  }

  /** Stop the request. One that has not been answered with its id yet is stopped as soon as it is. */
  halt(): void {
    const a = this.asking;
    if (!a) return;
    if (a.request) { void app.api.stop(a.request); return; }
    const stop = app.on((e) => { if (e.type === "iso-start" && e.note === this.note.id) { stop(); void app.api.stop(e.request); } });
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
