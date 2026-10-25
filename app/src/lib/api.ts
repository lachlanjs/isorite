// The Api over HTTP: the engine behind `isorite serve`. The app is written
// against the Api interface (@isorite/engine), so a webview can later hand it
// the engine itself instead of this.

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

/** The terminal's session (M11), through the isorite server: there only when `isorite term` runs beside it. */
export interface TerminalApi {
  view(): Promise<TerminalView>;
  prompt(asked: string, given: Given[]): Promise<void>;
  stop(): Promise<void>;
  reply(id: string, decision: Decision): Promise<void>;
}

export function httpApi(root: string = new URL("api/", document.baseURI).href): Api & { terminal: TerminalApi } {
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

  return {
    session: async () => { const { token: t, ...rest } = await session(); token = Promise.resolve(t); return rest; },
    notes: () => ask("notes"),
    readNote: (id) => ask("note" + q(id)),
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
    understanding: (note) => ask("understanding" + q(note)),
    saveScratchpad: (note, scratchpad, base) => write("POST", "understanding/scratchpad" + q(note), { scratchpad, base }),
    undoTurn: (conversation, turn) => write("POST", "iso/undo", { conversation, turn }),
    takeItem: (conversation, turn, item) => write("POST", "iso/take", { conversation, turn, item }),
    // The server's own: it names the repository when a terminal attaches, and tells the terminal's agent.
    nameRepository: async () => false,
    brokenNews: async () => [],
    answer: async (turn, permission, decision) => { await write("POST", "iso/answer", { turn, permission, decision }); },
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
    connect: (callback) => write("POST", "settings/connect", { callback }),
    connected: (code, state) => write("POST", "settings/connected", { code, state }),
    agentTools: () => ask("agent/tools"),
    agentLook: (look) => write("POST", "agent/look", look),
    agentWrite: (proposal) => write("POST", "agent/write", proposal),
    agentSend: (sent) => write("POST", "agent/send", sent),
    agentReceived: async (id, agent) => { await write("POST", "agent/received", { id, agent }); },
    agentStatus: async (agent, session, busy) => { await write("POST", "agent/status", { agent, session, busy }); },
    terminal: {
      view: () => ask<TerminalView>("terminal"),
      prompt: async (asked, given) => { await write("POST", "terminal/prompt", { asked, given }); },
      stop: async () => { await write("POST", "terminal/stop", {}); },
      reply: async (id, decision) => { await write("POST", "terminal/permission", { id, decision }); },
    },
    events(listener) {
      const source = new EventSource(root + "events");
      const on = (e: MessageEvent<string>) => { try { listener(JSON.parse(e.data) as EngineEvent); } catch { /* not ours */ } };
      const types = ["note-changed", "journal", "record", "iso-start", "iso-step", "iso-text", "iso-item", "iso-answer", "iso-taken", "iso-done", "iso-stopped", "iso-failed", "agent-start", "agent-step", "agent-done", "agent-sent", "agent-received", "terminal"] satisfies EngineEvent["type"][];
      for (const type of types) source.addEventListener(type, on);
      return () => source.close();
    },
  };
}
