// The terminal's session in the Iso pane (M11). `isorite term` starts OpenCode's own server on this machine with a
// password of its own, attaches the terminal to it, and tells this server where it is. This server is then its only
// other client: it reads the session the terminal shows and tells the pages, and asks, stops and answers for them.
// The pages never reach OpenCode, and never see the password.

import { OpenCode } from "@opencode/client";
import type { Given, TerminalItem, TerminalPermission, TerminalTurn, TerminalView } from "@isorite/engine";

/** OpenCode's messages, as far as the pane reads them (seen from 2.0.32, `spike/probe.ts`). */
export type Message =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "assistant"; content: Content[]; cost?: number; tokens?: { input: number; output: number }; model?: { id: string } }
  | { id: string; type: "idle"; outcome: string }
  | { id: string; type: string };
type Content =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; state: { status: string; input?: Record<string, unknown>; content?: { type: string; text?: string }[] } }
  | { type: string };

const OUTPUT = 4000;
const LOOKUPS = new Set(["search_notes", "find_similar", "outline_note", "read_note", "brief_base"]);
/** isorite's tools that change a note: their line opens it, where the agent's words are marked. */
const CHANGES = new Set(["edit_note", "write_note"]);

/** What a tool call acted on, in a line. */
export function titleOf(name: string, input: Record<string, unknown> = {}): string {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  if (name === "shell" || name === "bash") return s("command");
  if (LOOKUPS.has(name)) return s("query") || s("text") || s("id") + (s("section") ? ` § ${s("section")}` : "");
  if (CHANGES.has(name)) return s("note");
  return s("path") || s("filePath") || s("pattern") || s("url") || s("description") || "";
}

/** An edit's lines as a diff: what it took out, then what it put in. A write is all put in. */
function diffOf(name: string, input: Record<string, unknown>): string[] | undefined {
  const lines = (v: unknown) => (typeof v === "string" ? v.replace(/\n$/, "").split("\n") : []);
  if ((name === "edit" || name === "edit_note") && typeof input.oldString === "string") return [...lines(input.oldString).map((l) => "-" + l), ...lines(input.newString).map((l) => "+" + l)].slice(0, 200);
  if ((name === "write" || name === "write_note") && typeof input.content === "string") return lines(input.content).map((l) => "+" + l).slice(0, 200);
  return undefined;
}

/** The session's messages (oldest first) as the pane's turns. Text still arriving (`live`, by assistant message) is
 *  added where the listed message does not have it yet; `ours` are the prompts asked from a page. */
