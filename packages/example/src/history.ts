// The example's history: three weeks of a developer writing an N-body simulation, and a base of notes beside it,
// with their own agent (M25: a scripted one, through isorite's MCP). It is made by driving the engine itself, over
// files in memory, with a clock set to each moment, so every journal, hash, event and kept session is the engine's
// own. Times are counted back from `now`, so the last session is always the one just ended.
//
// What it leaves: the physics understood or worked through, the integrators worked through or opened, the
// algorithms begun (Barnes–Hut has a TODO, the quadtree is a stub with a question in it), the simulation's goal
// written down. Today's session is four moments, and the agent's answer on how big ε should be, which is in its
// session, not the note; the problem on the cost of direct summation has a solution with a slip in it.

import { blocks, GITATTRIBUTES } from "@isorite/core";
import { Engine, MemoryFiles, type Clock, type Similar } from "@isorite/engine";
import { ScriptedAgent, insertAfter, type Call } from "./agent.ts";

export const NAME = "nbody-notes", DEVICE = "laptop1";
const DAY = 86_400_000, MIN = 60_000;

/** The notes as they stand today: `physics/softening.md` and so on. */
export type Sources = Record<string, string>;

/** Every file of the two bases, by path within each. */
export interface Built { notes: Record<string, string>; own: Record<string, string> }

// ------------------------------------------------------------ text

/** The block of a note that begins with `prefix`. */
export function block(text: string, prefix: string): string {
  const b = blocks(text).find((x) => x.text.startsWith(prefix));
  if (!b) throw new Error(`no block begins "${prefix}"`);
  return b.text;
}

/** The note without the block that begins with `prefix`. */
export function drop(text: string, prefix: string): string {
  const b = block(text, prefix);
  return text.replace(b + "\n\n", "").replace("\n\n" + b, "");
}

// ------------------------------------------------------------ problems

/** A day the solution was worked on, and the working as it was left that day. */
interface Attempt { day: number; working: string }

/** A problem note (type: Problem) in the base, beside the notes it uses: its statement, then its solution. */
interface Problem {
  folder: string;
  name: string;
  title: string;
  uses: string[];
  question: string;
  made: number;
  attempts: Attempt[];
  /** Marked solved, by you, on that day. */
  solved?: number;
  /** The working left in the file at the end. */
  unsent?: string;
}

const P = "physics", I = "integrators", A = "algorithms", S = "simulation";
const n = (folder: string, name: string) => `${folder}/${name}`;
export const LAW = n(P, "newtons-law-of-gravitation"), NBODY = n(P, "the-n-body-problem"), UNITS = n(P, "units"), ENERGY = n(P, "energy-conservation"), SOFT = n(P, "softening"),
  EULER = n(I, "eulers-method"), LEAP = n(I, "leapfrog"), SYMP = n(I, "symplectic-integrators"), DT = n(I, "choosing-the-timestep"),
  DIRECT = n(A, "direct-summation"), COM = n(A, "centre-of-mass"), QUAD = n(A, "the-quadtree"), BH = n(A, "barnes-hut"), COST = n(A, "cost-and-accuracy"),
  LOOP = n(S, "the-main-loop"), INIT = n(S, "initial-conditions"), DIAG = n(S, "diagnostics"), GALAXY = n(S, "two-galaxies-colliding");

