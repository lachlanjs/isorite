// The terminal's session in Iso's pane (M11): what `isorite term` shows, followed by the isorite server, drawn in
// Build mode. Asking, stopping and answering go through the server; the page never reaches OpenCode itself. With no
// terminal attached (or in the tutorial, which has no server), there is no Build mode.

import type { Decision, EngineEvent, TerminalView } from "@isorite/engine";
import type { TerminalApi } from "./api.ts";
import { app } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";
import { tray } from "./tray.svelte.ts";

class TerminalState {
  view = $state.raw<TerminalView | null>(null);
  /** Why the last message could not be sent, or an answer not given. */
  problem = $state("");
  private started = false;

  get connected(): boolean { return !!this.view?.connected; }
  get running(): boolean { return !!this.view?.busy || this.view?.turns.at(-1)?.state === "running"; }
  private get api(): TerminalApi | null { return (app.api as { terminal?: TerminalApi } | undefined)?.terminal ?? null; }

  /** Read the session once, then follow the server's events. Once. */
  start(): void {
    if (this.started || !app.api) return;
    this.started = true;
    if (!this.api) { panes.setBuild(false); return; }
    void this.api.view().then((v) => this.show(v), () => panes.setBuild(false));
    app.on((e: EngineEvent) => { if (e.type === "terminal") this.show(e.terminal); });
  }

  private show(v: TerminalView): void {
    const was = this.connected;
    this.view = v;
    panes.setBuild(v.connected);
    // Asked from the terminal while you look elsewhere: Iso's tab says so.
    if (was && v.connected && panes.focus !== "iso" && v.turns.length > (this.seen ?? v.turns.length)) panes.unseen++;
    this.seen = v.turns.length;
  }
  private seen: number | null = null;

  async send(asked: string): Promise<boolean> {
    this.problem = "";
    if (!asked.trim() || !this.api) return false;
    try {
      const given = tray.sent.map((p) => (p.kind === "passage" ? { kind: p.kind, id: p.id, text: p.text } : { kind: p.kind, id: p.id }));
      await this.api.prompt(asked.trim(), given);
      return true;
    } catch (e) { this.problem = (e as Error).message; return false; }
  }
  async stop(): Promise<void> { try { await this.api?.stop(); } catch (e) { this.problem = (e as Error).message; } }
  async reply(id: string, decision: Decision): Promise<void> { try { await this.api?.reply(id, decision); } catch (e) { this.problem = (e as Error).message; } }
}

export const terminal = new TerminalState();
