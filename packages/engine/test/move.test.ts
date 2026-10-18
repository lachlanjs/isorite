import { expect, test } from "vitest";
import { hashText, moments, readJournal, readRecord, understanding } from "@isorite/core";
import { Conflict, Engine, EngineError, MemoryFiles } from "../src/index.ts";

const FORCE = "---\ntype: Concept\ntitle: Gravity\n---\n\nEvery pair of bodies attracts.\n";
const LEAP = "---\ntype: Concept\ntitle: Leapfrog\n---\n\nKick with the [force](/physics/gravity.md \"requires\"), then drift. See [it](/physics/gravity.md#law).\n";
const EXERCISE = "---\ntype: Exercise\nkind: written\ntitle: Two bodies\ntests: [physics/gravity, integrators/leapfrog]\n---\n\nFind the period.\n\n## Working\n\n";
const AT = Date.parse("2026-10-13T09:00:00Z");
const attempt = { id: "01K7A000000000000000000000", at: "2026-10-12T09:00:00Z", device: "laptop1", event: "attempt", exercise: "physics/two-bodies", tests: ["physics/gravity"], result: "right", by: "you", moves: { "physics/gravity": { by: 1, why: "exact" } } };

async function open() {
  const clock = { t: AT, now() { return this.t; } };
  const notes = new MemoryFiles({ "physics/gravity.md": FORCE, "integrators/leapfrog.md": LEAP });
  const study = new MemoryFiles({ "study/physics/two-bodies.md": EXERCISE, "record/laptop1.jsonl": JSON.stringify(attempt) + "\n" });
  const engine = await Engine.open({ notes, study, clock, device: "laptop1", name: "nbody-notes" });
  return { engine, notes, study, clock };
}

test("a note moved keeps its journal, its standing, and the links and exercises that name it", async () => {
  const { engine, notes, study } = await open();
  await engine.readNote("physics/gravity");
  const moved = await engine.moveNote("physics/gravity", "forces/newtons-law", hashText(FORCE));
  expect(moved).toMatchObject({ id: "forces/newtons-law", text: FORCE, changed: true });
  expect(notes.files.has("physics/gravity.md")).toBe(false);
  expect(notes.files.get("forces/newtons-law.md")).toBe(FORCE);
  // Its journal went with it, and says it moved.
  expect(study.files.has("journal/physics/gravity.jsonl")).toBe(false);
  const journal = readJournal(study.files.get("journal/forces/newtons-law.jsonl")!);
  expect(moments(journal).map((m) => m.what)).toEqual(["found", "moved"]);
  expect(journal.at(-1)).toMatchObject({ why: "move", from: "physics/gravity", who: "you" });
  // What the record knew of it follows it.
  const read = understanding(readRecord(study.files.get("record/laptop1.jsonl")!), AT);
  expect(read.get("forces/newtons-law")?.squares).toBe(1);
  expect(read.has("physics/gravity")).toBe(false);
  // Links to it, with a heading or not, now point to where it is, as your edit; so does the exercise.
  expect(notes.files.get("integrators/leapfrog.md")).toBe(LEAP.replaceAll("/physics/gravity.md", "/forces/newtons-law.md"));
  expect(readJournal(study.files.get("journal/integrators/leapfrog.jsonl")!).at(-1)).toMatchObject({ why: "edit", who: "you" });
  expect(study.files.get("study/physics/two-bodies.md")).toContain("tests: [forces/newtons-law, integrators/leapfrog]");
  expect((await engine.notes()).notes.map((n) => n.id)).toEqual(["forces/newtons-law", "integrators/leapfrog"]);
  expect((await engine.map()).model).toBeTruthy();
});

test("a move is refused onto another note, out of the base, or from a version that has moved on", async () => {
  const { engine } = await open();
  await expect(engine.moveNote("physics/gravity", "integrators/leapfrog", hashText(FORCE))).rejects.toBeInstanceOf(EngineError);
  await expect(engine.moveNote("physics/gravity", "@study/x", hashText(FORCE))).rejects.toBeInstanceOf(EngineError);
  await expect(engine.moveNote("physics/gravity", "physics/g2", "stale")).rejects.toBeInstanceOf(Conflict);
});

test("a note deleted is gone from the base; its journal stays, and links to it are left broken", async () => {
  const { engine, notes, study } = await open();
  await engine.readNote("physics/gravity");
  await engine.deleteNote("physics/gravity", hashText(FORCE));
  expect(notes.files.has("physics/gravity.md")).toBe(false);
  expect(study.files.has("journal/physics/gravity.jsonl")).toBe(true);
  expect(notes.files.get("integrators/leapfrog.md")).toBe(LEAP);
  expect((await engine.notes()).notes.map((n) => n.id)).toEqual(["integrators/leapfrog"]);
  await expect(engine.deleteNote("physics/gravity", hashText(FORCE))).rejects.toBeInstanceOf(Conflict);
});
