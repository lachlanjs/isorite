// The Api over HTTP: the engine behind `isorite serve`. The app is written
// against the Api interface (@isorite/engine), so a webview can later hand it
// the engine itself instead of this.

import { pictureType } from "@isorite/core";
import { baseHere } from "./here.ts";
import type { Api, Decision, EngineEvent, Given, NoteSource, Session, SetupCheck, SetupDraft, SetupView, TerminalView } from "@isorite/engine";

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

/** The terminal's session (M11), through the isorite server: there only when `isorite term` runs beside it. */
export interface TerminalApi {
  view(): Promise<TerminalView>;
  prompt(asked: string, given: Given[]): Promise<void>;
  stop(): Promise<void>;
  reply(id: string, decision: Decision): Promise<void>;
}

/** The provider's setup (M18), through the isorite server: there is none for the engine in the page (the guide's site). */
export interface SetupApi {
  view(): Promise<SetupView>;
  /** Keep it, and take it into use. Only from this machine. */
  keep(draft: SetupDraft): Promise<SetupView>;
  /** Doctor's checks of the provider, on the draft (null: as kept). Nothing is written. */
  check(draft: SetupDraft | null): Promise<SetupCheck[]>;
  /** The models the provider lists. */
  models(draft: SetupDraft | null): Promise<string[]>;
  /** isorite doctor --report: one block, its secrets hidden. */
  report(): Promise<string>;
}

/** The bases the server holds (M20), as the switcher lists them. */
export interface BaseRow { name: string; path: string; lend: boolean; open: boolean }
export interface BasesApi {
  list(): Promise<{ here: string; local: boolean; bases: BaseRow[] }>;
  /** Lend a base to every session, or stop (from this machine only). */
  lend(name: string, lend: boolean): Promise<BaseRow[]>;
}

/** Where the browser fetches a picture from (M22), so an `<img>` asks for it itself, cached and lazily. */
export interface FileUrls { fileUrl(path: string, from?: "notes" | "code"): string }

export function httpApi(root: string = new URL(baseHere() ? `b/${encodeURIComponent(baseHere())}/api/` : "api/", document.baseURI).href): Api & FileUrls & { terminal: TerminalApi; setup: SetupApi; bases: BasesApi } {
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
    ask: (request) => write("POST", "iso/ask", request),
    converse: (request) => write("POST", "iso/converse", request),
    undoTurn: (conversation, turn) => write("POST", "iso/undo", { conversation, turn }),
    setContext: (conversation, part, on) => write("POST", "iso/context", { conversation, part, on }),
    compact: (conversation, keep) => write("POST", "iso/compact", { conversation, ...(keep === undefined ? {} : { keep }) }),
    branch: (conversation) => write("POST", "iso/branch", { conversation }),
    agents: () => ask("agents"),
    saveAgents: (text) => write("POST", "agents", { text }),
    takeItem: (conversation, turn, item) => write("POST", "iso/take", { conversation, turn, item }),
    // The server's own: it names the repository when a terminal attaches, and tells the terminal's agent.
    nameRepository: async () => false,
    brokenNews: async () => [],
    answer: async (turn, permission, decision) => { await write("POST", "iso/answer", { turn, permission, decision }); },
    conversations: () => ask("conversations"),
    conversation: async (id) => { const c = await ask<{ id: string; turns: [] }>("conversation" + (id ? q(id) : "")); return c.id ? c : null; },
    turnContext: (request) => ask(`turn/context?turn=${encodeURIComponent(JSON.stringify(request))}`),
    stop: async (request) => { await write("POST", "iso/stop", { request }); },
    keep: (id, proposal, region) => write("POST", "proposal/keep" + q(id), { proposal, ...(region === undefined ? {} : { region }) }),
    revise: async (id, proposal, text) => { await write("POST", "proposal/revise" + q(id), { proposal, text }); },
    discard: async (id, proposal, region) => { await write("POST", "proposal/discard" + q(id), { proposal, ...(region === undefined ? {} : { region }) }); },
    drafts: () => ask("drafts"),
    createDraft: () => write("POST", "drafts", {}),
    keepDraft: (draft, proposal, folder) => write("POST", "draft/keep" + q(draft), { proposal, folder }),
    discardDraft: async (draft) => { await write("POST", "draft/discard" + q(draft), {}); },
    setDone: (id, done, base) => write("POST", "note/done" + q(id), { done, base }),
    context: (note, choice) => ask("context" + (note ? q(note) : "") + (choice ? `${note ? "&" : "?"}choice=${encodeURIComponent(JSON.stringify(choice))}` : "")),
    clearConversation: async () => { await write("POST", "context/clear", {}); },
    settings: () => ask("settings"),
    setKey: (key) => write("PUT", "settings/key", { key }),
    spend: () => ask("spend"),
    setSpendCap: (usd) => write("PUT", "settings/spend-cap", { usd }),
    connect: (callback) => write("POST", "settings/connect", { callback }),
    connected: (code, state) => write("POST", "settings/connected", { code, state }),
    agentTools: () => ask("agent/tools"),
    agentLook: (look) => write("POST", "agent/look", look),
    agentWrite: (proposal) => write("POST", "agent/write", proposal),
    agentSend: (sent) => write("POST", "agent/send", sent),
    agentReceived: async (id, agent) => { await write("POST", "agent/received", { id, agent }); },
    agentStatus: async (agent, session, busy) => { await write("POST", "agent/status", { agent, session, busy }); },
    setup: {
      view: () => ask<SetupView>("settings/provider"),
      keep: (draft) => write("PUT", "settings/provider", draft),
      check: (draft) => write("POST", "settings/provider/check", { draft }),
      models: async (draft) => (await write<{ models: string[] }>("POST", "settings/provider/models", { draft })).models,
      report: async () => (await write<{ text: string }>("POST", "settings/report", {})).text,
    },
    bases: {
      list: () => ask("bases"),
      lend: async (name, lend) => (await write<{ bases: BaseRow[] }>("POST", "bases/lend", { name, lend })).bases,
    },
    terminal: {
      view: () => ask<TerminalView>("terminal"),
      prompt: async (asked, given) => { await write("POST", "terminal/prompt", { asked, given }); },
      stop: async () => { await write("POST", "terminal/stop", {}); },
      reply: async (id, decision) => { await write("POST", "terminal/permission", { id, decision }); },
    },
    events(listener) {
      const source = new EventSource(root + "events");
      const on = (e: MessageEvent<string>) => { try { listener(JSON.parse(e.data) as EngineEvent); } catch { /* not ours */ } };
      const types = ["note-changed", "journal", "record", "iso-start", "iso-step", "iso-text", "iso-item", "iso-answer", "iso-taken", "iso-done", "iso-stopped", "iso-failed", "iso-retry", "context", "agent-start", "agent-step", "agent-done", "agent-sent", "agent-received", "terminal"] satisfies EngineEvent["type"][];
      for (const type of types) source.addEventListener(type, on);
      return () => source.close();
    },
  };
}
