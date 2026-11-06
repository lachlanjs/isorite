// A pi agent run inside the isorite server, serving the Iso pane (M35): the same `PaneSessions` the ACP follower is,
// so the pages cannot tell which is behind them. Pi's loop (`pi-agent-core`) runs here; what happens in it is folded
// into the pane's `TerminalView`. Nothing outside src/pi/ names a pi type.
//
// One session at a time (a new one replaces it). It asks before a tool in `ask` runs, through pi's `beforeToolCall`;
// no tool is asked by default, as pi itself asks for none. With a store (`FileStore`, in isorite's data folder) the
// pane's turns and the model's messages are written after each turn, and `resume()` takes up the session last kept;
// without one a session ends with the server. The pane's view is also kept as a record (`keepAgentRecord`), as for
// any agent.

import { randomUUID } from "node:crypto";
import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentSession, Api, Given, TerminalItem, TerminalPermission, TerminalTurn, TerminalView } from "@isorite/engine";
import { givenKey } from "../acp.ts";
import { INSTRUCTIONS } from "../mcp-http.ts";
import type { PaneSessions } from "../sessions.ts";
import { DEFAULT_COMPACTION_SETTINGS, estimateTokens, generateSummary, shouldCompact } from "@earendil-works/pi-coding-agent";
import { type PiRecord, type PiStore } from "./store.ts";
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
  /** When the model's context is summarised: where it nears the model's window (default: pi's). */
  compaction?: Partial<Compaction>;
  /** Where sessions are kept between runs of the server. With none, a session ends with the server. */
  store?: PiStore;
}

const OUTPUT = 4000;
interface Compaction { enabled: boolean; reserveTokens: number; keepRecentTokens: number }
/** What the summary of an earlier conversation begins with, in the message that stands for it. */
const SUMMARY = "[The earlier part of this conversation, summarised to make room]\n";
const EMPTY: TerminalView = { connected: true, agent: "", session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", sessions: [] };

const textOf = (content: unknown): string =>
  (Array.isArray(content) ? content : []).map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : "")).join("");

