// The Api over HTTP: the engine behind `isorite serve`. The app is written
// against the Api interface (@isorite/engine), so a webview can later hand it
// the engine itself instead of this.

import { pictureType } from "@isorite/core";
import { baseHere } from "./here.ts";
import type { Api, Decision, EngineEvent, Given, NoteSource, Session, TerminalView } from "@isorite/engine";

/** A request the server refused. For a save that lost a race, `current` is the note as it is now (null: gone). */
export class ApiError extends Error {
  readonly status: number;
  readonly current: NoteSource | null | undefined;
  constructor(message: string, status: number, current?: NoteSource | null) {
    super(message);
    this.status = status;
    this.current = current;
  }
}

/** The pane's agent session (M11, on ACP since M25), through the isorite server; on the guide's site, the finder's. */
export interface TerminalApi {
  view(): Promise<TerminalView>;
  prompt(asked: string, given: Given[]): Promise<void>;
  stop(): Promise<void>;
  reply(id: string, decision: Decision): Promise<void>;
  /** Keep what the agent asked back or offered (M25). */
  take(id: string): Promise<{ note: string }>;
  /** What is in the tray, for the next prompt in the session shown, asked here or in the terminal (M25). */
  give(given: Given[]): Promise<void>;
  /** Show an agent's session (M25): a live one, one the agent carries on, or one kept, to read. */
  follow(agent: string, session: string): Promise<void>;
  /** A new session with an attached agent, from here. */
  fresh(agent: string): Promise<void>;
  /** Ask the attached agents for their sessions again. */
  list(): Promise<void>;
  /** Set a mode or option of the session shown: the agent's own (its model, its plan mode). */
  set(kind: "mode" | "config", id: string, value: string): Promise<void>;
  /** Remove isorite's kept copy of a session that is not live; the agent's own history stays. */
  forget(agent: string, session: string): Promise<void>;
  /** The project's MCP config as isorite would write it (M25), and written, from this machine only. */
  project(): Promise<ProjectConfig>;
  writeProject(): Promise<string[]>;
  /** The agent chosen for the pane, with no front end of its own (M25); the ACP registry's; and choosing one, or
   *  none, from this machine only. */
  chosen(): Promise<ChosenAgent>;
  registry(): Promise<RegistryAgent[]>;
  /** The agents isorite knows by name, found on this machine or not, found ones first. */
  known(): Promise<KnownAgent[]>;
  choose(choice: AgentChoice | null): Promise<ChosenAgent>;
}
export interface ProjectConfig { repo: string; files: { file: string; harness: string; current: boolean; before: string | null; after: string }[] }
export type AgentChoice = { id: string } | { command: string };
export interface ChosenAgent { choice: AgentChoice | null; running: boolean; command: string; problem: string; said: string }
/** Where isorite's own files are kept (M27): in a repository of their own, or with the project's, what this machine chose,
 *  and the commands to copy. isorite runs none of them. */
export interface OwnRepoInfo { state: "own" | "tracked" | "shared" | "none" | "unavailable"; path: string; project: string | null; remotes: string[]; choice: "project" | "separate" | null; ask: boolean; commands: string[]; problem: string }
/** An agent isorite knows by name, found on this machine or not (M27). */
export interface KnownAgent { key: string; name: string; found: boolean; choice: AgentChoice; command: string; bin: string }
export interface RegistryAgent { id: string; name: string; version: string; description: string; site: string; how: "npx" | "uvx" | "binary" | null }

/** The bases the server holds (M20), as the switcher lists them. */
export interface BaseRow { name: string; path: string; lend: boolean; open: boolean }
export interface BasesApi {
  list(): Promise<{ here: string; local: boolean; bases: BaseRow[] }>;
  /** Lend a base to every session, or stop (from this machine only). */
  lend(name: string, lend: boolean): Promise<BaseRow[]>;
}

/** Where the browser fetches a picture from (M22), so an `<img>` asks for it itself, cached and lazily. */
export interface FileUrls { fileUrl(path: string, from?: "notes" | "code"): string }

