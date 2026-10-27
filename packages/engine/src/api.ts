// The Api: every operation the app asks for. The app is written against this
// interface and nothing else, so it does not know whether the engine is
// behind HTTP (the server) or in the same process (a webview, later).

import type { Anchor, Cost, Entry, MapModel, Passage, SessionMoment } from "@isorite/core";
import type { Part } from "./iso.ts";
import type { AgentEdit } from "./agent.ts";
import type { Step } from "./lookup.ts";
import type { Tier, ToolDef } from "./provider.ts";
import type { Decision, Given, Mode, Turn, TurnItem } from "./turn.ts";

/** What is open. */
export interface Session {
  /** The knowledge base's name, for the header's path. */
  name: string;
  device: string;
}

export interface NoteSummary {
  id: string;
  title: string;
  description: string;
  type: string;
  /** The folder's id: "" for the root. */
  dir: string;
  /** A question or a problem (M12), and the notes it is about or uses. */
  kind?: "question" | "problem";
  attached?: string[];
  /** When it was resolved or solved, as written. */
  done?: string;
  /** Its code links whose file is not in the base's repository (M12). */
  broken?: string[];
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

/** The base as the Atlas draws it: what the layout takes, and what each block says, by the note's id. */
export interface MapReport {
  model: MapModel;
  notes: Record<string, {
    title: string;
    /** The size of its text, as an estimate in tokens (what linking it to a note for Iso adds). */
    tokens: number;
    /** A question or a problem (M12). */
    kind?: "question" | "problem";
    /** A question resolved or a problem solved (M12): when, as written. */
    done?: string;
    /** Its links out of the base, to the web and to code (M12): drawn beside it on the Atlas. */
    links?: { kind: "web" | "code"; href: string; text: string; broken?: true }[];
  }>;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
}

/** What you chose of Iso's context for a request in a note (I3): the parts switched off, by id ("x:<entry>" an
 *  earlier exchange of the session, "n:<note>" a note this note links to), and whether Iso may look up more notes
 *  with its tools while it works (on unless said). The note itself is always sent: it is where the answer goes. */
export interface Choice { off?: string[]; lookup?: boolean }

/** A request to Iso in a note. The form decides where its text may go, whatever it writes. */
export type AskRequest =
  /** New text at a point: between the block `after` and the block `before`. */
  | { note: string; form: "insert"; after: Anchor | null; before: Anchor | null; asked: string; tier: Tier; choice?: Choice }
  /** These passages rewritten, and nothing else. What Iso says of the changes goes between `after` and `before`. */
  | { note: string; form: "rewrite"; regions: Passage[]; after: Anchor | null; before: Anchor | null; asked: string; tier: Tier; choice?: Choice }
  /** A note written for Iso (a draft, `@draft/…`): the draft is what is asked, and the reply is a note to keep in its place. */
  | { note: string; form: "note"; tier: Tier };

/** A turn of a conversation with Iso in its pane (M10): what is asked, in which mode, with what you gave it. Without
 *  `conversation` a new conversation begins. `lookup: false` keeps Iso to what you gave. */
export interface TurnRequest { conversation?: string; mode: Mode; asked: string; given: Given[]; tier: Tier; lookup?: boolean; off?: string[] }

/** A conversation, as the pane draws it. */
export interface Conversation { id: string; turns: Turn[] }

/** The terminal's session (M11), as the Iso pane's Build mode draws it: read by the isorite server from OpenCode's
 *  own server, which `isorite term` starts and the terminal is attached to. `connected` is false when no terminal is. */
export interface TerminalView { connected: boolean; session: string | null; title: string; busy: boolean; turns: TerminalTurn[]; asking: TerminalPermission[]; cost: number; tokens: { input: number; output: number }; model: string }
/** A prompt and what the agent did with it. `from` says where it was asked: in the terminal, or from a page. */
export interface TerminalTurn { id: string; asked: string; from: "terminal" | "here"; items: TerminalItem[]; state: "running" | "done" | "stopped" | "failed" }
export type TerminalItem =
  | { kind: "text"; text: string }
  /** A tool call. `title` is what it acted on (a command, a file, a note); `diff` an edit's lines, `-` and `+`. */
  | { kind: "tool"; id: string; name: string; title: string; status: "running" | "done" | "failed"; output: string; note?: string; diff?: string[]; base?: string };
/** The agent asks before doing: `action` (as `shell`) on `resources` (as the command). */
export interface TerminalPermission { id: string; action: string; resources: string[]; tool?: string }

/** A note for Iso that is not in the base yet. */
export interface DraftSummary { id: string; title: string }

/** A note's Understanding note (M10): Iso's reading of your understanding, and your scratchpad (`version` is the
 *  file's, null before there is one). */
export interface UnderstandingReport { note: string; reading: string; scratchpad: string; version: string | null }

/** What a request to Iso would be sent now, part by part, and what the session has cost. Sizes are estimates
 *  (four characters a token) until a provider's own count replaces them. */
export interface ContextReport {
  tokens: number;
  /** The most the mid tier's model takes. */
  limit: number;
  parts: Part[];
  session: { usd: number; requests: number };
  /** In a note of the base: each part you can switch on or off, as the choice asked about has it (I3). */
  items: ContextItem[];
  /** Whether Iso may look up more notes, as the choice has it. */
  lookup: boolean;
  /** Each part given, as much as it adds when sent (M10b: the Context view lists them). A note that is gone is not here. */
  given?: { kind: Given["kind"]; id: string; text?: string; tokens: number }[];
  /** The working set (M15), a row per part, as the Context view draws it. Sizes are as counted once the provider
   *  has said (`counted`): isorite's estimate times what the provider counted for it in the last turn. */
  rows?: HandRow[];
  counted?: boolean;
}

/** One part of what the next turn is sent (M15). `key` is what switches it: `g:<kind>:<id>` (or
 *  `g:passage:<id>:<hash>`, givenKey), `q:<id>` and `agents` by the page's `off`; `r:<id>`, `t:<id>` and `b:<id>` by
 *  `setContext`, kept in the conversation. */
export interface HandRow {
  key: string;
  group: "notes" | "conversation" | "fixed";
  kind: "note" | "folder" | "passage" | "understanding" | "read" | "question" | "turn" | "briefing" | "instructions" | "agents" | "message";
  title: string;
  detail: string;
  tokens: number;
  on: boolean;
  /** Who brought a note: you gave it, or Iso read it. */
  by?: "you" | "iso";
  /** Set aside because it was not used for AGE_OFF turns. */
  aged?: boolean;
  /** A turn a briefing stands for: the briefing's key. */
  under?: string;
  /** A part you gave: what it is, so the page can take it out of what it gives. */
  given?: Given;
}

/** What Iso has cost against what may be spent (M12). `per` is the period the figure covers: a calendar month
 *  (UTC), or what the provider's key counts. `source` says where `cap` comes from: the key's own limit, the
 *  `spend_cap` setting, or, with no cap at all, the most spent in any month so far (`cap` is null while nothing
 *  has been spent). */
export interface Spend { usd: number; cap: number | null; per: "day" | "week" | "month" | "total"; source: "key" | "setting" | "history" }

/** One part of Iso's context that can be switched off: an earlier exchange, or a note this note links to. */
export interface ContextItem { id: string; kind: "exchange" | "linked" | "question"; title: string; tokens: number; on: boolean }

/** What can be set, as the app may know it. The key itself is never sent back. */
export interface Settings {
  provider: string;
  /** Whether a key is held. */
  key: boolean;
  /** Whether the provider can make a key by signing in there (connect). */
  connect: boolean;
  tiers: Record<Tier, string>;
  /** The monthly spend cap set for Iso, in dollars; null for none. */
  spendCap: number | null;
}

/** A name and value the gateway is sent: a header, or a query value (M18). A value whose name looks secret is not
 *  sent back to the page: `held` says one is kept, and a pair sent back with `held` and no value keeps it. */
export interface SetupPair { name: string; value: string; held?: boolean }

/** The provider's setup, as Iso's settings show it: config.toml's [provider] and [tiers], its secrets held, not shown. */
export interface ProviderSetup {
  kind: "openrouter" | "gateway";
  name: string;
  url: string;
  keyHeld: boolean;
  /** The header the key goes in, when not Authorization. */
  keyHeader: string;
  /** What goes before the key in it, as `Bearer` (M21); empty for the default: Bearer in Authorization, and
   *  nothing in another header. */
  keyPrefix: string;
  headers: SetupPair[];
  query: SetupPair[];
  /** The client certificate: a .pfx, or a certificate and its key; and an authority. Paths on the server's machine. */
  pfx: string;
  passphraseHeld: boolean;
  cert: string;
  certKey: string;
  ca: string;
  streamUsage: boolean;
  maxTokens: number | null;
  tiers: Record<Tier, string>;
}

/** A setup sent to be checked or kept: the key and the .pfx's password as given now (a value), forgotten (null),
 *  or as held (left out). */
export interface SetupDraft extends ProviderSetup { key?: string | null; passphrase?: string | null }

export interface SetupView {
  setup: ProviderSetup;
  /** Whether it may be changed from where the page is: only from this machine (M18). */
  local: boolean;
  /** Where it is kept. */
  config: string;
}

/** One step of a check, as isorite doctor says it. */
export interface SetupCheck { step: string; outcome: "ok" | "fail" | "warn" | "skip"; said: string }

export type EngineEvent =
  /** A note's file was written, or found changed. `version` is null when the note is gone. */
  | { type: "note-changed"; id: string; version: string | null; who: string }
  /** An entry was added to a note's journal. */
  | { type: "journal"; id: string; entry: Entry }
  /** An event was added to this device's record of usage (what was cleared from Iso's context, what turns cost). */
  | { type: "record"; event: string }
  /** Iso was asked. Every request ends in exactly one of iso-done, iso-stopped, iso-failed. */
  | { type: "iso-start"; request: string; note: string; asked: string; tier: Tier; place: { form: "insert"; after: Anchor | null; before: Anchor | null } | { form: "rewrite"; regions: Passage[]; after: Anchor | null; before: Anchor | null } | { form: "note" } | { form: "turn"; conversation: string; mode: Mode; given: Given[] } }
  /** In a turn (M10): something it did other than look up or write its reply, as kept in the conversation. */
  | { type: "iso-item"; request: string; conversation: string; item: TurnItem }
  /** Your answer to something it asked before doing. */
  | { type: "iso-answer"; request: string; conversation: string; permission: string; decision: Decision }
  | { type: "iso-taken"; request: string; conversation: string; item: string; note: string }
  /** Iso looked something up. */
  | { type: "iso-step"; request: string; note: string; step: Step }
  /** A piece of its reply. `again`: what came before was not the reply; start over. */
  | { type: "iso-text"; request: string; note: string; delta: string; again: boolean }
  /** `proposal` is what it offers; for a rewrite that says something of its changes, `said` is that, a proposal of its own. */
  | { type: "iso-done"; request: string; note: string; proposal: string; said?: string; cost: Cost }
  | { type: "iso-stopped"; request: string; note: string }
  | { type: "iso-failed"; request: string; note: string; message: string }
  /** A conversation's working set changed: a part switched, a briefing made (M15). */
  | { type: "context"; conversation: string }
  /** The provider failed for a moment: it is asked again, the `retry`th time of `of`. */
  | { type: "iso-retry"; request: string; note: string; retry: number; of: number }
  /** A terminal agent (`agent` is its name, as `opencode`) began a turn in one of its sessions. Each turn ends in agent-done. */
  | { type: "agent-start"; request: string; agent: string; session: string }
  /** It looked something up in the base, with Iso's own tools. */
  | { type: "agent-step"; request: string; agent: string; session: string; step: Step }
  | { type: "agent-done"; request: string; agent: string; session: string }
  /** The person sent a note, or a passage of one, to whichever terminal agent is listening; `text` is what it is told. */
  | { type: "agent-sent"; id: string; note: string; title: string; passage?: string; said: string; text: string }
  /** An agent took what was sent into one of its sessions. */
  | { type: "agent-received"; id: string; agent: string }
  /** The terminal's session changed (M11): the whole of it, as the isorite server reads it. Not the engine's own. */
  | { type: "terminal"; terminal: TerminalView };

/** A terminal agent's change to a note of the base, written as Write mode writes (M11). `asked` is what the
 *  person asked the agent, as near as the harness can tell. */
export interface AgentChange {
  agent: string;
  session: string;
  note: string;
  asked: string;
  edit: AgentEdit;
}

/** One look-up by a terminal agent: which agent, which of its sessions, which tool, with what. */
export interface AgentLook {
  agent: string;
  session: string;
  tool: string;
  args: Record<string, unknown>;
  /** What the person asked the agent, for a proposal's journal entry. */
  asked?: string;
}

/** A picture's file (M22), as `GET /api/file` gives it: its bytes, its media type, and a version for caching. */
export interface FileBytes { bytes: Uint8Array; type: string; version: string }

/** A picture in the notes (M22), as `[[!` offers it: its path, size in bytes, size in pixels where that can be told,
 *  and its SHA-256, by which a picture pasted twice is found already there. */
export interface PictureInfo { path: string; bytes: number; width: number | null; height: number | null; sha256: string }

/** The largest picture isorite gives or takes (M22). */
export const MAX_FILE_BYTES = 20_000_000;

export interface Api {
  session(): Promise<Session>;
  notes(): Promise<Listing>;
  readNote(id: string): Promise<NoteSource>;
  /** A picture (M22): in the notes, by its path there, or (`code`) in the base's repository, by its path there. Null
   *  when there's no such picture, or the path isn't a picture's: nothing else is given this way. */
  file(path: string, from?: "notes" | "code"): Promise<FileBytes | null>;
  /** Every picture in the notes, by path (M22). */
  pictures(): Promise<PictureInfo[]>;
  /** Save a note. `base` is the version the text started from; a note that has moved on refuses with a Conflict. */
  saveNote(id: string, edit: { base: string; text: string }): Promise<Saved>;
  /** Make a note. Refuses when there is one already. */
  createNote(id: string, text: string): Promise<Saved>;
  /** Move a note of the base to another id: a new name, or another folder (made if need be). Its journal goes with
   *  it; links to it are changed to match, as your own edits. `base` as for saveNote. */
  moveNote(id: string, to: string, base: string): Promise<Saved>;
  /** Resolve a question or say a problem is solved, today, or open it again (M12). `base` as for saveNote. */
  setDone(id: string, done: boolean, base: string): Promise<Saved>;
  /** Delete a note of the base. Its journal stays, and links to it are left, broken. `base` as for saveNote. */
  deleteNote(id: string, base: string): Promise<void>;
  /** The note's journal, oldest first. */
  journal(id: string): Promise<Entry[]>;
  /** The note's text just after one of its journal's entries. */
  version(id: string, entry: string): Promise<string>;
  /** Write the note back as it was just after an entry, as a new entry of its own. `base` as for saveNote. */
  restore(id: string, entry: string, base: string): Promise<Saved>;
  /** The moments of the last session across every note, in the order they began: the one going on, or the last ended. */
  timeline(): Promise<SessionMoment[]>;
  search(query: string): Promise<SearchHit[]>;
  /** The Atlas's map of the base. */
  map(): Promise<MapReport>;
  /** Ask Iso. Returns at once with the request's id; what follows comes as events, and ends as a proposal in the note's journal. */
  ask(request: AskRequest): Promise<{ request: string }>;
  /** Ask Iso in its pane (M10). Returns at once with the conversation and the turn; what follows comes as events
   *  (iso-start, iso-step, iso-text, iso-item, then one of iso-done, iso-stopped, iso-failed, with the turn as the
   *  request), and is kept in the conversation. */
  converse(request: TurnRequest): Promise<{ conversation: string; turn: string }>;
  /** A conversation, or the latest when none is named; null when there is none. */
  conversation(id?: string): Promise<Conversation | null>;
  /** What a turn would send now, part by part, with the session's cost. */
  turnContext(request: Omit<TurnRequest, "asked">): Promise<ContextReport>;
  /** Switch a part of a conversation's working set on or off: `r:<note>` (read by Iso), `t:<turn>`, `b:<briefing>`. */
  setContext(conversation: string, part: string, on: boolean): Promise<void>;
  /** Sum up a conversation's earlier turns, all but the last `keep`, into a briefing that stands for them. */
  compact(conversation: string, keep?: number): Promise<{ briefing: string; usd: number }>;
  /** A new conversation that starts from a briefing of this one ("a new conversation from here"). */
  branch(conversation: string): Promise<{ conversation: string }>;
  /** The base's own instructions, AGENTS.md at the top of the notes (M15): null while there is none. */
  agents(): Promise<{ text: string | null }>;
  saveAgents(text: string): Promise<void>;
  /** A note's Understanding note. */
  understanding(note: string): Promise<UnderstandingReport>;
  /** Save your scratchpad in a note's Understanding note. */
  saveScratchpad(note: string, scratchpad: string, base: string | null): Promise<UnderstandingReport>;
  /** Put back every note a turn changed as it was before the turn. A note changed since is left as it is, and said. */
  undoTurn(conversation: string, turn: string): Promise<{ notes: string[]; left: string[] }>;
  /** Name the repository the base's code links point into, unless one is named: true if it was (M12). */
  nameRepository(path: string): Promise<boolean>;
  /** Code links broken since Iso, or the terminal's agent, was last told; each is told once (Q27). */
  brokenNews(to: "iso" | "agent"): Promise<{ id: string; title: string; href: string }[]>;
  /** Make a question Iso asked in a turn a question note, or insert what it offered: yours either way. */
  takeItem(conversation: string, turn: string, item: string): Promise<{ note: string }>;
  /** Your answer to what Iso asked before doing something in a turn. */
  answer(turn: string, permission: string, decision: Decision): Promise<void>;
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
  /** Start a note for Iso. It is one of isorite's own files, read and saved like any note, under the id it is given. */
  createDraft(): Promise<NoteSource>;
  /** Keep Iso's reply to a draft as a note of the knowledge base, in a folder, under the draft's title. The draft is then gone. */
  keepDraft(draft: string, proposal: string, folder: string): Promise<Saved>;
  /** Throw a draft away. Its journal stays. */
  discardDraft(draft: string): Promise<void>;
  /** What Iso would be sent if asked now, in this note (or in none). */
  /** What asking Iso in a note would send, with `choice` as the request would carry it. */
  context(note?: string, choice?: Choice): Promise<ContextReport>;
  /** Leave the session's earlier exchanges out of what Iso is sent from now on. Nothing is deleted. */
  clearConversation(): Promise<void>;
  settings(): Promise<Settings>;
  /** What Iso has cost, against the key's own limit where the provider gives one, else the `spend_cap` setting. */
  spend(): Promise<Spend>;
  /** Set the monthly spend cap in dollars (null: none). Where the key has a limit of its own, that is used instead. */
  setSpendCap(usd: number | null): Promise<Settings>;
  /** Hold a provider key (null forgets it). */
  setKey(key: string | null): Promise<Settings>;
  /** Begin making a key by signing in at the provider: the page to go to, which comes back to `callback` with a code. */
  connect(callback: string): Promise<{ url: string }>;
  /** Back from the provider with a code: exchange it for a key, and hold that key. */
  connected(code: string, state: string): Promise<Settings>;
  /** The tools a terminal agent is offered over the base: a brief of it, Iso's own look-ups, and changing a note,
   *  which is written and marked as the agent's (M11). */
  agentTools(): Promise<ToolDef[]>;
  /** Run one of them for an agent. What it looked up is published as an agent-step, for the Atlas; a proposal is
   *  written as agentWrite writes it, and refused as it refuses. */
  agentLook(look: AgentLook): Promise<{ text: string }>;
  /** Write an agent's change to a note, or a new note, as Iso's Write mode does: entered in its journal under the
   *  agent's name, its words marked, undone from the browser. What comes back is said to the agent. */
  agentWrite(proposal: AgentChange): Promise<{ text: string }>;
  /** Send a note, or a passage of it, with what the person says of it, to a terminal agent's session. */
  agentSend(sent: { note: string; passage?: string; said: string }): Promise<{ id: string }>;
  /** A terminal agent took what was sent. */
  agentReceived(id: string, agent: string): Promise<void>;
  /** An agent's session became busy (a turn begins) or idle (it ends). */
  agentStatus(agent: string, session: string, busy: boolean): Promise<void>;
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
