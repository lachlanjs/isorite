// What the Iso pane asks of the agent sessions on a base (M35): the pane-facing half of `AcpFollower`, named so that
// something other than ACP can serve it. A host holds the sessions, says which is shown, and folds what happens in
// them into one `TerminalView`; the pages read that view and nothing else, so they do not know which host (which
// driver) is behind it. ACP's is `AcpFollower`, which also takes in what passes through `isorite acp`; that half
// (`connect`, `tap`) is the wrapper's, not the pane's, and stays out of this.

import type { AgentSession, Given, TerminalView } from "@isorite/engine";
import type { Embed } from "./acp.ts";

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
  give(parts: Given[], render: (parts: Given[]) => string, embed?: Embed): Promise<void>;
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
  /** Set a mode or option of the session shown. */
  set(kind: "mode" | "config", id: string, value: string): void;
  /** Remove what is kept of a session that is not live. */
  forget(agent: string, session: string): Promise<void>;
  /** Ask again for the sessions the drawer lists. */
  refresh(): void;
}

export type { AgentSession };
