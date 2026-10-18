import { expect, test } from "vitest";
import { hashText, readJournal, replay, understanding, readRecord, moments, pending, splitFrontmatter } from "@isorite/core";
import { buildExample, COST_WORKING, EXERCISES } from "../src/index.ts";
import { loadSources } from "../src/node.ts";

const sources = loadSources();
const NOW = Date.parse("2026-10-18T10:00:00Z");
const built = await buildExample(sources, NOW);

test("every note's frontmatter reads, with its type and title", () => {
  for (const [path, text] of Object.entries(sources)) expect(splitFrontmatter(text)[0], path).toMatchObject({ type: "Concept", title: expect.any(String) });
});

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

test("each note's understanding is spread over the Atlas's four steps", () => {
  const events = readRecord(built.study["record/laptop1.jsonl"] ?? "");
  const read = understanding(events, NOW);
  const step = (id: string) => read.get(id)?.step ?? 0;
  const want: Record<string, number> = {
    "physics/newtons-law-of-gravitation": 3, "physics/units": 2, "physics/energy-conservation": 2, "physics/the-n-body-problem": 0, "physics/softening": 0,
    "integrators/eulers-method": 2, "integrators/leapfrog": 1, "integrators/symplectic-integrators": 1, "integrators/choosing-the-timestep": 1,
    "algorithms/direct-summation": 0, "algorithms/centre-of-mass": 2, "algorithms/the-quadtree": 0, "algorithms/barnes-hut": 0, "algorithms/cost-and-accuracy": 0,
    "simulation/the-main-loop": 0, "simulation/initial-conditions": 0, "simulation/diagnostics": 1, "simulation/two-galaxies-colliding": 0,
  };
  const got = Object.fromEntries(Object.keys(want).map((id) => [id, step(id)]));
  expect(got).toEqual(want);
  // Some are due again, for the study list.
  expect([...read].filter(([, u]) => u.due).map(([id]) => id).sort()).toEqual(["integrators/choosing-the-timestep", "integrators/symplectic-integrators", "simulation/diagnostics"]);
  expect(events.filter((e) => e.event === "attempt")).toHaveLength(EXERCISES.reduce((n, x) => n + x.attempts.length, 0));
});

test("today's session is five moments, and Iso's answer on softening waits", () => {
  const journals = Object.entries(built.study).filter(([p]) => p.startsWith("journal/") && !p.includes("@"));
  const today = journals.flatMap(([p, text]) => moments(readJournal(text)).filter((m) => Date.parse(m.at) > NOW - 3600_000).map((m) => ({ note: p, what: m.what, asked: m.asked })));
  expect(today.map((m) => m.what)).toEqual(expect.arrayContaining(["wrote", "edited", "kept", "edited", "offered"]));
  expect(today).toHaveLength(5);
  const soft = readJournal(built.study["journal/physics/softening.jsonl"]!);
  expect(pending(soft).map((p) => p.asked)).toEqual(["how big should ε be?"]);
});

test("the history has every kind of moment the timeline shows", () => {
  const all = Object.entries(built.study).filter(([p]) => p.startsWith("journal/")).flatMap(([, text]) => moments(readJournal(text)).map((m) => m.what));
  for (const what of ["wrote", "edited", "kept", "offered", "discarded", "restored", "changed elsewhere", "marked"]) expect(all, what).toContain(what);
});

test("a note for Iso waits unsent, and the cost of direct summation has working, wrong, and no marking", () => {
  const drafts = Object.keys(built.study).filter((p) => p.startsWith("drafts/"));
  expect(drafts).toHaveLength(1);
  expect(built.study[drafts[0]!]).toContain("Close encounters");
  expect(built.study["study/algorithms/the-cost-of-direct-summation.md"]).toContain(COST_WORKING);
  expect(built.notes["algorithms/barnes-hut.md"]).toContain("TODO:");
});
