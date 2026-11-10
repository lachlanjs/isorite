// A pi agent run inside the isorite server, serving the Agent pane (M35): the pane's `PaneSessions`,
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
import { givenKey } from "../given.ts";
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
  /** The key to use for a provider, asked for at each request (so one changed in the settings is used by the next turn). */
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
}

const OUTPUT = 4000;
interface Compaction { enabled: boolean; reserveTokens: number; keepRecentTokens: number }
/** What the summary of an earlier conversation begins with, in the message that stands for it. */
const SUMMARY = "[The earlier part of this conversation, summarised to make room]\n";
const EMPTY: TerminalView = { connected: true, agent: "", session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", sessions: [] };

/** A block of context given from the tray is tagged with the chip it came from and the turn it came in with, so it can be
 *  taken back out of what the model is sent when the chip is removed (M36, step 10). */
const TAG = /^\[context (\S+) @(\S+)\]\n/;
const WITHDRAWN = "[Context the person gave earlier here was withdrawn: they took it out of the conversation. Do not rely on it; read the notes again if you need them.]";
const tagged = (key: string, turn: string, block: string): string => `[context ${encodeURIComponent(key)} @${turn}]\n${block}\n[/context]\n\n`;

const textOf = (content: unknown): string =>
  (Array.isArray(content) ? content : []).map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : "")).join("");

/** The base's tools that act on one note, and the argument naming it. */
const NOTE_TOOLS: Record<string, string> = { read_note: "id", outline_note: "id", edit_note: "note", write_note: "note" };
/** The note a call of isorite's own acts on, as its id (not a lent base's, written `base:id`). */
function noteOf(tool: string, args: unknown): string | undefined {
  const key = NOTE_TOOLS[tool], v = key ? (args as Record<string, unknown> | null)?.[key] : undefined;
  if (typeof v !== "string" || !v.trim() || /^[a-z0-9-]+:(?!\/\/)/.test(v)) return undefined;
  return v.trim().replace(/^\/+/, "").replace(/\.md$/i, "");
}
/** An edit's lines, `-` what went and `+` what came, from what the call was given: a note's or a file's edit, or a whole
 *  file or note written (all of it added). */
function diffOf(args: unknown): string[] | undefined {
  const a = (args ?? {}) as Record<string, unknown>;
  const lines = (v: unknown, mark: string): string[] => (typeof v === "string" && v ? v.replace(/\n$/, "").split("\n").map((l) => mark + l) : []);
  // The lines the two sides share at either end are the same lines, not a change.
  const pair = (from: unknown, to: unknown): string[] => {
    const o = lines(from, ""), n = lines(to, "");
    let head = 0, tail = 0;
    while (head < o.length && head < n.length && o[head] === n[head]) head++;
    while (tail < o.length - head && tail < n.length - head && o[o.length - 1 - tail] === n[n.length - 1 - tail]) tail++;
    return [...o.slice(head, o.length - tail).map((l) => `-${l}`), ...n.slice(head, n.length - tail).map((l) => `+${l}`)];
  };
  if (typeof a.newString === "string" || typeof a.newText === "string") return pair(a.oldString ?? a.oldText, a.newString ?? a.newText).slice(0, 400);
  if (Array.isArray(a.edits)) return a.edits.flatMap((x: Record<string, unknown>) => pair(x?.oldText ?? x?.oldString, x?.newText ?? x?.newString)).slice(0, 400);
  if (typeof a.content === "string") return lines(a.content, "+").slice(0, 400);
  return undefined;
}

const userText = (content: unknown): string => (typeof content === "string" ? content : textOf(content));

