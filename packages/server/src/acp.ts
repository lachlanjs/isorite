// An agent's session over ACP, in the Iso pane (M25). `isorite acp` stands between an ACP front end (Toad, Zed) and
// the agent, passes every message through, and tells this server what passed (`tap`). Here the messages are folded
// into the pane's view of a session, the one M11 drew for OpenCode's; and what the pane asks (a prompt, a stop, an
// answer to a permission, notes given for the next prompt) is handed back to the wrapper to send into the session.
//
// The base sees the agent too. Each prompt is a turn on the Atlas. A file of the base the agent reads with its own
// tools (agents read the Markdown more often than they use isorite's: the M25 spike) is a step there, as a note read;
// one it changes is entered in the note's journal under its name, with what was asked, not as a change from elsewhere.
// What it asks back or offers through isorite's MCP (ask_question, offer_text) stands in the turn, to keep or not.

import { isAbsolute, relative, resolve, sep } from "node:path";
import { givenKey, notesOfTurns, type AgentRecord, type AgentSession, type Api, type EngineEvent, type Given, type TerminalItem, type TerminalPermission, type TerminalTurn, type TerminalView } from "@isorite/engine";
import { OWN_DIR } from "@isorite/core";
import type { Terminal } from "./terminal.ts";
import { INSTRUCTIONS, agentName } from "./mcp-http.ts";

/** Which way a message went: from the front end to the agent, from the agent, or from isorite to the agent. */
export type Way = "in" | "out" | "ours";
export interface Rpc { jsonrpc?: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> | null; error?: { message?: string } }
/** What a wrapper is asked to send for the pane, in one of the sessions it carries. `give` is put before that
 *  session's next prompt, from either place; `open` carries a session on (or starts one, with no id) from the pane,
 *  and asks `then` in it once it is open; `list` asks the agent for its sessions. */
export type Command =
  | { type: "prompt"; session: string; text: string }
  | { type: "cancel"; session: string }
  | { type: "permission"; id: string; optionId: string }
  | { type: "give"; session: string; text: string }
  | { type: "open"; session?: string; then?: string; give?: string }
  | { type: "list" };
/** The session the Atlas's turns and isorite's MCP calls are kept under, for the agent the wrapper carries. */
export const ACP_SESSION = "acp";

