// The Api: every operation the app asks for. The app is written against this
// interface and nothing else, so it does not know whether the engine is
// behind HTTP (the server) or in the same process (a webview, later).

import type { Anchor, Cost, Entry, FileKind, MapModel, Passage, SessionMoment } from "@isorite/core";
import type { AgentEdit } from "./agent.ts";
import type { Step, ToolDef } from "./lookup.ts";
import type { Given, Turn, TurnItem } from "./turn.ts";

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
    /** The size of its text, as an estimate in tokens . */
    tokens: number;
    /** A question or a problem (M12). */
    kind?: "question" | "problem";
    /** A question resolved or a problem solved (M12): when, as written. */
    done?: string;
    /** Its links out of the base, to the web and to code (M12): drawn beside it on the Atlas. */
    links?: { kind: "web" | "code"; href: string; text: string; broken?: true }[];
    /** The pictures it shows (M22), from the notes or the repository (`code`): drawn beside it on the Atlas. */
    pictures?: { href: string; path: string; from: "notes" | "code"; text: string; broken?: true }[];
  }>;
  /** The files on the map (M23), by their ref: an artifact by its title, anything else by its name; a folder of
   *  pictures (its path with a "/") by how many it holds. */
  files?: Record<string, { title: string; kind: FileKind; count?: number }>;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
}

/** A conversation with Iso from before M25, as the pane draws it, to read. */
export interface Conversation { id: string; turns: Turn[] }
/** A past conversation, as the drawer of them shows it (M24, K): when it began and was last added to, what was
 *  first asked, and how many turns and notes it has (the notes given, read, pointed to or changed). */
export interface ConversationSummary { id: string; at: string; last: string; asked: string; turns: number; notes: number }

/** An agent's session (M11, on ACP since M25), as the Iso pane draws it: followed by the isorite server through
 *  `isorite acp`. `connected` is false when no agent is attached. */
export interface TerminalView {
  connected: boolean; /** The agent, as it names itself: OpenCode, omp. */ agent: string; session: string | null; title: string; busy: boolean; turns: TerminalTurn[]; asking: TerminalPermission[]; cost: number; tokens: { input: number; output: number }; model: string;
  /** The agent's own name for itself, as its changes are signed (`agent:<id>`). */
  agentId?: string;
  /** The agent's context window, in tokens, and how much of it the session fills (ACP's usage_update). */
  size?: number;
  /** The agents' sessions on the base (M25): live ones, the agents' own, and those isorite carried and kept. */
  sessions?: AgentSession[];
  /** A kept session shown to read, with no agent attached that can carry it on. */
  reading?: boolean;
  /** What isorite's MCP puts in each session, in tokens (its instructions and tools), as estimated. */
  ours?: number;
  /** Why what the pane last asked of the agent was refused. */
  problem?: string;
  /** The slash commands the agent offers in this session (ACP's available_commands_update). */
  commands?: AgentCommand[];
  /** What the agent lets you set in this session: its modes, and its options such as the model. */
  settings?: AgentSetting[];
}
/** A slash command an agent offers: typed in the box as `/name`, it goes to the agent as the prompt. */
export interface AgentCommand { name: string; description: string; hint?: string }
/** One thing to set in an agent's session: a mode, or a config option (the model, say), with what it may be. */
export interface AgentSetting { kind: "mode" | "config"; id: string; name: string; current: string; options: { value: string; name: string; description?: string }[] }
/** A prompt and what the agent did with it. `from` says where it was asked: in the terminal, or from a page. `given`:
 *  the notes and passages put before it from the pane (M25). */
export interface TerminalTurn { id: string; asked: string; from: "terminal" | "here"; items: TerminalItem[]; state: "running" | "done" | "stopped" | "failed"; given?: Given[]; at?: string }
/** An agent's session as isorite kept it (M25), in its own files beside Iso's conversations: what was asked, from
 *  where, what the agent read, changed, asked back and offered. */
export interface AgentRecord { agent: string; name: string; session: string; title: string; at: string; last: string; turns: TerminalTurn[] }
/** A session in the drawer (M25): live (a wrapper carries it now), the agent's own (in its `session/list`), kept (a
 *  record here), or several of these. `open`: an agent that can carry it on is attached. */
export interface AgentSession { agent: string; name: string; session: string; title: string; asked: string; last: string; turns: number; notes: number; live: boolean; busy: boolean; kept: boolean; open: boolean }
export type TerminalItem =
  | { kind: "text"; text: string }
  /** A tool call. `title` is what it acted on (a command, a file, a note); `diff` an edit's lines, `-` and `+`. */
  | { kind: "tool"; id: string; name: string; title: string; status: "running" | "done" | "failed"; output: string; note?: string; diff?: string[]; base?: string }
  /** What the agent asked back, or offered, through isorite's MCP (M25): kept as Iso's are, or not. */
  | Extract<TurnItem, { kind: "question" | "offer" }>;
/** The agent asks before doing: `action` (as `shell`) on `resources` (as the command). */
export interface TerminalPermission { id: string; action: string; resources: string[]; tool?: string }

