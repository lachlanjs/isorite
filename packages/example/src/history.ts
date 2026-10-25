// The example's history: three weeks of a developer writing an N-body simulation, and a base of notes beside it,
// with Iso. It is made by driving the engine itself, over files in memory, with a clock set to each moment and a
// scripted Iso, so every journal, hash and event is the engine's own. Times are counted back from `now`, so the
// last session is always the one just ended.
//
// What it leaves: the physics understood or worked through, the integrators worked through or opened, the
// algorithms begun (Barnes–Hut has a TODO, the quadtree is a stub with a question in it), the simulation's goal
// written down. Today's session is five moments; Iso's answer on how big ε should be waits in the note on
// softening; a note for Iso about close encounters is written and not sent; the problem on the cost of direct
// summation has a solution with a slip in it.

import { blocks, GITATTRIBUTES, type Anchor, type Passage } from "@isorite/core";
import { Engine, MemoryFiles, MemorySecrets, KEY, type Clock, type EngineEvent, type Similar } from "@isorite/engine";
import { scriptedHttp, type Reply } from "./scripted.ts";
import { TUTORIAL_MEANING } from "./tutorial.ts";

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

const anchor = (text: string): Anchor => ({ text, nth: 0 });

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

/** What search by meaning finds for the questions the example's Iso asks it. */
const MEANING: Record<string, { note: string; heading: string; score: number }[]> = {
  "where the loop spends its time": [{ note: DIRECT, heading: "", score: 0.82 }, { note: COST, heading: "", score: 0.76 }],
};
export const similar: Similar = async (text) => ({
  ready: true,
  hits: (MEANING[text] ?? TUTORIAL_MEANING[text]?.map((h) => ({ ...h, heading: "" })) ?? []).map((h) => ({ note: h.note, heading: h.heading, body: "", score: h.score })),
});

// ------------------------------------------------------------ making it

