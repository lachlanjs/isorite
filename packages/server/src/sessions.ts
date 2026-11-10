// What the Agent pane asks of the agent sessions on a base: the pane-facing interface, so that the pages do not know
// which host (which driver) is behind it. A host holds the sessions, says which is shown, and folds what happens in
// them into one `TerminalView`; the pages read that view and nothing else. isorite's own agent (`pi/host.ts`) is the
// host; where none is chosen yet, `NoAgent` stands in and the pane shows its setup.

import type { AgentSession, Given, TerminalView } from "@isorite/engine";

export interface PaneSessions {
  /** The session shown, with every session on the base. */
  view(): TerminalView;
  /** Told the view whenever it changes. Returns the hang-up. */
  listen(fn: (view: TerminalView) => void): () => void;
  /** What is being asked of an agent now, for a note it changes: its turn running, else empty. */
  asked(agent: string): string;
  /** Ask in the session shown; with none yet, in a new one. */
  prompt(text: string): Promise<void>;
  /** Say something to the agent while it works, to come in after the step now running (M36). Throws where the agent
   *  cannot take it, or is not working. A host that cannot be steered leaves this out. */
  steer?(text: string): Promise<void>;
  /** Stop what the session shown is doing. */
  interrupt(): Promise<void>;
  /** Notes and passages given from the pane: those not given in the session yet go before its next prompt. */
  give(parts: Given[], render: (parts: Given[]) => string): Promise<void>;
  /** Take a chip's block back out of what the model is sent from now on (M36). Says whether there was one to take out.
   *  A host whose agent keeps its own history cannot, and leaves this out. */
  withdraw?(g: Given): Promise<boolean>;
  /** Answer what the agent asked before doing something. */
  reply(id: string, decision: "once" | "always" | "reject"): Promise<void>;
  /** Show a session: a live one, one that can be carried on, or one kept to read. */
  follow(agent: string, session: string): Promise<void>;
  /** A new session from the pane. */
  fresh(agent: string): Promise<void>;
  /** A new session that begins where `session` is and goes its own way. A host that cannot leaves this out. */
  fork?(agent: string, session: string): Promise<void>;
    /** Remove what is kept of a session that is not live. */
  forget(agent: string, session: string): Promise<void>;
  /** Ask again for the sessions the drawer lists. */
  refresh(): void;
}

export type { AgentSession };

/** A pane whose host can change while the server runs (M36: isorite's own agent chosen in the settings takes the pane
 *  at once, with no restart). Everything is asked of the host shown now, read anew at each call, so a method one host
 *  has and the other leaves out (steer, withdraw, fork) is there or not as the host now shown has it. Whoever listens
 *  goes on listening to whichever host it is, and is told its view as it changes hands. */
export function switchable(first: PaneSessions): { pane: PaneSessions; use(next: PaneSessions): void } {
  let now = first;
  const listeners = new Map<(view: TerminalView) => void, () => void>();
  const pane = new Proxy({} as PaneSessions, {
    get(_, key) {
      if (key === "listen") return (fn: (view: TerminalView) => void) => {
        listeners.set(fn, now.listen(fn));
        return () => { listeners.get(fn)?.(); listeners.delete(fn); };
      };
      const v = (now as unknown as Record<PropertyKey, unknown>)[key];
      return typeof v === "function" ? v.bind(now) : v;
    },
    has(_, key) { return key in now; },
  });
  return {
    pane,
    use(next) {
      if (next === now) return;
      now = next;
      for (const [fn, hangUp] of listeners) { hangUp(); listeners.set(fn, next.listen(fn)); fn(next.view()); }
    },
  };
}

const NONE: TerminalView = { connected: false, agent: "", session: null, title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", sessions: [] };
const NO_AGENT = "no agent is set up yet: choose a model for isorite's own agent in the pane's settings, or connect an outside agent over MCP (isorite setup)";

/** The pane's host where no model is chosen yet: nothing is connected, and what asks of an agent says how to have one. */
export class NoAgent implements PaneSessions {
  view(): TerminalView { return NONE; }
  listen(): () => void { return () => undefined; }
  asked(): string { return ""; }
  async prompt(): Promise<void> { throw new Error(NO_AGENT); }
  async interrupt(): Promise<void> { /* nothing runs */ }
  async give(): Promise<void> { /* nothing to give it to */ }
  async reply(): Promise<void> { throw new Error(NO_AGENT); }
  async follow(): Promise<void> { throw new Error(NO_AGENT); }
  async fresh(): Promise<void> { throw new Error(NO_AGENT); }
  async forget(): Promise<void> { throw new Error(NO_AGENT); }
  refresh(): void { /* nothing to list */ }
}
