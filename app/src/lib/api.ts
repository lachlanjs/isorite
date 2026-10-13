// The Api over HTTP: the engine behind `isorite serve`. The app is written
// against the Api interface (@isorite/engine), so a webview can later hand it
// the engine itself instead of this.

import type { Api, EngineEvent, NoteSource, Session } from "@isorite/engine";

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

export function httpApi(root: string = new URL("api/", document.baseURI).href): Api {
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
    search: (query) => ask(`search?q=${encodeURIComponent(query)}`),
    ask: (request) => write("POST", "iso/ask", request),
    stop: async (request) => { await write("POST", "iso/stop", { request }); },
    keep: (id, proposal, region) => write("POST", "proposal/keep" + q(id), { proposal, ...(region === undefined ? {} : { region }) }),
    revise: async (id, proposal, text) => { await write("POST", "proposal/revise" + q(id), { proposal, text }); },
    discard: async (id, proposal, region) => { await write("POST", "proposal/discard" + q(id), { proposal, ...(region === undefined ? {} : { region }) }); },
    drafts: () => ask("drafts"),
    createDraft: () => write("POST", "drafts", {}),
    keepDraft: (draft, proposal, folder) => write("POST", "draft/keep" + q(draft), { proposal, folder }),
    discardDraft: async (draft) => { await write("POST", "draft/discard" + q(draft), {}); },
    context: (note) => ask("context" + (note ? q(note) : "")),
    clearConversation: async () => { await write("POST", "context/clear", {}); },
    settings: () => ask("settings"),
    setKey: (key) => write("PUT", "settings/key", { key }),
    events(listener) {
      const source = new EventSource(root + "events");
      const on = (e: MessageEvent<string>) => { try { listener(JSON.parse(e.data) as EngineEvent); } catch { /* not ours */ } };
      const types = ["note-changed", "journal", "record", "iso-start", "iso-step", "iso-text", "iso-done", "iso-stopped", "iso-failed"] satisfies EngineEvent["type"][];
      for (const type of types) source.addEventListener(type, on);
      return () => source.close();
    },
  };
}