const OUTPUT = 4000;
const NOTE_TOOLS = /(^|[_:./-])(read_note|outline_note|edit_note|write_note)$/;
const CHANGES = new Set(["edit", "delete", "move"]);
/** ACP's kinds of tool, as the pane's switches name what is asked. */
const ACTIONS: Record<string, string> = { execute: "shell", edit: "edit", delete: "edit", move: "edit", read: "read", fetch: "webfetch" };
const EMPTY: TerminalView = { connected: false, via: "acp", agent: "", session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", sessions: [] };

type Asking = TerminalPermission & { options: { optionId: string; kind: string }[] };
type Block = { type?: string; text?: string; name?: string; uri?: string };
type Content = { type?: string; content?: Block; path?: string; oldText?: string | null; newText?: string };
type Tool = Extract<TerminalItem, { kind: "tool" }>;

const textOf = (blocks: unknown): string =>
  (Array.isArray(blocks) ? (blocks as Block[]) : [blocks as Block]).map((b) => (b?.type === "text" ? b.text ?? "" : b?.type === "resource_link" ? `@${b.name ?? b.uri ?? ""}` : "")).join("");
const lines = (v: string | null | undefined) => (v ? v.replace(/\n$/, "").split("\n") : []);
const keyOf = (agent: string, session: string): string => `${agent}\u0000${session}`;

export interface FollowerOptions {
  /** The base's engine, told of the agent's turns, reads and changes, and keeping its sessions. */
  api?: Pick<Api, "agentStatus" | "agentLook" | "agentChanged" | "events"> & Partial<Pick<Api, "keepAgentRecord" | "agentRecords" | "agentRecord" | "agentTools">>;
  /** The base's folder: a file in it (outside its .isorite/) is a note. */
  notes?: string;
  clock?: () => number;
}

/** A wrapper attached: one agent's process, behind one front end. */
interface Link {
  id: string;
  send: (c: Command) => void;
  /** The agent as its changes are signed, and as it names itself. */
  agent: string;
  name: string;
  /** What it can do with sessions it did not start here. */
  can: { load: boolean; resume: boolean; list: boolean };
  /** Requests toward the agent, by id, until answered; and the agent's own. */
  toAgent: Map<string, Rpc>;
  fromAgent: Map<string, Rpc>;
  /** The agent's own sessions, as its session/list last said. */
  listed: { session: string; title: string; last: string }[];
  /** A session asked for from the pane, to be shown once it opens. */
  opening: string | null;
}

/** A session being carried, live. */
interface Live {
  link: Link;
  session: string;
  from: "terminal" | "here";
  at: string;
  cwd: string;
  title: string;
  turns: TerminalTurn[];
  busy: boolean;
  cost: number;
  used: number;
  size: number;
  asking: Map<string, Asking>;
  /** The notes the agent read or changed in this turn, each told to the base once. */
  seen: Set<string>;
  /** History being replayed (session/load), and whether a user's message is being joined to. */
  loading: boolean;
  replaying: boolean;
  /** What was given from the pane for the next prompt, and everything given in the session so far. */
  pending: { parts: Given[]; text: string } | null;
  given: Set<string>;
}

/** The sessions the wrappers carry, as the pane draws them. One is shown: the one you chose, else the last to start. */
export class AcpFollower {
  #links = new Map<string, Link>();
  #lives = new Map<string, Live>();
  #kept: AgentSession[] = [];
  /** The session shown, by agent and id; whether you chose it; and a kept one shown to read, with no agent for it. */
  #shown: string | null = null;
  #chosen = false;
  #reading: AgentRecord | null = null;
  #view: TerminalView = EMPTY;
  #ours = 0;
  #listeners = new Set<(view: TerminalView) => void>();
  readonly #api: FollowerOptions["api"];
  readonly #notes: string | undefined;
  readonly #now: () => number;

  constructor({ api, notes, clock = Date.now }: FollowerOptions = {}) {
    this.#api = api;
    this.#notes = notes;
    this.#now = clock;
    void this.#readKept();
    // What isorite's MCP puts in each session: its instructions and its tools, as their text, about four characters a token.
    void api?.agentTools?.().then((tools) => { this.#ours = Math.ceil((INSTRUCTIONS.length + JSON.stringify(tools).length) / 4); this.#tell(); }, () => undefined);
    // What the agent asks back or offers through isorite's MCP stands in its turn, until kept: the turn running
    // for that agent, else the one shown.
    api?.events((e: EngineEvent) => {
      if (e.type === "agent-item") {
        const live = [...this.#lives.values()].find((l) => l.link.agent === e.agent && l.busy) ?? this.#shownLive();
        if (live && live.link.agent === e.agent && this.#edit(live, (items) => [...items, e.item])) this.#tell();
      }
      if (e.type === "agent-taken") {
        const mark = (t: TerminalTurn): TerminalTurn => ({ ...t, items: t.items.map((i) => (i.kind === "question" && i.id === e.id ? { ...i, made: e.note } : i.kind === "offer" && i.id === e.id ? { ...i, taken: true } : i)) });
        for (const l of this.#lives.values()) if (l.turns.some((t) => t.items.some((i) => (i.kind === "question" || i.kind === "offer") && i.id === e.id))) { l.turns = l.turns.map(mark); this.#keep(l); }
        this.#tell();
      }
    });
  }

  view(): TerminalView { return this.#view; }
  listen(fn: (view: TerminalView) => void): () => void { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }

  /** The view of the session shown, with every session on the base, told to whoever listens. */
  #tell(): void {
    const live = this.#shownLive(), read = !live ? this.#reading : null;
    const connected = this.#links.size > 0;
    if (live) {
      this.#view = {
        connected, via: "acp", agent: live.link.name, agentId: live.link.agent, session: live.session, title: live.title, busy: live.busy, turns: live.turns,
        asking: [...live.asking.values()].map(({ options: _, ...p }) => p), cost: live.cost, tokens: { input: live.used, output: 0 }, model: "", size: live.size, ours: this.#ours, sessions: this.#sessions(),
      };
    } else if (read) {
      this.#view = { ...EMPTY, connected, reading: true, agent: read.name, agentId: read.agent, session: read.session, title: read.title, turns: read.turns, sessions: this.#sessions() };
    } else {
      const link = [...this.#links.values()].at(-1);
      this.#view = { ...EMPTY, connected, agent: link?.name ?? "", agentId: link?.agent ?? "", sessions: this.#sessions() };
    }
    for (const fn of this.#listeners) fn(this.#view);
  }
  #shownLive(): Live | undefined { return this.#shown ? this.#lives.get(this.#shown) : undefined; }

  /** The drawer's sessions: live ones, the agents' own, and those kept here, newest first. */
  #sessions(): AgentSession[] {
    const all = new Map<string, AgentSession>();
    const open = (agent: string) => [...this.#links.values()].some((k) => k.agent === agent && (k.can.load || k.can.resume));
    for (const k of this.#kept) all.set(keyOf(k.agent, k.session), { ...k, open: open(k.agent) });
    for (const link of this.#links.values()) {
      for (const l of link.listed) {
        const key = keyOf(link.agent, l.session), was = all.get(key);
        all.set(key, was ? { ...was, title: was.title || l.title, last: was.last > l.last ? was.last : l.last } : { agent: link.agent, name: link.name, session: l.session, title: l.title, asked: "", last: l.last, turns: 0, notes: 0, live: false, busy: false, kept: false, open: open(link.agent) });
      }
    }
    for (const l of this.#lives.values()) {
      const key = keyOf(l.link.agent, l.session), was = all.get(key);
      const last = l.turns.at(-1)?.at ?? l.at;
      all.set(key, { agent: l.link.agent, name: l.link.name, session: l.session, title: l.title || was?.title || "", asked: l.turns[0]?.asked ?? was?.asked ?? "", last: was && was.last > last ? was.last : last, turns: Math.max(l.turns.length, was?.turns ?? 0), notes: Math.max(notesOfTurns(l.turns), was?.notes ?? 0), live: true, busy: l.busy, kept: !!was?.kept, open: true });
    }
    return [...all.values()].sort((a, b) => (a.live !== b.live ? (a.live ? -1 : 1) : a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  }
  async #readKept(): Promise<void> {
    try { this.#kept = (await this.#api?.agentRecords?.()) ?? []; this.#tell(); } catch { /* none kept */ }
  }

  /** A wrapper's channel: what the pane asks of its sessions goes down it. Returns the hang-up. */
  connect(id: string, send: (c: Command) => void): () => void {
    this.#hangUp(id);
    this.#links.set(id, { id, send, agent: "", name: "", can: { load: false, resume: false, list: false }, toAgent: new Map(), fromAgent: new Map(), listed: [], opening: null });
    this.#tell();
    return () => { if (this.#links.get(id)?.send === send) { this.#hangUp(id); this.#tell(); } };
  }
  #hangUp(id: string): void {
    const link = this.#links.get(id);
    if (!link) return;
    for (const [key, l] of this.#lives) {
      if (l.link !== link) continue;
      if (l.busy && link.agent) void this.#api?.agentStatus(link.agent, ACP_SESSION, false).catch(() => undefined);
      this.#lives.delete(key);
      if (this.#shown === key) { this.#shown = null; this.#chosen = false; }
    }
    this.#links.delete(id);
    this.#shown ??= [...this.#lives.keys()].at(-1) ?? null;
    void this.#readKept();
  }

  /** What is being asked of an agent now, for a note it changes: its turn running. */
  asked(agent: string): string {
    const live = [...this.#lives.values()].find((l) => l.link.agent === agent && l.busy);
    return live?.turns.at(-1)?.state === "running" ? live.turns.at(-1)!.asked : "";
  }

  /** Ask in the session shown; with none yet, in a new one with the agent last attached. */
  async prompt(text: string): Promise<void> {
    const live = this.#shownLive();
    if (live) { live.link.send({ type: "prompt", session: live.session, text }); return; }
    const link = this.#reading ? [...this.#links.values()].find((k) => k.agent === this.#reading!.agent) : [...this.#links.values()].at(-1);
    if (!link) throw new Error("no agent is attached: start one with isorite acp");
    link.opening = this.#reading?.session ?? "";
    link.send({ type: "open", ...(this.#reading ? { session: this.#reading.session } : {}), then: text, ...(this.#unopened ? { give: this.#unopened.text } : {}) });
  }
  /** Given before a session was open: for the one the next prompt opens. */
  #unopened: { parts: Given[]; text: string } | null = null;
  async interrupt(): Promise<void> { const live = this.#need(); live.link.send({ type: "cancel", session: live.session }); }
  /** Notes and passages given from the pane: those not given in the session yet go before its next prompt. */
  async give(parts: Given[], render: (parts: Given[]) => string): Promise<void> {
    const live = this.#shownLive();
    if (!live) { this.#unopened = parts.length ? { parts, text: render(parts) } : null; return; }
    const fresh = parts.filter((g) => !live.given.has(givenKey(g)));
    live.pending = fresh.length ? { parts: fresh, text: render(fresh) } : null;
    live.link.send({ type: "give", session: live.session, text: live.pending?.text ?? "" });
  }
  async reply(id: string, decision: "once" | "always" | "reject"): Promise<void> {
    const live = [...this.#lives.values()].find((l) => l.asking.has(id));
    const asked = live?.asking.get(id);
    if (!live || !asked) throw new Error("the agent is not asking that");
    const kinds = decision === "once" ? ["allow_once"] : decision === "always" ? ["allow_always", "allow_once"] : ["reject_once", "reject_always"];
    const option = kinds.map((k) => asked.options.find((o) => o.kind === k)).find(Boolean);
    if (!option) throw new Error("the agent gave no such choice");
    live.link.send({ type: "permission", id, optionId: option.optionId });
  }
  #need(): Live {
    const live = this.#shownLive();
    if (!live) throw new Error("no agent's session is shown: start one with isorite acp");
    return live;
  }

  /** Show a session: a live one; one an attached agent can carry on, which it is asked to; or one kept, to read. */
  async follow(agent: string, session: string): Promise<void> {
    const key = keyOf(agent, session);
    this.#shown = key; this.#chosen = true; this.#reading = null;
    if (!this.#lives.has(key)) {
      this.#reading = (await this.#api?.agentRecord?.(agent, session)) ?? null;
      const link = [...this.#links.values()].find((k) => k.agent === agent && (k.can.load || k.can.resume));
      if (link) { link.opening = session; link.send({ type: "open", session }); }
      else if (!this.#reading) { this.#shown = null; this.#chosen = false; this.#tell(); throw new Error("that session is neither kept here nor with an agent attached"); }
    }
    this.#tell();
  }
  /** A new session from the pane, with an attached agent. */
  async fresh(agent: string): Promise<void> {
    const link = [...this.#links.values()].find((k) => k.agent === agent);
    if (!link) throw new Error(`${agent} is not attached`);
    link.opening = "";
    link.send({ type: "open" });
  }
  /** Ask the attached agents for their sessions again: the drawer is being looked at. */
  refresh(): void {
    for (const link of this.#links.values()) if (link.can.list) link.send({ type: "list" });
    void this.#readKept();
  }

  /** What passed through a wrapper, in order. */
  tap(id: string, messages: { way: Way; message: Rpc }[]): void {
    const link = this.#links.get(id);
    if (!link) return;
    for (const { way, message } of messages) this.#fold(link, way, message);
    this.#tell();
  }

  #fold(link: Link, way: Way, m: Rpc): void {
    const key = m.id === undefined || m.id === null ? null : String(m.id);
    const sessionId = typeof m.params?.sessionId === "string" ? m.params.sessionId : "";
    // A request toward the agent, kept until its answer comes back.
    if (m.method && key !== null && way !== "out") {
      link.toAgent.set(key, m);
      const live = this.#lives.get(keyOf(link.agent, sessionId));
      if (m.method === "session/prompt" && live) this.#begin(live, key, way, m);
      // Carried on: its history, if the agent replays it, comes before the answer.
      if ((m.method === "session/load" || m.method === "session/resume") && sessionId) {
        const l = this.#open(link, sessionId, way, typeof m.params?.cwd === "string" ? m.params.cwd : "");
        l.loading = m.method === "session/load";
      }
      return;
    }
    // The agent's own request: a permission to ask.
    if (m.method && key !== null && way === "out") {
      link.fromAgent.set(key, m);
      const live = this.#lives.get(keyOf(link.agent, sessionId));
      if (m.method === "session/request_permission" && live) {
        const call = (m.params?.toolCall ?? {}) as { title?: string; kind?: string; toolCallId?: string; rawInput?: Record<string, unknown>; locations?: { path?: string }[] };
        const command = typeof call.rawInput?.command === "string" ? call.rawInput.command : "";
        // Said as the pane's switches know actions: a command is shell, a change to a file edit (M12, Q47).
        const tool = live.turns.at(-1)?.items.find((i): i is Tool => i.kind === "tool" && i.id === call.toolCallId);
        const kind = call.kind ?? tool?.name ?? "";
        const action = ACTIONS[kind] ?? call.title ?? "act";
        const paths = (call.locations ?? []).map((l) => l.path).filter((p): p is string => typeof p === "string");
        live.asking.set(key, { id: key, action, resources: command ? [command] : paths.length ? paths : ACTIONS[kind] && call.title ? [call.title] : [], ...(call.toolCallId ? { tool: call.toolCallId } : {}), options: (m.params?.options as Asking["options"]) ?? [] });
      }
      return;
    }
    // An answer.
    if (!m.method && key !== null) {
      if (way !== "out") {
        link.fromAgent.delete(key);
        for (const l of this.#lives.values()) l.asking.delete(key);
        return;
      }
      const asked = link.toAgent.get(key);
      link.toAgent.delete(key);
      const params = asked?.params ?? {};
      const live = this.#lives.get(keyOf(link.agent, typeof params.sessionId === "string" ? params.sessionId : ""));
      switch (asked?.method) {
        case "initialize": {
          const info = m.result?.agentInfo as { name?: string; title?: string } | undefined;
          const caps = (m.result?.agentCapabilities ?? {}) as { loadSession?: boolean; sessionCapabilities?: { resume?: unknown; list?: unknown } };
          link.agent = agentName(info?.name ?? "agent");
          link.name = info?.title ?? info?.name ?? "The agent";
          link.can = { load: !!caps.loadSession, resume: !!caps.sessionCapabilities?.resume, list: !!caps.sessionCapabilities?.list };
          if (link.can.list) link.send({ type: "list" });
          void this.#readKept();
          break;
        }
        case "session/new":
          if (typeof m.result?.sessionId === "string") this.#open(link, m.result.sessionId, key.startsWith("isorite-") ? "ours" : "in", typeof params.cwd === "string" ? params.cwd : "");
          break;
        case "session/load":
        case "session/resume":
          if (live) {
            if (m.error) { this.#lives.delete(keyOf(link.agent, live.session)); break; }
            void this.#loaded(live);
          }
          break;
        case "session/prompt":
          if (live) {
            const stop = m.error ? "failed" : m.result?.stopReason === "cancelled" ? "stopped" : m.result?.stopReason === "end_turn" ? "done" : "failed";
            live.busy = false;
            live.turns = live.turns.map((t) => (t.id === key ? { ...t, state: stop } : t));
            if (link.agent) void this.#api?.agentStatus(link.agent, ACP_SESSION, false).catch(() => undefined);
            this.#keep(live);
          }
          break;
        case "session/list":
          if (Array.isArray(m.result?.sessions)) {
            link.listed = (m.result.sessions as { sessionId?: string; title?: string | null; updatedAt?: string | null }[]).filter((x) => typeof x.sessionId === "string").map((x) => ({ session: x.sessionId!, title: x.title ?? "", last: x.updatedAt ?? "" }));
            for (const x of link.listed) { const l = this.#lives.get(keyOf(link.agent, x.session)); if (l && x.title && !l.title) l.title = x.title; }
          }
          break;
      }
      return;
    }
    if (m.method === "session/update") {
      const live = this.#lives.get(keyOf(link.agent, sessionId));
      if (live) this.#update(live, (m.params?.update ?? {}) as Record<string, unknown> & { sessionUpdate?: string });
    }
  }

  /** A session opened or carried on: shown, if it was asked for here or none is chosen. */
  #open(link: Link, session: string, way: Way, cwd: string): Live {
    const key = keyOf(link.agent, session);
    const was = this.#lives.get(key);
    const live: Live = was ?? { link, session, from: way === "ours" ? "here" : "terminal", at: new Date(this.#now()).toISOString(), cwd, title: link.listed.find((x) => x.session === session)?.title ?? "", turns: [], busy: false, cost: 0, used: 0, size: 0, asking: new Map(), seen: new Set(), loading: false, replaying: false, pending: null, given: new Set() };
    live.link = link;
    if (cwd) live.cwd = cwd;
    this.#lives.set(key, live);
    const asked = link.opening !== null && (link.opening === "" || link.opening === session);
    if (asked) { link.opening = null; if (this.#unopened) { live.pending = this.#unopened; this.#unopened = null; } }
    if (asked || !this.#chosen || this.#shown === key) { this.#shown = key; this.#chosen ||= asked; this.#reading = null; }
    return live;
  }
  /** Carried on: what isorite kept of it, then whatever the agent's own history has after that. */
  async #loaded(live: Live): Promise<void> {
    live.loading = false;
    const kept = await this.#api?.agentRecord?.(live.link.agent, live.session).catch(() => null);
    if (kept?.turns.length) {
      live.turns = [...kept.turns.map((t) => (t.state === "running" ? { ...t, state: "stopped" as const } : t)), ...live.turns.slice(kept.turns.length)];
      live.title ||= kept.title;
      live.at = kept.at;
      for (const t of kept.turns) for (const g of t.given ?? []) live.given.add(givenKey(g));
    }
    this.#tell();
  }

  /** A prompt, from the front end or the pane: a turn, with what was given before it. */
  #begin(live: Live, key: string, way: Way, m: Rpc): void {
    const blocks = Array.isArray(m.params?.prompt) ? (m.params.prompt as Block[]) : [];
    const pending = live.pending, first = blocks[0];
    const given = pending && first?.type === "text" && first.text === pending.text ? pending : null;
    if (given) for (const g of given.parts) live.given.add(givenKey(g));
    live.pending = null;
    live.replaying = false;
    live.seen.clear();
    live.busy = true;
    live.turns = [...live.turns, { id: key, asked: textOf(given ? blocks.slice(1) : blocks), from: way === "ours" ? "here" : "terminal", items: [], state: "running", at: new Date(this.#now()).toISOString(), ...(given ? { given: given.parts } : {}) }];
    if (live.link.agent) void this.#api?.agentStatus(live.link.agent, ACP_SESSION, true).catch(() => undefined);
    // The last to start is shown, unless you chose one.
    if (!this.#chosen) { this.#shown = keyOf(live.link.agent, live.session); this.#reading = null; }
  }

  /** Kept in isorite's own files, as carried so far. */
  #keep(live: Live): void {
    if (!this.#api?.keepAgentRecord || !live.link.agent || !live.turns.length) return;
    const last = live.turns.at(-1)?.at ?? live.at;
    const record: AgentRecord = { agent: live.link.agent, name: live.link.name, session: live.session, title: live.title, at: live.at, last, turns: live.turns };
    void this.#api.keepAgentRecord(record).then(() => this.#readKept(), () => undefined);
  }

  /** Change the last turn's items; whether there was one. */
  #edit(live: Live, fn: (items: TerminalItem[]) => TerminalItem[]): boolean {
    const turns = [...live.turns], t = turns.at(-1);
    if (!t) return false;
    turns[turns.length - 1] = { ...t, items: fn([...t.items]) };
    live.turns = turns;
    return true;
  }

  #update(live: Live, u: Record<string, unknown> & { sessionUpdate?: string }): void {
    switch (u.sessionUpdate) {
      case "user_message_chunk": {
        // Only a replayed conversation, or a prompt from the pane echoed, sends the user's words back: a turn each,
        // joined while they last.
        if (!live.loading) break;
        const text = textOf(u.content), t = live.turns.at(-1);
        if (live.replaying && t && !t.items.length) live.turns = [...live.turns.slice(0, -1), { ...t, asked: t.asked + text }];
        else live.turns = [...live.turns, { id: `replay-${live.turns.length}`, asked: text, from: "terminal", items: [], state: "done" }];
        live.replaying = true;
        break;
      }
      case "agent_message_chunk": {
        live.replaying = false;
        const text = textOf(u.content);
        this.#edit(live, (items) => {
          const end = items.at(-1);
          if (end?.kind === "text") items[items.length - 1] = { kind: "text", text: end.text + text };
          else items.push({ kind: "text", text });
          return items;
        });
        break;
      }
      case "tool_call":
      case "tool_call_update": {
        live.replaying = false;
        const id = String(u.toolCallId ?? "");
        let done: Tool | null = null, kind = "";
        this.#edit(live, (items) => {
          const at = items.findIndex((i) => i.kind === "tool" && i.id === id);
          const was: Tool = at < 0 ? { kind: "tool", id, name: "tool", title: "", status: "running", output: "" } : (items[at] as Tool);
          const content = Array.isArray(u.content) ? (u.content as Content[]) : null;
          const diff = content?.find((c) => c.type === "diff");
          const output = content ? content.filter((c) => c.type === "content").map((c) => textOf(c.content)).join("\n").slice(0, OUTPUT) : was.output;
          const input = (u.rawInput ?? {}) as Record<string, unknown>;
          kind = typeof u.kind === "string" ? u.kind : diff ? "edit" : "";
          const name = typeof u.name === "string" ? u.name : kind && at < 0 ? kind : was.name;
          const named = NOTE_TOOLS.test(name) ? (typeof input.id === "string" ? input.id : typeof input.note === "string" ? input.note : undefined) : undefined;
          // A file of the base, read or changed with the agent's own tools, is that note.
          const file = this.#noteIn(live, [...((u.locations as { path?: string }[] | undefined) ?? []).map((l) => l.path), input.path, input.filePath, input.file_path, input.filename, diff?.path, ...(typeof input.command === "string" ? input.command.match(/[^\s'"]+\.md\b/g) ?? [] : [])]);
          const note = named?.replace(/^\/+/, "").replace(/\.md$/, "") ?? file ?? was.note;
          const status = u.status === "completed" ? "done" : u.status === "failed" ? "failed" : u.status ? "running" : was.status;
          const now: Tool = {
            ...was, name, status, output,
            title: typeof u.title === "string" ? u.title : was.title,
            ...(note ? { note } : {}),
            ...(diff ? { diff: [...lines(diff.oldText).map((l) => "-" + l), ...lines(diff.newText).map((l) => "+" + l)].slice(0, 200) } : {}),
          };
          if (at < 0) items.push(now); else items[at] = now;
          if (status === "done" && note && !named && !live.loading) done = now;
          return items;
        });
        if (done) this.#told(live, done, kind);
        break;
      }
      case "usage_update": {
        const cost = (u.cost as { amount?: number } | null)?.amount;
        live.used = Number(u.used ?? 0);
        live.size = Number(u.size ?? 0);
        if (typeof cost === "number") live.cost = cost;
        break;
      }
      case "session_info_update":
        if (typeof u.title === "string") live.title = u.title;
        break;
    }
  }

  /** The note a path names, if it is a Markdown file of the base (relative paths read from the session's folder). */
  #noteIn(live: Live, paths: unknown[]): string | undefined {
    if (!this.#notes) return undefined;
    for (const p of paths) {
      if (typeof p !== "string" || !p.endsWith(".md")) continue;
      const rel = relative(this.#notes, isAbsolute(p) ? p : resolve(live.cwd || this.#notes, p));
      if (!rel || rel.startsWith("..") || isAbsolute(rel) || rel.split(sep)[0] === OWN_DIR) continue;
      return rel.split(sep).join("/").replace(/\.md$/, "");
    }
    return undefined;
  }

  /** A note the agent read or changed with its own tools, told to the base once a turn: a step, or a change. */
  #told(live: Live, tool: Tool, kind: string): void {
    const api = this.#api, note = tool.note!, agent = live.link.agent;
    if (!api || !agent) return;
    const changed = CHANGES.has(kind) || !!tool.diff;
    if (changed) { void api.agentChanged({ agent, note, asked: this.asked(agent) }).catch(() => undefined); return; }
    if (live.seen.has(note)) return;
    live.seen.add(note);
    void api.agentLook({ agent, session: ACP_SESSION, tool: "read_note", args: { id: note } }).catch(() => undefined);
  }
}

/** The pane's one session: an ACP agent's while a wrapper is attached, else the terminal's (M11). */
export class Following {
  readonly terminal: Terminal;
  readonly acp: AcpFollower;
  constructor(terminal: Terminal, acp: AcpFollower) { this.terminal = terminal; this.acp = acp; }
  /** Which is shown: an ACP agent's session while one is attached or a kept one is read, else the terminal's. */
  following(): AcpFollower | Terminal { const v = this.acp.view(); return v.connected || v.reading ? this.acp : this.terminal; }
  #which() { return this.following(); }
  view(): TerminalView { return this.#which().view(); }
  listen(fn: (view: TerminalView) => void): () => void {
    const a = this.acp.listen(() => fn(this.view())), b = this.terminal.listen(() => fn(this.view()));
    return () => { a(); b(); };
  }
  attach(...args: Parameters<Terminal["attach"]>) { return this.terminal.attach(...args); }
  detach(): void { this.terminal.detach(); }
  prompt(text: string) { return this.#which().prompt(text); }
  interrupt() { return this.#which().interrupt(); }
  reply(id: string, decision: "once" | "always" | "reject") { return this.#which().reply(id, decision); }
}
