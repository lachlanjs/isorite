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
import type { Api, EngineEvent, TerminalItem, TerminalPermission, TerminalTurn, TerminalView } from "@isorite/engine";
import { OWN_DIR } from "@isorite/core";
import type { Terminal } from "./terminal.ts";
import { agentName } from "./mcp-http.ts";

/** Which way a message went: from the front end to the agent, from the agent, or from isorite to the agent. */
export type Way = "in" | "out" | "ours";
export interface Rpc { jsonrpc?: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> | null; error?: { message?: string } }
/** What the wrapper is asked to send for the pane. `give` is put before the next prompt, from either place. */
export type Command = { type: "prompt"; text: string } | { type: "cancel" } | { type: "permission"; id: string; optionId: string } | { type: "give"; text: string };
/** The session the Atlas's turns and isorite's MCP calls are kept under, for the agent the wrapper carries. */
export const ACP_SESSION = "acp";

const OUTPUT = 4000;
const NOTE_TOOLS = /(^|[_:./-])(read_note|outline_note|edit_note|write_note)$/;
const CHANGES = new Set(["edit", "delete", "move"]);
/** ACP's kinds of tool, as the pane's switches name what is asked. */
const ACTIONS: Record<string, string> = { execute: "shell", edit: "edit", delete: "edit", move: "edit", read: "read", fetch: "webfetch" };
const EMPTY: TerminalView = { connected: false, agent: "", session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "" };

type Asking = TerminalPermission & { options: { optionId: string; kind: string }[] };
type Block = { type?: string; text?: string; name?: string; uri?: string };
type Content = { type?: string; content?: Block; path?: string; oldText?: string | null; newText?: string };
type Tool = Extract<TerminalItem, { kind: "tool" }>;

const textOf = (blocks: unknown): string =>
  (Array.isArray(blocks) ? (blocks as Block[]) : [blocks as Block]).map((b) => (b?.type === "text" ? b.text ?? "" : b?.type === "resource_link" ? `@${b.name ?? b.uri ?? ""}` : "")).join("");
const lines = (v: string | null | undefined) => (v ? v.replace(/\n$/, "").split("\n") : []);

export interface FollowerOptions {
  /** The base's engine, told of the agent's turns, reads and changes. */
  api?: Pick<Api, "agentStatus" | "agentLook" | "agentChanged" | "events">;
  /** The base's folder: a file in it (outside its .isorite/) is a note. */
  notes?: string;
}

/** The session the wrapper carries, as the pane draws it. One wrapper at a time; a second takes over. */
export class AcpFollower {
  #view: TerminalView = EMPTY;
  #listeners = new Set<(view: TerminalView) => void>();
  #wrapper: ((c: Command) => void) | null = null;
  /** Requests sent to the agent, by id, until answered; and the agent's own requests. */
  #toAgent = new Map<string, Rpc>();
  #fromAgent = new Map<string, Rpc>();
  #asking = new Map<string, Asking>();
  /** A user's message being replayed (session/load), to be joined to. */
  #replaying = false;
  #agent = "";
  /** The session's folder, against which the agent's relative paths are read. */
  #cwd = "";
  /** The notes the agent read or changed in this turn, each told to the base once. */
  #seen = new Set<string>();
  readonly #api: FollowerOptions["api"];
  readonly #notes: string | undefined;