export function httpApi(root: string = new URL(baseHere() ? `b/${encodeURIComponent(baseHere())}/api/` : "api/", document.baseURI).href): Api & FileUrls & { terminal: TerminalApi; bases: BasesApi; own: { repo(): Promise<OwnRepoInfo | null>; choose(choice: "project" | "separate"): Promise<OwnRepoInfo> } } {
  let token: Promise<string> | null = null;
  const ask = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try { res = await fetch(root + path, init); } catch { throw new ApiError("isorite is not answering", 0); }
    const body = await res.json().catch(() => ({})) as { error?: string; current?: NoteSource | null };
    if (!res.ok) throw new ApiError(body.error ?? res.statusText, res.status, body.current);
    return body as T;
  };
  const session = () => ask<Session & { token: string }>("session");
  const write = async <T>(method: string, path: string, body: unknown): Promise<T> => {
    token ??= session().then((s) => s.token);
    const headers = { "Content-Type": "application/json", "x-isorite-token": await token };
    return ask<T>(path, { method, headers, body: JSON.stringify(body) });
  };
  const q = (id: string) => `?id=${encodeURIComponent(id)}`;
  const fileUrl = (path: string, from: "notes" | "code" = "notes") => `${root}file?${from === "code" ? "code" : "path"}=${encodeURIComponent(path)}`;

  return {
    session: async () => { const { token: t, ...rest } = await session(); token = Promise.resolve(t); return rest; },
    notes: () => ask("notes"),
    readNote: (id) => ask("note" + q(id)),
    fileUrl,
    pictures: () => ask("pictures"),
    savePicture: async (path, bytes) => {
      token ??= session().then((s) => s.token);
      const type = pictureType(path) ?? "application/octet-stream";
      return ask(`file?path=${encodeURIComponent(path)}`, { method: "POST", headers: { "Content-Type": type, "x-isorite-token": await token }, body: bytes as Uint8Array<ArrayBuffer> });
    },
    file: async (path, from) => {
      let res: Response;
      try { res = await fetch(fileUrl(path, from)); } catch { throw new ApiError("isorite is not answering", 0); }
      if (res.status === 404) return null;
      if (!res.ok) throw new ApiError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText, res.status);
      return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "", version: (res.headers.get("etag") ?? "").replaceAll('"', "") };
    },
    saveNote: (id, edit) => write("PUT", "note" + q(id), edit),
    createNote: (id, text) => write("POST", "note" + q(id), { text }),
    journal: (id) => ask("journal" + q(id)),
    version: async (id, entry) => (await ask<{ text: string }>("version" + q(id) + "&entry=" + encodeURIComponent(entry))).text,
    moveNote: (id, to, base) => write("POST", "note/move" + q(id), { to, base }),
    deleteNote: async (id, base) => { await write("POST", "note/delete" + q(id), { base }); },
    restore: (id, entry, base) => write("POST", "note/restore" + q(id), { entry, base }),
    map: () => ask("map"),
    timeline: () => ask("timeline"),
    search: (query) => ask(`search?q=${encodeURIComponent(query)}`),
    agents: () => ask("agents"),
    saveAgents: (text) => write("POST", "agents", { text }),
    // The server's own: it tells the agent of broken code links with its next prompt.
    nameRepository: async () => false,
    agentNotes: () => ask("agents/notes"),
    setAgentNotes: (may) => write("POST", "agents/notes", { may }),
    brokenNews: async () => [],
    conversations: () => ask("conversations"),
    deleteConversation: async (id) => { await write("POST", "conversation/delete", { id }); },
    conversation: async (id) => { const c = await ask<{ id: string; turns: [] }>("conversation" + (id ? q(id) : "")); return c.id ? c : null; },
    keep: (id, proposal, region) => write("POST", "proposal/keep" + q(id), { proposal, ...(region === undefined ? {} : { region }) }),
    revise: async (id, proposal, text) => { await write("POST", "proposal/revise" + q(id), { proposal, text }); },
    discard: async (id, proposal, region) => { await write("POST", "proposal/discard" + q(id), { proposal, ...(region === undefined ? {} : { region }) }); },
    setDone: (id, done, base) => write("POST", "note/done" + q(id), { done, base }),
    agentTools: () => ask("agent/tools"),
    agentLook: (look) => write("POST", "agent/look", look),
    agentWrite: (proposal) => write("POST", "agent/write", proposal),
    agentSend: (sent) => write("POST", "agent/send", sent),
    agentReceived: async (id, agent) => { await write("POST", "agent/received", { id, agent }); },
    agentStatus: async (agent, session, busy) => { await write("POST", "agent/status", { agent, session, busy }); },
    agentTake: (id) => write("POST", "agent/take", { id }),
    // Told by isorite acp to the server, never by a page.
    agentChanged: async () => { throw new Error("only isorite acp tells the server of an agent's change"); },
    keepAgentRecord: async () => { throw new Error("only the server keeps an agent's session"); },
    agentRecords: () => ask("agent/records"),
    agentRecord: (agent, session) => ask(`agent/record?agent=${encodeURIComponent(agent)}&session=${encodeURIComponent(session)}`),
    deleteAgentRecord: async () => { throw new Error("a kept session is removed through the pane's drawer"); },
    bases: {
      list: () => ask("bases"),
      lend: async (name, lend) => (await write<{ bases: BaseRow[] }>("POST", "bases/lend", { name, lend })).bases,
    },
    own: { repo: () => ask<OwnRepoInfo | null>("own/repo"), choose: (choice) => write<OwnRepoInfo>("POST", "own/choose", { choice }) },
    terminal: {
      view: () => ask<TerminalView>("terminal"),
      prompt: async (asked, given) => { await write("POST", "terminal/prompt", { asked, given }); },
      stop: async () => { await write("POST", "terminal/stop", {}); },
      reply: async (id, decision) => { await write("POST", "terminal/permission", { id, decision }); },
      take: (id) => write("POST", "agent/take", { id }),
      give: async (given) => { await write("POST", "acp/give", { given }); },
      follow: async (agent, session) => { await write("POST", "acp/follow", { agent, session }); },
      fresh: async (agent) => { await write("POST", "acp/new", { agent }); },
      list: async () => { await write("POST", "acp/list", {}); },
      set: async (kind, id, value) => { await write("POST", "acp/set", { kind, id, value }); },
      forget: async (agent, session) => { await write("POST", "acp/forget", { agent, session }); },
      project: () => ask<ProjectConfig>("connect"),
      writeProject: async () => (await write<{ written: string[] }>("POST", "connect", {})).written,
      chosen: () => ask<ChosenAgent>("acp/agent"),
      registry: () => ask<RegistryAgent[]>("acp/registry"),
      known: () => ask<KnownAgent[]>("acp/known"),
      choose: (choice) => write<ChosenAgent>("POST", "acp/choose", { choice }),
    },
    events(listener) {
      const source = new EventSource(root + "events");
      const on = (e: MessageEvent<string>) => { try { listener(JSON.parse(e.data) as EngineEvent); } catch { /* not ours */ } };
      const types = ["note-changed", "journal", "agent-start", "agent-step", "agent-done", "agent-sent", "agent-received", "agent-item", "agent-taken", "terminal"] satisfies EngineEvent["type"][];
      for (const type of types) source.addEventListener(type, on);
      return () => source.close();
    },
  };
}
