// The example's history: six weeks of a person building a base on dynamical mean-field theory, with Iso. It is
// made by driving the engine itself, over files in memory, with a clock set to each moment and a scripted Iso, so
// every journal, hash and event is the engine's own. Times are counted back from `now`, so the last session is
// always the one just ended.
//
// What it leaves (the boards' Atlas): the many-body basics understood, the lattice models and impurity problems
// worked through or opened, DMFT itself begun. Today's session is the board's five moments; Iso's Bethe lattice
// form waits in the self-consistency condition; a note for Iso is written and not sent; the Bethe lattice exercise
// has working and no marking yet.

import { blocks, dumpStudyConfig, CONFIG_FILE, GITATTRIBUTES, type Anchor, type Passage } from "@isorite/core";
import { Engine, MemoryFiles, MemorySecrets, KEY, type Clock, type EngineEvent, type Similar } from "@isorite/engine";
import { scriptedHttp, type Reply } from "./scripted.ts";
import { TUTORIAL_MEANING } from "./tutorial.ts";

export const NAME = "dmft-notes", DEVICE = "laptop1";
const DAY = 86_400_000, MIN = 60_000;

/** The notes as they stand today: `dmft/weiss-field.md` and so on. */
export type Sources = Record<string, string>;

/** Every file of the two bases, by path within each. */
export interface Built { notes: Record<string, string>; study: Record<string, string> }

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

// ------------------------------------------------------------ exercises

interface Attempt {
  day: number;
  /** The working as sent; the last one given stays in the file. */
  working: string;
  answer: string;
  result: "right" | "partly" | "wrong";
  /** Passages of the working Iso marks, by their first words, as right or wrong. */
  marks: [string, "right" | "wrong"][];
  moves: Record<string, [number, string]>;
}

interface Exercise {
  folder: string;
  name: string;
  title: string;
  tests: string[];
  question: string;
  /** Asked of Iso (on that day, after that exercise) rather than written by you. */
  byIso?: { day: number; after: string | null; usage: Reply["usage"] };
  made: number;
  next?: string;
  attempts: Attempt[];
  /** The working left in the file without being sent. */
  unsent?: string;
}

const B = "many-body-basics", L = "lattice-models", I = "impurity-problems", D = "dmft";
const n = (folder: string, name: string) => `${folder}/${name}`;
const SQ = n(B, "second-quantisation"), GF = n(B, "greens-function"), MATS = n(B, "matsubara-frequencies"), SE = n(B, "self-energy"),
  DYSON = n(B, "dyson-equation"), SPEC = n(B, "spectral-function"), QP = n(B, "quasiparticle-weight"),
  TB = n(L, "tight-binding"), DOS = n(L, "density-of-states"), HUB = n(L, "hubbard-model"), MOTT = n(L, "mott-transition"),
  AIM = n(I, "anderson-impurity-model"), HYB = n(I, "hybridisation-function"), SOLVER = n(I, "impurity-solver"),
  INF = n(D, "infinite-dimensions"), LSE = n(D, "local-self-energy"), CAVITY = n(D, "cavity-construction"), MAP = n(D, "lattice-to-impurity-map"),
  WEISS = n(D, "weiss-field"), SC = n(D, "self-consistency-condition"), LOOP = n(D, "the-dmft-loop");