export async function buildExample(sources: Sources, now = Date.now()): Promise<Built> {
  const final = (id: string): string => { const t = sources[`${id}.md`]; if (t === undefined) throw new Error(`no note ${id} in the example`); return t; };
  const notes = new MemoryFiles(), own = new MemoryFiles({ ".gitattributes": GITATTRIBUTES });
  let t = 0;
  const clock: Clock = { now: () => t++ };
  const replies: Reply[] = [];
  const http = scriptedHttp(() => { const r = replies.shift(); if (!r) throw new Error("Iso was asked more than the script says"); return r; });
  const engine = await Engine.open({ notes, own, clock, device: DEVICE, name: NAME, http, secrets: new MemorySecrets({ [KEY]: "example" }), similar });

  const done = new Map<string, Extract<EngineEvent, { type: "iso-done" | "iso-failed" }>>();
  const waiting = new Map<string, () => void>();
  engine.events((e) => {
    if (e.type !== "iso-done" && e.type !== "iso-failed") return;
    done.set(e.request, e);
    waiting.get(e.request)?.();
  });
  /** Ask Iso, with the replies it is to give, and wait for what it offers. */
  const iso = async (request: Parameters<Engine["ask"]>[0], ...said: Reply[]): Promise<Extract<EngineEvent, { type: "iso-done" }>> => {
    replies.push(...said);
    const { request: id } = await engine.ask(request);
    if (!done.has(id)) await new Promise<void>((r) => waiting.set(id, r));
    const e = done.get(id)!;
    if (e.type === "iso-failed") throw new Error(`Iso failed: ${e.message}`);
    return e;
  };
  const write = async (id: string, text: string) => {
    let version: string | null = null;
    try { version = (await engine.readNote(id)).version; } catch { /* a new note */ }
    return version === null ? engine.createNote(id, text) : engine.saveNote(id, { base: version, text });
  };
  /** Iso asked for new text after the block that begins `after` (or at the top), and its reply. */
  const insert = async (id: string, after: string | null, asked: string, reply: string, calls: Reply["calls"], usage: Reply["usage"]) => {
    const text = (await engine.readNote(id)).text, all = blocks(text);
    const k = after === null ? -1 : all.findIndex((b) => b.text.startsWith(after));
    if (after !== null && k < 0) throw new Error(`no block begins "${after}" in ${id}`);
    const said: Reply[] = calls?.length ? [{ calls, usage: { in: Math.round(usage!.in * 0.6), out: 40, usd: usage!.usd * 0.4 } }, { text: reply, usage }] : [{ text: reply, usage }];
    return iso({ note: id, form: "insert", after: k >= 0 ? anchor(all[k]!.text) : null, before: all[k + 1] ? anchor(all[k + 1]!.text) : null, asked, tier: "mid" }, ...said);
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
    const p = await insert(ENERGY, "$E = K + U$ is constant", "why is energy a good check on a run?", block(final(ENERGY), "A numerical integration"), [{ name: "read_note", arguments: { id: LAW } }], { in: 4800, out: 120, usd: 0.0094 });
    await engine.keep(ENERGY, p.proposal);
  });
  on(18, 10, async () => {
    const p = await insert(UNITS, "Converting back", "add the SI conversions", "With $M = 10^{11} M_\\odot$ and $L = 10$ kpc, the unit of time is about 47 million years and of speed about 207 km/s.", [], { in: 3900, out: 90, usd: 0.0071 });
    await engine.discard(UNITS, p.proposal);
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
  on(14, 7, async () => {
    const p = await insert(LEAP, "One force calculation", "why does its energy not drift, when Euler's does?", "It is second order, and time-reversible. Its energy error stays bounded.", [{ name: "read_note", arguments: { id: EULER } }, { name: "read_note", arguments: { id: ENERGY } }], { in: 6200, out: 160, usd: 0.0121 });
    await engine.revise(LEAP, p.proposal, `${block(final(LEAP), "## Why it does not drift")}\n\n${block(final(LEAP), "It is second order")}`);
    await engine.keep(LEAP, p.proposal);
  });
  // The loop moved to leapfrog in another editor, and found the next time it was opened.
  on(13, 0, async () => { await notes.write(`${LOOP}.md`, drop(final(LOOP), "Rests on")); await engine.readNote(LOOP); });
  // A note for Iso: asked from the Atlas, kept as a note.
  on(12, 0, async () => {
    const draft = await engine.createDraft();
    await engine.saveNote(draft.id, { base: draft.version, text: "---\ntype: Concept\ntitle: Symplectic integrators\n---\n\nWhat makes leapfrog keep its energy over thousands of orbits, when RK4, which is more accurate per step, does not? Rest it on [leapfrog](/integrators/leapfrog.md) and [energy](/physics/energy-conservation.md).\n" });
    const body = final(SYMP).replace(/^---\n[\s\S]*?\n---\n\n/, "").trimEnd();
    const p = await iso({ note: draft.id, form: "note", tier: "mid" },
      { calls: [{ name: "read_note", arguments: { id: LEAP } }, { name: "read_note", arguments: { id: ENERGY } }], usage: { in: 5400, out: 50, usd: 0.0060 } },
      { text: body, usage: { in: 8800, out: 380, usd: 0.0198 } });
    await engine.keepDraft(draft.id, p.proposal, I);
  });
  on(12, 8, () => write(SYMP, final(SYMP)));
  on(12, 20, () => write(DT, final(DT)));
  on(10, 0, () => write(SOFT, final(SOFT)));

  // ---- the algorithms, this last week
  on(7, 0, () => write(DIRECT, final(DIRECT)));
  const comPlain = "Far away, the group acts like one body.";
  on(7, 10, () => write(COM, final(COM).replace(block(final(COM), "Seen from a distance"), comPlain)));
  on(5, 20, async () => {
    const p = await iso({ note: COM, form: "rewrite", regions: [{ text: comPlain, nth: 0 } as Passage], after: null, before: null, asked: "say how far is far enough", tier: "mid" },
      { text: `⟦1⟧${block(final(COM), "Seen from a distance")}⟦/1⟧\n⟦note⟧I gave the condition and the size of the error.⟦/note⟧`, usage: { in: 6900, out: 210, usd: 0.0141 } });
    await engine.keep(COM, p.proposal);
    if (p.said) await engine.discard(COM, p.said);
  });
  on(5, 0, () => write(INIT, final(INIT)));
  on(4, 0, () => write(BH, drop(final(BH), "With $\\theta = 0$")));
  on(4, 15, () => write(COST, final(COST)));
  on(3, 0, () => write(GALAXY, drop(final(GALAXY), "At $N = 2000$")));
  // A note for Iso, written and not yet sent.
  on(1, 30, async () => {
    const draft = await engine.createDraft();
    await engine.saveNote(draft.id, { base: draft.version, text: "---\ntype: Concept\ntitle: Close encounters\n---\n\nIn the cluster run, two bodies pass very close and the energy jumps by a percent in one step. What is happening, and what can I do about it? Rest it on [softening](/physics/softening.md), [choosing the timestep](/integrators/choosing-the-timestep.md) and [energy](/physics/energy-conservation.md).\n" });
  });

  // ---- today's session: five moments, the last a few minutes ago
  on(0, -28, () => write(QUAD, final(QUAD)));
  on(0, -22, () => write(BH, final(BH)));
  on(0, -16, async () => {
    const p = await insert(LOOP, null, "link what this rests on", block(final(LOOP), "Rests on"),
      [{ name: "search_notes", arguments: { query: "leapfrog" } }, { name: "read_note", arguments: { id: LEAP } }, { name: "find_similar", arguments: { text: "where the loop spends its time" } }, { name: "outline_note", arguments: { id: DT } }],
      { in: 10400, out: 130, cached: 5800, usd: 0.0172 });
    await engine.keep(LOOP, p.proposal);
  });
  on(0, -10, () => write(GALAXY, final(GALAXY)));
  on(0, -4, () => insert(SOFT, "Beyond a few", "how big should ε be?", "A common choice is a few hundredths of the mean distance between neighbouring bodies: for $N$ bodies in a sphere of size 1, $\\varepsilon \\approx 0.05\\, N^{-1/3}$. Smaller, and close passes still jump; larger, and the galaxy's core is blurred.",
    [{ name: "read_note", arguments: { id: DT } }, { name: "read_note", arguments: { id: UNITS } }], { in: 8700, out: 150, cached: 6200, usd: 0.0139 }));

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
  if (replies.length) throw new Error(`${replies.length} scripted replies were never asked for`);
  return { notes: Object.fromEntries(notes.files), own: Object.fromEntries(own.files) };
}
