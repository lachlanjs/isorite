// A scripted agent for the examples' histories (M25): what a person's own agent does in a base, made without a
// model. Each turn is asked, its tools called through the engine as isorite's MCP calls them (so every look is a
// step on the Atlas and every change is journalled under the agent's name, with what was asked), and the session
// kept as isorite keeps one it carried, so the pane's drawer lists it.

import type { AgentRecord, Engine, EngineEvent, Given, TerminalItem, TerminalTurn } from "@isorite/engine";

/** One of isorite's tools, called with its arguments. */
export interface Call { tool: string; args: Record<string, unknown> }

/** The notes a call names, as the pane draws them under its line. */
const NOTE_OF: Record<string, string> = { read_note: "id", outline_note: "id", edit_note: "note", write_note: "note" };

export class ScriptedAgent {
  readonly #engine: Engine;
  readonly #clock: () => number;
  readonly #items: Extract<TerminalItem, { kind: "question" | "offer" }>[] = [];
  #record: AgentRecord | null = null;
  #calls = 0;
  /** Its id, as its changes are signed (`agent:claude`), and its name, as it names itself. */
  readonly agent: string;
  readonly name: string;

  constructor(engine: Engine, clock: () => number, agent = "claude", name = "Claude") {
    this.#engine = engine;
    this.#clock = clock;
    this.agent = agent;
    this.name = name;
    engine.events((e: EngineEvent) => { if (e.type === "agent-item" && e.agent === agent) this.#items.push(e.item); });
  }

  /** A new session: the turns after this are kept in it. */
  begin(session: string): void { this.#record = null; this.#session = session; }
  #session = "";

  /** A turn: what was asked (and given, from the pane), the calls it made, and its reply. What it asked back or
   *  offered is returned, for the person to keep or not. */
  async turn(asked: string, calls: Call[], reply: string, given: Given[] = []): Promise<Extract<TerminalItem, { kind: "question" | "offer" }>[]> {
    const session = this.#session, at = new Date(this.#clock()).toISOString(), items: TerminalItem[] = [];
    await this.#engine.agentStatus(this.agent, session, true);
    for (const c of calls) {
      const before = this.#items.length;
      await this.#engine.agentLook({ agent: this.agent, session, tool: c.tool, args: c.args, asked });
      const put = this.#items.slice(before);
      if (put.length) { items.push(...put); continue; }
      const key = NOTE_OF[c.tool], note = key ? String(c.args[key]).replace(/^\/+|\.md$/g, "") : undefined;
      const title = String(c.args.query ?? c.args.text ?? c.args.path ?? note ?? "");
      items.push({ kind: "tool", id: `call-${++this.#calls}`, name: `mcp__isorite__${c.tool}`, title, status: "done", output: "", ...(note ? { note } : {}) });
    }
    items.push({ kind: "text", text: reply });
    await this.#engine.agentStatus(this.agent, session, false);
    const turn: TerminalTurn = { id: `turn-${this.#calls}-${at}`, asked, from: given.length ? "here" : "terminal", items, state: "done", at, ...(given.length ? { given } : {}) };
    const r = this.#record ?? { agent: this.agent, name: this.name, session, title: asked, at, last: at, turns: [] };
    this.#record = { ...r, last: new Date(this.#clock()).toISOString(), turns: [...r.turns, turn] };
    await this.#engine.keepAgentRecord(this.#record);
    return items.filter((i): i is Extract<TerminalItem, { kind: "question" | "offer" }> => i.kind === "question" || i.kind === "offer");
  }
}

/** An agent's edit_note that puts `text` after the block `after` of a note (or before its first, with none), as the
 *  passage beside it: the call an agent makes to add to a note. */
export function insertAfter(note: string, blocks: string[], after: string | null, text: string): Call {
  const k = after === null ? -1 : blocks.findIndex((b) => b.startsWith(after));
  if (after !== null && k < 0) throw new Error(`no block begins "${after}" in ${note}`);
  const next = blocks[k + 1];
  return next !== undefined
    ? { tool: "edit_note", args: { note, oldString: next, newString: `${text}\n\n${next}` } }
    : { tool: "edit_note", args: { note, oldString: blocks[k]!, newString: `${blocks[k]}\n\n${text}` } };
}
