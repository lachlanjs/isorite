// The Api: every operation the app asks for. The app is written against this
// interface and nothing else, so it does not know whether the engine is
// behind HTTP (the server) or in the same process (a webview, later).

import type { Anchor, Cost, Entry } from "@isorite/core";
import type { Step } from "./lookup.ts";
import type { Tier } from "./provider.ts";

/** What is open. */
export interface Session {
  /** The knowledge base's name, for the header's path. */
  name: string;
  /** Whether there is a study base, and so a journal. */
  study: boolean;
  device: string;
}

export interface NoteSummary {
  id: string;
  title: string;
  description: string;
  type: string;
  /** The folder's id: "" for the root. */
  dir: string;
}

export interface Listing {
  notes: NoteSummary[];
  /** Every folder, the empty ones included, without the root. */
  dirs: string[];
}

/** A note's file as it is on disk, with the version to send back when saving. */
export interface NoteSource {
  id: string;
  text: string;
  version: string;
}

export interface Saved extends NoteSource {
  /** False when the text sent was what the file already held: nothing was written or entered. */
  changed: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
}

/** A request to Iso for new text at a point of a note: between the block `after` and the block `before`. */
export interface AskRequest {
  note: string;
  form: "insert";
  after: Anchor | null;
  before: Anchor | null;
  asked: string;
  tier: Tier;
}

/** What can be set, as the app may know it. The key itself is never sent back. */
export interface Settings {
  provider: string;
  /** Whether a key is held. */
  key: boolean;
  tiers: Record<Tier, string>;
}

export type EngineEvent =
  /** A note's file was written, or found changed. `version` is null when the note is gone. */
  | { type: "note-changed"; id: string; version: string | null; who: string }
  /** An entry was added to a note's journal. */
  | { type: "journal"; id: string; entry: Entry }
  /** Iso was asked. Every request ends in exactly one of iso-done, iso-stopped, iso-failed. */
  | { type: "iso-start"; request: string; note: string; asked: string; after: Anchor | null; before: Anchor | null; tier: Tier }
  /** Iso looked something up. */
  | { type: "iso-step"; request: string; note: string; step: Step }
  /** A piece of its reply. `again`: what came before was not the reply; start over. */
  | { type: "iso-text"; request: string; note: string; delta: string; again: boolean }
  | { type: "iso-done"; request: string; note: string; proposal: string; cost: Cost }
  | { type: "iso-stopped"; request: string; note: string }
  | { type: "iso-failed"; request: string; note: string; message: string };

export interface Api {
  session(): Promise<Session>;
  notes(): Promise<Listing>;
  readNote(id: string): Promise<NoteSource>;
  /** Save a note. `base` is the version the text started from; a note that has moved on refuses with a Conflict. */
  saveNote(id: string, edit: { base: string; text: string }): Promise<Saved>;
  /** Make a note. Refuses when there is one already. */
  createNote(id: string, text: string): Promise<Saved>;
  /** The note's journal, oldest first. Empty with no study base. */
  journal(id: string): Promise<Entry[]>;
  search(query: string): Promise<SearchHit[]>;
  /** Ask Iso. Returns at once with the request's id; what follows comes as events, and ends as a proposal in the note's journal. */
  ask(request: AskRequest): Promise<{ request: string }>;
  /** Stop a request. Nothing is entered. */
  stop(request: string): Promise<void>;
  /** Write a proposal into its note. The note's file changes here and nowhere else on Iso's account. */
  keep(id: string, proposal: string): Promise<Saved>;
  /** Your edit to a proposal's text before keeping it. */
  revise(id: string, proposal: string, text: string): Promise<void>;
  /** Take a proposal away. It stays in the journal. */
  discard(id: string, proposal: string): Promise<void>;
  settings(): Promise<Settings>;
  /** Hold a provider key (null forgets it). */
  setKey(key: string | null): Promise<Settings>;
  /** Listen to everything the engine does, until the returned function is called. */
  events(listener: (event: EngineEvent) => void): () => void;
}

/** A request the engine refuses. `status` is the HTTP status it becomes. */
export class EngineError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A save from text that is no longer the note's. `current` is the note now, or null when it is gone. */
export class Conflict extends EngineError {
  readonly current: NoteSource | null;
  constructor(message: string, current: NoteSource | null) {
    super(message, 409);
    this.current = current;
  }
}
