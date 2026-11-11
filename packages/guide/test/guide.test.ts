import { expect, test } from "vitest";
import { AGENTS_FILE, Bundle, lensNotes, parseLens, resolveLens } from "@isorite/core";
import { LEARNING, PRACTICE } from "@isorite/engine";
import { GUIDE_LENSES, MOVED, START, YOURS, movedHash } from "../src/index.ts";
import { loadGuide, loadGuidePictures } from "../src/node.ts";

// The guide is a base like any other: it is checked as one.
const files = loadGuide();
const b = Bundle.fromFiles([...Object.entries(files).map(([path, text]) => ({ path, text })), ...Object.keys(loadGuidePictures()).map((path) => ({ path }))]);
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
  expect(start.embeds[0]).toBe("general/solve-this-one");
  for (const id of start.embeds) expect(b.concepts.get(id)?.kind, id).toBe("problem");
  for (const n of notes) expect(n.done, n.id).toBeNull();
});

test("what the guide says of keeping a base is what the agent is told", () => {
  const well = files["bases/keeping-a-base-well.md"]!.toLowerCase(), told = `${PRACTICE}\n${LEARNING}`.toLowerCase();
  const AGREE: [guide: string, prompt: string][] = [
    ["one idea a note", "one idea a note"], ['"requires"', '"requires"'], ['"uses"', '"uses"'], ["look before you write", "before you write a note, look"],
    ["marks where your understanding stops", "marks where their understanding stops"], ["leave an open question open", "leave it open"],
    ["in your own words", "in their words"], ["check, do not solve", "never solve it"], ["yours to split or merge", "theirs to split"],
  ];
  for (const [guide, prompt] of AGREE) { expect(well, guide).toContain(guide); expect(told, prompt).toContain(prompt); }
});

test("the guide's lenses name notes that are there, and the tour is a path from Start here", () => {
  for (const [file, text] of Object.entries(GUIDE_LENSES)) {
    const r = resolveLens(parseLens(file.replace(/\.toml$/, ""), text), lensNotes(b));
    expect(r.problems.filter((p) => p.level === "error"), file).toEqual([]);
    expect(r.order.slice(0, 3), file).toEqual(["general/start-here", "general/find-your-way", "general/the-switches"]);
  }
});

test("each step of the tour is titled as an action, ends in a question or a problem to work out, and holds every note once; the last is the tutor", () => {
  const lens = parseLens("tour", GUIDE_LENSES["tour.toml"]!), listed = lens.islands.flatMap((i) => i.notes.map((n) => n.replace(/^\//, "").replace(/\.md$/, "")));
  for (const step of lens.islands) {
    const kinds = step.notes.map((n) => b.concepts.get(n.replace(/^\//, "").replace(/\.md$/, ""))?.kind);
    expect(kinds.some((k) => k === "question" || k === "problem"), step.name).toBe(true);
    expect(step.title, step.name).toMatch(/^[A-Z][a-z]+ /);
  }
  expect(new Set(listed).size).toBe(listed.length);
  expect(listed.filter((id) => !b.concepts.has(id))).toEqual([]);
  expect(notes.map((n) => n.id).filter((id) => !listed.includes(id))).toEqual([]);
  expect(lens.islands.at(-1)!.notes).toContain("agents/the-tutor");
  expect(files["agents/get-taught.md"]).toContain("/socratic-tutor teach me isorite");
});

test("an address from before the notes were put in islands opens the note it was, and the map names notes that are there", () => {
  for (const [old, now] of Object.entries(MOVED)) {
    expect(b.concepts.has(now), `${old} → ${now}`).toBe(true);
    expect(b.concepts.has(old) && old !== now, `${old} is still a note`).toBe(false);
  }
  expect(movedHash("#/n/atlas/the-switches")).toBe("#/n/general/the-switches");
  expect(movedHash("#/b/tutorial/n/start-here?x=1")).toBe("#/b/tutorial/n/general/start-here?x=1");
  expect(movedHash("#/n/general/start-here")).toBeNull();
  expect(movedHash("#/b/code/n/start-here")).toBeNull();
});