const pull = "$F = G m_1 m_2 / d^2 = 1 \\cdot \\tfrac12 \\cdot \\tfrac12 / 1 = \\tfrac14$.\n\nEach accelerates at $a = F/m = \\tfrac14 / \\tfrac12$.\n\nSo each accelerates at $\\tfrac12$, towards the other.";
const energyWrong = "$K = \\tfrac12 \\cdot \\tfrac12 \\cdot (\\tfrac12)^2 = \\tfrac1{16}$.\n\n$U = -G m_1 m_2 / d = -\\tfrac14$.\n\nSo $E = \\tfrac1{16} - \\tfrac14 = -\\tfrac3{16}$.";
const energyRight = "$K = 2 \\times \\tfrac12 \\cdot \\tfrac12 \\cdot (\\tfrac12)^2 = \\tfrac18$, both bodies moving.\n\n$U = -G m_1 m_2 / d = -\\tfrac14$.\n\nSo $E = \\tfrac18 - \\tfrac14 = -\\tfrac18$.";
const spiralWrong = "After the step, $\\mathbf{r}' = \\mathbf{R} + \\mathbf{v}\\,\\Delta t$.\n\nSo $|\\mathbf{r}'| = R + v\\,\\Delta t$.";
const spiralRight = "After the step, $\\mathbf{r}' = \\mathbf{R} + \\mathbf{v}\\,\\Delta t$, with $\\mathbf{v}$ at right angles to $\\mathbf{R}$.\n\nSo $|\\mathbf{r}'|^2 = R^2 + v^2 \\Delta t^2$.\n\nSo $|\\mathbf{r}'| \\approx R\\,(1 + v^2 \\Delta t^2 / 2R^2)$: larger, every step, whatever the sign of $\\Delta t$.";
const kdkPartly = "Kick: $\\mathbf{v} \\mathrel{+}= \\Delta t\\, \\mathbf{a}$.\n\nDrift: $\\mathbf{r} \\mathrel{+}= \\Delta t\\, \\mathbf{v}$.\n\nKick: $\\mathbf{v} \\mathrel{+}= \\Delta t\\, \\mathbf{a}$, with the new $\\mathbf{a}$.";
const kdk = "Kick: $\\mathbf{v} \\mathrel{+}= \\tfrac12 \\Delta t\\, \\mathbf{a}$.\n\nDrift: $\\mathbf{r} \\mathrel{+}= \\Delta t\\, \\mathbf{v}$.\n\nKick: $\\mathbf{v} \\mathrel{+}= \\tfrac12 \\Delta t\\, \\mathbf{a}$, with the new $\\mathbf{a}$: two half kicks make one whole.";
const symplectic = "Leapfrog keeps a nearby energy $\\tilde H = H + O(\\Delta t^2)$ exactly.\n\nSo $H$ can only wobble around $\\tilde H$, never drift.\n\nRK4 keeps no such quantity, so its small errors add up.";
const com = "$M = 1 + 2 + 1 = 4$.\n\n$\\mathbf{R} = (1 \\cdot (0,0) + 2 \\cdot (3,0) + 1 \\cdot (0,4)) / 4 = (6, 4)/4$.\n\nSo $\\mathbf{R} = (1.5, 1)$, with $M = 4$.";
const step = "The drift falls as $\\Delta t^2$; at $T/100$ it is a few parts in a million.\n\nSo $\\Delta t = 2\\pi/100 \\approx 0.06$ is enough.\n\nCheck: record $E$ every 100 steps and plot the drift; halve $\\Delta t$ and it should fall by four.";
/** The working on the cost of direct summation as it is left: each pair counted twice. */
export const COST_WORKING = "Each body feels the other $N - 1$.\n\nSo there are $N(N-1)$ pairs: $2000 \\times 1999 \\approx 4 \\times 10^6$.\n\nAt 20 ns a pair, a step takes 0.08 s.";

