// An agent's session over ACP, in the Iso pane (M25, the spike). `isorite acp` stands between an ACP front end
// (Toad, Zed) and the agent, passes every message through, and tells this server what passed (`tap`). Here the
// messages are folded into the pane's view of a session, the one M11 drew for OpenCode's; and what the pane asks
// (a prompt, a stop, an answer to a permission) is handed back to the wrapper to send into the same session.

import type { TerminalItem, TerminalPermission, TerminalTurn, TerminalView } from "@isorite/engine";
import type { Terminal } from "./terminal.ts";

/** Which way a message went: from the front end to the agent, from the agent, or from isorite to the agent. */
export type Way = "in" | "out" | "ours";
export interface Rpc { jsonrpc?: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> | null; error?: { message?: string } }
/** What the wrapper is asked to send for the pane. */
export type Command = { type: "prompt"; text: string } | { type: "cancel" } | { type: "permission"; id: string; optionId: string };

const OUTPUT = 4000;
const NOTE_TOOLS = /(^|[_:./-])(read_note|outline_note|edit_note|write_note)$/;
const EMPTY: TerminalView = { connected: false, session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "" };

type Asking = TerminalPermission & { options: { optionId: string; kind: string }[] };
type Block = { type?: string; text?: string; name?: string; uri?: string };
type Content = { type?: string; content?: Block; path?: string; oldText?: string | null; newText?: string };

const textOf = (blocks: unknown): string =>
  (Array.isArray(blocks) ? (blocks as Block[]) : [blocks as Block]).map((b) => (b?.type === "text" ? b.text ?? "" : b?.type === "resource_link" ? `@${b.name ?? b.uri ?? ""}` : "")).join("");
const lines = (v: string | null | undefined) => (v ? v.replace(/\n$/, "").split("\n") : []);

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

  view(): TerminalView { return this.#view; }
  listen(fn: (view: TerminalView) => void): () => void { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #tell(): void { this.#view = { ...this.#view, asking: [...this.#asking.values()].map(({ options: _, ...p }) => p) }; for (const fn of this.#listeners) fn(this.#view); }

  /** The wrapper's channel: what the pane asks goes down it. Returns the hang-up. */
  connect(send: (c: Command) => void): () => void {
    this.#wrapper = send;
    this.#view = { ...EMPTY, connected: true };
    this.#toAgent.clear(); this.#fromAgent.clear(); this.#asking.clear();
    this.#tell();
    return () => { if (this.#wrapper !== send) return; this.#wrapper = null; this.#view = EMPTY; this.#asking.clear(); this.#tell(); };
  }

  async prompt(text: string): Promise<void> { this.#need()({ type: "prompt", text }); }
  async interrupt(): Promise<void> { this.#need()({ type: "cancel" }); }
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
      if (m.method === "session/prompt") {
        this.#replaying = false;
        this.#view = { ...this.#view, busy: true, turns: [...this.#view.turns, { id: key, asked: textOf(m.params?.prompt), from: way === "ours" ? "here" : "terminal", items: [], state: "running" }] };
      }
      if (m.method === "session/load" || m.method === "session/resume") this.#view = { ...this.#view, session: String(m.params?.sessionId ?? ""), turns: [], title: "" };
      return;
    }
    // The agent's own request: a permission to ask.
    if (m.method && key !== null && way === "out") {
      this.#fromAgent.set(key, m);
      if (m.method === "session/request_permission") {
        const call = (m.params?.toolCall ?? {}) as { title?: string; toolCallId?: string; rawInput?: Record<string, unknown> };
        const command = typeof call.rawInput?.command === "string" ? call.rawInput.command : "";
        this.#asking.set(key, { id: key, action: call.title ?? "act", resources: command ? [command] : [], ...(call.toolCallId ? { tool: call.toolCallId } : {}), options: (m.params?.options as Asking["options"]) ?? [] });
      }
      return;
    }
    // An answer.
    if (!m.method && key !== null) {
      if (way === "out") {
        const asked = this.#toAgent.get(key);
        this.#toAgent.delete(key);
        if (asked?.method === "session/new" && typeof m.result?.sessionId === "string") this.#view = { ...this.#view, session: m.result.sessionId, turns: [], title: "" };
        if (asked?.method === "session/prompt") {
          const stop = m.error ? "failed" : m.result?.stopReason === "cancelled" ? "stopped" : m.result?.stopReason === "end_turn" ? "done" : "failed";
          this.#view = { ...this.#view, busy: false, turns: this.#view.turns.map((t) => (t.id === key ? { ...t, state: stop } : t)) };
        }
      } else {
        this.#fromAgent.delete(key);
        this.#asking.delete(key);
      }
      return;
    }
    if (m.method === "session/update") this.#update(m.params ?? {});
  }

  #update(params: Record<string, unknown>): void {
    if (this.#view.session && params.sessionId !== this.#view.session) return;
    const u = (params.update ?? {}) as Record<string, unknown> & { sessionUpdate?: string };
    const turns = [...this.#view.turns];
    const last = (): TerminalTurn | undefined => turns.at(-1);
    const edit = (fn: (items: TerminalItem[]) => TerminalItem[]) => {
      const t = last();
      if (t) turns[turns.length - 1] = { ...t, items: fn([...t.items]) };
    };
    switch (u.sessionUpdate) {
      case "user_message_chunk": {
        // Only a replayed conversation sends the user's words back: a turn each, joined while they last.
        const text = textOf(u.content);
        const t = last();
        if (this.#replaying && t && !t.items.length) turns[turns.length - 1] = { ...t, asked: t.asked + text };
        else turns.push({ id: `replay-${turns.length}`, asked: text, from: "terminal", items: [], state: "done" });
        this.#replaying = true;
        break;
      }
      case "agent_message_chunk": {
        this.#replaying = false;
        const text = textOf(u.content);
        edit((items) => {
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
        edit((items) => {
          const at = items.findIndex((i) => i.kind === "tool" && i.id === id);
          const was = at < 0 ? { kind: "tool" as const, id, name: "tool", title: "", status: "running" as const, output: "" } : (items[at] as Extract<TerminalItem, { kind: "tool" }>);
          const content = Array.isArray(u.content) ? (u.content as Content[]) : null;
          const diff = content?.find((c) => c.type === "diff");
          const output = content ? content.filter((c) => c.type === "content").map((c) => textOf(c.content)).join("\n").slice(0, OUTPUT) : was.output;
          const input = (u.rawInput ?? {}) as Record<string, unknown>;
          const name = typeof u.name === "string" ? u.name : typeof u.kind === "string" && at < 0 ? u.kind : was.name;
          const note = NOTE_TOOLS.test(name) && typeof input.note === "string" ? input.note : was.note;
          const status = u.status === "completed" ? "done" : u.status === "failed" ? "failed" : u.status ? "running" : was.status;
          const now: TerminalItem = {
            ...was, name, status, output,
            title: typeof u.title === "string" ? u.title : was.title,
            ...(note ? { note } : {}),
            ...(diff ? { diff: [...lines(diff.oldText).map((l) => "-" + l), ...lines(diff.newText).map((l) => "+" + l)].slice(0, 200) } : {}),
          };
          if (at < 0) items.push(now); else items[at] = now;
          return items;
        });
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
    this.#view = { ...this.#view, turns };
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