const exact = "Exact, and unaided.";
const pauli = "$\\{c^\\dagger_\\sigma, c^\\dagger_\\sigma\\} = 2 (c^\\dagger_\\sigma)^2 = 0$.\n\n$n^2 = c^\\dagger c\\, c^\\dagger c = c^\\dagger (1 - c^\\dagger c)\\, c = c^\\dagger c = n$, using the first result.\n\nSo $n^2 = n$, and $n$ is 0 or 1.";
const level = (last: string) => `$c(\\tau) = e^{-\\varepsilon\\tau} c$, since $[H, c] = -\\varepsilon c$.\n\n$G(\\tau) = -\\langle c(\\tau)\\, c^\\dagger \\rangle = -e^{-\\varepsilon\\tau} (1 - n_F(\\varepsilon))$ for $0 < \\tau < \\beta$.\n\n${last}`;
const sigma = "Dyson: $\\Sigma = G_0^{-1} - G^{-1}$.\n\n$= (i\\omega_n - \\varepsilon) - (i\\omega_n - \\varepsilon - a/i\\omega_n)$.\n\nSo $\\Sigma(i\\omega_n) = a / i\\omega_n$.";
const zWrong = "$\\partial_\\omega \\operatorname{Re}\\Sigma = -\\alpha$.\n\nSo $Z = 1 - \\alpha$.";
const zRight = "$\\partial_\\omega \\operatorname{Re}\\Sigma = -\\alpha$.\n\n$Z = (1 - (-\\alpha))^{-1}$.\n\nSo $Z = 1/(1+\\alpha)$ and $m^*/m = 1 + \\alpha$.";
const band = "Each cosine runs from $-1$ to $1$, so $\\varepsilon_k$ runs from $-4t$ to $4t$.\n\nThe bandwidth is $W = 8t$.\n\nThe density of states diverges logarithmically at $\\varepsilon = 0$: the van Hove singularity, from the saddle points at $(\\pi, 0)$ and $(0, \\pi)$.";
const atomWrong = "One electron per site. Moving one makes a doubly occupied site and an empty one.\n\nThe cost is $U/2$.";
const atomRight = "One electron per site. Moving one makes a doubly occupied site and an empty one.\n\nThe cost is $U$: the doubly occupied site costs $U$, the empty one nothing.\n\nSo for $U \\gg W$ there is a charge gap of about $U - W$: an insulator.";
const isolatedPartly = "With no bath the site is an atom. Its poles are at $\\pm U/2$.\n\nSo $G(i\\omega_n) = 1/(i\\omega_n - U/2)$.";
const isolatedRight = "With no bath the site is an atom. Its poles are at $\\pm U/2$, each with weight $1/2$ at half filling.\n\nSo $G(i\\omega_n) = \\frac{1/2}{i\\omega_n - U/2} + \\frac{1/2}{i\\omega_n + U/2}$.";
const oneLevel = "$\\Delta(i\\omega_n) = \\dfrac{V^2}{i\\omega_n - \\epsilon_1}$.\n\nAs $\\epsilon_1 \\to \\infty$, $\\Delta \\to 0$: the bath decouples and the site is an atom.";
const zWalkPartly = "The kinetic energy per site is a sum over $z$ neighbours.\n\nWith $t \\sim 1/z$ it stays finite.";
const zWalk = "The kinetic energy per site is a sum over $z$ neighbours.\n\nThe band's width grows as $\\sqrt{z}\\, t$: the hopping amplitudes add like the steps of a random walk.\n\nWith $t \\sim 1/\\sqrt{z}$ the bandwidth stays finite; with $t \\sim 1/z$ the electrons would stop moving.";
const local = "No: $Z$ comes from $\\partial_\\omega \\Sigma$, which is the same at every $k$.\n\nThe impurity is one site, so it can only give a $\\Sigma$ that depends on frequency alone.";

