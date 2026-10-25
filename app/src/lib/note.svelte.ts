// One note, open for writing. The text here is the whole file. It is saved a
// moment after the typing stops, when the note is left, and on Ctrl+S; what is
// not yet saved is also kept in this browser, so a closed tab loses nothing.
// Every save names the version it started from, and a note that was changed
// elsewhere meanwhile is offered as a choice instead of being overwritten.

import { hashText, spliceText, splitFrontmatter, splitSource } from "@isorite/core";
import type { EngineEvent, NoteSource } from "@isorite/engine";
import { ApiError } from "./api.ts";
import { app } from "./app.svelte.ts";

/** How long after the last keystroke a note is saved. */
export const SAVE_AFTER_MS = 1500;

export type Loaded = "loading" | "ready" | "missing" | "error";
export type Saving = "saved" | "unsaved" | "saving" | "conflict" | "failed";

/** The fields the editor shows; everything else in the frontmatter is left as it is. */
export interface Fields { title: string; type: string; description: string; tags: string }

type Draft = { base: string; text: string };
const draftKey = (id: string) => `isorite.draft.${id}`;
function draft(id: string, value?: Draft | null): Draft | null {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null") as Draft | null;
    if (value) localStorage.setItem(draftKey(id), JSON.stringify(value));
    else localStorage.removeItem(draftKey(id));
  } catch { /* storage unavailable: no drafts */ }
  return null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export class NoteSession {
  readonly id: string;
  loaded = $state<Loaded>("loading");
  saving = $state<Saving>("saved");
  message = $state("");
  /** The whole file, as edited. */
  text = $state("");
  /** When a save was refused: the note as it is now elsewhere (null: it is gone). */
  theirs = $state.raw<NoteSource | null | undefined>(undefined);
  /** Counts up when the text was replaced from outside the editor, which then reloads. */
  revision = $state(0);

  private base = "";
  private saved = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private stop: (() => void) | null = null;

  constructor(id: string) { this.id = id; }

  /** The frontmatter as read, or null when it cannot be parsed: then only the source is shown. */
  readonly meta = $derived.by(() => {
    try { return splitFrontmatter(this.text)[0] ?? {}; } catch { return null; }
  });
  readonly fields = $derived.by((): Fields => {
    const m = this.meta ?? {};
    return { title: str(m.title), type: str(m.type), description: str(m.description), tags: Array.isArray(m.tags) ? m.tags.map(String).join(", ") : str(m.tags) };
  });
  /** The text under the frontmatter. */
  readonly body = $derived.by(() => {
    try { return splitSource(this.text)[2]; } catch { return this.text; }
  });

  async open(): Promise<void> {
    try {
      const note = await app.api.readNote(this.id);
      // Text typed here and never saved: carry on from it, or, if the note moved on meanwhile, ask.
      const kept = draft(this.id);
      this.take(note);
      if (kept && kept.text !== note.text) {
        this.text = kept.text;
        if (kept.base === note.version) this.changed();
        else { this.theirs = note; this.saving = "conflict"; draft(this.id, kept); }
      }
      this.loaded = "ready";
      this.stop = app.on((e) => this.hear(e));
    } catch (e) {
      this.loaded = e instanceof ApiError && e.status === 404 ? "missing" : "error";
      this.message = (e as Error).message;
    }
  }

  /** Leave the note: save what is unsaved and stop listening. */
  async close(): Promise<void> {
    this.stop?.();
    await this.save();
  }

  /** The note was written by the engine on your say (a proposal kept): this is its text now. */
  adopt(note: NoteSource): void { this.take(note); }

  /** Write the note back as it was just after an entry of its journal: anything unsaved is saved first, so it is in
   *  the journal too, and the restore is an entry of its own. */
  async restore(entry: string): Promise<void> {
    await this.settle();
    this.take(await app.api.restore(this.id, entry, this.base));
  }

  /** Move the note to another id (a new name, or another folder), anything unsaved saved first. Its new id. */
  async move(to: string): Promise<string> {
    await this.settle();
    const moved = await app.api.moveNote(this.id, to, this.base);
    this.stop?.();
    return moved.id;
  }

  /** Resolve the question, or say the problem is solved, today; or open it again (M12). Anything unsaved is saved
   *  first. */
  async setDone(done: boolean): Promise<void> {
    await this.settle();
    this.take(await app.api.setDone(this.id, done, this.base));
    await app.refresh();
  }

  /** Delete the note, anything unsaved saved first, so that its journal has the last of it. */
  async remove(): Promise<void> {
    await this.settle();
    await app.api.deleteNote(this.id, this.base);
    this.stop?.();
  }

  private async settle(): Promise<void> {
    if (this.saving !== "saved") await this.save();
    if (this.saving !== "saved") throw new Error(this.message || "the note could not be saved first");
  }

  private take(note: NoteSource): void {
    this.text = this.saved = note.text;
    this.base = note.version;
    this.theirs = undefined;
    this.saving = "saved";
    this.message = "";
    draft(this.id, null);
    this.revision++;
  }

  // ------------------------------------------------------------ edits

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.changed();
  }
  setBody(body: string): void {
    if (body !== this.body) this.setText(spliceText(this.text, {}, body));
  }
  /** Change frontmatter fields; an empty value removes the field. Only those fields' lines change. */
  setFields(changes: Partial<Fields>): void {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      const v = value.trim();
      out[key] = key === "tags" ? (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : null) : v || null;
    }
    this.setMeta(out);
  }
  /** Change frontmatter fields to these values as they are (null removes one). Only those fields' lines change. */
  setMeta(changes: Record<string, unknown>): void {
    try { this.setText(spliceText(this.text, changes, null)); } catch { /* unparseable frontmatter: edited as source */ }
  }

  private changed(): void {
    draft(this.id, { base: this.base, text: this.text });
    if (this.saving === "conflict") return; // nothing is sent until the choice is made
    this.saving = "unsaved";
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.save(); }, SAVE_AFTER_MS);
  }

  // ------------------------------------------------------------ saving

  /** Save now, if there is anything to save. Saves follow one another; they never overlap. */
  save(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.inFlight = (this.inFlight ?? Promise.resolve()).then(() => this.send());
    return this.inFlight;
  }

  private async send(): Promise<void> {
    if (this.loaded !== "ready" || this.saving === "conflict" || this.text === this.saved) return;
    const text = this.text;
    this.saving = "saving";
    try {
      const done = await app.api.saveNote(this.id, { base: this.base, text });
      this.base = done.version;
      this.saved = text;
      this.message = "";
      if (this.text === text) { this.saving = "saved"; draft(this.id, null); }
      else this.changed(); // typed while it was being saved
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.current !== undefined) {
        // The same text arrived there another way (the other tab saved it): nothing to choose.
        if (e.current?.text === text) return this.take(e.current);
        this.theirs = e.current;
        this.saving = "conflict";
      } else {
        this.saving = "failed";
        this.message = (e as Error).message;
        this.timer = setTimeout(() => { void this.save(); }, 5000); // and again, until it is answered
      }
    }
  }

  /** The note was written somewhere. With nothing unsaved here, take the new text; otherwise the next save will ask. */
  private hear(event: EngineEvent): void {
    if (event.type !== "note-changed" || event.id !== this.id) return;
    if (event.version === this.base || event.version === hashText(this.text)) return; // our own save
    if (this.saving !== "saved") return;
    void app.api.readNote(this.id).then((note) => {
      if (this.saving === "saved" && note.version !== this.base) this.take(note);
    }, () => undefined);
  }

  // ------------------------------------------------------------ the choice

  /** Keep what is written here: saved over theirs, which stays in the note's journal. */
  keepMine(): Promise<void> {
    const theirs = this.theirs;
    if (theirs === undefined) return Promise.resolve();
    this.theirs = undefined;
    this.saving = "unsaved";
    if (theirs === null) {
      // The note is gone: mine is written as a new note in its place.
      return app.api.createNote(this.id, this.text).then((made) => this.take(made), (e) => { this.saving = "failed"; this.message = (e as Error).message; });
    }
    this.base = theirs.version;
    this.saved = theirs.text;
    return this.save();
  }

  /** Take what is there now, and drop what was written here. */
  keepTheirs(): void {
    if (this.theirs) this.take(this.theirs);
  }
}
