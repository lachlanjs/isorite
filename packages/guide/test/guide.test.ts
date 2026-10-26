import { expect, test } from "vitest";
import { AGENTS_FILE, Bundle } from "@isorite/core";
import { LEARNING, PRACTICE } from "@isorite/engine";
import { START, YOURS } from "../src/index.ts";
import { loadGuide } from "../src/node.ts";

// The guide is a base like any other: it is checked as one.
const files = loadGuide();
const b = Bundle.fromFiles(Object.entries(files).map(([path, text]) => ({ path, text })));
const notes = [...b.concepts.values()];

test("every note loads with a kind and a title, and the base has no issues", () => {
  expect(notes.length).toBeGreaterThan(30);
  expect(b.issues).toEqual([]);
  for (const n of notes) expect(n.meta.type, n.id).toMatch(/^(Concept|Question|Problem)$/);
  for (const n of notes.filter((n) => n.kind === "note" && n.id !== YOURS)) expect(n.description, n.id).not.toBe("");
  expect(files[AGENTS_FILE]).toBeTruthy();
  expect(b.concepts.has("AGENTS")).toBe(false);
});

test("no link is broken, and every problem uses a concept, every question is about one", () => {
  for (const n of notes) for (const l of n.links) expect(l.broken, `${n.id} → ${l.target}`).toBe(false);
  for (const n of notes.filter((n) => n.kind !== "note")) {
    expect(n.attached.length, n.id).toBeGreaterThan(0);
    for (const id of n.attached) expect(b.concepts.get(id)?.kind, `${n.id} → ${id}`).toBe("note");
  }
});

test("every concept, and every problem, is reached from Start here along links and the problems beside them", () => {
  const seen = new Set<string>([START]), queue = [START];
  const beside = (id: string) => notes.filter((n) => n.attached.includes(id)).map((n) => n.id);
  while (queue.length) {
    const n = b.concepts.get(queue.shift()!)!;
    for (const next of [...n.links.map((l) => l.target), ...n.embeds, ...beside(n.id)]) if (!seen.has(next) && b.concepts.has(next)) { seen.add(next); queue.push(next); }
  }
  expect(notes.map((n) => n.id).filter((id) => !seen.has(id))).toEqual([]);
});

test("Start here embeds problems, the first of them the one about solving, and none is solved yet", () => {
  const start = b.concepts.get(START)!;
  expect(start.embeds.length).toBeGreaterThan(3);
  expect(start.embeds[0]).toBe("solve-this-one");
  for (const id of start.embeds) expect(b.concepts.get(id)?.kind, id).toBe("problem");
  for (const n of notes) expect(n.done, n.id).toBeNull();
});

test("what the guide says of keeping a base is what Iso is told", () => {
  const well = files["your-own-base/keeping-a-base-well.md"]!.toLowerCase(), told = `${PRACTICE}\n${LEARNING}`.toLowerCase();
  const AGREE: [guide: string, prompt: string][] = [
    ["one idea a note", "one idea a note"], ['"requires"', '"requires"'], ['"uses"', '"uses"'], ["look before you write", "before you write a note, look"],
    ["marks where your understanding stops", "marks where their understanding stops"], ["leave an open question open", "leave it open"],
    ["in your own words", "in their words"], ["check, do not solve", "never solve it"], ["yours to split or merge", "theirs to split"],
  ];
  for (const [guide, prompt] of AGREE) { expect(well, guide).toContain(guide); expect(told, prompt).toContain(prompt); }
});
