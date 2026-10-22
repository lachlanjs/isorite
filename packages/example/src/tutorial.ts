// The tutorial's Iso: what it answers to each request the tutorial walks through, chosen by what the request is
// (a marking, an exercise, a rewrite, a note for Iso, new text) and by the words asked. Anything else is answered
// once, plainly, with what this Iso is.

import type { Reply, Request } from "./scripted.ts";

/** The prompts the tutorial fills in, word for word. */
export const PROMPTS = {
  /** In the quadtree, a stub with a question in it. */
  insert: "how is a body inserted, and what does each node keep?",
  /** Barnes–Hut's TODO, selected. */
  rewrite: "answer my TODO",
  /** The project: in the note on cost and accuracy. */
  speed: "how much faster is Barnes–Hut at N = 5000?",
  /** The project: a note for Iso, written from the Atlas. */
  octree: "How does the quadtree become an octree for 3D, and what changes in Barnes–Hut?",
  /** L2: the question written in a new note, Close encounters. */
  close: "What goes wrong when two bodies pass close?",
} as const;

export const UNSCRIPTED = "In this tutorial I answer only what it walks you through. With a provider key in your own isorite, I would answer this too.";

const text = (r: Request): string => r.messages.filter((m) => m.role === "user").map((m) => String(m.content)).join("\n\n");
const looked = (r: Request): boolean => r.messages.some((m) => m.role === "tool");
const asked = (r: Request): string => (text(r).split(/# What they ask(?: now)?[^\n]*\n\n/).at(-1) ?? "").trim().toLowerCase();

const INSERT = `To insert a body, start at the root and walk down: at each node, go into the one of its four squares that holds the body's position.

- **An empty leaf** takes the body, and is done.
- **A leaf with a body already** is split: both bodies go down into its new children, which may split again if they land in the same square.
- **An inner node** passes the body down to the child whose square holds it.

On the way down, every node passed adds the body to its total mass $M$ and to $M\\mathbf{R}$, so that each keeps its mass and centre of mass with no second pass. A node keeps its square (centre and side $s$), its mass, its centre of mass, and its four children or its one body.`;

const THETA = `With $\\theta = 0.5$ the force error is about a percent for most bodies, and several percent for a few near dense nodes; it falls quickly as $\\theta$ shrinks. The error of a node used whole is of order $(s/d)^2$, the [centre of mass](/algorithms/centre-of-mass.md "uses")'s quadrupole, and $s/d < \\theta$ bounds it.

The cost: a body opens nodes only near it. Around it, each level of the tree adds a ring of about the same number of nodes used whole, and there are $\\log_4 N$ levels, so each body visits $O(\\log N)$ nodes, and all of them $O(N \\log N)$.`;

const SPEED = `About ten times fewer interactions. Direct summation computes $N(N-1)/2 \\approx 1.25 \\times 10^7$ pairs at $N = 5000$. Barnes–Hut at $\\theta = 0.5$ uses some 200 nodes for each body, so about $10^6$ interactions in all.

Each of them costs more: the tree walk branches, and in plain Python it is slow enough to lose the whole factor. Measure it, as your note on [cost and accuracy](/algorithms/cost-and-accuracy.md) says, before counting on it.`;

const OCTREE = `An octree is the same tree with eight children instead of four: each cube is split in half along each of the three axes.

What changes:
- **Insertion** picks one of eight children, by the sign of the body's position against the cube's centre on each axis: three comparisons, one bit each.
- **The opening rule** is the same, $s/d < \\theta$, with $s$ the cube's side.
- **The cost** is still $O(N \\log N)$; the log is now base 8, but each opened node has twice as many children, so the work per body is about the same.

Nothing in the [main loop](/simulation/the-main-loop.md) changes: only \`accelerations\`.`;

const CLOSE = `When two bodies pass within a small fraction of their usual distance, their acceleration grows as $1/r^2$, and a step of fixed length overshoots: the energy jumps.

Three ways out:
- **Soften the force.** With $\\varepsilon$ a little larger than the closest passes you care about, the force stays finite. Right for a galaxy, whose bodies stand for many stars.
- **A shorter step**, for everyone. Simple, and leapfrog stays symplectic, but every body pays for the one close pair.
- **Steps that differ by body** (block timesteps). Efficient, but only a careful scheme keeps the energy from drifting.

For two galaxies colliding, the first is the usual answer.`;

/** The answer to one request to the tutorial's Iso. */
/** In a turn in Iso's pane (M10): which mode, from what it was told. */
const modeOf = (r: Request): "ask" | "write" | "understand" | null => {
  const system = JSON.stringify(r.messages.find((m) => m.role === "system")?.content ?? "");
  return system.includes("# Write mode") ? "write" : system.includes("# Understand mode") ? "understand" : system.includes("# Ask mode") ? "ask" : null;
};
const tools = (r: Request): number => r.messages.filter((m) => m.role === "tool").length;

const TODO = "TODO: how big an error does θ = 0.5 give, and why does the cost grow only as N log N?";

/** Iso's pane (M10): Ask, Write and Understand mode, on the questions the tutorial walks through. */
function turnAnswer(r: Request, mode: "ask" | "write" | "understand"): Reply | null {
  const q = asked(r), n = tools(r);
  if (mode === "ask" && q.includes("inserted")) {
    if (n === 0) return { calls: [{ name: "search_notes", arguments: { query: "quadtree" } }, { name: "read_note", arguments: { id: "algorithms/centre-of-mass" } }], usage: { in: 5100, out: 50, usd: 0.0059 } };
    if (n === 2) return { calls: [{ name: "point_to_note", arguments: { id: "algorithms/centre-of-mass", why: "It is what each node keeps as bodies pass down." } }], usage: { in: 7800, out: 40, usd: 0.0061 } };
    return { text: INSERT, usage: { in: 8400, out: 310, cached: 4800, usd: 0.0163 } };
  }
  if (mode === "write" && q.includes("todo")) {
    if (n === 0) return { calls: [{ name: "read_note", arguments: { id: "algorithms/barnes-hut" } }, { name: "read_note", arguments: { id: "algorithms/the-quadtree" } }], usage: { in: 5600, out: 60, usd: 0.0061 } };
    if (n === 2) return { calls: [{ name: "edit_note", arguments: { id: "algorithms/barnes-hut", old: TODO, new: THETA } }], usage: { in: 8900, out: 290, cached: 5100, usd: 0.0154 } };
    return { text: "I answered both questions in your TODO, from the quadtree's depth and the centre of mass, and took the TODO away.", usage: { in: 9400, out: 40, cached: 8800, usd: 0.0041 } };
  }
  if (mode === "understand" && /backwards|retrace|reverse/.test(q)) {
    if (n === 0) return { calls: [{ name: "record_understanding", arguments: { id: "integrators/leapfrog", by: 0.5, why: "You saw that running it backwards retraces it, and that this is why its error cannot pile up." } }, { name: "write_understanding", arguments: { id: "integrators/leapfrog", reading: "You can say why leapfrog's energy error stays bounded: it is time-reversible, so it cannot drift one way. Not yet shown: what being symplectic adds to that." } }], usage: { in: 6200, out: 120, usd: 0.0068 } };
    return { text: "Yes: run backwards it retraces its steps, so an error it made going forward is undone coming back, and it cannot keep growing one way. That is reversibility. Being [symplectic](/integrators/symplectic-integrators.md) is the stronger reason, and the next thing to look at.", usage: { in: 7100, out: 90, cached: 5600, usd: 0.0049 } };
  }
  if (mode === "understand" && /leapfrog|bounded|drift/.test(q)) {
    if (n === 0) return { calls: [{ name: "read_note", arguments: { id: "integrators/leapfrog", section: "Why it does not drift" } }], usage: { in: 5200, out: 40, usd: 0.0056 } };
    return { text: "Before I say why: what happens if you run leapfrog with $-\\Delta t$, from where it ended?", usage: { in: 6900, out: 30, cached: 4800, usd: 0.0044 } };
  }
  return null;
}

export function tutorialAnswer(r: Request): Reply {
  const mode = modeOf(r);
  if (mode) return turnAnswer(r, mode) ?? { text: UNSCRIPTED, usage: { in: 4000, out: 40, usd: 0.0049 } };
  const all = text(r);
  // A marking: the cost of direct summation is right once the pairs are halved.
  if (all.includes("⟦answer⟧")) {
    const answer = /⟦answer⟧([\s\S]*?)⟦\/answer⟧/.exec(all)?.[1] ?? "";
    const right = /\/\s*2|\\tfrac\s*?\{?N|2\s*\\times\s*10\^\{?6|0\.04/.test(answer);
    const tests = [...all.matchAll(/\(id: ([^;)]+)[;)]/g)].map((m) => m[1]!.trim());
    const marks = right
      ? [{ quote: answer, mark: "right" }]
      : [{ quote: "Each body feels the other $N - 1$.", mark: "right" }, { quote: "So there are $N(N-1)$ pairs: $2000 \\times 1999 \\approx 4 \\times 10^6$.", mark: "wrong" }, { quote: answer, mark: "wrong" }];
    const why = right ? "Each pair once, by the third law, unaided." : "Each pair is counted twice: the third law halves it.";
    return {
      text: JSON.stringify({ result: right ? "right" : "wrong", marks, moves: Object.fromEntries(tests.map((t) => [t, { by: right ? 1 : 0, why }])) }),
      usage: { in: 2210, out: 980, cached: 900, usd: 0.0139 },
    };
  }
  // An exercise asked for: one on the note asked from, in two lines.
  if (all.includes("# What it is to test")) {
    const title = /## (.+?) \(/.exec(all.split("# What it is to test")[1] ?? "")?.[1] ?? "this note";
    return { text: `# What ${title.toLowerCase()} is for\n\nIn two or three lines, say what ${title.toLowerCase()} is for in the simulation, and name the step of the main loop where it is used.`, usage: { in: 1240, out: 110, usd: 0.0037 } };
  }
  // A rewrite: Barnes–Hut's TODO answered.
  if (/⟦1⟧/.test(all)) {
    if (asked(r).includes("todo")) return { text: `⟦1⟧${THETA}⟦/1⟧\n⟦note⟧I answered both questions in your TODO, and took the TODO away.⟦/note⟧`, usage: { in: 7900, out: 290, cached: 5100, usd: 0.0154 } };
    return { text: `⟦note⟧${UNSCRIPTED}⟦/note⟧`, usage: { in: 6000, out: 40, usd: 0.0062 } };
  }
  // A note for Iso: close encounters, waiting from yesterday; or the octree, written in the tutorial.
  if (all.includes("# What they wrote for you")) {
    const close = /close (pass|encounter)/i.test(all), octree = /octree|3d|three dimensions/i.test(all);
    if (!close && !octree) return { text: UNSCRIPTED, usage: { in: 4000, out: 40, usd: 0.0049 } };
    if (!looked(r)) return close
      ? { calls: [{ name: "read_note", arguments: { id: "physics/softening" } }, { name: "read_note", arguments: { id: "integrators/choosing-the-timestep" } }, { name: "find_similar", arguments: { text: "an energy jump when two bodies pass close" } }], usage: { in: 4900, out: 60, usd: 0.0056 } }
      : { calls: [{ name: "read_note", arguments: { id: "algorithms/the-quadtree" } }, { name: "read_note", arguments: { id: "algorithms/barnes-hut" } }, { name: "search_notes", arguments: { query: "octree" } }], usage: { in: 5200, out: 60, usd: 0.0058 } };
    return close ? { text: CLOSE, usage: { in: 9600, out: 360, cached: 4100, usd: 0.0191 } } : { text: OCTREE, usage: { in: 9900, out: 340, cached: 4400, usd: 0.0188 } };
  }
  // New text in a note: the quadtree's question, or the project's.
  const q = asked(r);
  if (q.includes("inserted")) {
    if (!looked(r)) return { calls: [{ name: "search_notes", arguments: { query: "quadtree" } }, { name: "read_note", arguments: { id: "algorithms/centre-of-mass" } }], usage: { in: 5100, out: 50, usd: 0.0059 } };
    return { text: INSERT, usage: { in: 8400, out: 310, cached: 4800, usd: 0.0163 } };
  }
  // E1: the octree, asked in a new note of its own.
  if (q.includes("octree") && q.includes("barnes")) {
    if (!looked(r)) return { calls: [{ name: "read_note", arguments: { id: "algorithms/the-quadtree" } }, { name: "read_note", arguments: { id: "algorithms/barnes-hut" } }, { name: "search_notes", arguments: { query: "octree" } }], usage: { in: 5200, out: 60, usd: 0.0058 } };
    return { text: OCTREE, usage: { in: 9900, out: 340, cached: 4400, usd: 0.0188 } };
  }
  // L2: a question written in a new note of its own, and asked there.
  if (/pass(es)? close|close (pass|encounter)/.test(q)) {
    if (!looked(r)) return { calls: [{ name: "read_note", arguments: { id: "physics/softening" } }, { name: "read_note", arguments: { id: "integrators/choosing-the-timestep" } }, { name: "find_similar", arguments: { text: "an energy jump when two bodies pass close" } }], usage: { in: 4900, out: 60, usd: 0.0056 } };
    return { text: CLOSE, usage: { in: 9600, out: 360, cached: 4100, usd: 0.0191 } };
  }
  // Asked in place in the terminal's note view.
  if (/\b3d\b|three dimensions/.test(q)) return { text: "In 3D the same tree has eight children a node: an octree.", usage: { in: 4200, out: 30, usd: 0.0051 } };
  if (q.includes("faster")) {
    if (!looked(r)) return { calls: [{ name: "read_note", arguments: { id: "algorithms/direct-summation" } }, { name: "read_note", arguments: { id: "algorithms/barnes-hut" } }], usage: { in: 5300, out: 50, usd: 0.0060 } };
    return { text: SPEED, usage: { in: 8800, out: 260, cached: 5000, usd: 0.0158 } };
  }
  return { text: UNSCRIPTED, usage: { in: 4000, out: 40, usd: 0.0049 } };
}

/** What search by meaning finds for the questions the tutorial's Iso asks it. */
export const TUTORIAL_MEANING: Record<string, { note: string; score: number }[]> = {
  "an energy jump when two bodies pass close": [{ note: "physics/energy-conservation", score: 0.79 }, { note: "simulation/diagnostics", score: 0.75 }],
};
