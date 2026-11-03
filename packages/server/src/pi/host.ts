// A pi agent run inside the isorite server, serving the Iso pane (M35): the same `PaneSessions` the ACP follower is,
// so the pages cannot tell which is behind them. Pi's loop (`pi-agent-core`) runs here; what happens in it is folded
// into the pane's `TerminalView`. Nothing outside src/pi/ names a pi type.
//
// One session at a time (a new one replaces it). It asks before a tool in `ask` runs, through pi's `beforeToolCall`;
// no tool is asked by default, as pi itself asks for none. Its model context is not kept between runs of the
// server: what is kept is the pane's view of it (`keepAgentRecord`), as for any agent.

import { randomUUID } from "node:crypto";
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentSession, Api, Given, TerminalItem, TerminalPermission, TerminalTurn, TerminalView } from "@isorite/engine";
import { givenKey } from "../acp.ts";
import { INSTRUCTIONS } from "../mcp-http.ts";
import type { PaneSessions } from "../sessions.ts";
import { isoriteTools, titleOf, type ToolsApi } from "./tools.ts";

type StreamFn = NonNullable<ConstructorParameters<typeof Agent>[0]>["streamFn"];
type Decision = "once" | "always" | "reject";

export interface PiHostOptions {
  api: ToolsApi & Pick<Api, "agentStatus"> & Partial<Pick<Api, "keepAgentRecord" | "events">>;
  model: Model<any>;
  streamFn: StreamFn;
  /** How the agent is known on the base: its changes are signed `agent:<id>`. */
  id?: string;
  name?: string;
  /** Tools to ask about before they run. */
  ask?: (tool: string) => boolean;
  /** Tools besides the base's (pi's own for files and shell), made for each prompt. */
  more?: () => AgentTool[];
  /** A reason to refuse a call before it runs, or undefined. Checked first; if it throws, the call is refused. */
  guard?: (call: { tool: string; args: unknown }) => string | undefined;
  clock?: () => number;
}

const OUTPUT = 4000;
const EMPTY: TerminalView = { connected: true, agent: "", session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", sessions: [] };

const textOf = (content: unknown): string =>
  (Array.isArray(content) ? content : []).map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : "")).join("");

export class PiHost implements PaneSessions {
  readonly #api: PiHostOptions["api"];
  readonly #model: Model<any>;
  readonly #streamFn: StreamFn;
  readonly #id: string;
  readonly #name: string;
  readonly #ask: (tool: string) => boolean;
  readonly #more: () => AgentTool[];
  readonly #guard: NonNullable<PiHostOptions["guard"]>;
  readonly #now: () => number;
  #agent: Agent | null = null;
  #session = "";
  #at = "";
  #title = "";
  #turns: TerminalTurn[] = [];
  #busy = false;
  /** The person stopped it: an aborted run is then a stop, not a failure. */
  #stopping = false;
  #cost = 0;
  #used = 0;
  #asking = new Map<string, TerminalPermission & { wait: (d: Decision) => void }>();
  #allowed = new Set<string>();
  #pending: { parts: Given[]; text: string } | null = null;
  #given = new Set<string>();
  /** The text item the assistant message now streaming writes into. */
  #writing = -1;
  #view: TerminalView = EMPTY;
  #listeners = new Set<(v: TerminalView) => void>();