export const EXERCISES: Exercise[] = [
  { folder: B, name: "pauli-from-the-anticommutators", title: "Pauli exclusion from the anticommutators", tests: [SQ], made: 41, next: "one-level",
    question: "Using only the anticommutation relations, show that $(c^\\dagger_\\sigma)^2 = 0$ and that $n_\\sigma = c^\\dagger_\\sigma c_\\sigma$ can only be 0 or 1.",
    attempts: [
      { day: 40, working: pauli, answer: "So $n^2 = n$, and $n$ is 0 or 1.", result: "right", marks: [["$\\{c", "right"], ["$n^2 = c", "right"], ["So $n^2", "right"]], moves: { [SQ]: [1, exact] } },
      { day: 29, working: pauli, answer: "So $n^2 = n$, and $n$ is 0 or 1.", result: "right", marks: [["So $n^2", "right"]], moves: { [SQ]: [1, "Exact again, three weeks on."] } },
      { day: 18, working: pauli, answer: "So $n^2 = n$, and $n$ is 0 or 1.", result: "right", marks: [["So $n^2", "right"]], moves: { [SQ]: [1, exact] } },
    ] },
  { folder: B, name: "one-level", title: "The Green's function of one level", tests: [GF, MATS, SQ], made: 38, next: "sigma-from-g",
    question: "A single level, $H = \\varepsilon\\, c^\\dagger c$, at temperature $T$. Find $G(i\\omega_n)$.",
    attempts: [
      { day: 38, working: level("So $G(i\\omega_n) = 1/(i\\omega_n + \\varepsilon)$."), answer: "So $G(i\\omega_n) = 1/(i\\omega_n + \\varepsilon)$.", result: "partly", marks: [["$c(\\tau)", "right"], ["$G(\\tau)", "right"], ["So $G", "wrong"]], moves: { [GF]: [0.5, "The time dependence is right; the sign of ε is lost in the transform."], [MATS]: [0.5, "Uses the antiperiodic interval correctly, but the transform goes wrong."], [SQ]: [0, "Bears on it only in passing."] } },
      { day: 37, working: level("So $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$."), answer: "So $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$.", result: "right", marks: [["So $G", "right"]], moves: { [GF]: [1, exact], [MATS]: [1, "The transform over the fermionic frequencies done right."], [SQ]: [1, "The commutator with H is used correctly."] } },
      { day: 28, working: level("So $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$."), answer: "So $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$.", result: "right", marks: [["So $G", "right"]], moves: { [GF]: [1, exact], [MATS]: [1, exact], [SQ]: [1, exact] } },
      { day: 21, working: level("So $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$."), answer: "So $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$.", result: "right", marks: [["So $G", "right"]], moves: { [GF]: [1, exact], [MATS]: [1, exact], [SQ]: [1, exact] } },
    ] },
  { folder: B, name: "sigma-from-g", title: "The self-energy from G", tests: [SE, DYSON, GF], made: 35, next: "z-for-a-linear-self-energy",
    question: "Given $G_0(i\\omega_n) = 1/(i\\omega_n - \\varepsilon)$ and an interacting $G(i\\omega_n) = 1/(i\\omega_n - \\varepsilon - a/i\\omega_n)$, find $\\Sigma(i\\omega_n)$.",
    attempts: [35, 33, 25, 17, 10].map((day, k): Attempt => ({ day, working: sigma, answer: "So $\\Sigma(i\\omega_n) = a / i\\omega_n$.", result: "right", marks: [["Dyson", "right"], ["So $\\Sigma", "right"]],
      moves: { [SE]: [1, exact], [DYSON]: [1, k ? exact : "Inverted the right way round, unaided."], [GF]: [k === 4 ? 0.5 : 1, "Reads the pole structure off G."] } })),
  },
  { folder: B, name: "z-for-a-linear-self-energy", title: "Z for a linear self-energy", tests: [QP, SPEC, SE], made: 31,
    question: "Near the Fermi level $\\operatorname{Re}\\Sigma(\\omega) \\approx -\\alpha\\,\\omega$, with $\\alpha > 0$. What are $Z$ and $m^*/m$?",
    attempts: [
      { day: 31, working: zWrong, answer: "So $Z = 1 - \\alpha$.", result: "wrong", marks: [["$\\partial", "right"], ["So $Z", "wrong"]], moves: { [QP]: [0, "The derivative is right; Z is its first-order expansion, not Z."], [SPEC]: [0, "Not reached."], [SE]: [-0.5, "Treats the derivative of Σ as if it were Z."] } },
      { day: 30, working: zRight, answer: "So $Z = 1/(1+\\alpha)$ and $m^*/m = 1 + \\alpha$.", result: "right", marks: [["$Z = (1", "right"], ["So $Z", "right"]], moves: { [QP]: [1, exact], [SPEC]: [1, "Knows what the peak's weight is."], [SE]: [0.5, "Corrected after the last marking."] } },
      { day: 20, working: zRight, answer: "So $Z = 1/(1+\\alpha)$ and $m^*/m = 1 + \\alpha$.", result: "right", marks: [["So $Z", "right"]], moves: { [QP]: [1, exact], [SPEC]: [1, exact], [SE]: [0, "Nothing new about Σ here."] } },
      { day: 8, working: zRight, answer: "So $Z = 1/(1+\\alpha)$ and $m^*/m = 1 + \\alpha$.", result: "right", marks: [["So $Z", "right"]], moves: { [QP]: [1, exact], [SPEC]: [1, exact], [SE]: [0, "Nothing new about Σ here."] } },
    ] },
  { folder: L, name: "bandwidth-of-the-square-lattice", title: "The bandwidth of the square lattice", tests: [TB, DOS], made: 26, next: "the-atomic-limit",
    question: "For $\\varepsilon_k = -2t(\\cos k_x + \\cos k_y)$, find the bandwidth, and say where the density of states diverges.",
    attempts: [26, 23, 19, 12, 6, 3].map((day, k): Attempt => ({ day, working: band, answer: "The bandwidth is $W = 8t$.", result: "right", marks: [["Each cosine", "right"], ["The bandwidth", "right"], ["The density", "right"]],
      moves: { [TB]: [1, exact], [DOS]: [k === 4 ? 0.5 : k === 5 ? 0 : 1, k === 5 ? "Nothing new about the density of states." : "Places the van Hove singularity."] } })),
  },
  { folder: L, name: "the-atomic-limit", title: "The atomic limit at half filling", tests: [HUB, MOTT], made: 15,
    question: "Set $t = 0$ in the Hubbard model at half filling. What does it cost to move one electron to a neighbouring site, and what does that say about $U \\gg W$?",
    attempts: [
      { day: 15, working: atomWrong, answer: "The cost is $U/2$.", result: "partly", marks: [["One electron", "right"], ["The cost", "wrong"]], moves: { [HUB]: [0.5, "The picture is right; the energy is counted once too few."], [MOTT]: [0.5, "On the way to the gap."] } },
      { day: 11, working: atomRight, answer: "So for $U \\gg W$ there is a charge gap of about $U - W$: an insulator.", result: "right", marks: [["The cost", "right"], ["So for", "right"]], moves: { [HUB]: [1, exact], [MOTT]: [1, "The gap, and why it is of order U − W."] } },
      { day: 9, working: atomRight, answer: "So for $U \\gg W$ there is a charge gap of about $U - W$: an insulator.", result: "right", marks: [["So for", "right"]], moves: { [HUB]: [1, exact], [MOTT]: [0, "Says nothing yet of the metal's side."] } },
      { day: 4, working: atomRight, answer: "So for $U \\gg W$ there is a charge gap of about $U - W$: an insulator.", result: "right", marks: [["So for", "right"]], moves: { [HUB]: [1, exact], [MOTT]: [0.5, "Still only the insulating side."] } },
    ] },
  { folder: I, name: "the-isolated-impurity", title: "The isolated impurity", tests: [AIM, GF], made: 14,
    question: "Set $V_k = 0$ in the Anderson model. Find the impurity's Green's function at half filling, $\\varepsilon_d = -U/2$.",
    attempts: [
      { day: 14, working: isolatedPartly, answer: "So $G(i\\omega_n) = 1/(i\\omega_n - U/2)$.", result: "partly", marks: [["With no bath", "right"], ["So $G", "wrong"]], moves: { [AIM]: [0.5, "Both poles found, but only one kept."], [GF]: [0, "Bears on it only in passing."] } },
      { day: 11, working: isolatedRight, answer: "So $G(i\\omega_n) = \\frac{1/2}{i\\omega_n - U/2} + \\frac{1/2}{i\\omega_n + U/2}$.", result: "right", marks: [["With no bath", "right"], ["So $G", "right"]], moves: { [AIM]: [1, exact], [GF]: [1, "Weights of the poles read correctly."] } },
      { day: 5, working: isolatedRight, answer: "So $G(i\\omega_n) = \\frac{1/2}{i\\omega_n - U/2} + \\frac{1/2}{i\\omega_n + U/2}$.", result: "right", marks: [["So $G", "right"]], moves: { [AIM]: [1, exact], [GF]: [0.5, exact] } },
    ] },
  { folder: I, name: "one-bath-level", title: "One bath level", tests: [HYB, AIM, MATS], made: 13, byIso: { day: 13, after: "the-isolated-impurity", usage: { in: 1240, out: 160, usd: 0.0041 } },
    question: "Take a bath of one level at energy $\\epsilon_1$, with hybridisation $V$. Write $\\Delta(i\\omega_n)$, and say what happens to it as $\\epsilon_1 \\to \\infty$.",
    attempts: [
      { day: 13, working: oneLevel, answer: "As $\\epsilon_1 \\to \\infty$, $\\Delta \\to 0$: the bath decouples and the site is an atom.", result: "right", marks: [["$\\Delta", "right"], ["As $", "right"]], moves: { [HYB]: [1, exact], [AIM]: [0.5, "The limit back to the isolated site."], [MATS]: [1, exact] } },
      { day: 1, working: oneLevel, answer: "As $\\epsilon_1 \\to \\infty$, $\\Delta \\to 0$: the bath decouples and the site is an atom.", result: "right", marks: [["As $", "right"]], moves: { [HYB]: [1, exact], [AIM]: [0.5, exact], [MATS]: [0.5, exact] } },
    ] },
  { folder: D, name: "why-one-over-root-z", title: "Why 1/√z", tests: [INF], made: 7, next: "what-a-local-self-energy-cannot-do",
    question: "Why must the hopping scale as $t^*/\\sqrt{z}$, and not as $t^*/z$, as $z \\to \\infty$?",
    attempts: [
      { day: 7, working: zWalkPartly, answer: "With $t \\sim 1/z$ it stays finite.", result: "partly", marks: [["The kinetic", "right"], ["With $t", "wrong"]], moves: { [INF]: [0.5, "Sees that the sum over neighbours matters; not why the amplitudes add as they do."] } },
      { day: 4, working: zWalk, answer: "With $t \\sim 1/\\sqrt{z}$ the bandwidth stays finite; with $t \\sim 1/z$ the electrons would stop moving.", result: "right", marks: [["The band", "right"], ["With $t", "right"]], moves: { [INF]: [1, exact] } },
      { day: 2, working: zWalk, answer: "With $t \\sim 1/\\sqrt{z}$ the bandwidth stays finite; with $t \\sim 1/z$ the electrons would stop moving.", result: "right", marks: [["With $t", "right"]], moves: { [INF]: [0.5, "The same working as two days ago."] } },
    ] },
  { folder: D, name: "what-a-local-self-energy-cannot-do", title: "What a local self-energy cannot do", tests: [LSE, MAP], made: 5,
    question: "If $\\Sigma(k,\\omega) = \\Sigma(\\omega)$, can the quasiparticle weight differ between two points of the Fermi surface? Why does the map to an impurity need this?",
    attempts: [
      { day: 1, working: local, answer: "The impurity is one site, so it can only give a $\\Sigma$ that depends on frequency alone.", result: "right", marks: [["No: $Z$", "right"], ["The impurity", "right"]], moves: { [LSE]: [1, exact], [MAP]: [1, "Ties the map to the locality of Σ."] } },
    ] },
  { folder: D, name: "the-bethe-lattice", title: "The Bethe lattice", tests: [SC], made: 1, byIso: { day: 1, after: "what-a-local-self-energy-cannot-do", usage: { in: 1380, out: 140, usd: 0.0043 } },
    question: "Show that on the Bethe lattice the self-consistency condition reduces to $\\Delta = t^2 G$.",
    attempts: [],
    unsent: "Start from the semicircular density of states.\n\nThen $G = 1/(\\zeta - t^2 G)$, with $\\zeta = i\\omega + \\mu - \\Sigma$.\n\nSo $\\Delta = t^2/G$." },
];