const userText = (content: unknown): string => (typeof content === "string" ? content : textOf(content));

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
  readonly #store: PiStore | null;
  readonly #compaction: Compaction;
  /** The thinking item the assistant message now streaming writes into. */
  #thinkingAt = -1;
  /** Cancels a summary being written. */
  #summarising: AbortController | null = null;
  /** Why the last thing asked of the agent could not be done, shown in the pane. */
  #problem = "";
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
  /** What was said while it worked and has not reached the model: the item's id, and the text as the model will have it. */
  #queued: { id: string; body: string }[] = [];
  /** The first user message of a run is the prompt itself: it is not a queued message landing. */
  #primed = false;
  /** The text item the assistant message now streaming writes into. */
  #writing = -1;
  #view: TerminalView = EMPTY;
  #listeners = new Set<(v: TerminalView) => void>();

  constructor({ api, model, streamFn, id = "pi", name = "pi", ask = () => false, more = () => [], guard = () => undefined, clock = Date.now, store, compaction }: PiHostOptions) {
    this.#api = api;
    this.#model = model;
    this.#streamFn = streamFn;
    this.#id = id;
    this.#name = name;
    this.#ask = ask;
    this.#more = more;
    this.#guard = guard;
    this.#now = clock;
    this.#store = store ?? null;
    this.#compaction = { enabled: compaction?.enabled ?? DEFAULT_COMPACTION_SETTINGS.enabled ?? true, reserveTokens: compaction?.reserveTokens ?? DEFAULT_COMPACTION_SETTINGS.reserveTokens ?? 16384, keepRecentTokens: compaction?.keepRecentTokens ?? DEFAULT_COMPACTION_SETTINGS.keepRecentTokens ?? 20000 };
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
    if (this.#busy) { await this.#say(text, "followUp"); return; }
    this.#problem = "";
    if (!this.#agent) this.#open();
    const agent = this.#agent!;
    const pending = this.#pending;
    this.#pending = null;
    if (pending) for (const g of pending.parts) this.#given.add(givenKey(g));
    agent.state.tools = [...(await isoriteTools(this.#api, { agent: this.#id, session: this.#session }, () => this.asked(this.#id))), ...this.#more()];
    const turn: TerminalTurn = { id: randomUUID(), asked: text, from: "here", items: [], state: "running", ...(pending ? { given: pending.parts } : {}), at: new Date(this.#now()).toISOString() };
    this.#turns = [...this.#turns, turn];
    if (!this.#title) this.#title = text.slice(0, 80);
    this.#busy = true;
    this.#primed = false;
    this.#queued = [];
    this.#writing = -1;
    this.#thinkingAt = -1;
    void this.#api.agentStatus(this.#id, this.#session, true).catch(() => undefined);
    this.#tell();
    // What was given goes before the question, in the same message. An earlier conversation that has grown near the
    // model's window is summarised first.
    const body = pending?.text ? `${pending.text}\n\n${text}` : text;
    void (async () => { await this.#compactIfNeeded(agent); if (this.#stopping) throw new Error("stopped"); await agent.prompt(body); })().then(() => undefined, (e: Error) => { if (this.#stopping) this.#set("stopped"); else this.#fail(e.message); }).then(() => this.#end());
  }

  async steer(text: string): Promise<void> {
    if (!this.#busy) throw new Error("the agent is not working: ask it instead");
    await this.#say(text, "steer");
  }

  /** Said while it works: a steer comes in after the step now running, a follow-up when it would otherwise stop. */
  async #say(text: string, mode: "steer" | "followUp"): Promise<void> {
    const agent = this.#agent;
    if (!agent) return;
    const pending = this.#pending;
    this.#pending = null;
    if (pending) for (const g of pending.parts) this.#given.add(givenKey(g));
    const body = pending?.text ? `${pending.text}\n\n${text}` : text;
    const id = randomUUID();
    this.#queued.push({ id, body });
    this.#edit((items) => [...items, { kind: "message", id, text, mode, state: "queued" }]);
    const message = { role: "user" as const, content: [{ type: "text" as const, text: body }], timestamp: this.#now() };
    if (mode === "steer") agent.steer(message); else agent.followUp(message);
    this.#tell();
  }

  async interrupt(): Promise<void> {
    this.#stopping = true;
    this.#summarising?.abort();
    this.#agent?.clearAllQueues();
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
    this.#agent = null; this.#session = ""; this.#turns = []; this.#title = ""; this.#cost = 0; this.#used = 0; this.#given.clear(); this.#pending = null; this.#problem = "";
    this.#tell();
  }
  set(): void { throw new Error(`${this.#name} offers no modes or options yet`); }
  async forget(): Promise<void> { throw new Error("nothing is kept apart from the session shown"); }
  refresh(): void { /* one session, nothing to list again */ }

  /** Take up the session last kept, if there is one: its turns in the pane, and its messages for the model. An
   *  unreadable one is reported in the pane and left alone, and the agent starts fresh. */
  async resume(): Promise<void> {
    if (!this.#store || this.#agent) return;
    let kept: PiRecord | null;
    try { kept = await this.#store.latest(); } catch (e) { this.#problem = (e as Error).message; this.#tell(); return; }
    if (!kept) return;
    this.#open(kept);
    // A turn that was running when the server went down is shown as stopped: it never finished.
    this.#turns = kept.turns.map((t) => (t.state === "running" ? { ...t, state: "stopped" as const } : t));
    this.#title = kept.title;
    this.#cost = kept.cost;
    this.#used = kept.used;
    this.#given = new Set(kept.given);
    this.#tell();
  }

  #save(): void {
    if (!this.#store || !this.#agent || !this.#turns.length) return;
    const record: PiRecord = {
      version: 1, session: this.#session, title: this.#title, at: this.#at, last: this.#turns.at(-1)?.at ?? this.#at, cost: this.#cost, used: this.#used,
      given: [...this.#given], turns: this.#turns, // The system prompt is the agent's own at every start, so a saved session does not carry an old one.
      messages: (JSON.parse(JSON.stringify(this.#agent.state.messages)) as { role?: string }[]).filter((m) => m.role !== "system"),
    };
    this.#store.save(record).catch((e: Error) => { this.#problem = `Could not keep this session: ${e.message}`; this.#tell(); });
  }

  #open(kept?: PiRecord): void {
    this.#session = kept?.session ?? randomUUID();
    this.#at = kept?.at ?? new Date(this.#now()).toISOString();
    this.#agent = new Agent({
      initialState: { systemPrompt: INSTRUCTIONS, model: this.#model, ...(kept ? { messages: kept.messages as never } : {}) },
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
    if (e.type === "message_start" && (e.message as { role?: string }).role === "user") {
      if (!this.#primed) { this.#primed = true; return; }
      const said = userText((e.message as { content?: unknown }).content);
      const at = this.#queued.findIndex((q) => q.body === said);
      if (at < 0) return;
      const [q] = this.#queued.splice(at, 1);
      // It now stands where the model took it up, after what came before.
      this.#edit((items) => {
        const was = items.find((i) => i.kind === "message" && i.id === q!.id) as Extract<TerminalItem, { kind: "message" }> | undefined;
        return was ? [...items.filter((i) => i !== was), { ...was, state: "landed" as const }] : items;
      });
    } else if (e.type === "message_start" && (e.message as { role?: string }).role === "assistant") {
      this.#edit((items) => [...items, { kind: "text", text: "" }]);
      this.#writing = (this.#turns.at(-1)?.items.length ?? 1) - 1;
    } else if (e.type === "message_update" && e.assistantMessageEvent.type === "thinking_delta") {
      const delta = e.assistantMessageEvent.delta;
      if (this.#thinkingAt < 0) {
        // Before the text item it belongs ahead of.
        const at = Math.max(this.#writing, 0);
        this.#edit((items) => [...items.slice(0, at), { kind: "thinking", text: "" }, ...items.slice(at)]);
        this.#thinkingAt = at;
        this.#writing = at + 1;
      }
      const t = this.#thinkingAt;
      this.#edit((items) => items.map((i, k) => (k === t && i.kind === "thinking" ? { ...i, text: i.text + delta } : i)));
    } else if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
      const at = this.#writing, delta = e.assistantMessageEvent.delta;
      this.#edit((items) => items.map((i, k) => (k === at && i.kind === "text" ? { ...i, text: i.text + delta } : i)));
    } else if (e.type === "message_end" && (e.message as { role?: string }).role === "assistant") {
      const m = e.message as { content?: unknown; usage?: { totalTokens?: number; cost?: { total?: number } } };
      const at = this.#writing, think = this.#thinkingAt, whole = textOf(m.content);
      const thought = (Array.isArray(m.content) ? (m.content as { type?: string; thinking?: string }[]) : []).map((b) => (b?.type === "thinking" ? b.thinking ?? "" : "")).join("");
      this.#edit((items) => items.flatMap((i, k) => (k === think ? (thought.trim() ? [{ kind: "thinking", text: thought } as TerminalItem] : []) : k !== at ? [i] : whole ? [{ kind: "text", text: whole } as TerminalItem] : [])));
      this.#writing = -1;
      this.#thinkingAt = -1;
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
    this.#dropQueued();
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
    this.#save();
    this.#tell();
  }
  /** What the model would be sent now: the last answer's own count, and an estimate for what came after it. */
  #contextTokens(messages: AgentMessage[]): number {
    let last = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as { role?: string; usage?: { totalTokens?: number }; stopReason?: string };
      if (m.role === "assistant" && m.usage?.totalTokens && m.stopReason !== "aborted" && m.stopReason !== "error") { last = i; break; }
    }
    const counted = last >= 0 ? ((messages[last] as { usage: { totalTokens: number } }).usage.totalTokens) : 0;
    return counted + messages.slice(last + 1).reduce((n, m) => n + estimateTokens(m), 0);
  }

  /** Before a prompt: if what the model would be sent nears its window, summarise the earlier part of the conversation
   *  and keep the recent part as it was (cut at a message of the person's, so a tool call and its result stay together).
   *  The turn shows it. If the summary cannot be made the conversation goes on as it was and the turn says so. */
  async #compactIfNeeded(agent: Agent): Promise<void> {
    const window = this.#model.contextWindow, settings = this.#compaction;
    if (!settings.enabled || !window) return;
    const messages = [...agent.state.messages];
    const before = this.#contextTokens(messages);
    if (!shouldCompact(before, window, settings)) return;
    // Leading system messages stay as they are; so does nothing else but the recent part.
    const roleOf = (m: AgentMessage | undefined): string | undefined => (m as { role?: string } | undefined)?.role;
    let head = 0;
    while (roleOf(messages[head]) === "system") head++;
    const earlier = (messages[head] as { content?: unknown } | undefined)?.content;
    const previous = userText(earlier).startsWith(SUMMARY) ? userText(earlier).slice(SUMMARY.length) : undefined;
    const from = head + (previous === undefined ? 0 : 1);
    let acc = 0, cut = from;
    for (let i = messages.length - 1; i >= from; i--) { acc += estimateTokens(messages[i]!); if (acc >= settings.keepRecentTokens) { cut = i; break; } }
    while (cut > from && roleOf(messages[cut]) !== "user") cut--;
    if (cut <= from) return;
    const id = this.#turns.at(-1)?.items.length ?? 0;
    this.#edit((items) => [...items, { kind: "compaction", state: "running", before }]);
    this.#tell();
    this.#summarising = new AbortController();
    try {
      const summary = await generateSummary(messages.slice(from, cut), this.#model, settings.reserveTokens, undefined, undefined, this.#summarising.signal, undefined, previous, undefined, this.#streamFn);
      const stand = { role: "user" as const, content: [{ type: "text" as const, text: SUMMARY + summary }], timestamp: this.#now() };
      // The recent answers' own counts describe the context as it was before: they are not trusted any more, so the
      // size of what stands now is estimated until the model's next answer gives a count.
      const recent = messages.slice(cut).map((m) => ((m as { role?: string }).role === "assistant" ? ({ ...m, usage: { ...(m as { usage?: object }).usage, totalTokens: 0 } } as AgentMessage) : m));
      const kept: AgentMessage[] = [...messages.slice(0, head), stand, ...recent];
      agent.state.messages = kept;
      const after = this.#contextTokens(kept);
      this.#used = after;
      this.#edit((items) => items.map((i, k) => (k === id && i.kind === "compaction" ? { ...i, state: "done" as const, after, summary } : i)));
    } catch (e) {
      const error = this.#stopping ? "stopped" : (e as Error).message;
      this.#edit((items) => items.map((i, k) => (k === id && i.kind === "compaction" ? { ...i, state: "failed" as const, error } : i)));
    } finally { this.#summarising = null; this.#tell(); }
  }

  /** Said but never taken up (the run ended or was stopped first). */
  #dropQueued(): void {
    if (!this.#queued.length) return;
    const ids = new Set(this.#queued.map((q) => q.id));
    this.#queued = [];
    this.#agent?.clearAllQueues();
    this.#edit((items) => items.map((i) => (i.kind === "message" && ids.has(i.id) ? { ...i, state: "dropped" as const } : i)));
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
      model: this.#model.id ?? "", ...(this.#problem ? { problem: this.#problem } : {}), steer: true, ...(this.#model.contextWindow ? { size: this.#model.contextWindow } : {}), sessions: entry ? [entry] : [],
    };
    for (const fn of this.#listeners) fn(this.#view);
  }
}
