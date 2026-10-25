import { expect, test } from "vitest";
import { hashText, readJournal, replay, moments, pending, splitFrontmatter } from "@isorite/core";
import { buildExample, COST_WORKING, PROBLEMS } from "../src/index.ts";
import { loadSources } from "../src/node.ts";

const sources = loadSources();
const NOW = Date.parse("2026-10-18T10:00:00Z");
const built = await buildExample(sources, NOW);

test("every note's frontmatter reads, with its type and title", () => {
  for (const [path, text] of Object.entries(sources)) expect(splitFrontmatter(text)[0], path).toMatchObject({ type: "Concept", title: expect.any(String) });
});

const problems = PROBLEMS.map((x) => `${x.folder}/${x.name}.md`);

test("the notes come out as they stand in the package, every one of them journalled, with the problems beside them", () => {
  expect(Object.keys(built.notes).sort()).toEqual([...Object.keys(sources), ...problems].sort());
  for (const [path, text] of Object.entries(sources)) {
    expect(built.notes[path], path).toBe(text);
    const journal = readJournal(built.own[`journal/${path.replace(/\.md$/, ".jsonl")}`] ?? "");
    const head = replay(journal);
    expect(head?.text, path).toBe(text);
    expect(head?.broken, path).toEqual([]);
    expect(head?.hash).toBe(hashText(text));
  }
});

test("each problem is a note of the base, beside the notes it uses, its statement then its solution as last left", () => {
  for (const x of PROBLEMS) {
    const path = `${x.folder}/${x.name}.md`, [meta, body] = splitFrontmatter(built.notes[path]!);
    expect(meta, path).toEqual({ type: "Problem", title: x.title, uses: x.uses });
    expect(body, path).toContain(x.question);
    const last = x.unsent ?? x.attempts.at(-1)?.working;
    if (last) expect(body, path).toContain(`## Solution\n\n${last}`);
    expect(replay(readJournal(built.own[`journal/${path.replace(/\.md$/, ".jsonl")}`]!))?.text).toBe(built.notes[path]);
  }
  // Nothing of the study base is left.
  expect(Object.keys(built.own).filter((p) => p.startsWith("study/") || p.startsWith("record/") && built.own[p]!.includes('"attempt"'))).toEqual([]);
});

test("today's session is five moments, and Iso's answer on softening waits", () => {
  const journals = Object.entries(built.own).filter(([p]) => p.startsWith("journal/") && !p.includes("@"));
  const today = journals.flatMap(([p, text]) => moments(readJournal(text)).filter((m) => Date.parse(m.at) > NOW - 3600_000).map((m) => ({ note: p, what: m.what, asked: m.asked })));
  expect(today.map((m) => m.what)).toEqual(expect.arrayContaining(["wrote", "edited", "kept", "edited", "offered"]));
  expect(today).toHaveLength(5);
  const soft = readJournal(built.own["journal/physics/softening.jsonl"]!);
  expect(pending(soft).map((p) => p.asked)).toEqual(["how big should ε be?"]);
});

test("the history has every kind of moment the timeline shows", () => {
  const all = Object.entries(built.own).filter(([p]) => p.startsWith("journal/")).flatMap(([, text]) => moments(readJournal(text)).map((m) => m.what));
  for (const what of ["wrote", "edited", "kept", "offered", "discarded", "restored", "changed elsewhere"]) expect(all, what).toContain(what);
});

test("a note for Iso waits unsent, and the cost of direct summation has a solution with a slip in it", () => {
  const drafts = Object.keys(built.own).filter((p) => p.startsWith("drafts/"));
  expect(drafts).toHaveLength(1);
  expect(built.own[drafts[0]!]).toContain("Close encounters");
  expect(built.notes["algorithms/the-cost-of-direct-summation.md"]).toContain(COST_WORKING);
  expect(built.notes["algorithms/barnes-hut.md"]).toContain("TODO:");
});