export class PiHost implements PaneSessions {
  readonly #api: PiHostOptions["api"];
  #model: Model<any>;
  #streamFn: StreamFn;
  readonly #getApiKey: PiHostOptions["getApiKey"];
  readonly #id: string;
  #name: string;
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
  /** The other sessions kept, by id (the one shown is in the fields below); and the last write, waited for before one is left. */
  #kept = new Map<string, Omit<AgentSession, "agent" | "name">>();
  #saving: Promise<void> = Promise.resolve();
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
  /** When each tool call now running began, for how long it took. */
  #started = new Map<string, number>();
  #asking = new Map<string, TerminalPermission & { wait: (d: Decision) => void }>();
  #allowed = new Set<string>();
  #pending: { parts: Given[]; blocks: string[] } | null = null;
  /** The blocks taken back out: `<key>@<turn>` of each, kept with the session. */
  #withdrawn = new Set<string>();
  #given = new Set<string>();
  /** What was said while it worked and has not reached the model: the item's id, and the text as the model will have it. */
  #queued: { id: string; body: string }[] = [];
  /** The first user message of a run is the prompt itself: it is not a queued message landing. */
  #primed = false;
  /** The text item the assistant message now streaming writes into. */
  #writing = -1;
  #view: TerminalView = EMPTY;
  #listeners = new Set<(v: TerminalView) => void>();

  constructor({ api, model, streamFn, id = "pi", name = "pi", ask = () => false, more = () => [], guard = () => undefined, clock = Date.now, store, compaction, getApiKey }: PiHostOptions) {
    this.#getApiKey = getApiKey;
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
      // Kept (a question made a note, words inserted): the item in its turn says so.
      if (e.type === "agent-taken") {
        const has = (t: TerminalTurn) => t.items.some((i) => (i.kind === "question" || i.kind === "offer") && i.id === e.id);
        if (!this.#turns.some(has)) return;
        this.#turns = this.#turns.map((t) => (has(t) ? { ...t, items: t.items.map((i) => (i.kind === "question" && i.id === e.id ? { ...i, made: e.note } : i.kind === "offer" && i.id === e.id ? { ...i, taken: true } : i)) } : t));
        this.#save();
        this.#keep();
        this.#tell();
        return;
      }
      if (e.type !== "agent-item" || e.agent !== this.#id || !this.#turns.length) return;
      this.#edit((items) => [...items, e.item as TerminalItem]);
      this.#tell();
    });
    this.#tell();
  }

