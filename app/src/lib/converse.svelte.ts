// The conversation in Iso's pane (M10): its turns as the engine keeps them, the turn running now as its events
// come, and what is sent with the next. One conversation at a time; a new one is begun from the pane.

import type { ContextReport, Conversation, Decision, EngineEvent, Turn, TurnItem } from "@isorite/engine";
import { app } from "./app.svelte.ts";
import { context } from "./context.svelte.ts";
import { panes } from "./panes.svelte.ts";
import { tray, type Part } from "./tray.svelte.ts";

class Converse {
  /** The conversation shown: its id ("" before the first turn) and its turns, oldest first. */
  id = $state("");
  turns = $state.raw<Turn[]>([]);
  /** The text of the turn running, as it streams. */
  streaming = $state("");
  /** Why the last message could not be sent. */
  problem = $state("");
  /** What the next turn would send, part by part. */
  report = $state.raw<ContextReport | null>(null);
  /** What Iso's pane shows: the conversation, or what the next turn is sent (M10b). */
  view = $state<"chat" | "context">("chat");
  /** Earlier turns left out of what the next is sent. */
  off = $state.raw<string[]>([]);
  toggleTurn(id: string): void { this.off = this.off.includes(id) ? this.off.filter((x) => x !== id) : [...this.off, id]; this.measure(); }
  /** As much as a part given adds to the next turn, once measured. */
  sizeOf(p: Part): number | null {
    const g = this.report?.given?.find((x) => x.kind === p.kind && x.id === p.id && (p.kind !== "passage" || x.text === p.text));
    return g ? g.tokens : null;
  }
  private started = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  get running(): Turn | null { const t = this.turns.at(-1); return t?.state === "running" ? t : null; }

  /** Load the latest conversation, and follow the engine's events. Once. */
  start(): void {
    if (this.started || !app.api) return;
    this.started = true;
    void app.api.conversation().then((c) => { if (c && !this.id) this.show(c); }, () => undefined);
    app.on((e) => this.follow(e));
    this.measure();
  }

  private show(c: Conversation): void { this.id = c.id; this.turns = c.turns; }

  /** A fresh conversation: nothing earlier is sent. The last one stays in the study base. */
  fresh(): void { if (this.running) return; this.id = ""; this.turns = []; this.streaming = ""; this.off = []; this.measure(); }

  async send(asked: string): Promise<boolean> {
    this.problem = "";
    if (!asked.trim() || this.running) return false;
    try {
      const given = tray.sent.map((p) => (p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }));
      const { conversation } = await app.api.converse({ ...(this.id ? { conversation: this.id } : {}), mode: panes.mode, asked: asked.trim(), given, tier: context.tier, ...(this.off.length ? { off: this.off } : {}) });
      this.id = conversation;
      return true;
    } catch (e) { this.problem = (e as Error).message; return false; }
  }

  async stop(): Promise<void> { const t = this.running; if (t) await app.api.stop(t.id); }
  /** Put back what a turn changed. What could not be put back is said in the turn. */
  async undo(turn: string): Promise<void> {
    this.problem = "";
    try { await app.api.undoTurn(this.id, turn); } catch (e) { this.problem = (e as Error).message; }
  }
  async answer(permission: string, decision: Decision): Promise<void> { const t = this.running; if (t) await app.api.answer(t.id, permission, decision); }

  private follow(e: EngineEvent): void {
    if (e.type === "iso-start" && e.place.form === "turn") {
      if (this.id && e.place.conversation !== this.id) return;
      this.id = e.place.conversation;
      this.streaming = "";
      this.turns = [...this.turns.filter((t) => t.id !== e.request), { id: e.request, conversation: e.place.conversation, at: new Date().toISOString(), mode: e.place.mode, asked: e.asked, given: e.place.given, tier: e.tier, items: [], state: "running" }];
      return;
    }
    if (!("request" in e)) { if (e.type === "note-changed" || e.type === "journal") this.measure(); return; }
    const k = this.turns.findIndex((t) => t.id === e.request);
    if (k < 0) return;
    const t = this.turns[k]!;
    const put = (next: Turn) => { this.turns = this.turns.map((x, i) => (i === k ? next : x)); };
    if (e.type === "iso-text") this.streaming = e.again ? e.delta : this.streaming + e.delta;
    else if (e.type === "iso-item") {
      if (e.item.kind === "text") this.streaming = "";
      put({ ...t, items: [...t.items, e.item] });
    }
    else if (e.type === "iso-answer") put({ ...t, items: t.items.map((i): TurnItem => (i.kind === "permission" && i.id === e.permission ? { ...i, answer: e.decision } : i)) });
    else if (e.type === "iso-done") { put({ ...t, state: "done", cost: e.cost }); this.streaming = ""; this.measure(); }
    else if (e.type === "iso-stopped") { put({ ...t, state: "stopped", ...(this.streaming ? { items: [...t.items, { kind: "text" as const, text: this.streaming }] } : {}) }); this.streaming = ""; }
    else if (e.type === "iso-failed") { put({ ...t, state: "failed", message: e.message }); this.streaming = ""; }
  }

  /** Ask again, a moment after what changes it, what the next turn would send. */
  measure(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!app.api) return;
      const given = tray.sent.map((p) => (p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }));
      void app.api.turnContext({ ...(this.id ? { conversation: this.id } : {}), mode: panes.mode, given, tier: context.tier, ...(this.off.length ? { off: this.off } : {}) })
        .then((r) => (this.report = r), () => undefined);
    }, 250);
  }
}

export const converse = new Converse();
