import { expect, test } from "vitest";
import { hashText, readJournal, replay, moments, splitFrontmatter } from "@isorite/core";
import type { AgentRecord } from "@isorite/engine";
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

test("today's session is four moments, one the agent's, and its answer on softening is in its session, not the note", () => {
  const journals = Object.entries(built.own).filter(([p]) => p.startsWith("journal/"));
  const today = journals.flatMap(([p, text]) => moments(readJournal(text)).filter((m) => Date.parse(m.at) > NOW - 3600_000).map((m) => ({ note: p, what: m.what, who: m.who, asked: m.asked })));
  expect(today.map((m) => m.what).sort()).toEqual(["edited", "edited", "edited", "wrote"]);
  expect(today.filter((m) => m.who === "agent:claude")).toEqual([{ note: "journal/simulation/the-main-loop.jsonl", what: "edited", who: "agent:claude", asked: "link what this rests on" }]);
  const session = JSON.parse(built.own["conversations/agents/claude/today.json"]!) as AgentRecord;
  expect(session.turns.map((t) => t.asked)).toEqual(["link what this rests on", "how big should ε be?"]);
  expect(session.turns[1]!.items.flatMap((i) => (i.kind === "tool" ? [i.note] : []))).toEqual(["physics/softening", "integrators/choosing-the-timestep", "physics/units"]);
  expect(built.notes["physics/softening.md"]).not.toContain("0.05");
});

test("the history has every kind of moment the timeline shows of a base kept since M25", () => {
  const all = Object.entries(built.own).filter(([p]) => p.startsWith("journal/")).flatMap(([, text]) => moments(readJournal(text)));
  for (const what of ["wrote", "edited", "restored", "changed elsewhere"]) expect(all.map((m) => m.what), what).toContain(what);
  // The agent's changes, each with what was asked, and one of them undone.
  expect(all.filter((m) => m.who === "agent:claude").map((m) => m.asked).sort()).toEqual(["add the SI conversions", "link what this rests on", "say how far is far enough", "What makes leapfrog keep its energy over thousands of orbits, when RK4, which is more accurate per step, does not? Write it as a note.", "why does its energy not drift, when Euler's does?", "why is energy a good check on a run?"].sort());
  expect(Object.keys(built.own).filter((p) => p.startsWith("conversations/agents/claude/")).sort()).toEqual(["centre-of-mass", "energy", "leapfrog", "symplectic", "today", "units"].map((s) => `conversations/agents/claude/${s}.json`));
});

test("the cost of direct summation has a solution with a slip in it, and Barnes–Hut a TODO", () => {
  expect(built.notes["algorithms/the-cost-of-direct-summation.md"]).toContain(COST_WORKING);
  expect(built.notes["algorithms/barnes-hut.md"]).toContain("TODO:");
});
