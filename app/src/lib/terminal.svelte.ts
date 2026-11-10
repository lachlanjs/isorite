// The Agent pane's session (isorite's own agent): the agent set up for the
// base, one of its sessions shown, the others in the drawer, and what is in the tray given to the one shown before
// its next prompt. Asking, stopping and answering go through the server; the page never reaches the agent itself.
// On the guide's site there is no server: the finder stands in for an agent, in the page.
//
// The agent's own conversations, from before M25, are read here too: drawn as a session kept, with nothing to carry on.

import { IMAGE_TYPES } from "@isorite/core";
import { MAX_IMAGE_BYTES } from "@isorite/engine";
import type { ConversationSummary, Decision, EngineEvent, Given, TerminalItem, TerminalTurn, TerminalView, Turn } from "@isorite/engine";
import type { PiApi, TerminalApi } from "./api.ts";
import { app } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";
import { tray, type Part } from "./tray.svelte.ts";
import { askedParts } from "./pointers.ts";

const MAX_ATTACHED = 6;
export interface Attached { key: string; name: string; url: string; id?: string; state: "keeping" | "kept" | "bad"; note?: string }
const givenOf = (): Given[] => tray.sent.map((p) => (p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }));

/** A turn of the agent's, from before M25, as an agent's turn is drawn: what it read and changed as the lines of isorite's
 *  tools, what it said, and what it asked back or offered. */
export function asAgentTurn(t: Turn): TerminalTurn {
  const items: TerminalItem[] = t.items.flatMap((i, k): TerminalItem[] => {
    if (i.kind === "text" || i.kind === "question" || i.kind === "offer") return [i];
    if (i.kind === "look") return [{ kind: "tool", id: `${t.id}:${k}`, name: i.step.tool, title: i.step.query ?? i.step.opened ?? i.step.said, status: i.step.failed ? "failed" : "done", output: "", ...(i.step.opened && !i.step.away ? { note: i.step.opened } : {}) }];
    if (i.kind === "change") return [{ kind: "tool", id: `${t.id}:${k}`, name: i.why === "create" ? "write_note" : "edit_note", title: i.to ?? i.note, status: "done", output: "", ...(i.why === "delete" ? {} : { note: i.to ?? i.note }) }];
    if (i.kind === "point") return [{ kind: "text", text: `Look at [${app.listing.notes.find((n) => n.id === i.note)?.title ?? i.note}](/${i.note}.md)${i.why ? `: ${i.why}` : "."}` }];
    return [];
  });
  return { id: t.id, asked: t.asked, from: "here", items, state: t.state, given: t.given, at: t.at };
}

/** A prompt as the person wrote it: the notice isorite adds for the agent (code links gone stale, http.ts) is the
 *  agent's to read, not part of what was asked, so it is not shown in the turn or the session's title. */
