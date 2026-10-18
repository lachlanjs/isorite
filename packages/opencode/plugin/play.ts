// The notes in play in a session: what the agent's look-ups found, what it reached along links from them, and how
// far each got (found and not opened, looked at, read, or used in an answer). Drawn as a tree, as `Terminal-Chat`
// draws the notes found, in the sidebar.

/** One step, as the isorite server publishes it (the engine's Step). */
export interface Step {
  tool: string;
  how: "keyword" | "meaning" | "link" | "read";
  notes: string[];
  opened?: string;
  from?: string;
  rel?: string;
  query?: string;
  scores?: Record<string, number>;
  failed?: boolean;
}

export type State = "not opened" | "looked at" | "read" | "used";
const RANK: Record<State, number> = { "not opened": 0, "looked at": 1, read: 2, used: 3 };

export interface InPlay {
  id: string;
  how: Step["how"];
  /** How it was found: the words searched for, or how alike in meaning. */
  query?: string;
  score?: number;
  /** For a note reached along a link: the note it was reached from, and what the link says. */
  from?: string;
  rel?: string;
  state: State;
}

export interface Row {
  /** The tree's lines before it: "├─ ", "│  └─ ". */
  prefix: string;
  id: string;
  /** What it is called, and how it came: `keyword "mixing"`, `meaning 0.81`, `requires ›`. */
  label: string;
  detail: string;
  state: State;
}

export class Play {
  private readonly notes = new Map<string, InPlay>();

  /** Takes in one of the agent's steps. */
  add(step: Step): void {
    if (step.failed) return;
    if (step.tool === "search_notes" || step.tool === "find_similar") {
      for (const id of step.notes) {
        if (this.notes.has(id)) continue;
        const score = step.scores?.[id];
        this.notes.set(id, { id, how: step.how, ...(step.query ? { query: step.query } : {}), ...(score === undefined ? {} : { score }), state: "not opened" });
      }
      return;
    }
    if (!step.opened) return;
    const known = this.notes.get(step.opened);
    const reached: InPlay = known ?? { id: step.opened, how: step.how, ...(step.from ? { from: step.from } : {}), ...(step.rel ? { rel: step.rel } : {}), state: "not opened" };
    this.notes.set(step.opened, { ...reached, state: this.higher(reached.state, step.tool === "outline_note" ? "looked at" : "read") });
  }

  /** The notes an answer cites are used. Whether any was not used before. */
  cite(ids: Iterable<string>): boolean {
    let changed = false;
    for (const id of ids) {
      const known = this.notes.get(id);
      if (known && known.state !== "used") { this.notes.set(id, { ...known, state: "used" }); changed = true; }
    }
    return changed;
  }

  get size(): number { return this.notes.size; }

  /** How many were found by searching, how many more by following links, how many used. */
  summary(): { found: number; followed: number; used: number } {
    const all = [...this.notes.values()];
    return { found: all.filter((n) => !n.from).length, followed: all.filter((n) => n.from).length, used: all.filter((n) => n.state === "used").length };
  }

  /** The tree, a row a note: those found at the top in the order found, each with what was reached from it beneath. */
  rows(title: (id: string) => string): Row[] {
    const all = [...this.notes.values()];
    const under = (parent: string | undefined) => all.filter((n) => (n.from && this.notes.has(n.from) ? n.from : undefined) === parent);
    const out: Row[] = [];
    const walk = (parent: string | undefined, lead: string) => {
      const kids = under(parent);
      kids.forEach((n, k) => {
        const last = k === kids.length - 1;
        const named = title(n.id).toLowerCase();
        out.push({
          prefix: lead + (last ? "└─ " : "├─ "), id: n.id, state: n.state,
          label: n.from ? `${n.rel ?? "links to"} › ${named}` : named,
          detail: n.from ? "" : n.how === "meaning" ? `meaning${n.score === undefined ? "" : ` ${n.score.toFixed(2)}`}` : n.how === "keyword" ? `keyword${n.query ? ` "${n.query}"` : ""}` : "",
        });
        walk(n.id, lead + (last ? "   " : "│  "));
      });
    };
    walk(undefined, "");
    return out;
  }

  private higher(a: State, b: State): State { return RANK[b] > RANK[a] ? b : a; }
}
