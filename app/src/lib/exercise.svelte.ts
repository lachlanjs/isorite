// An exercise, open: what it asks and tests, the part of the working marked as
// the answer, Iso's marks over the working, and the squares for what it tests.
// The answer is held in this browser until it is sent (and in local storage, so
// a reload keeps it); the file never holds it. The marks come from the
// exercise's journal, the squares from the study record.

import { exercise, findPassage, lowest, passageOf, placeMarks, type Marks, type Passage, type Understanding } from "@isorite/core";
import type { StudyReport } from "@isorite/engine";
import { app } from "./app.svelte.ts";
import type { NoteIso, Span } from "./iso.svelte.ts";
import type { NoteSession } from "./note.svelte.ts";

const answerKey = (id: string) => `isorite.answer.${id}`;
function stored(id: string): Passage | null {
  try { const v = JSON.parse(localStorage.getItem(answerKey(id)) ?? "null") as Passage | null; return v && typeof v.text === "string" && typeof v.nth === "number" ? v : null; } catch { return null; }
}
function store(id: string, p: Passage | null): void {
  try { if (p) localStorage.setItem(answerKey(id), JSON.stringify(p)); else localStorage.removeItem(answerKey(id)); } catch { /* not kept */ }
}

/** A move as the squares' reasons show it: −1, −½, 0, +½, +1. */
export function moveText(by: number): string {
  const sign = by > 0 ? "+" : by < 0 ? "−" : "";
  const a = Math.abs(by);
  return a === 0 ? "0" : sign + (a === 0.5 ? "½" : a === 1 ? "1" : String(a));
}

export class ExerciseState {
  private readonly note: NoteSession;
  private readonly iso: NoteIso;
  private stop: (() => void) | null = null;
  /** The passage marked as the answer, as it was when marked. */
  answer = $state.raw<Passage | null>(null);
  /** The study record as the study page reads it. */
  study = $state.raw<StudyReport | null>(null);
  /** A marking that is running: its request, or "" before the engine has answered with it. */
  marking = $state<string | null>(null);
  failed = $state("");
  /** Counts up on each right result: the squares flash. */
  flash = $state(0);

  constructor(note: NoteSession, iso: NoteIso) {
    this.note = note;
    this.iso = iso;
    this.answer = stored(note.id);
  }

  readonly ex = $derived.by(() => exercise(this.note.text));
  /** Whether this note is an exercise (and not some other note of the study base). */
  readonly is = $derived.by(() => this.note.meta?.type === "Exercise");

  /** Where the answer is now, or null when it has been edited away or is outside the working. */
  readonly answerAt = $derived.by((): Span | null => {
    if (!this.answer) return null;
    const at = findPassage(this.note.text, this.answer);
    return at && at.from >= this.ex.from ? at : null;
  });

  /** The selection, when it is a part of the working that could be marked as the answer. */
  readonly selection = $derived.by((): Span | null => {
    const c = this.iso.cursor;
    if (!c || c.to <= c.from || c.from < this.ex.from) return null;
    let { from, to } = c;
    const text = this.note.text;
    while (from < to && /\s/.test(text[from]!)) from++;
    while (to > from && /\s/.test(text[to - 1]!)) to--;
    return to > from ? { from, to } : null;
  });

  /** Iso's latest marking, and where its marks fall in the working as it is now. */
  readonly last = $derived.by(() => this.iso.entries.filter((e): e is Marks => e.kind === "marks").at(-1) ?? null);
  readonly marks = $derived.by(() => (this.last ? placeMarks(this.note.text, this.last.marks).filter((m) => m.from >= this.ex.from) : []));
  readonly counts = $derived({ right: this.marks.filter((m) => m.mark === "right").length, wrong: this.marks.filter((m) => m.mark === "wrong").length });

  /** The squares: the lowest reading of the notes it tests. */
  readonly squares = $derived.by(() => {
    const readings = new Map<string, Understanding>();
    for (const [id, n] of Object.entries(this.study?.notes ?? {})) readings.set(id, { ...n, lapsed: false, last: null, evidence: [] });
    return lowest(readings, this.ex.tests);
  });

  /** What the last marking moved, by note. */
  readonly moves = $derived.by(() => {
    const last = this.last;
    if (!last) return [];
    return this.ex.tests.flatMap((t) => {
      const e = this.study?.notes[t]?.evidence.find((x) => x.marks === last.id);
      return e ? [{ note: t, by: e.by }] : [];
    });
  });

  async open(): Promise<void> {
    this.stop = app.on((e) => {
      if (e.type === "record") void this.reread();
      if (!this.marking || !("request" in e) || (this.marking && e.request !== this.marking)) {
        // The request's id may not be known yet when it starts.
        if (e.type === "iso-start" && this.marking === "" && e.note === this.note.id) this.marking = e.request;
        return;
      }
      if (e.type === "iso-done") { this.marking = null; void this.reread().then(() => { if (this.last?.result === "right") this.flash++; }); }
      else if (e.type === "iso-failed") { this.marking = null; this.failed = e.message; }
      else if (e.type === "iso-stopped") this.marking = null;
    });
    await this.reread();
  }
  close(): void { this.stop?.(); }

  async reread(): Promise<void> {
    try { this.study = await app.api.study(); } catch { /* the next event asks again */ }
  }

  /** Mark the selection as the answer, in place of any before. */
  markAnswer(): void {
    const s = this.selection;
    if (!s) return;
    this.answer = passageOf(this.note.text, s.from, s.to);
    store(this.note.id, this.answer);
  }
  clearAnswer(): void { this.answer = null; store(this.note.id, null); }

  /** Send it for marking. The exercise is saved first: Iso is sent the file. */
  async send(): Promise<void> {
    if (this.marking !== null || !this.answerAt) return;
    this.failed = "";
    this.marking = "";
    try {
      await this.note.save();
      // The answer named again against the file as saved: it is the same text, found the same way.
      const at = this.answerAt;
      if (!at) throw new Error("the answer you marked is no longer in the working");
      const answer = passageOf(this.note.text, at.from, at.to);
      const { request } = await app.api.ask({ note: this.note.id, form: "mark", answer, tier: this.iso.tier });
      if (this.marking === "") this.marking = request;
    } catch (e) {
      this.marking = null;
      this.failed = (e as Error).message;
    }
  }

  async windBack(): Promise<void> {
    try { await app.api.windBack(this.note.id); await this.reread(); } catch (e) { this.failed = (e as Error).message; }
  }
}