export const askedOf = (text: string): ReturnType<typeof askedParts> => askedParts(text.replace(/\s*\(isorite: [^]*$/, "").trimEnd());
export const plainAsked = (text: string): string => askedOf(text).body;

/** isorite's own tools, as a harness names those of an MCP server (mcp__isorite__read_note, isorite_read_note). */
export const bareTool = (name: string): string => name.replace(/^(mcp_+)?isorite[_:]+/, "");
/** The tools that change a note. */
export const NOTE_CHANGES = new Set(["edit_note", "write_note"]);
/** The notes a turn changed, each once, in the order it changed them: a change it made, not one that left the note as it was. */
export function changedIn(t: TerminalTurn): string[] {
  const ids = new Set<string>();
  for (const i of t.items) if (i.kind === "tool" && i.note && !i.base && i.status === "done" && NOTE_CHANGES.has(bareTool(i.name)) && !/^That leaves /.test(i.output)) ids.add(i.note);
  return [...ids];
}
/** Why a turn failed, in a few words, and what would put it right. */
export function failure(message: string): { said: string; fix: "settings" | "retry" } {
  if (/api.?key|no key|unauthori[sz]ed|\b401\b|\b403\b|authentication|credential/i.test(message)) return { said: "No key for this model.", fix: "settings" };
  if (/rate.?limit|\b429\b|too many requests|overloaded|\b529\b/i.test(message)) return { said: "Rate limited by the provider.", fix: "retry" };
  if (/model.*not (found|exist)|no such model|\b404\b/i.test(message)) return { said: "The provider has no such model.", fix: "settings" };
  if (/fetch failed|ECONN|ENOTFOUND|network|socket|timed? ?out/i.test(message)) return { said: "Could not reach the provider.", fix: "retry" };
  const short = message.replace(/^\(|\)$/g, "").trim();
  return { said: short.length > 140 ? `${short.slice(0, 139)}…` : short || "The model failed.", fix: "retry" };
}
// The notice is always the last thing in a prompt, and an agent may cut a title short inside it: all of it goes.

class TerminalState {
  view = $state.raw<TerminalView | null>(null);
  /** An earlier conversation with the agent being read, in place of the agent's session. */
  old = $state.raw<TerminalView | null>(null);
  /** What the pane shows: the session, what the agent has in hand (the Context view), or the drawer. */
  shown = $state<"session" | "context" | "past">("session");
  /** The agent's own conversations, from before M25, as the drawer lists them: fetched when it opens. */
  past = $state.raw<ConversationSummary[]>([]);
  /** Why the last message could not be sent, or an answer not given. */
  problem = $state("");
  /** A prompt or steer on its way to the server: the box waits, so one Enter sends one message. */
  sending = $state(false);
  /** Permissions answered here, until the server's view no longer asks them: their buttons stand down at once. */
  answered = $state.raw<ReadonlySet<string>>(new Set());
  /** Tool calls refused here because a switch is off, and which switch: said under the call, not just marked failed. */
  refusedBy = $state.raw<Readonly<Record<string, "run" | "files">>>({});
  /** What was sent from this box, oldest first, as it was written (its pointers in it): Up in an empty box brings back the last. */
  history = $state.raw<string[]>([]);
  /** Turns undone here (Undo turn): their bar says so. */
  undone = $state.raw<ReadonlySet<string>>(new Set());
  /** A turn being undone now: its bar's button stands down. */
  undoing = $state("");
  private started = false;
  /** A view has come from the event stream: the first read, if it answers later, is older and is dropped. */
  private heard = false;

  /** The session drawn: an old conversation being read, else the agent's. */
  get session(): TerminalView | null { return this.old ?? this.view; }
  get connected(): boolean { return !!this.view?.connected; }
  get running(): boolean { return !this.old && (!!this.view?.busy || this.view?.turns.at(-1)?.state === "running"); }
  private get api(): TerminalApi | null { return (app.api as { terminal?: TerminalApi } | undefined)?.terminal ?? null; }

  /** Read the session once, then follow the server's events. Once. */
  start(): void {
    if (this.started || !app.api) return;
    this.started = true;
    void app.api.agentNotes().then(({ may }) => { panes.on.notes = may; }, () => undefined);
    panes.notesFlipped = (may) => { void app.api.setAgentNotes(may).catch((e: Error) => { panes.on.notes = !may; this.problem = e.message; }); };
    // The native agent's reach is the header's two switches, held by the server: files on is read and write, run is the shell.
    const pi = (app.api as { pi?: PiApi } | undefined)?.pi;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (pi && local) {
      void pi.state().then((m) => { panes.on.files = m.reach.files === "write"; panes.on.run = m.reach.shell; }, () => undefined);
      panes.reachFlipped = () => { void pi.setReach(panes.on.files ? "write" : "read", panes.on.run).catch((e: Error) => { this.problem = e.message; }); };
    }
    if (!this.api) { panes.setAttached(false); return; }
    const read = () => this.api?.view().then((v) => { if (!this.heard) this.show(v); }, () => { if (!this.heard) panes.setAttached(false); });
    void read();
    app.on((e: EngineEvent) => { if (e.type === "terminal") { this.heard = true; this.show(e.terminal); } });
    // Back after the stream was lost: what happened meanwhile is read again, and the next event wins as ever.
    app.onReconnect(() => { this.heard = false; void read(); });
  }

  private show(v: TerminalView): void {
    const was = this.connected;
    this.view = v;
    panes.setAttached(v.connected || !!v.reading);
    // What the agent asks to do that its switch does not allow is refused here (Q47); the rest it asks as before.
    for (const p of v.asking) {
      if (this.refused.has(p.id)) continue;
      const off = /^(shell|bash|execute)$/.test(p.action) ? (!panes.on.run ? "run" : null) : /^(edit|write|patch)$/.test(p.action) ? (!panes.on.files ? "files" : null) : null;
      if (off) {
        this.refused.add(p.id);
        if (p.tool) this.refusedBy = { ...this.refusedBy, [p.tool]: off };
        void this.reply(p.id, "reject");
      }
    }
    // What the server no longer asks needs no answer held for it.
    if (this.answered.size) {
      const open = new Set(v.asking.map((p) => p.id));
      const still = [...this.answered].filter((id) => open.has(id));
      if (still.length !== this.answered.size) this.answered = new Set(still);
    }
    // Asked from the agent's front end while you look elsewhere: the Agent tab says so.
    if (was && v.connected && panes.focus !== "agent" && v.turns.length > (this.seen ?? v.turns.length)) panes.unseen++;
    this.seen = v.turns.length;
  }
  private seen: number | null = null;
  private readonly refused = new Set<string>();

  /** `raw`: what the box held (pointers in it), kept for Up to bring back. */
  async send(asked: string, raw = asked): Promise<boolean> {
    if (!asked.trim() || !this.api || this.sending || this.keeping) return false;
    this.problem = "";
    this.old = null;
    this.sending = true;
    try {
      // The images the model can see go with the turn; any it cannot are left out (their chips said so).
      const images = this.sees ? this.attached.flatMap((a) => (a.id ? [a.id] : [])) : [];
      await this.api.prompt(asked.trim(), givenOf(), images);
      this.clearAttached();
      if (raw.trim() && this.history.at(-1) !== raw) this.history = [...this.history.slice(-49), raw];
      return true;
    } catch (e) { this.problem = (e as Error).message; return false; } finally { this.sending = false; }
  }

  // ------------------------------------------------------------ images given in the box

  /** What is in the box beside the text: images pasted or dropped, each shown as a chip until the turn is sent. `id` is
   *  the server's name for one it has kept; none yet, or `note` says why it will not be sent. */
  attached = $state.raw<Attached[]>([]);
  /** Whether the model takes images (the server says). Where it does not, a chip says so and is not sent. */
  get sees(): boolean { return !!this.view?.images; }
  /** Whether images can be given here at all: the pane's agent is isorite's own, through the server. */
  get canAttach(): boolean { return !!this.api?.image && this.connected; }
  get keeping(): boolean { return this.attached.some((a) => a.state === "keeping"); }
  /** Take images pasted or dropped: each checked (type, size), then kept by the server where the model takes it. */
  async attach(files: File[]): Promise<void> {
    const api = this.api;
    if (!api?.image) return;
    for (const file of files) {
      if (this.attached.length >= MAX_ATTACHED) { this.problem = `At most ${MAX_ATTACHED} images go with a turn.`; break; }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name = file.name || "pasted image";
      const bad = !IMAGE_TYPES.includes(file.type as never) ? "Not a png, jpeg, gif or webp." : file.size > MAX_IMAGE_BYTES ? `Over ${MAX_IMAGE_BYTES / 1e6} MB.` : "";
      this.attached = [...this.attached, { key, name, url: URL.createObjectURL(file), state: bad ? "bad" : this.sees ? "keeping" : "kept", ...(bad ? { note: bad } : {}) }];
      if (bad || !this.sees) continue;
      try {
        const kept = await api.image(new Uint8Array(await file.arrayBuffer()));
        this.attached = this.attached.map((a) => (a.key === key ? { ...a, id: kept.id, state: "kept" } : a));
      } catch (e) {
        this.attached = this.attached.map((a) => (a.key === key ? { ...a, state: "bad", note: (e as Error).message } : a));
      }
    }
  }
  unattach(key: string): void {
    const gone = this.attached.find((a) => a.key === key);
    if (gone) URL.revokeObjectURL(gone.url);
    this.attached = this.attached.filter((a) => a.key !== key);
  }
  clearAttached(): void {
    for (const a of this.attached) URL.revokeObjectURL(a.url);
    this.attached = [];
  }
  /** Where an image sent with a turn is shown from, or null where there is none. */
  imageUrl(id: string): string | null { return this.api?.imageUrl?.(id) ?? null; }

  /** Said while the agent works: in after the step running now. */
  async steer(asked: string): Promise<boolean> {
    if (!asked.trim() || !this.api || this.sending) return false;
    this.problem = "";
    this.sending = true;
    try { await this.api.steer(asked.trim(), givenOf()); return true; } catch (e) { this.problem = (e as Error).message; return false; } finally { this.sending = false; }
  }
  get canSteer(): boolean { return this.running && !!this.view?.steer; }
  async stop(): Promise<void> { try { await this.api?.stop(); } catch (e) { this.problem = (e as Error).message; } }
  async reply(id: string, decision: Decision): Promise<void> {
    if (this.answered.has(id)) return;
    this.answered = new Set([...this.answered, id]);
    try { await this.api?.reply(id, decision); } catch (e) {
      this.problem = (e as Error).message;
      this.answered = new Set([...this.answered].filter((x) => x !== id));
    }
  }
  /** Keep a question the agent asked back, or a passage it offered (M25). */
  async take(id: string): Promise<void> { try { await this.api?.take(id); } catch (e) { this.problem = (e as Error).message; } }

  /** An agent connected, or a kept session of one shown: its session is the pane's. */
  get inPane(): boolean { return !!this.view && (this.view.connected || !!this.view.reading); }
  /** What is in the tray, told to the session shown: what it has not been given yet goes before its next prompt. */
  async give(): Promise<void> {
    if (!this.inPane || !this.api) return;
    try { await this.api.give(givenOf()); } catch (e) { this.problem = (e as Error).message; }
  }
  /** A chip was taken out of the tray: what was given with it is taken back out of what the agent is sent. */
  async withdraw(p: Part): Promise<void> {
    if (!this.inPane || !this.api) return;
    try { await this.api.withdraw(p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }); } catch { /* an agent that cannot take it back keeps what it was given */ }
  }
  async fork(agent: string, session: string): Promise<void> { this.problem = ""; try { await this.api?.fork(agent, session); } catch (e) { this.problem = (e as Error).message; } }
  async follow(agent: string, session: string): Promise<void> { this.problem = ""; this.old = null; try { await this.api?.follow(agent, session); } catch (e) { this.problem = (e as Error).message; } }
  /** Remove one of the agent's old conversations (before M25); the drawer lists the rest again. */
  async forgetPast(id: string): Promise<void> {
    this.problem = "";
    try {
      await app.api.deleteConversation(id);
      if (this.old?.session === id) this.old = null;
      this.past = await app.api.conversations();
    } catch (e) { this.problem = (e as Error).message; }
  }
  /** The pane's settings, opened at the provider (where a key is typed and a model chosen). */
  async settings(): Promise<void> {
    panes.settings = "agent";
    // The provider list appears once the settings have read the model's state.
    let at = document.getElementById("pi-provider");
    for (let i = 0; !at && i < 30; i++) { await new Promise((r) => setTimeout(r, 100)); at = document.getElementById("pi-provider"); }
    at?.scrollIntoView({ block: "center" });
    at?.focus();
  }
  /** A turn asked again, as it was asked (after a rate limit, say). */
  async retry(t: TerminalTurn): Promise<void> {
    if (this.running) return;
    await this.send(t.asked);
  }
  /** The notes a turn changed, put back as they were before it: each to its journal's entry before the turn's first
   *  change (a note the turn made is deleted). Refused, and nothing changed, where a note was changed again after the
   *  turn (by you or a later turn): that is undone from the note's timeline. */
  async undo(t: TerminalTurn): Promise<void> {
    if (this.undoing || !t.at) return;
    this.problem = "";
    this.undoing = t.id;
    try {
      const who = `agent:${this.view?.agentId ?? "pi"}`, from = Date.parse(t.at) - 1000, to = t.took === undefined ? Infinity : Date.parse(t.at) + t.took + 1000;
      const plan: { id: string; back: string | null; version: string }[] = [];
      for (const id of changedIn(t)) {
        const entries = await app.api.journal(id);
        const mine = entries.filter((e) => e.who === who && Date.parse(e.at) >= from && Date.parse(e.at) <= to && e.why !== "move");
        if (!mine.length) continue;
        const first = entries.indexOf(mine[0]!), last = entries.indexOf(mine.at(-1)!);
        if (entries.slice(last + 1).some((e) => e.why !== "move")) throw new Error(`${app.listing.notes.find((n) => n.id === id)?.title ?? id} was changed after this turn: undo it from its timeline`);
        const before = entries.slice(0, first).filter((e) => e.why !== "move").at(-1);
        plan.push({ id, back: before?.id ?? null, version: (await app.api.readNote(id)).version });
      }
      for (const p of plan) {
        if (p.back) await app.api.restore(p.id, p.back, p.version);
        else await app.api.deleteNote(p.id, p.version);
      }
      this.undone = new Set([...this.undone, t.id]);
    } catch (e) { this.problem = (e as Error).message; } finally { this.undoing = ""; }
  }
  /** Remove isorite's kept copy of a session that is not live (the agent's own history stays). */
  async forget(agent: string, session: string): Promise<void> {
    this.problem = "";
    try {
      await this.api?.forget(agent, session);
      if (this.view?.agentId === agent && this.view.session === session) this.old = null;
    } catch (e) { this.problem = (e as Error).message; }
  }
  async fresh(agent: string): Promise<void> { this.problem = ""; this.old = null; try { await this.api?.fresh(agent); } catch (e) { this.problem = (e as Error).message; } }

  /** The drawer, opened or closed: the agents asked for their sessions again, and the agent's conversations listed. */
  async drawer(): Promise<void> {
    if (this.shown === "past") { this.shown = "session"; return; }
    this.shown = "past";
    if (this.inPane) void this.api?.list().catch(() => undefined);
    try { this.past = await app.api.conversations(); } catch { this.past = []; }
  }
  /** An earlier conversation with the agent, read in the pane. */
  async read(id: string): Promise<void> {
    this.problem = "";
    try {
      const c = await app.api.conversation(id);
      if (c) this.old = { connected: false, reading: true, agent: "Agent", agentId: "legacy", session: c.id, title: c.turns[0]?.asked ?? "", busy: false, turns: c.turns.map(asAgentTurn), asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "" };
      this.shown = "session";
    } catch (e) { this.problem = (e as Error).message; }
  }
}

export const terminal = new TerminalState();
tray.onRemove = (part) => void terminal.withdraw(part);
