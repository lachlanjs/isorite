// The Iso pane's agent session (M11; on ACP since M25, when Iso's own loop was retired): an agent attached to the
// base, one of its sessions shown, the others in the drawer, and what is in the tray given to the one shown before
// its next prompt. Asking, stopping and answering go through the server; the page never reaches the agent itself.
// On the guide's site there is no server: the finder stands in for an agent, in the page.
//
// Iso's own conversations, from before M25, are read here too: drawn as a session kept, with nothing to carry on.

import type { ConversationSummary, Decision, EngineEvent, Given, TerminalItem, TerminalTurn, TerminalView, Turn } from "@isorite/engine";
import type { TerminalApi } from "./api.ts";
import { app } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";
import { tray, type Part } from "./tray.svelte.ts";

const givenOf = (): Given[] => tray.sent.map((p) => (p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }));

/** A turn of Iso's, from before M25, as an agent's turn is drawn: what it read and changed as the lines of isorite's
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

class TerminalState {
  view = $state.raw<TerminalView | null>(null);
  /** An earlier conversation with the agent being read, in place of the agent's session. */
  old = $state.raw<TerminalView | null>(null);
  /** What the pane shows: the session, what the agent has in hand (the Context view), or the drawer. */
  shown = $state<"session" | "context" | "past">("session");
  /** Iso's own conversations, from before M25, as the drawer lists them: fetched when it opens. */
  past = $state.raw<ConversationSummary[]>([]);
  /** The drawer's "change agent" is open: asked for from the header's chip. */
  changing = $state(false);
  /** Why the last message could not be sent, or an answer not given. */
  problem = $state("");
  private started = false;

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
    if (!this.api) { panes.setAttached(false); return; }
    void this.api.view().then((v) => this.show(v), () => panes.setAttached(false));
    app.on((e: EngineEvent) => { if (e.type === "terminal") this.show(e.terminal); });
  }

  private show(v: TerminalView): void {
    const was = this.connected;
    this.view = v;
    panes.setAttached(v.connected || !!v.reading);
    // What the agent asks to do that its switch does not allow is refused here (Q47); the rest it asks as before.
    for (const p of v.asking) {
      if (this.refused.has(p.id)) continue;
      const off = /^(shell|bash|execute)$/.test(p.action) ? !panes.on.run : /^(edit|write|patch)$/.test(p.action) ? !panes.on.files : false;
      if (off) { this.refused.add(p.id); void this.reply(p.id, "reject"); }
    }
    // Asked from the agent's front end while you look elsewhere: Iso's tab says so.
    if (was && v.connected && panes.focus !== "iso" && v.turns.length > (this.seen ?? v.turns.length)) panes.unseen++;
    this.seen = v.turns.length;
  }
  private seen: number | null = null;
  private readonly refused = new Set<string>();

  async send(asked: string): Promise<boolean> {
    this.problem = "";
    if (!asked.trim() || !this.api) return false;
    this.old = null;
    try {
      await this.api.prompt(asked.trim(), givenOf());
      return true;
    } catch (e) { this.problem = (e as Error).message; return false; }
  }
  /** Said while the agent works: in after the step running now. */
  async steer(asked: string): Promise<boolean> {
    this.problem = "";
    if (!asked.trim() || !this.api) return false;
    try { await this.api.steer(asked.trim(), givenOf()); return true; } catch (e) { this.problem = (e as Error).message; return false; }
  }
  get canSteer(): boolean { return this.running && !!this.view?.steer; }
  async stop(): Promise<void> { try { await this.api?.stop(); } catch (e) { this.problem = (e as Error).message; } }
  async reply(id: string, decision: Decision): Promise<void> { try { await this.api?.reply(id, decision); } catch (e) { this.problem = (e as Error).message; } }
  /** Keep a question the agent asked back, or a passage it offered (M25). */
  async take(id: string): Promise<void> { try { await this.api?.take(id); } catch (e) { this.problem = (e as Error).message; } }

  /** An agent attached, or a kept session of one shown. */
  get acp(): boolean { return !!this.view && (this.view.connected || !!this.view.reading); }
  /** What is in the tray, told to the session shown: what it has not been given yet goes before its next prompt. */
  async give(): Promise<void> {
    if (!this.acp || !this.api) return;
    try { await this.api.give(givenOf()); } catch (e) { this.problem = (e as Error).message; }
  }
  /** A chip was taken out of the tray: what was given with it is taken back out of what the agent is sent. */
  async withdraw(p: Part): Promise<void> {
    if (!this.acp || !this.api) return;
    try { await this.api.withdraw(p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }); } catch { /* an agent that cannot take it back keeps what it was given */ }
  }
  async fork(agent: string, session: string): Promise<void> { this.problem = ""; try { await this.api?.fork(agent, session); } catch (e) { this.problem = (e as Error).message; } }
  async follow(agent: string, session: string): Promise<void> { this.problem = ""; this.old = null; try { await this.api?.follow(agent, session); } catch (e) { this.problem = (e as Error).message; } }
  /** Set a mode or option of the session shown; the server's view settles it. */
  async set(kind: "mode" | "config", id: string, value: string): Promise<void> {
    this.problem = "";
    try { await this.api?.set(kind, id, value); } catch (e) { this.problem = (e as Error).message; }
  }
  /** Remove one of Iso's old conversations (before M25); the drawer lists the rest again. */
  async forgetPast(id: string): Promise<void> {
    this.problem = "";
    try {
      await app.api.deleteConversation(id);
      if (this.old?.session === id) this.old = null;
      this.past = await app.api.conversations();
    } catch (e) { this.problem = (e as Error).message; }
  }
  /** The header's agent chip: the drawer, with the choice of agent open. */
  change(): void {
    this.changing = true;
    if (this.shown !== "past") void this.drawer();
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

  /** The drawer, opened or closed: the agents asked for their sessions again, and Iso's conversations listed. */
  async drawer(): Promise<void> {
    if (this.shown === "past") { this.shown = "session"; return; }
    this.shown = "past";
    if (this.acp) void this.api?.list().catch(() => undefined);
    try { this.past = await app.api.conversations(); } catch { this.past = []; }
  }
  /** An earlier conversation with the agent, read in the pane. */
  async read(id: string): Promise<void> {
    this.problem = "";
    try {
      const c = await app.api.conversation(id);
      if (c) this.old = { connected: false, reading: true, agent: "Agent", agentId: "iso", session: c.id, title: c.turns[0]?.asked ?? "", busy: false, turns: c.turns.map(asAgentTurn), asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "" };
      this.shown = "session";
    } catch (e) { this.problem = (e as Error).message; }
  }
}

export const terminal = new TerminalState();
tray.onRemove = (part) => void terminal.withdraw(part);