  /** Carry on with another model (and the way to reach it): the session stays, and the next request goes to it. */
  use(model: Model<any>, streamFn: StreamFn, name?: string): void {
    this.#model = model;
    this.#streamFn = streamFn;
    if (name) this.#name = name;
    if (this.#agent) this.#agent.state.model = model;
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
    this.#pending = fresh.length ? { parts: fresh, blocks: fresh.map((g) => render([g])) } : null;
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
    const message = this.#message(pending, turn.id.slice(0, 8), text);
    void (async () => { await this.#compactIfNeeded(agent); if (this.#stopping) throw new Error("stopped"); await agent.prompt(message); })().then(() => undefined, (e: Error) => { if (this.#stopping) this.#set("stopped"); else this.#fail(e.message); }).then(() => this.#end());
  }

  /** The person's message for the model: each block given with it, tagged, then what they asked. */
  #message(pending: { parts: Given[]; blocks: string[] } | null, turn: string, text: string) {
    const blocks = (pending?.parts ?? []).map((g, i) => tagged(givenKey(g), turn, pending!.blocks[i] ?? ""));
    return { role: "user" as const, content: [...blocks, text].map((t) => ({ type: "text" as const, text: t })), timestamp: this.#now() };
  }

  /** What the model is sent: the messages, with each withdrawn block replaced by a line saying so. */
  #redact(messages: AgentMessage[]): AgentMessage[] {
    if (!this.#withdrawn.size) return messages;
    return messages.map((m) => {
      const msg = m as { role?: string; content?: unknown };
      if (msg.role !== "user" || !Array.isArray(msg.content)) return m;
      let changed = false;
      const content = (msg.content as { type?: string; text?: string }[]).map((c) => {
        const tag = c?.type === "text" && c.text ? TAG.exec(c.text) : null;
        if (!tag || !this.#withdrawn.has(`${decodeURIComponent(tag[1]!)}@${tag[2]}`)) return c;
        changed = true;
        return { type: "text", text: WITHDRAWN };
      });
      return changed ? ({ ...m, content } as AgentMessage) : m;
    });
  }

  /** The person took a chip out of the tray: the block given with it comes out of everything the model is sent from now
   *  on. The turns it came in stay as they were, marked. Says whether there was anything to take out. */
  async withdraw(g: Given): Promise<boolean> {
    const key = givenKey(g);
    if (this.#pending) {
      const keep = this.#pending.parts.map((p, i) => ({ p, b: this.#pending!.blocks[i]! })).filter((x) => givenKey(x.p) !== key);
      this.#pending = keep.length ? { parts: keep.map((x) => x.p), blocks: keep.map((x) => x.b) } : null;
    }
    if (!this.#given.has(key)) return false;
    // Taken back also means it is given afresh if it is put in again.
    this.#given.delete(key);
    for (const m of this.#agent?.state.messages ?? []) {
      const msg = m as { role?: string; content?: unknown };
      if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
      for (const c of msg.content as { type?: string; text?: string }[]) {
        const tag = c?.type === "text" && c.text ? TAG.exec(c.text) : null;
        if (tag && decodeURIComponent(tag[1]!) === key) this.#withdrawn.add(`${key}@${tag[2]}`);
      }
    }
    this.#turns = this.#turns.map((t) => {
      const at = (t.given ?? []).flatMap((x, i) => (givenKey(x) === key && !t.withdrawn?.includes(i) ? [i] : []));
      return at.length ? { ...t, withdrawn: [...(t.withdrawn ?? []), ...at] } : t;
    });
    this.#save();
    this.#keep();
    this.#tell();
    return true;
  }

  async steer(text: string): Promise<void> {
    if (!this.#busy) throw new Error("The agent is not working: ask it instead");
    await this.#say(text, "steer");
  }

  /** Said while it works: a steer comes in after the step now running, a follow-up when it would otherwise stop. */
  async #say(text: string, mode: "steer" | "followUp"): Promise<void> {
    const agent = this.#agent;
    if (!agent) return;
    const pending = this.#pending;
    this.#pending = null;
    if (pending) for (const g of pending.parts) this.#given.add(givenKey(g));
    const id = randomUUID();
    const message = this.#message(pending, (this.#turns.at(-1)?.id ?? id).slice(0, 8), text);
    this.#queued.push({ id, body: userText(message.content) });
    this.#edit((items) => [...items, { kind: "message", id, text, mode, state: "queued" }]);
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
    if (!asked) throw new Error("The agent is not asking that");
    asked.wait(decision);
  }

  /** Show another kept session, and carry on in it. The one left is already kept (it is written after each turn). */
  async follow(_agent: string, session: string): Promise<void> {
    if (session === this.#session) return;
    if (this.#busy) throw new Error("The agent is working: stop it first");
    const kept = await this.#fetch(session);
    this.#restore(kept);
  }

  /** A new session from the pane; the one shown stays kept and can be shown again. */
  async fresh(_agent: string): Promise<void> {
    if (this.#busy) throw new Error("The agent is working: stop it first");
    await this.#saving;
    this.#blank();
    this.#tell();
  }

  /** A new session that begins where `session` is (its turns and the model's messages), going its own way from there;
   *  its cost starts again at nothing. The original is not changed. */
  async fork(_agent: string, session: string): Promise<void> {
    if (this.#busy) throw new Error("The agent is working: stop it first");
    const from = session === this.#session && this.#agent ? this.#record() : await this.#fetch(session);
    if (!from || !this.#store) throw new Error("that session is not kept, so there is nothing to fork");
    const now = new Date(this.#now()).toISOString();
    const copy: PiRecord = { ...JSON.parse(JSON.stringify(from)) as PiRecord, session: randomUUID(), title: `${from.title || "A session"} (fork)`.slice(0, 90), at: now, last: now, cost: 0 };
    await this.#store.save(copy);
    this.#kept.set(copy.session, this.#summary(copy));
    this.#restore(copy);
  }


  /** Remove what is kept of a session. The one shown is left first, for a new one. */
  async forget(_agent: string, session: string): Promise<void> {
    if (!this.#store) throw new Error("nothing is kept apart from the session shown");
    if (session === this.#session) {
      if (this.#busy) throw new Error("The agent is working: stop it first");
      await this.#saving;
      this.#blank();
    }
    await this.#store.remove(session);
    this.#kept.delete(session);
    this.#tell();
  }

  /** Read the list of kept sessions again. */
  refresh(): void { void this.#index().then(() => this.#tell()); }

  async #index(): Promise<void> {
    if (!this.#store) return;
    const { records, unreadable } = await this.#store.list();
    this.#kept = new Map(records.map((r) => [r.session, this.#summary(r)]));
    if (unreadable.length) this.#problem = `${unreadable.length === 1 ? "A saved session" : `${unreadable.length} saved sessions`} could not be read (${unreadable.join(", ")}). ${unreadable.length === 1 ? "It was" : "They were"} left where ${unreadable.length === 1 ? "it is" : "they are"}.`;
  }

  #summary(r: PiRecord): Omit<AgentSession, "agent" | "name"> {
    return { session: r.session, title: r.title, asked: r.turns[0]?.asked ?? "", last: r.last, turns: r.turns.length, notes: 0, live: false, busy: false, kept: true, open: true };
  }

  async #fetch(session: string): Promise<PiRecord> {
    if (!this.#store) throw new Error("that session is not here to carry on");
    await this.#saving;
    const kept = await this.#store.load(session);
    if (!kept) throw new Error("that session is not kept");
    return kept;
  }

  /** No session shown: the next question begins a new one. Everything of the last is let go (it stays kept). */
  #blank(): void {
    this.#agent = null; this.#session = ""; this.#at = ""; this.#turns = []; this.#title = ""; this.#cost = 0; this.#used = 0;
    this.#given = new Set(); this.#withdrawn = new Set(); this.#pending = null; this.#queued = []; this.#problem = "";
    this.#writing = -1; this.#thinkingAt = -1; this.#primed = false; this.#stopping = false;
  }

  /** Show `kept` and carry on from it: its turns for the pane, its messages for the model. A turn that was running when
   *  the server went down is shown as stopped: it never finished. */
  #restore(kept: PiRecord): void {
    this.#blank();
    this.#open(kept);
    this.#turns = kept.turns.map((t) => (t.state === "running" ? { ...t, state: "stopped" as const } : t));
    this.#title = kept.title;
    this.#cost = kept.cost;
    this.#used = kept.used;
    this.#given = new Set(kept.given);
    this.#withdrawn = new Set(kept.withdrawn ?? []);
    this.#tell();
  }

  /** Take up the session last kept, if there is one. An unreadable one is reported in the pane and left alone, and the
   *  agent starts fresh. */
  async resume(): Promise<void> {
    if (!this.#store || this.#agent) return;
    let kept: PiRecord | null;
    try { kept = await this.#store.latest(); } catch (e) { this.#problem = (e as Error).message; this.#tell(); return; }
    try { await this.#index(); } catch { /* the list is ask again with refresh */ }
    if (!kept) { this.#tell(); return; }
    this.#restore(kept);
  }

  #record(): PiRecord {
    return {
      version: 1, session: this.#session, title: this.#title, at: this.#at, last: this.#turns.at(-1)?.at ?? this.#at, cost: this.#cost, used: this.#used,
      given: [...this.#given], withdrawn: [...this.#withdrawn], turns: this.#turns, // The system prompt is the agent's own at every start, so a saved session does not carry an old one.
      messages: (JSON.parse(JSON.stringify(this.#agent!.state.messages)) as { role?: string }[]).filter((m) => m.role !== "system"),
    };
  }

  #save(): void {
    if (!this.#store || !this.#agent || !this.#turns.length) return;
    const record = this.#record();
    this.#kept.set(record.session, this.#summary(record));
    const store = this.#store;
    this.#saving = this.#saving.then(() => store.save(record)).catch((e: Error) => { this.#problem = `Could not keep this session: ${e.message}`; this.#tell(); });
  }

  #open(kept?: PiRecord): void {
    this.#session = kept?.session ?? randomUUID();
    this.#at = kept?.at ?? new Date(this.#now()).toISOString();
    this.#agent = new Agent({
      initialState: { systemPrompt: INSTRUCTIONS, model: this.#model, ...(kept ? { messages: kept.messages as never } : {}) },
      // Through this host, so a model chosen later (`use`) is the one the next request goes to.
      transformContext: async (messages) => this.#redact(messages),
      streamFn: ((...args: Parameters<NonNullable<StreamFn>>) => this.#streamFn!(...args)) as StreamFn,
      ...(this.#getApiKey ? { getApiKey: this.#getApiKey } : {}),
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
      this.#started.set(e.toolCallId, this.#now());
      const note = noteOf(e.toolName, e.args), diff = diffOf(e.args);
      this.#edit((items) => [...items, { kind: "tool", id: e.toolCallId, name: e.toolName, title: titleOf(e.args), status: "running", output: "", ...(note ? { note } : {}), ...(diff ? { diff } : {}) }]);
    } else if (e.type === "tool_execution_end") {
      const out = textOf((e.result as { content?: unknown })?.content).slice(0, OUTPUT);
      const began = this.#started.get(e.toolCallId), ms = began === undefined ? undefined : Math.max(0, this.#now() - began);
      this.#started.delete(e.toolCallId);
      this.#edit((items) => items.map((i) => (i.kind === "tool" && i.id === e.toolCallId ? { ...i, status: e.isError ? "failed" : "done", output: out, ...(ms === undefined ? {} : { ms }) } : i)));
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
    const t = this.#turns.at(-1);
    if (t?.state === "running" && t.at) this.#turns = [...this.#turns.slice(0, -1), { ...t, took: Math.max(0, this.#now() - Date.parse(t.at)) }];
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
      const summary = await generateSummary(this.#redact(messages.slice(from, cut)), this.#model, settings.reserveTokens, undefined, undefined, this.#summarising.signal, undefined, previous, undefined, this.#streamFn);
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

  /** The session shown, with the others kept, newest first. */
  #sessions(entry: AgentSession | null): AgentSession[] {
    const others = [...this.#kept.values()].filter((k) => k.session !== this.#session).map((k) => ({ agent: this.#id, name: this.#name, ...k }));
    return [...(entry ? [entry] : []), ...others].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  }

  #tell(): void {
    const last = this.#turns.at(-1)?.at ?? this.#at;
    const entry: AgentSession | null = this.#session ? { agent: this.#id, name: this.#name, session: this.#session, title: this.#title, asked: this.#turns[0]?.asked ?? "", last, turns: this.#turns.length, notes: 0, live: true, busy: this.#busy, kept: Boolean(this.#store), open: true } : null;
    this.#view = {
      connected: true, agent: this.#name, agentId: this.#id, session: this.#session || null, title: this.#title, busy: this.#busy, turns: this.#turns,
      asking: [...this.#asking.values()].map(({ wait: _, ...p }) => p), cost: this.#cost, tokens: { input: this.#used, output: 0 },
      model: this.#model.id ?? "", ...(this.#problem ? { problem: this.#problem } : {}), steer: true, ...(this.#model.contextWindow ? { size: this.#model.contextWindow } : {}), fork: Boolean(this.#store), sessions: this.#sessions(entry),
    };
    for (const fn of this.#listeners) fn(this.#view);
  }
}
