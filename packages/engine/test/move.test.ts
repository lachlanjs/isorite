import { expect, test } from "vitest";
import { hashText, moments, readJournal } from "@isorite/core";
import { Conflict, Engine, EngineError, MemoryFiles } from "../src/index.ts";

const FORCE = "---\ntype: Concept\ntitle: Gravity\n---\n\nEvery pair of bodies attracts.\n";
const LEAP = "---\ntype: Concept\ntitle: Leapfrog\n---\n\nKick with the [force](/physics/gravity.md \"requires\"), then drift. See [it](/physics/gravity.md#law).\n";
const AT = Date.parse("2026-10-13T09:00:00Z");

async function open() {
  const clock = { t: AT, now() { return this.t; } };
  const notes = new MemoryFiles({ "physics/gravity.md": FORCE, "integrators/leapfrog.md": LEAP });
  const study = new MemoryFiles();
  const engine = await Engine.open({ notes, own: study, clock, device: "laptop1", name: "nbody-notes" });
  return { engine, notes, study, clock };
}

test("a note moved keeps its journal, and the links that name it follow it", async () => {
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
  // Links to it, with a heading or not, now point to where it is, as your edit.
  expect(notes.files.get("integrators/leapfrog.md")).toBe(LEAP.replaceAll("/physics/gravity.md", "/forces/newtons-law.md"));
  expect(readJournal(study.files.get("journal/integrators/leapfrog.jsonl")!).at(-1)).toMatchObject({ why: "edit", who: "you" });
  expect((await engine.notes()).notes.map((n) => n.id)).toEqual(["forces/newtons-law", "integrators/leapfrog"]);
  expect((await engine.map()).model).toBeTruthy();
});

test("a move is refused onto another note, out of the base, or from a version that has moved on", async () => {
  const { engine } = await open();
  await expect(engine.moveNote("physics/gravity", "integrators/leapfrog", hashText(FORCE))).rejects.toBeInstanceOf(EngineError);
  await expect(engine.moveNote("physics/gravity", "@draft/x", hashText(FORCE))).rejects.toBeInstanceOf(EngineError);
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