  constructor({ api, model, streamFn, id = "pi", name = "pi", ask = () => false, more = () => [], guard = () => undefined, clock = Date.now }: PiHostOptions) {
    this.#api = api;
    this.#model = model;
    this.#streamFn = streamFn;
    this.#id = id;
    this.#name = name;
    this.#ask = ask;
    this.#more = more;
    this.#guard = guard;
    this.#now = clock;
    // What the agent asks back or offers (ask_question, offer_text) stands in its turn, until kept or not.
    api.events?.((e) => {
      if (e.type !== "agent-item" || e.agent !== this.#id || !this.#turns.length) return;
      this.#edit((items) => [...items, e.item as TerminalItem]);
      this.#tell();
    });
    this.#tell();
  }

  view(): TerminalView { return this.#view; }
  listen(fn: (v: TerminalView) => void): () => void { this.#listeners.add(fn); return () => { this.#listeners.delete(fn); }; }
  asked(agent: string): string {
    const t = this.#turns.at(-1);
    return agent === this.#id && t?.state === "running" ? t.asked : "";
  }

  async give(parts: Given[], render: (parts: Given[]) => string): Promise<void> {
    const fresh = parts.filter((g) => !this.#given.has(givenKey(g)));
    this.#pending = fresh.length ? { parts: fresh, text: render(fresh) } : null;
  }

  async prompt(text: string): Promise<void> {
    if (this.#busy) throw new Error("the agent is working: stop it first");
    if (!this.#agent) await this.#open();
    const agent = this.#agent!;
    const pending = this.#pending;
    this.#pending = null;
    if (pending) for (const g of pending.parts) this.#given.add(givenKey(g));
    agent.state.tools = [...(await isoriteTools(this.#api, { agent: this.#id, session: this.#session }, () => this.asked(this.#id))), ...this.#more()];
    const turn: TerminalTurn = { id: randomUUID(), asked: text, from: "here", items: [], state: "running", ...(pending ? { given: pending.parts } : {}), at: new Date(this.#now()).toISOString() };
    this.#turns = [...this.#turns, turn];
    if (!this.#title) this.#title = text.slice(0, 80);
    this.#busy = true;
    this.#writing = -1;
    void this.#api.agentStatus(this.#id, this.#session, true).catch(() => undefined);
    this.#tell();
    // What was given goes before the question, in the same message.
    void agent.prompt(pending?.text ? `${pending.text}\n\n${text}` : text).then(() => undefined, (e: Error) => { if (this.#stopping) this.#set("stopped"); else this.#fail(e.message); }).then(() => this.#end());
  }

  async interrupt(): Promise<void> {
    this.#stopping = true;
    for (const a of this.#asking.values()) a.wait("reject");
    this.#agent?.abort();
  }

  async reply(id: string, decision: Decision): Promise<void> {
    const asked = this.#asking.get(id);
    if (!asked) throw new Error("the agent is not asking that");
    asked.wait(decision);
  }

  async follow(_agent: string, session: string): Promise<void> {
    if (session !== this.#session) throw new Error("that session is not here to carry on");
  }
  async fresh(_agent: string): Promise<void> {
    if (this.#busy) throw new Error("the agent is working: stop it first");
    this.#agent = null; this.#session = ""; this.#turns = []; this.#title = ""; this.#cost = 0; this.#used = 0; this.#given.clear(); this.#pending = null;
    this.#tell();
  }
  set(): void { throw new Error(`${this.#name} offers no modes or options yet`); }
  async forget(): Promise<void> { throw new Error("nothing is kept apart from the session shown"); }
  refresh(): void { /* one session, nothing to list again */ }

  async #open(): Promise<void> {
    this.#session = randomUUID();
    this.#at = new Date(this.#now()).toISOString();
    this.#agent = new Agent({
      initialState: { systemPrompt: INSTRUCTIONS, model: this.#model },
      streamFn: this.#streamFn,
      sessionId: this.#session,
      beforeToolCall: async ({ toolCall, args }) => {
        // The guard first, and shut if it cannot say.
        let refused: string | undefined;
        try { refused = this.#guard({ tool: toolCall.name, args }); } catch { refused = "that could not be checked"; }
        if (refused) return { block: true, reason: refused };
        if (!this.#ask(toolCall.name) || this.#allowed.has(toolCall.name)) return undefined;
        const id = randomUUID();
        const decision = await new Promise<Decision>((wait) => {
          this.#asking.set(id, { id, action: toolCall.name, resources: [titleOf(args)], tool: toolCall.name, wait });
          this.#tell();
        });
        this.#asking.delete(id);
        this.#tell();
        if (decision === "reject") return { block: true, reason: "The person declined this." };
        if (decision === "always") this.#allowed.add(toolCall.name);
        return undefined;
      },
    });
    this.#agent.subscribe((e) => this.#on(e));
  }

  #on(e: AgentEvent): void {
    if (e.type === "message_start" && (e.message as { role?: string }).role === "assistant") {
      this.#edit((items) => [...items, { kind: "text", text: "" }]);
      this.#writing = (this.#turns.at(-1)?.items.length ?? 1) - 1;
    } else if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
      const at = this.#writing, delta = e.assistantMessageEvent.delta;
      this.#edit((items) => items.map((i, k) => (k === at && i.kind === "text" ? { ...i, text: i.text + delta } : i)));
    } else if (e.type === "message_end" && (e.message as { role?: string }).role === "assistant") {
      const m = e.message as { content?: unknown; usage?: { totalTokens?: number; cost?: { total?: number } } };
      const at = this.#writing, whole = textOf(m.content);
      this.#edit((items) => items.flatMap((i, k) => (k !== at ? [i] : whole ? [{ kind: "text", text: whole } as TerminalItem] : [])));
      this.#writing = -1;
      this.#cost += m.usage?.cost?.total ?? 0;
      this.#used = m.usage?.totalTokens ?? this.#used;
    } else if (e.type === "tool_execution_start") {
      this.#edit((items) => [...items, { kind: "tool", id: e.toolCallId, name: e.toolName, title: titleOf(e.args), status: "running", output: "" }]);
    } else if (e.type === "tool_execution_end") {
      const out = textOf((e.result as { content?: unknown })?.content).slice(0, OUTPUT);
      this.#edit((items) => items.map((i) => (i.kind === "tool" && i.id === e.toolCallId ? { ...i, status: e.isError ? "failed" : "done", output: out } : i)));
    } else return;
    this.#tell();
  }

  #fail(message: string): void {
    this.#edit((items) => [...items, { kind: "text", text: `(${message})` }]);
    this.#set("failed");
  }
  #end(): void {
    const last = [...(this.#agent?.state.messages ?? [])].reverse().find((m) => (m as { role?: string }).role === "assistant") as { stopReason?: string; errorMessage?: string } | undefined;
    if (this.#turns.at(-1)?.state === "running") {
      if (this.#stopping || last?.stopReason === "aborted") this.#set("stopped");
      else if (last?.stopReason === "error") this.#fail(last.errorMessage ?? "the model failed");
      else this.#set("done");
    }
    this.#busy = false;
    this.#stopping = false;
    void this.#api.agentStatus(this.#id, this.#session, false).catch(() => undefined);
    this.#keep();
    this.#tell();
  }
  #set(state: TerminalTurn["state"]): void {
    const turns = [...this.#turns], t = turns.at(-1);
    if (t) turns[turns.length - 1] = { ...t, state };
    this.#turns = turns;
  }
  #edit(fn: (items: TerminalItem[]) => TerminalItem[]): void {
    const turns = [...this.#turns], t = turns.at(-1);
    if (!t) return;
    turns[turns.length - 1] = { ...t, items: fn([...t.items]) };
    this.#turns = turns;
  }

  #keep(): void {
    if (!this.#api.keepAgentRecord || !this.#turns.length) return;
    const last = this.#turns.at(-1)?.at ?? this.#at;
    void this.#api.keepAgentRecord({ agent: this.#id, name: this.#name, session: this.#session, title: this.#title, at: this.#at, last, turns: this.#turns }).catch(() => undefined);
  }

  #tell(): void {
    const last = this.#turns.at(-1)?.at ?? this.#at;
    const entry: AgentSession | null = this.#session ? { agent: this.#id, name: this.#name, session: this.#session, title: this.#title, asked: this.#turns[0]?.asked ?? "", last, turns: this.#turns.length, notes: 0, live: true, busy: this.#busy, kept: false, open: true } : null;
    this.#view = {
      connected: true, agent: this.#name, agentId: this.#id, session: this.#session || null, title: this.#title, busy: this.#busy, turns: this.#turns,
      asking: [...this.#asking.values()].map(({ wait: _, ...p }) => p), cost: this.#cost, tokens: { input: this.#used, output: 0 },
      model: this.#model.id ?? "", ...(this.#model.contextWindow ? { size: this.#model.contextWindow } : {}), sessions: entry ? [entry] : [],
    };
    for (const fn of this.#listeners) fn(this.#view);
  }
}