// ------------------------------------------------------------ the scripted search by meaning

/** What search by meaning finds for the questions the example's Iso asks it. */
const MEANING: Record<string, { note: string; heading: string; score: number }[]> = {
  "the loop oscillates between metal and insulator": [{ note: MOTT, heading: "", score: 0.81 }, { note: QP, heading: "", score: 0.74 }],
};
export const similar: Similar = async (text) => ({
  ready: true,
  hits: (MEANING[text] ?? TUTORIAL_MEANING[text]?.map((h) => ({ ...h, heading: "" })) ?? []).map((h) => ({ note: h.note, heading: h.heading, body: "", score: h.score })),
});

// ------------------------------------------------------------ making it

export async function buildExample(sources: Sources, now = Date.now()): Promise<Built> {
  const final = (id: string): string => { const t = sources[`${id}.md`]; if (t === undefined) throw new Error(`no note ${id} in the example`); return t; };
  const notes = new MemoryFiles(), study = new MemoryFiles({
    [CONFIG_FILE]: dumpStudyConfig({ format: 1, base: { path: `../${NAME}`, remote: "", root: "" } }),
    ".gitattributes": GITATTRIBUTES,
  });
  let t = 0;
  const clock: Clock = { now: () => t++ };
  const replies: Reply[] = [];
  const http = scriptedHttp(() => { const r = replies.shift(); if (!r) throw new Error("Iso was asked more than the script says"); return r; });
  const engine = await Engine.open({ notes, study, clock, device: DEVICE, name: NAME, http, secrets: new MemorySecrets({ [KEY]: "example" }), similar });

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

  // ---- many-body basics, six weeks ago
  on(41, 0, () => write(SQ, final(SQ)));
  on(40, 0, () => write(GF, drop(final(GF), "Why it matters:")));
  on(40, 6, async () => {
    const p = await insert(GF, "$$\nG_{ij}(t)", "why does this matter?", "This matters because the Green's function contains all single-particle information: its poles give the excitation energies.", [{ name: "read_note", arguments: { id: SQ } }], { in: 5200, out: 180, usd: 0.0112 });
    await engine.revise(GF, p.proposal, block(final(GF), "Why it matters:"));
    await engine.keep(GF, p.proposal);
  });
  on(40, 9, () => write(GF, final(GF)));
  on(39, 0, () => write(MATS, final(MATS)));
  on(37, 0, () => write(SE, final(SE)));
  on(36, 0, () => write(DYSON, drop(final(DYSON), "This last form")));
  on(36, 5, async () => {
    const p = await insert(DYSON, "$$\nG^{-1}", "how is this used in practice?", block(final(DYSON), "This last form"), [{ name: "outline_note", arguments: { id: SE } }], { in: 6100, out: 120, usd: 0.0109 });
    await engine.keep(DYSON, p.proposal);
  });
  on(34, 0, () => write(SPEC, final(SPEC)));
  on(34, 7, async () => {
    const p = await insert(SPEC, "Free electrons:", "add an ARPES example", "In ARPES on a cuprate, the quasiparticle band near the nodal direction is a sharp peak that broadens away from the Fermi level, with a kink near 70 meV.", [{ name: "search_notes", arguments: { query: "photoemission" } }], { in: 6800, out: 210, usd: 0.0131 });
    await engine.discard(SPEC, p.proposal);
  });
  on(32, 0, () => write(QP, drop(final(QP), "$Z \\to 0$")));
  on(8, 20, () => write(QP, final(QP)));

  // ---- lattice models, a month ago
  on(27, 0, () => write(TB, final(TB)));
  on(26, -60, () => write(DOS, final(DOS)));
  on(24, 0, () => write(HUB, final(HUB)));
  on(22, 0, () => write(MOTT, drop(final(MOTT), "TODO:")));
  // Edited in another editor (on the phone, say): found the next time it was opened.
  on(21, 0, async () => { await notes.write(`${MOTT}.md`, final(MOTT)); await engine.readNote(MOTT); });
  // A list deleted by mistake, and the note restored to before it.
  on(19, 30, () => write(DOS, drop(final(DOS), "Two I use:")));
  on(19, 32, async () => {
    const journal = await engine.journal(DOS), before = journal.filter((e) => e.kind === "change").at(-2)!;
    await engine.restore(DOS, before.id, (await engine.readNote(DOS)).version);
  });
  on(20, 30, () => engine.windBack(`@study/${L}/bandwidth-of-the-square-lattice`));

  // ---- impurity problems, two weeks ago
  on(16, 0, () => write(AIM, final(AIM)));
  const plain = "So the bath only matters through $\\Delta$.";
  const hybFree = " The impurity's free Green's function is then $\\mathcal{G}_0^{-1}(i\\omega_n) = i\\omega_n - \\varepsilon_d - \\Delta(i\\omega_n)$.";
  on(15, 0, () => write(HYB, final(HYB).replace(hybFree, "").replace(block(final(HYB), "So two baths"), plain)));
  on(14, 40, async () => {
    const p = await iso({ note: HYB, form: "rewrite", regions: [{ text: plain, nth: 0 } as Passage], after: null, before: null, asked: "say why that is enough for DMFT", tier: "mid" },
      { text: `⟦1⟧${block(final(HYB), "So two baths")}⟦/1⟧\n⟦note⟧I said what follows from it: the bath itself is never needed.⟦/note⟧`, usage: { in: 7400, out: 240, usd: 0.0158 } });
    await engine.keep(HYB, p.proposal);
    if (p.said) await engine.discard(HYB, p.said);
  });

  // ---- DMFT, the last nine days
  on(9, 0, () => write(INF, drop(final(INF), "The payoff:")));
  on(9, 6, async () => { const p = await insert(INF, "With that scaling", "what does the limit buy us?", block(final(INF), "The payoff:"), [], { in: 4300, out: 60, usd: 0.0079 }); await engine.keep(INF, p.proposal); });
  on(8, 0, () => write(LSE, final(LSE)));
  // A note for Iso: asked from the Atlas, kept as a note, then given its description.
  on(6, 0, async () => {
    const draft = await engine.createDraft();
    await engine.saveNote(draft.id, { base: draft.version, text: "---\ntype: Concept\ntitle: Cavity construction\n---\n\nHow is the single-site action got by removing one site from the lattice? What survives in infinite dimensions, and why? Rest it on [infinite dimensions](/dmft/infinite-dimensions.md) and the [local self-energy](/dmft/local-self-energy.md).\n" });
    const body = final(CAVITY).replace(/^---\n[\s\S]*?\n---\n\n/, "").trimEnd();
    const p = await iso({ note: draft.id, form: "note", tier: "mid" },
      { calls: [{ name: "read_note", arguments: { id: INF } }, { name: "read_note", arguments: { id: LSE } }], usage: { in: 5600, out: 50, usd: 0.0061 } },
      { calls: [{ name: "search_notes", arguments: { query: "anderson impurity bath" } }], usage: { in: 8100, out: 30, usd: 0.0052 } },
      { text: body, usage: { in: 9400, out: 420, usd: 0.0214 } });
    await engine.keepDraft(draft.id, p.proposal, D);
  });
  on(6, 8, () => write(CAVITY, final(CAVITY)));
  on(5, 0, () => write(MAP, final(MAP)));
  const weissThen = drop(drop(final(WEISS), "It is not known"), "By analogy");
  on(4, 0, () => write(WEISS, weissThen));
  on(3, 0, async () => { const p = await insert(WEISS, "$$\n\\mathcal{G}_0^{-1}", "why field, if it is a function?", block(final(WEISS), "By analogy"), [{ name: "search_notes", arguments: { query: "mean field" } }], { in: 5900, out: 70, usd: 0.0098 }); await engine.keep(WEISS, p.proposal); });
  on(2, 0, () => write(SC, final(SC)));
  on(1, 0, () => write(LOOP, drop(final(LOOP), "Rests on the")));
  // A note for Iso, written and not yet sent.
  on(1, 30, async () => {
    const draft = await engine.createDraft();
    await engine.saveNote(draft.id, { base: draft.version, text: "---\ntype: Concept\ntitle: Why DMFT is exact only in infinite dimensions\n---\n\nIn three dimensions, what exactly is lost? Only the momentum dependence of the self-energy, or vertex corrections too? Rest it on the [local self-energy](/dmft/local-self-energy.md) and [infinite dimensions](/dmft/infinite-dimensions.md).\n" });
  });

  // ---- today's session: the board's five moments, the last a few minutes ago
  on(0, -28, () => write(SOLVER, final(SOLVER)));
  on(0, -22, () => write(WEISS, final(WEISS)));
  on(0, -16, async () => {
    const p = await insert(LOOP, null, "link what this rests on", block(final(LOOP), "Rests on the"),
      [{ name: "search_notes", arguments: { query: "self-consistency" } }, { name: "read_note", arguments: { id: SC } }, { name: "find_similar", arguments: { text: "the loop oscillates between metal and insulator" } }, { name: "outline_note", arguments: { id: SOLVER } }],
      { in: 11200, out: 140, cached: 6100, usd: 0.0186 });
    await engine.keep(LOOP, p.proposal);
  });
  on(0, -10, () => write(HYB, final(HYB)));
  on(0, -4, () => insert(SC, "The sum over $k$", "give the Bethe lattice form", "On the Bethe lattice, with half-bandwidth $D$, the condition closes in one line: $\\Delta(i\\omega_n) = (D/2)^2\\, G(i\\omega_n)$. No sum over momenta is left.",
    [{ name: "read_note", arguments: { id: DOS } }, { name: "read_note", arguments: { id: WEISS } }], { in: 9800, out: 160, cached: 7200, usd: 0.0147 }));

  // ---- the exercises: made, then each attempt sent for marking
  for (const x of EXERCISES) {
    const id = `@study/${x.folder}/${x.name}`, head = (working: string) => {
      const meta = [`type: Exercise`, `kind: written`, `title: ${JSON.stringify(x.title)}`, `tests: [${x.tests.join(", ")}]`, ...(x.next ? [`next: ${x.folder}/${x.next}`] : [])];
      return `---\n${meta.join("\n")}\n---\n\n${x.question}\n\n## Working\n\n${working}\n`;
    };
    if (x.byIso) {
      const by = x.byIso;
      on(by.day, -40, async () => {
        const draft = await engine.createExerciseDraft(x.folder, x.tests, by.after ? `@study/${x.folder}/${by.after}` : null);
        const p = await iso({ note: draft.id, form: "exercise", tier: "mid" }, { text: `# ${x.title}\n\n${x.question}`, usage: by.usage });
        const kept = await engine.keepExercise(draft.id, p.proposal);
        if (kept.id !== id) throw new Error(`the exercise was kept as ${kept.id}, not ${id}`);
      });
    } else on(x.made, -40, () => write(id, head("")));
    for (const a of x.attempts) {
      on(a.day, -30, async () => {
        const now = (await engine.readNote(id)).text, working = now.slice(0, now.indexOf("## Working") + "## Working".length) + `\n\n${a.working}\n`;
        await write(id, working);
        const marks = a.marks.map(([first, mark]) => ({ quote: block(a.working, first), mark }));
        await iso({ note: id, form: "mark", answer: { text: a.answer, nth: 0 }, tier: "mid" },
          { text: JSON.stringify({ result: a.result, marks, moves: Object.fromEntries(Object.entries(a.moves).map(([note, [by, why]]) => [note, { by, why }])) }), usage: { in: 2400, out: 1100, cached: 800, usd: 0.0151 } });
      });
    }
    if (x.unsent) on(1, -10, async () => { const now = (await engine.readNote(id)).text; await write(id, now.slice(0, now.indexOf("## Working") + "## Working".length) + `\n\n${x.unsent}\n`); });
  }

  // In time order: the day, then the minute within it. Days are counted back from now; a session's minutes from
  // two hours before now's time of day (today's are counted back from now itself).
  ops.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [day, minute, act] of ops) {
    t = day === 0 ? now + minute * MIN : now - day * DAY - 2 * 60 * MIN + minute * MIN;
    await act();
  }
  if (replies.length) throw new Error(`${replies.length} scripted replies were never asked for`);
  return { notes: Object.fromEntries(notes.files), study: Object.fromEntries(study.files) };
}