  constructor({ api, notes }: FollowerOptions = {}) {
    this.#api = api;
    this.#notes = notes;
    // What the agent asks back or offers through isorite's MCP stands in its turn, until kept.
    api?.events((e: EngineEvent) => {
      if (e.type === "agent-item" && this.#view.connected && e.agent === this.#agent) this.#edit((items) => [...items, e.item]) && this.#tell();
      if (e.type === "agent-taken") {
        const turns = this.#view.turns.map((t) => ({ ...t, items: t.items.map((i) => (i.kind === "question" && i.id === e.id ? { ...i, made: e.note } : i.kind === "offer" && i.id === e.id ? { ...i, taken: true } : i)) }));
        this.#view = { ...this.#view, turns };
        this.#tell();
      }
    });
  }

  view(): TerminalView { return this.#view; }
  listen(fn: (view: TerminalView) => void): () => void { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #tell(): void { this.#view = { ...this.#view, asking: [...this.#asking.values()].map(({ options: _, ...p }) => p) }; for (const fn of this.#listeners) fn(this.#view); }

  /** The wrapper's channel: what the pane asks goes down it. Returns the hang-up. */
  connect(send: (c: Command) => void): () => void {
    this.#wrapper = send;
    this.#view = { ...EMPTY, connected: true };
    this.#toAgent.clear(); this.#fromAgent.clear(); this.#asking.clear(); this.#seen.clear();
    this.#tell();
    return () => {
      if (this.#wrapper !== send) return;
      if (this.#view.busy && this.#agent) void this.#api?.agentStatus(this.#agent, ACP_SESSION, false).catch(() => undefined);
      this.#wrapper = null; this.#view = EMPTY; this.#asking.clear(); this.#tell();
    };
  }

  /** What is being asked of the agent now, if it is the one this wrapper carries: for a note it changes. */
  asked(agent: string): string {
    if (!this.#view.connected || (this.#agent && this.#agent !== agent)) return "";
    const t = this.#view.turns.at(-1);
    return t?.state === "running" ? t.asked : "";
  }

  async prompt(text: string): Promise<void> { this.#need()({ type: "prompt", text }); }
  async interrupt(): Promise<void> { this.#need()({ type: "cancel" }); }
  /** Notes and passages given from the pane, put before the next prompt asked in either place. */
  async give(text: string): Promise<void> { this.#need()({ type: "give", text }); }
  async reply(id: string, decision: "once" | "always" | "reject"): Promise<void> {
    const asked = this.#asking.get(id);
    if (!asked) throw new Error("the agent is not asking that");
    const kinds = decision === "once" ? ["allow_once"] : decision === "always" ? ["allow_always", "allow_once"] : ["reject_once", "reject_always"];
    const option = kinds.map((k) => asked.options.find((o) => o.kind === k)).find(Boolean);
    if (!option) throw new Error("the agent gave no such choice");
    this.#need()({ type: "permission", id, optionId: option.optionId });
  }
  #need(): (c: Command) => void {
    if (!this.#wrapper || !this.#view.session) throw new Error("no agent's session is attached: start one with isorite acp");
    return this.#wrapper;
  }

  /** What passed through the wrapper, in order. */
  tap(messages: { way: Way; message: Rpc }[]): void {
    for (const { way, message } of messages) this.#fold(way, message);
    this.#tell();
  }

  #fold(way: Way, m: Rpc): void {
    const key = m.id === undefined || m.id === null ? null : String(m.id);
    // A request toward the agent, kept until its answer comes back.
    if (m.method && key !== null && way !== "out") {
      this.#toAgent.set(key, m);
      if (typeof m.params?.cwd === "string") this.#cwd = m.params.cwd;
      if (m.method === "session/prompt") {
        this.#replaying = false;
        this.#seen.clear();
        this.#view = { ...this.#view, busy: true, turns: [...this.#view.turns, { id: key, asked: textOf(m.params?.prompt), from: way === "ours" ? "here" : "terminal", items: [], state: "running" }] };
        if (this.#agent) void this.#api?.agentStatus(this.#agent, ACP_SESSION, true).catch(() => undefined);
      }
      if (m.method === "session/load" || m.method === "session/resume") this.#view = { ...this.#view, session: String(m.params?.sessionId ?? ""), turns: [], title: "" };
      return;
    }
    // The agent's own request: a permission to ask.
    if (m.method && key !== null && way === "out") {
      this.#fromAgent.set(key, m);
      if (m.method === "session/request_permission") {
        const call = (m.params?.toolCall ?? {}) as { title?: string; kind?: string; toolCallId?: string; rawInput?: Record<string, unknown>; locations?: { path?: string }[] };
        const command = typeof call.rawInput?.command === "string" ? call.rawInput.command : "";
        // Said as the pane's switches know actions: a command is shell, a change to a file edit (M12, Q47).
        const tool = this.#view.turns.at(-1)?.items.find((i): i is Tool => i.kind === "tool" && i.id === call.toolCallId);
        const kind = call.kind ?? tool?.name ?? "";
        const action = ACTIONS[kind] ?? call.title ?? "act";
        const paths = (call.locations ?? []).map((l) => l.path).filter((p): p is string => typeof p === "string");
        this.#asking.set(key, { id: key, action, resources: command ? [command] : paths.length ? paths : ACTIONS[kind] && call.title ? [call.title] : [], ...(call.toolCallId ? { tool: call.toolCallId } : {}), options: (m.params?.options as Asking["options"]) ?? [] });
      }
      return;
    }
    // An answer.
    if (!m.method && key !== null) {
      if (way === "out") {
        const asked = this.#toAgent.get(key);
        this.#toAgent.delete(key);
        if (asked?.method === "initialize") {
          const info = m.result?.agentInfo as { name?: string; title?: string } | undefined;
          this.#agent = agentName(info?.name ?? "agent");
          this.#view = { ...this.#view, agent: info?.title ?? info?.name ?? "The agent" };
        }
        if (asked?.method === "session/new" && typeof m.result?.sessionId === "string") this.#view = { ...this.#view, session: m.result.sessionId, turns: [], title: "" };
        if (asked?.method === "session/prompt") {
          const stop = m.error ? "failed" : m.result?.stopReason === "cancelled" ? "stopped" : m.result?.stopReason === "end_turn" ? "done" : "failed";
          this.#view = { ...this.#view, busy: false, turns: this.#view.turns.map((t) => (t.id === key ? { ...t, state: stop } : t)) };
          if (this.#agent) void this.#api?.agentStatus(this.#agent, ACP_SESSION, false).catch(() => undefined);
        }
        if (asked?.method === "session/list" && Array.isArray(m.result?.sessions)) {
          const mine = (m.result.sessions as { sessionId?: string; title?: string | null }[]).find((s) => s.sessionId === this.#view.session);
          if (mine?.title) this.#view = { ...this.#view, title: mine.title };
        }
      } else {
        this.#fromAgent.delete(key);
        this.#asking.delete(key);
      }
      return;
    }
    if (m.method === "session/update") this.#update(m.params ?? {});
  }

  /** Change the last turn's items; whether there was one. */
  #edit(fn: (items: TerminalItem[]) => TerminalItem[]): boolean {
    const turns = [...this.#view.turns], t = turns.at(-1);
    if (!t) return false;
    turns[turns.length - 1] = { ...t, items: fn([...t.items]) };
    this.#view = { ...this.#view, turns };
    return true;
  }

  #update(params: Record<string, unknown>): void {
    if (this.#view.session && params.sessionId !== this.#view.session) return;
    const u = (params.update ?? {}) as Record<string, unknown> & { sessionUpdate?: string };
    switch (u.sessionUpdate) {
      case "user_message_chunk": {
        // Only a replayed conversation sends the user's words back: a turn each, joined while they last.
        const text = textOf(u.content), turns = [...this.#view.turns], t = turns.at(-1);
        if (this.#replaying && t && !t.items.length) turns[turns.length - 1] = { ...t, asked: t.asked + text };
        else turns.push({ id: `replay-${turns.length}`, asked: text, from: "terminal", items: [], state: "done" });
        this.#view = { ...this.#view, turns };
        this.#replaying = true;
        break;
      }
      case "agent_message_chunk": {
        this.#replaying = false;
        const text = textOf(u.content);
        this.#edit((items) => {
          const end = items.at(-1);
          if (end?.kind === "text") items[items.length - 1] = { kind: "text", text: end.text + text };
          else items.push({ kind: "text", text });
          return items;
        });
        break;
      }
      case "tool_call":
      case "tool_call_update": {
        this.#replaying = false;
        const id = String(u.toolCallId ?? "");
        let done: Tool | null = null, kind = "";
        this.#edit((items) => {
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
          const file = this.#noteIn([...((u.locations as { path?: string }[] | undefined) ?? []).map((l) => l.path), input.path, input.filePath, input.file_path, input.filename, diff?.path, ...(typeof input.command === "string" ? input.command.match(/[^\s'"]+\.md\b/g) ?? [] : [])]);
          const note = named?.replace(/^\/+/, "").replace(/\.md$/, "") ?? file ?? was.note;
          const status = u.status === "completed" ? "done" : u.status === "failed" ? "failed" : u.status ? "running" : was.status;
          const now: Tool = {
            ...was, name, status, output,
            title: typeof u.title === "string" ? u.title : was.title,
            ...(note ? { note } : {}),
            ...(diff ? { diff: [...lines(diff.oldText).map((l) => "-" + l), ...lines(diff.newText).map((l) => "+" + l)].slice(0, 200) } : {}),
          };
          if (at < 0) items.push(now); else items[at] = now;
          if (status === "done" && note && !named) done = now;
          return items;
        });
        if (done) this.#told(done, kind);
        break;
      }
      case "usage_update": {
        const cost = (u.cost as { amount?: number } | null)?.amount;
        this.#view = { ...this.#view, tokens: { input: Number(u.used ?? 0), output: this.#view.tokens.output }, ...(typeof cost === "number" ? { cost } : {}) };
        break;
      }
      case "session_info_update":
        if (typeof u.title === "string") this.#view = { ...this.#view, title: u.title };
        break;
    }
  }

  /** The note a path names, if it is a Markdown file of the base (relative paths read from the session's folder). */
  #noteIn(paths: unknown[]): string | undefined {
    if (!this.#notes) return undefined;
    for (const p of paths) {
      if (typeof p !== "string" || !p.endsWith(".md")) continue;
      const rel = relative(this.#notes, isAbsolute(p) ? p : resolve(this.#cwd || this.#notes, p));
      if (!rel || rel.startsWith("..") || isAbsolute(rel) || rel.split(sep)[0] === OWN_DIR) continue;
      return rel.split(sep).join("/").replace(/\.md$/, "");
    }
    return undefined;
  }

  /** A note the agent read or changed with its own tools, told to the base once a turn: a step, or a change. */
  #told(tool: Tool, kind: string): void {
    const api = this.#api, note = tool.note!;
    if (!api || !this.#agent) return;
    const changed = CHANGES.has(kind) || !!tool.diff;
    if (changed) { void api.agentChanged({ agent: this.#agent, note, asked: this.asked(this.#agent) }).catch(() => undefined); return; }
    if (this.#seen.has(note)) return;
    this.#seen.add(note);
    void api.agentLook({ agent: this.#agent, session: ACP_SESSION, tool: "read_note", args: { id: note } }).catch(() => undefined);
  }
}

/** The pane's one session: an ACP agent's while a wrapper is attached, else the terminal's (M11). */
export class Following {
  readonly terminal: Terminal;
  readonly acp: AcpFollower;
  constructor(terminal: Terminal, acp: AcpFollower) { this.terminal = terminal; this.acp = acp; }
  #which() { return this.acp.view().connected ? this.acp : this.terminal; }
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