export type EngineEvent =
  /** A note's file was written, or found changed. `version` is null when the note is gone. */
  | { type: "note-changed"; id: string; version: string | null; who: string }
  /** An entry was added to a note's journal. */
  | { type: "journal"; id: string; entry: Entry }
  /** A terminal agent (`agent` is its name, as `opencode`) began a turn in one of its sessions. Each turn ends in agent-done. */
  | { type: "agent-start"; request: string; agent: string; session: string }
  /** It looked something up in the base, with Iso's own tools. */
  | { type: "agent-step"; request: string; agent: string; session: string; step: Step }
  | { type: "agent-done"; request: string; agent: string; session: string }
  /** The person sent a note, or a passage of one, to whichever terminal agent is listening; `text` is what it is told. */
  | { type: "agent-sent"; id: string; note: string; title: string; passage?: string; said: string; text: string }
  /** An agent took what was sent into one of its sessions. */
  | { type: "agent-received"; id: string; agent: string }
  /** An agent asked a question back or offered a passage (M25), for the person to keep or not. */
  | { type: "agent-item"; agent: string; session: string; item: Extract<TurnItem, { kind: "question" | "offer" }> }
  /** What an agent offered was kept: the question made a note, or the passage put in one. */
  | { type: "agent-taken"; id: string; note: string }
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

/** A file (M22, M23), as `GET /api/file` gives it: its bytes, its media type, and a version for caching. */
export interface FileBytes { bytes: Uint8Array; type: string; version: string }

/** Code of the base's repository, as a code link names it (M29): a symbol's lines or a range, shown in place. `text` is
 *  at most MAX_CODE_LINES lines of it, from line `start`; `end` is where it really ends. Where it can't be shown, why. */
export type CodeSlice =
  | { state: "ok"; path: string; symbol?: string; start: number; end: number; total: number; text: string; more?: true; /** Declared more than once; the first is shown. */ count?: number }
  | { state: "no-repository" | "no-file" | "no-symbol" | "unsupported" | "too-large"; path: string; symbol?: string };
/** The most lines of code shown in place. */
export const MAX_CODE_LINES = 120;

/** A picture in the notes (M22), as `[[!` offers it: its path, size in bytes, size in pixels where that can be told,
 *  and its SHA-256, by which a picture pasted twice is found already there. */
export interface PictureInfo { path: string; bytes: number; width: number | null; height: number | null; sha256: string }

/** The largest picture isorite gives or takes (M22). */
export const MAX_FILE_BYTES = 20_000_000;

export interface Api {
  session(): Promise<Session>;
  notes(): Promise<Listing>;
  readNote(id: string): Promise<NoteSource>;
  /** A file that isn't a note (M23; M22 gave pictures only): in the notes, by its path there, or (`code`) a picture in
   *  the base's repository. Null when there's no such file, or the path is a note's. */
  file(path: string, from?: "notes" | "code"): Promise<FileBytes | null>;
  /** The code a code link names (M29): `code:sim/step.py#leapfrog`, `#L40-L52`, or the whole file. */
  code(href: string): Promise<CodeSlice>;
  /** Every picture in the notes, by path (M22). */
  pictures(): Promise<PictureInfo[]>;
  /** Put a picture in the notes at `path` (M22), pasted or dropped: never over a file that's there (a Conflict). */
  savePicture(path: string, bytes: Uint8Array): Promise<PictureInfo>;
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
  /** A conversation with Iso from before M25, or the latest when none is named; null when there is none. */
  conversation(id?: string): Promise<Conversation | null>;
  /** Every conversation, the newest first (M24, K). */
  conversations(): Promise<ConversationSummary[]>;
  /** Remove one of Iso's conversations from before M25 (M27). */
  deleteConversation(id: string): Promise<void>;
  /** The base's own instructions, AGENTS.md at the top of the notes (M15): null while there is none. */
  agents(): Promise<{ text: string | null }>;
  saveAgents(text: string): Promise<void>;
  /** Name the repository the base's code links point into, unless one is named: true if it was (M12). */
  nameRepository(path: string): Promise<boolean>;
  /** Whether agents may change this base's notes, through isorite's tools or by asking to edit its files. */
  agentNotes(): Promise<{ may: boolean }>;
  setAgentNotes(may: boolean): Promise<void>;
  /** Code links broken since an agent was last told; each is told once (Q27). */
  brokenNews(): Promise<{ id: string; title: string; href: string }[]>;
  /** Write a proposal of Iso's still waiting in a note's journal (from before M25) into its note. For a rewrite,
   *  `region` keeps that one passage; without it, every one still waiting. */
  keep(id: string, proposal: string, region?: number): Promise<Saved>;
  /** Your edit to a proposal before keeping it: its text, or for a rewrite the text of each of its regions. */
  revise(id: string, proposal: string, text: string | string[]): Promise<void>;
  /** Take a proposal away (for a rewrite, one region of it, or all that still wait). It stays in the journal. */
  discard(id: string, proposal: string, region?: number): Promise<void>;
  /** The tools an agent is offered over the base (isorite's MCP): a brief of it, the look-ups, changing a note,
   *  which is written and marked as the agent's (M11), asking back and offering text, and artifacts (M25). */
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
  /** Keep what an agent offered with ask_question or offer_text (M25): the question made a note, or the passage
   *  inserted at the end of its note, as Iso's are kept. */
  agentTake(id: string): Promise<{ note: string }>;
  /** An agent changed a note's file with its own tools, in a turn isorite saw (M25): entered in its journal under the
   *  agent's name, with what was asked, not as a change made elsewhere. */
  agentChanged(change: { agent: string; note: string; asked: string }): Promise<void>;
  /** Keep an agent's session as isorite carried it (M25), replacing what was kept of it. */
  keepAgentRecord(record: AgentRecord): Promise<void>;
  /** The sessions kept, newest first, each as the drawer shows it; or one, whole. */
  agentRecords(): Promise<AgentSession[]>;
  agentRecord(agent: string, session: string): Promise<AgentRecord | null>;
  /** Remove isorite's kept copy of an agent's session. The agent's own history is not touched. */
  deleteAgentRecord(agent: string, session: string): Promise<void>;
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