export const PROBLEMS: Problem[] = [
  { folder: P, name: "the-pull-between-two-bodies", title: "The pull between two bodies", uses: [LAW, UNITS], made: 20,
    question: "In units with $G = 1$, two bodies of mass $\\tfrac12$ are 1 apart. How fast does each accelerate, and which way?",
    attempts: [20, 17, 12, 5, 2].map((day): Attempt => ({ day, working: pull })),
  },
  { folder: P, name: "the-energy-of-the-orbit", title: "The energy of the two-body orbit", uses: [ENERGY, LAW], made: 16,
    question: "For the two-body orbit of the notes (masses $\\tfrac12$, 1 apart, each moving at $\\tfrac12$), find $K$, $U$ and $E$.",
    attempts: [
      { day: 16, working: energyWrong },
      { day: 14, working: energyRight },
      { day: 9, working: energyRight },
      { day: 3, working: energyRight },
    ] },
  { folder: I, name: "why-eulers-orbit-spirals-out", title: "Why Euler's orbit spirals out", uses: [EULER, ENERGY], made: 15,
    question: "A body on a circular orbit of radius $R$ takes one Euler step. Show that its distance from the centre grows, and by how much, to leading order in $\\Delta t$.",
    attempts: [
      { day: 15, working: spiralWrong },
      { day: 13, working: spiralRight },
      { day: 6, working: spiralRight },
      { day: 3, working: spiralRight },
    ] },
  { folder: I, name: "one-leapfrog-step", title: "One leapfrog step", uses: [LEAP], made: 12,
    question: "Write one leapfrog step as kick, drift and kick, and say how many times the accelerations are computed.",
    attempts: [
      { day: 12, working: kdkPartly },
      { day: 8, working: kdk },
      { day: 3, working: kdk },
    ] },
  { folder: I, name: "why-leapfrog-does-not-drift", title: "Why leapfrog does not drift", uses: [SYMP, LEAP], made: 10,
    question: "RK4 is more accurate than leapfrog over one step. Why, then, does its energy drift over a long run while leapfrog's does not?",
    attempts: [
      { day: 10, working: symplectic },
      { day: 1, working: symplectic },
    ] },
  { folder: A, name: "the-centre-of-mass-of-a-node", title: "The centre of mass of a node", uses: [COM], made: 6,
    question: "A node holds bodies of mass 1 at $(0,0)$, 2 at $(3,0)$ and 1 at $(0,4)$. What is its total mass, and where is its centre of mass?",
    attempts: [6, 4, 2, 1].map((day): Attempt => ({ day, working: com })),
  },
  { folder: A, name: "the-cost-of-direct-summation", title: "The cost of direct summation", uses: [DIRECT], made: 1,
    question: "Using Newton's third law, how many pairs does direct summation compute each step for $N$ bodies? At 20 ns a pair, how long is a step at $N = 2000$?",
    attempts: [], unsent: COST_WORKING },
  { folder: S, name: "a-timestep-for-the-orbit", title: "A timestep for the orbit", uses: [DT, DIAG], made: 11,
    question: "For the two-body orbit (period $2\\pi$), choose $\\Delta t$ for leapfrog so that the energy drift stays below $10^{-5}$, and say how you would check it.",
    attempts: [11, 7].map((day): Attempt => ({ day, working: step })),
  },
];

// ------------------------------------------------------------ the scripted search by meaning

/** What search by meaning finds for what the example's agent asks it. */
const MEANING: Record<string, { note: string; heading: string; score: number }[]> = {
  "where the loop spends its time": [{ note: DIRECT, heading: "", score: 0.82 }, { note: COST, heading: "", score: 0.76 }],
};
export const similar: Similar = async (text) => ({
  ready: true,
  hits: (MEANING[text] ?? []).map((h) => ({ note: h.note, heading: h.heading, body: "", score: h.score })),
});

// ------------------------------------------------------------ making it

