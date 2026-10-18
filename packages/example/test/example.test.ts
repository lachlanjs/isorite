import { expect, test } from "vitest";
import { hashText, readJournal, replay, understanding, readRecord, moments, pending } from "@isorite/core";
import { buildExample, EXERCISES } from "../src/index.ts";
import { loadSources } from "../src/node.ts";

const sources = loadSources();
const NOW = Date.parse("2026-10-18T10:00:00Z");
const built = await buildExample(sources, NOW);

test("the notes come out as they stand in the package, every one of them journalled", () => {
  expect(Object.keys(built.notes).sort()).toEqual(Object.keys(sources).sort());
  for (const [path, text] of Object.entries(sources)) {
    expect(built.notes[path], path).toBe(text);
    const journal = readJournal(built.study[`journal/${path.replace(/\.md$/, ".jsonl")}`] ?? "");
    const head = replay(journal);
    expect(head?.text, path).toBe(text);
    expect(head?.broken, path).toEqual([]);
    expect(head?.hash).toBe(hashText(text));
  }
});

test("each note's understanding is as the boards' Atlas draws it", () => {
  const events = readRecord(built.study["record/laptop1.jsonl"] ?? "");
  const read = understanding(events, NOW);
  const step = (id: string) => read.get(id)?.step ?? 0;
  const want: Record<string, number> = {
    "many-body-basics/second-quantisation": 3, "many-body-basics/greens-function": 3, "many-body-basics/matsubara-frequencies": 3, "many-body-basics/self-energy": 3,
    "many-body-basics/dyson-equation": 3, "many-body-basics/spectral-function": 2, "many-body-basics/quasiparticle-weight": 2,
    "lattice-models/tight-binding": 3, "lattice-models/density-of-states": 2, "lattice-models/hubbard-model": 2, "lattice-models/mott-transition": 1,
    "impurity-problems/anderson-impurity-model": 2, "impurity-problems/hybridisation-function": 1, "impurity-problems/impurity-solver": 0,
    "dmft/infinite-dimensions": 1, "dmft/local-self-energy": 1, "dmft/cavity-construction": 0, "dmft/lattice-to-impurity-map": 1,
    "dmft/weiss-field": 0, "dmft/self-consistency-condition": 0, "dmft/the-dmft-loop": 0,
  };
  const got = Object.fromEntries(Object.keys(want).map((id) => [id, step(id)]));
  expect(got).toEqual(want);
  expect(events.filter((e) => e.event === "attempt")).toHaveLength(EXERCISES.reduce((n, x) => n + x.attempts.length, 0));
});

test("today's session is the board's five moments, and Iso's Bethe lattice form waits", () => {
  const journals = Object.entries(built.study).filter(([p]) => p.startsWith("journal/") && !p.includes("@"));
  const today = journals.flatMap(([p, text]) => moments(readJournal(text)).filter((m) => Date.parse(m.at) > NOW - 3600_000).map((m) => ({ note: p, what: m.what, asked: m.asked })));
  expect(today.map((m) => m.what)).toEqual(expect.arrayContaining(["wrote", "edited", "kept", "edited", "offered"]));
  expect(today).toHaveLength(5);
  const sc = readJournal(built.study["journal/dmft/self-consistency-condition.jsonl"]!);
  expect(pending(sc).map((p) => p.asked)).toEqual(["give the Bethe lattice form"]);
});

test("the history has every kind of moment the timeline shows", () => {
  const all = Object.entries(built.study).filter(([p]) => p.startsWith("journal/")).flatMap(([, text]) => moments(readJournal(text)).map((m) => m.what));
  for (const what of ["wrote", "edited", "kept", "offered", "discarded", "restored", "changed elsewhere", "marked"]) expect(all, what).toContain(what);
});

test("a note for Iso waits unsent, and the Bethe lattice exercise has working and no marking", () => {
  const drafts = Object.keys(built.study).filter((p) => p.startsWith("drafts/"));
  expect(drafts).toHaveLength(1);
  expect(built.study[drafts[0]!]).toContain("Why DMFT is exact only in infinite dimensions");
  expect(built.study["study/dmft/the-bethe-lattice.md"]).toContain("So $\\Delta = t^2/G$.");
});
