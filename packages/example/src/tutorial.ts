// The tutorial's Iso: what it answers to each request the tutorial walks through, chosen by what the request is
// (a marking, an exercise, a rewrite, a note for Iso, new text) and by the words asked. Anything else is answered
// once, plainly, with what this Iso is.

import type { Reply, Request } from "./scripted.ts";

/** The prompts the tutorial fills in, word for word. */
export const PROMPTS = {
  insert: "what does each solver cost, and where does it fail?",
  rewrite: "answer my TODO",
  exercise: "",
} as const;

export const UNSCRIPTED = "In this tutorial I answer only what it walks you through. With a provider key in your own isorite, I would answer this too.";

const text = (r: Request): string => r.messages.filter((m) => m.role === "user").map((m) => String(m.content)).join("\n\n");
const looked = (r: Request): boolean => r.messages.some((m) => m.role === "tool");
const asked = (r: Request): string => (text(r).split(/# What they ask(?: now)?[^\n]*\n\n/).at(-1) ?? "").trim().toLowerCase();

const SOLVERS = `Three are in common use, and each trades something:

- **Exact diagonalisation** keeps a few bath levels (6 to 10) and diagonalises exactly. Cheap and works at zero temperature, but the bath is coarse, so spectra come out as a few spikes.
- **Continuous-time quantum Monte Carlo** (CT-QMC, in its hybridisation expansion) samples the full $\\Delta(\\tau)$ with no bath discretised. Exact up to statistical error, at any $U$, but only at finite temperature and on the Matsubara axis, so real-frequency spectra need analytic continuation.
- **The numerical renormalisation group** resolves low energies finely and works on the real axis at $T = 0$; it is costly for more than one or two orbitals and blurs high energies.

For the half-filled single-band model you have, CT-QMC is the usual choice; ED is the quickest way to get the loop running.`;

const COEXISTENCE = `At low temperature both solutions of the loop exist for $U_{c1} < U < U_{c2}$: started from the metal it stays metallic up to $U_{c2}$, where $Z \\to 0$; started from the insulator it stays insulating down to $U_{c1}$, where the gap closes. On the Bethe lattice $U_{c1} \\approx 2.4D$ and $U_{c2} \\approx 2.9D$. The transition is first order at finite temperature, with a free-energy crossing between the two, and the coexistence region ends at a critical point near $T \\approx 0.025D$.`;

const WHAT_IS_LOST = `In three dimensions the self-energy depends on momentum, and DMFT throws that away: it keeps all the local, time-resolved correlations and none of the spatial ones.

What is lost:
- **short-range correlations** between neighbouring sites, such as antiferromagnetic fluctuations above the Néel temperature, which in 2D and 3D can open a pseudogap;
- **the momentum dependence of $Z$** around the Fermi surface, which a local $\\Sigma$ cannot give (your exercise on it showed why);
- **non-local vertex corrections**, so response functions such as the optical conductivity are approximate.

Cluster extensions (cellular DMFT, the dynamical cluster approximation) bring back correlations within a cluster of a few sites, at a cost that grows quickly with its size.`;

/** The answer to one request to the tutorial's Iso. */
export function tutorialAnswer(r: Request): Reply {
  const all = text(r);
  // A marking: the Bethe lattice exercise is right when the answer is Δ = t² G, and wrong (as first written) otherwise.
  if (all.includes("⟦answer⟧")) {
    const answer = /⟦answer⟧([\s\S]*?)⟦\/answer⟧/.exec(all)?.[1] ?? "";
    const right = /t\^2\s*G\b/.test(answer) && !/t\^2\s*\/\s*G/.test(answer);
    const tests = [...all.matchAll(/\(id: ([^;)]+)[;)]/g)].map((m) => m[1]!.trim());
    const marks = right
      ? [{ quote: answer, mark: "right" }]
      : [{ quote: "Then $G = 1/(\\zeta - t^2 G)$, with $\\zeta = i\\omega + \\mu - \\Sigma$.", mark: "right" }, { quote: answer, mark: "wrong" }];
    const why = right ? "The semicircle's self-consistency, closed in one line, unaided." : "The equation for G is right; Δ is read off it upside down.";
    return {
      text: JSON.stringify({ result: right ? "right" : "wrong", marks, moves: Object.fromEntries(tests.map((t) => [t, { by: right ? 1 : 0, why }])) }),
      usage: { in: 2380, out: 1060, cached: 900, usd: 0.0148 },
    };
  }
  // An exercise asked for: one on the note asked from, in two lines.
  if (all.includes("# What it is to test")) {
    const title = /## (.+?) \(/.exec(all.split("# What it is to test")[1] ?? "")?.[1] ?? "this note";
    return { text: `# What the ${title} is for\n\nIn two or three lines, say what the ${title} is for in DMFT, and name one place in the loop where it is used.`, usage: { in: 1290, out: 120, usd: 0.0039 } };
  }
  // A rewrite: the Mott transition's TODO answered.
  if (/⟦1⟧/.test(all)) {
    if (asked(r).includes("todo")) return { text: `⟦1⟧${COEXISTENCE}⟦/1⟧\n⟦note⟧I answered the question in your TODO and took the TODO away.⟦/note⟧`, usage: { in: 8200, out: 310, cached: 5400, usd: 0.0161 } };
    return { text: `⟦note⟧${UNSCRIPTED}⟦/note⟧`, usage: { in: 6000, out: 40, usd: 0.0062 } };
  }
  // A note for Iso: what DMFT loses outside infinite dimensions, after reading the notes it rests on.
  if (all.includes("# What they wrote for you")) {
    if (!/three dimensions|infinite dimensions/i.test(all)) return { text: UNSCRIPTED, usage: { in: 4000, out: 40, usd: 0.0049 } };
    if (!looked(r)) return { calls: [{ name: "read_note", arguments: { id: "dmft/local-self-energy" } }, { name: "read_note", arguments: { id: "dmft/infinite-dimensions" } }, { name: "find_similar", arguments: { text: "what a local self-energy cannot describe" } }], usage: { in: 5100, out: 60, usd: 0.0058 } };
    return { text: WHAT_IS_LOST, usage: { in: 9800, out: 380, cached: 4200, usd: 0.0196 } };
  }
  // New text in a note: the impurity solver's question.
  if (asked(r).includes("solver")) {
    if (!looked(r)) return { calls: [{ name: "search_notes", arguments: { query: "impurity solver" } }, { name: "read_note", arguments: { id: "impurity-problems/hybridisation-function" } }], usage: { in: 5400, out: 50, usd: 0.0061 } };
    return { text: SOLVERS, usage: { in: 8900, out: 330, cached: 5000, usd: 0.0172 } };
  }
  return { text: UNSCRIPTED, usage: { in: 4000, out: 40, usd: 0.0049 } };
}

/** What search by meaning finds for the questions the tutorial's Iso asks it. */
export const TUTORIAL_MEANING: Record<string, { note: string; score: number }[]> = {
  "what a local self-energy cannot describe": [{ note: "many-body-basics/quasiparticle-weight", score: 0.78 }, { note: "dmft/lattice-to-impurity-map", score: 0.74 }],
};
