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

/** The native agent's model and keys (M36, step 8), from this machine only. A key is sent and never read back. */
export interface PiState {
  /** The pane of this base is the native agent's now (else a choice here takes effect at the next start). */
  active: boolean;
  choice: { provider: string; model: string } | null;
  /** Who chose: the environment (ISORITE_PI) wins over the settings while it is set. */
  source: "environment" | "settings" | null;
  providers: { id: string; name: string; env: string }[];
  keys: Record<string, "saved" | "environment" | null>;
  /** What the native agent may reach in the project (step 9), and whether the environment sets it. */
  reach: { files: "off" | "read" | "write"; shell: boolean };
  reachFromEnvironment: boolean;
  /** The gateway config.toml's [provider] names (never a key, a passphrase or a header's value), why it cannot be
   *  used, or null where it names none. */
  gateway: { name: string; url: string; models: string[]; certificate: string[]; keyHeader: string | null; headers: string[] } | { problem: string } | null;
}
export interface PiApi {
  state(): Promise<PiState>;
  setKey(provider: string, key: string): Promise<void>;
  removeKey(provider: string): Promise<void>;
  choose(provider: string, model: string): Promise<void>;
  /** The models a provider offers, by id. */
  models(provider: string): Promise<string[]>;
  /** One short request with the key and model: how long it took, or (thrown) why it did not answer. */
  check(provider: string, model: string): Promise<{ ms: number; said: string }>;
  setReach(files: "off" | "read" | "write", shell: boolean): Promise<void>;
  /** The agent's skills for this base: where each came from, whether it is on, and (for one that could not be read) why not. */
  skills(): Promise<PiSkill[]>;
  setSkill(name: string, enabled: boolean): Promise<PiSkill[]>;
}
export interface PiSkill { name: string; description: string; source: "built-in" | "yours" | "base"; enabled: boolean; error?: string }

/** The pane's agent session (isorite's own agent), through the isorite server; on the guide's site, the finder's. */
export interface TerminalApi {
  view(): Promise<TerminalView>;
  prompt(asked: string, given: Given[], images?: string[]): Promise<void>;
  /** Hand the server an image for the next prompt: its id, to send with it. Absent where the agent cannot be given one. */
  image?(bytes: Uint8Array): Promise<{ id: string; type: string }>;
  /** Where an image sent with a turn is shown from. */
  imageUrl?(id: string): string;
  /** Say something while the agent works, to come in after the step running now (M36). */
  steer(asked: string, given: Given[]): Promise<void>;
  stop(): Promise<void>;
  reply(id: string, decision: Decision): Promise<void>;
  /** Keep what the agent asked back or offered (M25). */
  take(id: string): Promise<{ note: string }>;
  /** What is in the tray, for the next prompt in the session shown, asked here or in the terminal (M25). */
  give(given: Given[]): Promise<void>;
  /** A chip was taken out of the tray: the agent, where it can, stops being sent what was given with it (M36). */
  withdraw(given: Given): Promise<void>;
  /** Show an agent's session (M25): a live one, one the agent carries on, or one kept, to read. */
  follow(agent: string, session: string): Promise<void>;
  /** A new session that begins where a kept one is and goes its own way (M36), where the agent's sessions can be forked. */
  fork(agent: string, session: string): Promise<void>;
  /** A new session with an attached agent, from here. */
  fresh(agent: string): Promise<void>;
  /** Ask the attached agents for their sessions again. */
  list(): Promise<void>;
  /** Remove isorite's kept copy of a session that is not live; the agent's own history stays. */
  forget(agent: string, session: string): Promise<void>;
}
/** Where isorite's own files are kept (M27): in a repository of their own, or with the project's, what this machine chose,
 *  and the commands to copy. isorite runs none of them. */
export interface OwnRepoInfo { state: "own" | "tracked" | "shared" | "none" | "unavailable"; path: string; project: string | null; remotes: string[]; choice: "project" | "separate" | null; ask: boolean; commands: string[]; problem: string }

