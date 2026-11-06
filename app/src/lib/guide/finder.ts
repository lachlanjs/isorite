// The finder on the guide's site (M16; an agent's session since M25): there is no server there, so no agent of yours
// can be attached, and the finder stands in for one, in the page. It answers through the engine as any agent works
// through isorite's MCP (finderTurn), and its session is drawn as any agent's is: the pane, the Atlas and the
// Context view see nothing different. Its session lasts as long as the page.

import { finderTurn } from "@isorite/guide";
import type { Api, Engine, EngineEvent, Given, TerminalItem, TerminalTurn, TerminalView } from "@isorite/engine";
import type { TerminalApi } from "../api.ts";

const NAME = "the guide's finder", SESSION = "finder";

/** The finder's session, with the pane's calls as a server answers them. `tell` hears each change of its view. */
export class FinderTerminal implements TerminalApi {
  readonly #engine: Engine;
  readonly #tell: (view: TerminalView) => void;
  #turns: TerminalTurn[] = [];
  #given: Given[] = [];
  #busy = false;
  #n = 0;

  constructor(engine: Engine, tell: (view: TerminalView) => void) { this.#engine = engine; this.#tell = tell; }

  #view(): TerminalView {
    return { connected: true, agent: NAME, agentId: "finder", session: SESSION, title: "", busy: this.#busy, turns: this.#turns, asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "",
      sessions: this.#turns.length ? [{ agent: "finder", name: NAME, session: SESSION, title: "", asked: this.#turns[0]!.asked, last: this.#turns.at(-1)!.at ?? "", turns: this.#turns.length, notes: 0, live: true, busy: this.#busy, kept: false, open: true }] : [] };
  }
  #changed(): void { this.#tell(this.#view()); }

  async view(): Promise<TerminalView> { return this.#view(); }

  async prompt(asked: string, given: Given[]): Promise<void> {
    if (this.#busy) throw new Error("the finder is answering: wait for it");
    const parts = [...this.#given, ...given.filter((g) => !this.#given.some((x) => x.kind === g.kind && x.id === g.id))];
    this.#given = [];
    const turn: TerminalTurn = { id: `turn-${++this.#n}`, asked, from: "here", items: [], state: "running", at: new Date().toISOString(), ...(parts.length ? { given: parts } : {}) };
    this.#turns = [...this.#turns, turn];
    this.#busy = true;
    this.#changed();
    // A moment to be seen at work.
    await new Promise((r) => setTimeout(r, 300));
    const { calls, reply } = await finderTurn(this.#engine, SESSION, asked, { first: this.#turns.length === 1, given: parts.flatMap((g) => (g.kind === "note" ? [g.id] : [])) });
    const items: TerminalItem[] = [...calls.map((c, k): TerminalItem => ({ kind: "tool", id: `${turn.id}:${k}`, name: c.tool, title: c.title, status: "done", output: "", ...(c.note ? { note: c.note } : {}) })), { kind: "text", text: reply }];
    this.#turns = this.#turns.map((t) => (t.id === turn.id ? { ...t, items, state: "done" } : t));
    this.#busy = false;
    this.#changed();
  }
  async steer(): Promise<void> { throw new Error("the finder answers at once: there is nothing to steer"); }
  async stop(): Promise<void> { /* it answers at once */ }
  async reply(): Promise<void> { throw new Error("the finder asks nothing"); }
  async take(): Promise<{ note: string }> { throw new Error("the finder offers nothing to keep"); }
  async give(given: Given[]): Promise<void> { this.#given = given; }
  async follow(): Promise<void> { /* its one session */ }
  async fresh(): Promise<void> { this.#turns = []; this.#given = []; this.#changed(); }
  async list(): Promise<void> { /* its one session */ }
  async forget(): Promise<void> { /* nothing is kept */ }
  async set(): Promise<void> { /* the finder has nothing to set */ }
  async project(): Promise<never> { throw new Error("there is no project here"); }
  async writeProject(): Promise<never> { throw new Error("there is no project here"); }
  async chosen(): Promise<never> { throw new Error("no agent is started here"); }
  async registry(): Promise<never> { throw new Error("no agent is started here"); }
  async detected(): Promise<never> { throw new Error("no agent is started here"); }
  async choose(): Promise<never> { throw new Error("no agent is started here"); }
}

/** The engine in the page, with the finder as its pane's agent: the engine's own calls, and its events with the
 *  finder's session told among them, as the server tells an agent's. */
export function withFinder(engine: Engine): Api & { terminal: TerminalApi } {
  const listeners = new Set<(e: EngineEvent) => void>();
  const terminal = new FinderTerminal(engine, (view) => { for (const l of listeners) l({ type: "terminal", terminal: view }); });
  const events = (listener: (e: EngineEvent) => void): (() => void) => {
    listeners.add(listener);
    const off = engine.events(listener);
    return () => { listeners.delete(listener); off(); };
  };
  return new Proxy(engine, {
    get(target, key) {
      if (key === "terminal") return terminal;
      if (key === "events") return events;
      const v = Reflect.get(target, key, target) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  }) as unknown as Api & { terminal: TerminalApi };
}
