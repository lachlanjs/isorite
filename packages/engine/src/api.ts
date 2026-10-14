// The Api: every operation the app asks for. The app is written against this
// interface and nothing else, so it does not know whether the engine is
// behind HTTP (the server) or in the same process (a webview, later).

import type { Anchor, Cost, Entry, MapModel, Passage } from "@isorite/core";
import type { Part } from "./iso.ts";
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

/** Both bases as one map: what the layout takes, and what each block says, by the note's name in the model
 *  (a study note's begins `@study/`). */
export interface MapReport {
  model: MapModel;
  notes: Record<string, {
    title: string;
    /** Understanding in the Atlas's four steps: 0 not reached, 1 opened, 2 worked through, 3 understood. */
    step: 0 | 1 | 2 | 3;
    /** A study note's kind, as its top edge says it. */
    kind?: string;
    /** A note of the knowledge base: the size of its text, as an estimate in tokens (what linking it to a note for Iso adds). */
    tokens?: number;
  }>;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
}

/** A request to Iso in a note. The form decides where its text may go, whatever it writes. */
export type AskRequest =
  /** New text at a point: between the block `after` and the block `before`. */
  | { note: string; form: "insert"; after: Anchor | null; before: Anchor | null; asked: string; tier: Tier }
  /** These passages rewritten, and nothing else. What Iso says of the changes goes between `after` and `before`. */
  | { note: string; form: "rewrite"; regions: Passage[]; after: Anchor | null; before: Anchor | null; asked: string; tier: Tier }
  /** A note written for Iso (a draft, `@draft/…`): the draft is what is asked, and the reply is a note to keep in its place. */
  | { note: string; form: "note"; tier: Tier };

/** A note for Iso that is not in the base yet. */
export interface DraftSummary { id: string; title: string }

/** What a request to Iso would be sent now, part by part, and what the session has cost. Sizes are estimates
 *  (four characters a token) until a provider's own count replaces them. */
export interface ContextReport {
  tokens: number;
  /** The most the mid tier's model takes. */
  limit: number;
  parts: Part[];
  session: { usd: number; requests: number };
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
  /** An event was added to the study record. */
  | { type: "record"; event: string }
  /** Iso was asked. Every request ends in exactly one of iso-done, iso-stopped, iso-failed. */
  | { type: "iso-start"; request: string; note: string; asked: string; tier: Tier; place: { form: "insert"; after: Anchor | null; before: Anchor | null } | { form: "rewrite"; regions: Passage[]; after: Anchor | null; before: Anchor | null } | { form: "note" } }
  /** Iso looked something up. */
  | { type: "iso-step"; request: string; note: string; step: Step }
  /** A piece of its reply. `again`: what came before was not the reply; start over. */
  | { type: "iso-text"; request: string; note: string; delta: string; again: boolean }
  /** `proposal` is what it offers; for a rewrite that says something of its changes, `said` is that, a proposal of its own. */
  | { type: "iso-done"; request: string; note: string; proposal: string; said?: string; cost: Cost }
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
  /** The Atlas's map of the base and, with it, the study base. */
  map(): Promise<MapReport>;
  /** Ask Iso. Returns at once with the request's id; what follows comes as events, and ends as a proposal in the note's journal. */
  ask(request: AskRequest): Promise<{ request: string }>;
  /** Stop a request. Nothing is entered. */
  stop(request: string): Promise<void>;
  /** Write a proposal into its note. The note's file changes here and nowhere else on Iso's account. For a
   *  rewrite, `region` keeps that one passage; without it, every one still waiting. */
  keep(id: string, proposal: string, region?: number): Promise<Saved>;
  /** Your edit to a proposal before keeping it: its text, or for a rewrite the text of each of its regions. */
  revise(id: string, proposal: string, text: string | string[]): Promise<void>;
  /** Take a proposal away (for a rewrite, one region of it, or all that still wait). It stays in the journal. */
  discard(id: string, proposal: string, region?: number): Promise<void>;
  /** The notes for Iso that are waiting outside the base, newest first. */
  drafts(): Promise<DraftSummary[]>;
  /** Start a note for Iso. It is a file of the study base, read and saved like any note, under the id it is given. */
  createDraft(): Promise<NoteSource>;
  /** Keep Iso's reply to a draft as a note of the knowledge base, in a folder, under the draft's title. The draft is then gone. */
  keepDraft(draft: string, proposal: string, folder: string): Promise<Saved>;
  /** Throw a draft away. Its journal stays. */
  discardDraft(draft: string): Promise<void>;
  /** What Iso would be sent if asked now, in this note (or in none). */
  context(note?: string): Promise<ContextReport>;
  /** Leave the session's earlier exchanges out of what Iso is sent from now on. Nothing is deleted. */
  clearConversation(): Promise<void>;
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