/** The bases the server holds (M20), as the switcher lists them. */
export interface BaseRow { name: string; path: string; lend: boolean; open: boolean; title: string }
export interface BasesApi {
  list(): Promise<{ here: string; local: boolean; bases: BaseRow[] }>;
  /** Lend a base to every session, or stop (from this machine only). */
  lend(name: string, lend: boolean): Promise<BaseRow[]>;
  /** Show a base by a title of its own; empty, by its name again. */
  title(name: string, title: string): Promise<BaseRow[]>;
}

/** Where the browser fetches a picture from (M22), so an `<img>` asks for it itself, cached and lazily. */
export interface FileUrls { fileUrl(path: string, from?: "notes" | "code"): string }

export function httpApi(root: string = new URL(baseHere() ? `b/${encodeURIComponent(baseHere())}/api/` : "api/", document.baseURI).href): Api & FileUrls & { terminal: TerminalApi; pi: PiApi; bases: BasesApi; own: { repo(): Promise<OwnRepoInfo | null>; choose(choice: "project" | "separate"): Promise<OwnRepoInfo> } } {
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
    code: (href, full) => ask(`code?href=${encodeURIComponent(href)}${full ? "&full=1" : ""}`),
    addImage: async (dir, name, bytes) => {
      token ??= session().then((s) => s.token);
      return ask(`image?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-isorite-token": await token }, body: bytes as Uint8Array<ArrayBuffer> });
    },
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
    makeFolder: (path) => write("POST", "folder", { path }),
    moveFolder: async (from, to) => { await write("POST", "folder/move", { from, to }); },
    deleteFolder: async (path) => { await write("POST", "folder/delete", { path }); },
    moveNote: (id, to, base) => write("POST", "note/move" + q(id), { to, base }),
    deleteNote: async (id, base) => { await write("POST", "note/delete" + q(id), { base }); },
    restore: (id, entry, base) => write("POST", "note/restore" + q(id), { entry, base }),
    map: () => ask("map"),
    lenses: () => ask("lenses"),
    lens: (name) => ask(`lens?name=${encodeURIComponent(name)}`),
    timeline: () => ask("timeline"),
    search: (query) => ask(`search?q=${encodeURIComponent(query)}`),
    find: (query) => ask(`find?q=${encodeURIComponent(query)}`),
    agents: () => ask("agents"),
    saveAgents: (text) => write("POST", "agents", { text }),
    // The server's own: it tells the agent of broken code links with its next prompt.
    nameRepository: async () => false,
    agentNotes: () => ask("agents/notes"),
    setAgentNotes: (may) => write("POST", "agents/notes", { may }),
    // The server's own too: the skills are listed and switched through `pi.skills`.
    agentSkillsOff: async () => ({ off: [] }),
    setAgentSkillsOff: async () => undefined,
    hidden: () => ask("hidden"),
    setHidden: (ids) => write("POST", "hidden", { ids }),
    brokenNews: async () => [],
    conversations: () => ask("conversations"),
    deleteConversation: async (id) => { await write("POST", "conversation/delete", { id }); },
    conversation: async (id) => { const c = await ask<{ id: string; turns: [] }>("conversation" + (id ? q(id) : "")); return c.id ? c : null; },
    setDone: (id, done, base) => write("POST", "note/done" + q(id), { done, base }),
    agentTools: () => ask("agent/tools"),
    agentLook: (look) => write("POST", "agent/look", look),
    agentWrite: (proposal) => write("POST", "agent/write", proposal),
    agentSend: (sent) => write("POST", "agent/send", sent),
    agentReceived: async (id, agent) => { await write("POST", "agent/received", { id, agent }); },
    agentStatus: async (agent, session, busy) => { await write("POST", "agent/status", { agent, session, busy }); },
    agentTake: (id) => write("POST", "agent/take", { id }),
    keepAgentRecord: async () => { throw new Error("only the server keeps an agent's session"); },
    agentRecords: () => ask("agent/records"),
    agentRecord: (agent, session) => ask(`agent/record?agent=${encodeURIComponent(agent)}&session=${encodeURIComponent(session)}`),
    deleteAgentRecord: async () => { throw new Error("a kept session is removed through the pane's drawer"); },
    bases: {
      list: () => ask("bases"),
      lend: async (name, lend) => (await write<{ bases: BaseRow[] }>("POST", "bases/lend", { name, lend })).bases,
      title: async (name, title) => (await write<{ bases: BaseRow[] }>("POST", "bases/title", { name, title })).bases,
    },
    own: { repo: () => ask<OwnRepoInfo | null>("own/repo"), choose: (choice) => write<OwnRepoInfo>("POST", "own/choose", { choice }) },
    pi: {
      state: () => ask<PiState>("pi"),
      setKey: async (provider, key) => { await write("POST", "pi/key", { provider, key }); },
      removeKey: async (provider) => { await write("POST", "pi/key/remove", { provider }); },
      choose: async (provider, model) => { await write("POST", "pi/choose", { provider, model }); },
      models: async (provider) => (await ask<{ models: string[] }>(`pi/models?provider=${encodeURIComponent(provider)}`)).models,
      check: (provider, model) => write("POST", "pi/check", { provider, model }) as Promise<{ ms: number; said: string }>,
      setReach: async (files, shell) => { await write("POST", "pi/reach", { files, shell }); },
      skills: async () => (await ask<{ skills: PiSkill[] }>("pi/skills")).skills,
      setSkill: async (name, enabled) => ((await write("POST", "pi/skills", { name, enabled })) as { skills: PiSkill[] }).skills,
    },
    terminal: {
      view: () => ask<TerminalView>("terminal"),
      prompt: async (asked, given, images) => { await write("POST", "terminal/prompt", { asked, given, ...(images?.length ? { images } : {}) }); },
      image: async (bytes) => {
        token ??= session().then((s) => s.token);
        return ask(`terminal/image`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-isorite-token": await token }, body: bytes as Uint8Array<ArrayBuffer> });
      },
      imageUrl: (id) => `${root}terminal/image?id=${encodeURIComponent(id)}`,
      steer: async (asked, given) => { await write("POST", "terminal/steer", { asked, given }); },
      stop: async () => { await write("POST", "terminal/stop", {}); },
      reply: async (id, decision) => { await write("POST", "terminal/permission", { id, decision }); },
      take: (id) => write("POST", "agent/take", { id }),
      give: async (given) => { await write("POST", "terminal/give", { given }); },
      withdraw: async (given) => { await write("POST", "terminal/withdraw", { given }); },
      follow: async (agent, session) => { await write("POST", "terminal/follow", { agent, session }); },
      fork: async (agent, session) => { await write("POST", "terminal/fork", { agent, session }); },
      fresh: async (agent) => { await write("POST", "terminal/new", { agent }); },
      list: async () => { await write("POST", "terminal/list", {}); },
      forget: async (agent, session) => { await write("POST", "terminal/forget", { agent, session }); },
    },
    events(listener, live) {
      const source = new EventSource(root + "events");
      // The browser reconnects by itself; what changed while the stream was down is caught up by whoever hears `live`.
      let down = false;
      source.addEventListener("open", () => { if (down) { down = false; live?.(true); } });
      source.addEventListener("error", () => { if (!down) { down = true; live?.(false); } });
      const on = (e: MessageEvent<string>) => { try { listener(JSON.parse(e.data) as EngineEvent); } catch { /* not ours */ } };
      const types = ["note-changed", "hidden", "lenses", "journal", "agent-start", "agent-step", "agent-done", "agent-sent", "agent-received", "agent-item", "agent-taken", "terminal"] satisfies EngineEvent["type"][];
      for (const type of types) source.addEventListener(type, on);
      return () => source.close();
    },
  };
}