export function toTurns(messages: Message[], { live = new Map<string, string>(), ours = new Set<string>(), busy = false } = {}): TerminalTurn[] {
  const turns: TerminalTurn[] = [];
  for (const m of messages) {
    if (m.type === "user" && "text" in m) {
      turns.push({ id: m.id, asked: m.text, from: ours.has(m.id) || ours.has(m.text) ? "here" : "terminal", items: [], state: "running" });
      continue;
    }
    const turn = turns.at(-1);
    if (!turn) continue;
    if (m.type === "idle" && "outcome" in m) {
      turn.state = m.outcome === "succeeded" ? "done" : /interrupt|cancel|abort/.test(m.outcome) ? "stopped" : "failed";
      continue;
    }
    if (m.type !== "assistant" || !("content" in m)) continue;
    let texts = 0;
    for (const c of m.content) {
      if (c.type === "text" && "text" in c) { texts++; if (c.text) turn.items.push({ kind: "text", text: c.text }); }
      else if (c.type === "tool" && "state" in c) {
        const input = c.state.input ?? {};
        const output = (c.state.content ?? []).map((x) => x.text ?? "").join("").slice(0, OUTPUT);
        const status = c.state.status === "completed" ? "done" : /error|fail/.test(c.state.status) ? "failed" : "running";
        const item: TerminalItem = { kind: "tool", id: c.id, name: c.name, title: titleOf(c.name, input), status, output };
        const named = LOOKUPS.has(c.name) ? input.id : CHANGES.has(c.name) ? input.note : undefined;
        if (typeof named === "string" && named) item.note = named.replace(/^\//, "").replace(/\.md$/, "");
        const diff = diffOf(c.name, input);
        if (diff) item.diff = diff;
        turn.items.push(item);
      }
    }
    const streaming = live.get(m.id);
    if (streaming && !texts) turn.items.push({ kind: "text", text: streaming });
  }
  // Text whose message is not listed yet belongs to the turn under way.
  const listed = new Set(messages.map((m) => m.id));
  const last = turns.at(-1);
  if (last && last.state === "running") for (const [id, text] of live) if (!listed.has(id) && text) last.items.push({ kind: "text", text });
  if (!busy) for (const t of turns) if (t.state === "running") t.state = "done";
  return turns;
}

/** What is asked from a page, with what was given in the Iso pane's context: notes and folders by name, for the
 *  agent to read with isorite's tools, and passages as they are. */
export function given(asked: string, parts: Given[], title: (id: string) => string): string {
  const notes = parts.filter((p) => p.kind === "note" || p.kind === "understanding").map((p) => `- ${title(p.id)} (${p.id})`);
  const folders = parts.filter((p) => p.kind === "folder").map((p) => `- the folder ${p.id}`);
  const passages = parts.flatMap((p) => (p.kind === "passage" ? [`From ${title(p.id)} (${p.id}):\n${p.text.split("\n").map((l) => "> " + l).join("\n")}`] : []));
  const out = [asked.trim()];
  if (notes.length || folders.length) out.push(`From my knowledge base (read them with read_note, or outline_note first):\n${[...notes, ...folders].join("\n")}`);
  if (passages.length) out.push(passages.join("\n\n"));
  return out.join("\n\n");
}

/** Where OpenCode's server is, and how to sign in to it. */
export interface Attachment { url: string; password: string; directory: string }

const EMPTY: TerminalView = { connected: false, session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "" };
/** Events after which the session is read again; text arrives as deltas in between. */
const REREAD = /^session\.(step\.ended|tool\.|inbox\.delivered|execution\.|created|renamed)|^permission\./;

type Client = ReturnType<typeof OpenCode.make>;

/** The terminal's session, followed. One terminal at a time: a second `isorite term` on the same server takes over. */
export class Terminal {
  #view: TerminalView = EMPTY;
  #client: Client | null = null;
  #stop: AbortController | null = null;
  #listeners = new Set<(view: TerminalView) => void>();
  #live = new Map<string, string>();
  #ours = new Set<string>();
  #asking = new Map<string, TerminalPermission>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #directory = "";

  view(): TerminalView { return this.#view; }
  listen(fn: (view: TerminalView) => void): () => void { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #tell(): void { for (const fn of this.#listeners) fn(this.#view); }

  async attach({ url, password, directory }: Attachment): Promise<void> {
    this.detach();
    const client = OpenCode.make({ baseUrl: url, headers: { authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") } });
    await client.server.info();
    this.#client = client;
    this.#directory = directory;
    this.#view = { ...EMPTY, connected: true };
    const stop = (this.#stop = new AbortController());
    void this.#follow(client, stop.signal);
    await this.#choose();
    await this.#read();
  }

  detach(): void {
    this.#stop?.abort();
    this.#stop = null;
    this.#client = null;
    this.#live.clear();
    this.#asking.clear();
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#view.connected) { this.#view = EMPTY; this.#tell(); }
  }

  /** Ask in the session the terminal shows, from a page. While it works, the prompt steers the turn under way. */
  async prompt(text: string): Promise<void> {
    const client = this.#need();
    if (!this.#view.session) { await this.#choose(true); }
    this.#ours.add(text);
    const sent = (await client.session.prompt({ sessionID: this.#view.session!, text } as never)) as { id?: string };
    if (sent?.id) this.#ours.add(sent.id);
    this.#soon();
  }

  async interrupt(): Promise<void> {
    const client = this.#need();
    if (this.#view.session) await client.session.interrupt({ sessionID: this.#view.session } as never);
    this.#soon();
  }

  /** Answer what the agent asked; only what this session is asking can be answered. */
  async reply(id: string, decision: "once" | "always" | "reject"): Promise<void> {
    const client = this.#need();
    if (!this.#asking.has(id) || !this.#view.session) throw new Error("the terminal is not asking that");
    await client.permission.reply({ sessionID: this.#view.session, requestID: id, decision } as never);
    this.#asking.delete(id);
    this.#soon();
  }

  #need(): Client {
    if (!this.#client) throw new Error("no terminal is attached: start one with isorite term");
    return this.#client;
  }

  /** The session to follow: the one the terminal last showed, else the latest. With `make`, one is made when none is. */
  async #choose(make = false): Promise<void> {
    const client = this.#client;
    if (!client) return;
    const listed = (await client.session.list().catch(() => null)) as { data?: { id: string; title?: string; time?: { updated?: number } }[] } | null;
    const sessions = [...(listed?.data ?? [])].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
    if (sessions[0]) { this.#show(sessions[0].id); return; }
    if (make) {
      const made = (await client.session.create({ location: { directory: this.#directory } } as never)) as { id: string };
      this.#show(made.id);
    }
  }

  #show(session: string): void {
    if (this.#view.session === session) return;
    this.#live.clear();
    this.#asking.clear();
    this.#view = { ...this.#view, session, turns: [], asking: [] };
    void this.#pending();
  }

  async #pending(): Promise<void> {
    const client = this.#client, session = this.#view.session;
    if (!client || !session) return;
    const asked = (await client.permission.list({ sessionID: session } as never).catch(() => [])) as { id: string; action: string; resources?: string[]; source?: { id?: string } }[];
    for (const p of asked ?? []) this.#asking.set(p.id, { id: p.id, action: p.action, resources: p.resources ?? [], ...(p.source?.id ? { tool: p.source.id } : {}) });
    this.#soon();
  }

  async #follow(client: Client, signal: AbortSignal): Promise<void> {
    try {
      for await (const raw of client.event.subscribe()) {
        if (signal.aborted) return;
        const e = raw as { type: string; data?: Record<string, unknown> };
        const d = e.data ?? {};
        const session = typeof d.sessionID === "string" ? d.sessionID : null;
        // The terminal moved to another session: follow it.
        if ((e.type === "session.viewed" || e.type === "session.created") && session) this.#show(session);
        if (session && session !== this.#view.session) continue;
        if (e.type === "session.execution.started") this.#view = { ...this.#view, busy: true };
        if (/^session\.execution\.(succeeded|failed|interrupted|cancelled|stopped)/.test(e.type)) { this.#view = { ...this.#view, busy: false }; this.#live.clear(); }
        if (e.type === "session.text.delta" && typeof d.assistantMessageID === "string") {
          this.#live.set(d.assistantMessageID, (this.#live.get(d.assistantMessageID) ?? "") + String(d.delta ?? ""));
          this.#view = { ...this.#view, turns: this.#turns(this.#messages) };
          this.#tell();
          continue;
        }
        if (e.type === "permission.asked" && typeof d.id === "string") {
          const source = d.source as { id?: string } | undefined;
          this.#asking.set(d.id, { id: d.id, action: String(d.action ?? ""), resources: (d.resources as string[]) ?? [], ...(source?.id ? { tool: source.id } : {}) });
        }
        if (e.type === "permission.replied" && typeof d.requestID === "string") this.#asking.delete(d.requestID);
        if (e.type === "session.usage.updated") this.#view = { ...this.#view, cost: Number(d.cost ?? 0), tokens: { input: Number((d.tokens as { input?: number })?.input ?? 0), output: Number((d.tokens as { output?: number })?.output ?? 0) } };
        if (REREAD.test(e.type) || e.type === "session.usage.updated") this.#soon();
      }
    } catch {
      // OpenCode went: the terminal has closed.
      if (!signal.aborted && this.#client === client) this.detach();
    }
  }

  #messages: Message[] = [];
  #turns(messages: Message[]): TerminalTurn[] { return toTurns(messages, { live: this.#live, ours: this.#ours, busy: this.#view.busy }); }

  /** Read the session again shortly, once for a burst of events. */
  #soon(): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => { this.#timer = null; void this.#read(); }, 80);
  }

  async #read(): Promise<void> {
    const client = this.#client, session = this.#view.session;
    if (!client) return;
    if (!session) { this.#tell(); return; }
    const [listed, info] = await Promise.all([
      client.message.list({ sessionID: session, limit: 200, order: "desc" } as never).catch(() => null) as Promise<{ data?: Message[] } | null>,
      client.session.get({ sessionID: session } as never).catch(() => null) as Promise<{ title?: string; model?: { id?: string }; cost?: number } | null>,
    ]);
    if (this.#client !== client || this.#view.session !== session) return;
    // Listed newest first, the latest 200 (the most OpenCode gives at once): enough for the pane.
    this.#messages = [...(listed?.data ?? [])].reverse();
    const model = [...this.#messages].reverse().find((m): m is Extract<Message, { type: "assistant" }> => m.type === "assistant" && "content" in m)?.model?.id ?? info?.model?.id ?? this.#view.model;
    this.#view = { ...this.#view, title: info?.title ?? this.#view.title, model, turns: this.#turns(this.#messages), asking: [...this.#asking.values()] };
    this.#tell();
  }
}