export async function buildExample(sources: Sources, now = Date.now()): Promise<Built> {
  const final = (id: string): string => { const t = sources[`${id}.md`]; if (t === undefined) throw new Error(`no note ${id} in the example`); return t; };
  const notes = new MemoryFiles(), own = new MemoryFiles({ ".gitattributes": GITATTRIBUTES });
  let t = 0;
  const clock: Clock = { now: () => t++ };
  const engine = await Engine.open({ notes, own, clock, device: DEVICE, name: NAME, similar });
  const agent = new ScriptedAgent(engine, clock.now);

  const write = async (id: string, text: string) => {
    let version: string | null = null;
    try { version = (await engine.readNote(id)).version; } catch { /* a new note */ }
    return version === null ? engine.createNote(id, text) : engine.saveNote(id, { base: version, text });
  };
  const read = (id: string): Call => ({ tool: "read_note", args: { id } });
  /** The agent asked to add to a note: it reads what it rests on, writes `text` after the block beginning `after`
   *  (or at the top), and says so. */
  const add = async (id: string, after: string | null, asked: string, text: string, reads: Call[], reply: string) => {
    const now = blocks((await engine.readNote(id)).text).map((b) => b.text);
    await agent.turn(asked, [...reads, insertAfter(id, now, after, text)], reply);
  };

  // Every moment, as [days ago, minutes into that day's session, what happens], done in time order.
  const ops: [number, number, () => Promise<unknown>][] = [];
  const on = (day: number, minute: number, act: () => Promise<unknown>) => ops.push([day, minute, act]);
  /** The note as it stood before the blocks from the one beginning `prefix` on were written. */
  const upTo = (text: string, prefix: string) => text.slice(0, text.indexOf(block(text, prefix))).trimEnd() + "\n";

  // ---- the physics, three weeks ago
  on(21, 0, () => write(LAW, final(LAW)));
  on(21, 8, () => write(NBODY, final(NBODY)));
  on(21, 4, () => write(UNITS, final(UNITS)));
  on(19, 0, () => write(ENERGY, drop(final(ENERGY), "A numerical integration")));
  on(19, 6, async () => {
    agent.begin("energy");
    await add(ENERGY, "$E = K + U$ is constant", "why is energy a good check on a run?", block(final(ENERGY), "A numerical integration"), [read(LAW)], `I added why to [energy conservation](/${ENERGY}.md): a numerical run conserves it only as well as its integrator does.`);
  });
  // The agent's SI conversions, undone: the note put back as it was.
  on(18, 10, async () => {
    agent.begin("units");
    await add(UNITS, "Converting back", "add the SI conversions", "With $M = 10^{11} M_\\odot$ and $L = 10$ kpc, the unit of time is about 47 million years and of speed about 207 km/s.", [], `Added to [units](/${UNITS}.md).`);
  });
  on(18, 14, async () => {
    const journal = await engine.journal(UNITS), before = journal.filter((e) => e.kind === "change").at(-2)!;
    await engine.restore(UNITS, before.id, (await engine.readNote(UNITS)).version);
  });

  // ---- the first program: Euler, and a two-body orbit
  const loopEuler = "---\ntype: Concept\ntitle: The main loop\ndescription: \"The program's heart: step, and now and then measure.\"\n---\n\n```python\nr, v, m = initial_conditions()\nfor step in range(steps):\n    a = accelerations(r, m)\n    r += dt * v\n    v += dt * a\n    if step % 100 == 0:\n        record(step * dt, energy(r, v, m))\n```\n\nAll the time is in `accelerations`.\n";
  on(17, 0, () => write(EULER, final(EULER)));
  on(17, 10, () => write(INIT, upTo(final(INIT), "**A Plummer sphere**")));
  on(17, 20, () => write(LOOP, loopEuler));
  on(16, 0, () => write(DIAG, final(DIAG)));
  // A list deleted by mistake, and the note restored to before it.
  on(15, 30, () => write(DIAG, drop(final(DIAG), "- **Energy drift**")));
  on(15, 32, async () => {
    const journal = await engine.journal(DIAG), before = journal.filter((e) => e.kind === "change").at(-2)!;
    await engine.restore(DIAG, before.id, (await engine.readNote(DIAG)).version);
  });

  // ---- leapfrog, two weeks ago
  on(14, 0, () => write(LEAP, drop(drop(final(LEAP), "## Why it does not drift"), "It is second order")));
  // The agent's answer, written into the note, then made yours: a heading of your own and its words reworked.
  on(14, 7, async () => {
    agent.begin("leapfrog");
    await add(LEAP, "One force calculation", "why does its energy not drift, when Euler's does?", "It is second order, and time-reversible. Its energy error stays bounded.", [read(EULER), read(ENERGY)], `In short: [leapfrog](/${LEAP}.md) is time-reversible, so its energy error stays bounded, where [Euler's](/${EULER}.md) grows every step.`);
  });
  on(14, 12, () => write(LEAP, final(LEAP)));
  // The loop moved to leapfrog in another editor, and found the next time it was opened.
  on(13, 0, async () => { await notes.write(`${LOOP}.md`, drop(final(LOOP), "Rests on")); await engine.readNote(LOOP); });
  // A note asked of the agent from the pane, with the notes it is to rest on given.
  on(12, 0, async () => {
    agent.begin("symplectic");
    await agent.turn("What makes leapfrog keep its energy over thousands of orbits, when RK4, which is more accurate per step, does not? Write it as a note.", [read(LEAP), read(ENERGY), { tool: "write_note", args: { note: SYMP, content: final(SYMP) } }],
      `I wrote [symplectic integrators](/${SYMP}.md), resting on [leapfrog](/${LEAP}.md) and [energy conservation](/${ENERGY}.md).`, [{ kind: "note", id: LEAP }, { kind: "note", id: ENERGY }]);
  });
  on(12, 20, () => write(DT, final(DT)));
  on(10, 0, () => write(SOFT, final(SOFT)));

  // ---- the algorithms, this last week
  on(7, 0, () => write(DIRECT, final(DIRECT)));
  const comPlain = "Far away, the group acts like one body.";
  on(7, 10, () => write(COM, final(COM).replace(block(final(COM), "Seen from a distance"), comPlain)));
  on(5, 20, async () => {
    agent.begin("centre-of-mass");
    await agent.turn("say how far is far enough", [read(COM), { tool: "edit_note", args: { note: COM, oldString: comPlain, newString: block(final(COM), "Seen from a distance") } }], `I gave the condition and the size of the error in [the centre of mass](/${COM}.md).`, [{ kind: "passage", id: COM, text: comPlain }]);
  });
  on(5, 0, () => write(INIT, final(INIT)));
  on(4, 0, () => write(BH, drop(final(BH), "With $\\theta = 0$")));
  on(4, 15, () => write(COST, final(COST)));
  on(3, 0, () => write(GALAXY, drop(final(GALAXY), "At $N = 2000$")));

  // ---- today's session: five moments, the last a few minutes ago
  on(0, -28, () => write(QUAD, final(QUAD)));
  on(0, -22, () => write(BH, final(BH)));
  on(0, -16, async () => {
    agent.begin("today");
    await add(LOOP, null, "link what this rests on", block(final(LOOP), "Rests on"),
      [{ tool: "search_notes", args: { query: "leapfrog" } }, read(LEAP), { tool: "find_similar", args: { text: "where the loop spends its time" } }, { tool: "outline_note", args: { id: DT } }],
      `[The main loop](/${LOOP}.md) now says what it rests on: [leapfrog](/${LEAP}.md) for the step, [direct summation](/${DIRECT}.md) for the forces, and [the timestep](/${DT}.md).`);
  });
  on(0, -10, () => write(GALAXY, final(GALAXY)));
  // Asked in the same session, and answered there: the note is left as it is.
  on(0, -4, () => agent.turn("how big should ε be?", [read(SOFT), read(DT), read(UNITS)],
    `A common choice is a few hundredths of the mean distance between neighbouring bodies: for $N$ bodies in a sphere of size 1, $\\varepsilon \\approx 0.05\\, N^{-1/3}$, as [softening](/${SOFT}.md) has it in other words. Smaller, and close passes still jump, as [choosing the timestep](/${DT}.md) warns; larger, and the galaxy's core is blurred.`));

  // ---- the problems: each made, then its solution worked on, day by day
  for (const x of PROBLEMS) {
    const id = `${x.folder}/${x.name}`, head = (working: string) => {
      const meta = [`type: Problem`, `title: ${JSON.stringify(x.title)}`, `uses: [${x.uses.join(", ")}]`];
      return `---\n${meta.join("\n")}\n---\n\n${x.question}\n${working ? `\n## Solution\n\n${working}\n` : ""}`;
    };
    on(x.made, -40, () => write(id, head("")));
    for (const a of x.attempts) on(a.day, -30, () => write(id, head(a.working)));
    if (x.unsent) on(1, -10, () => write(id, head(x.unsent!)));
  }

  // In time order: the day, then the minute within it. Days are counted back from now; a session's minutes from
  // two hours before now's time of day (today's are counted back from now itself).
  ops.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [day, minute, act] of ops) {
    t = day === 0 ? now + minute * MIN : now - day * DAY - 2 * 60 * MIN + minute * MIN;
    await act();
  }
  return { notes: Object.fromEntries(notes.files), own: Object.fromEntries(own.files) };
}
