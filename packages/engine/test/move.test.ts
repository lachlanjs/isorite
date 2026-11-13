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

test("an id from before a move resolves to where the note is now, through any number of moves, after a reopen too", async () => {
  const { engine, notes, study, clock } = await open();
  expect(await engine.resolveNote("physics/gravity")).toMatchObject({ state: "here", id: "physics/gravity" });
  await engine.moveNote("physics/gravity", "forces/gravity", hashText(FORCE));
  clock.t += 1000;
  await engine.moveFolder("forces", "mechanics/forces");
  expect(await engine.resolveNote("/physics/gravity.md")).toMatchObject({ asked: "physics/gravity", state: "moved", id: "mechanics/forces/gravity" });
  expect(await engine.resolveNote("forces/gravity")).toMatchObject({ state: "moved", id: "mechanics/forces/gravity" });
  // Read from the journals by an engine that never saw the moves.
  const again = await Engine.open({ notes, own: study, clock, device: "laptop1", name: "nbody-notes" });
  expect(await again.resolveNote("physics/gravity")).toMatchObject({ state: "moved", id: "mechanics/forces/gravity" });
  // Deleted: the journal stays, so it is known to have been there.
  await again.deleteNote("integrators/leapfrog", (await again.readNote("integrators/leapfrog")).version);
  expect(await again.resolveNote("integrators/leapfrog")).toMatchObject({ state: "deleted", id: "integrators/leapfrog" });
  expect(await again.resolveNote("nowhere/at-all")).toMatchObject({ state: "unknown" });
});

test("a note with the same file name elsewhere is offered for an id that never was", async () => {
  const { engine } = await open();
  expect((await engine.resolveNote("old/gravity")).like).toEqual(["physics/gravity"]);
});

test("an agent reading, outlining or editing a note by its old path reaches it, and is told where it is", async () => {
  const { engine } = await open();
  await engine.moveNote("physics/gravity", "forces/gravity", hashText(FORCE));
  const read = (await engine.agentLook({ agent: "a", session: "s", tool: "read_note", args: { id: "/physics/gravity.md" } })).text;
  expect(read.split("\n")[0]).toBe("(/physics/gravity.md moved to /forces/gravity.md)");
  expect(read).toContain("Every pair of bodies attracts.");
  expect((await engine.agentLook({ agent: "a", session: "s", tool: "outline_note", args: { id: "physics/gravity" } })).text).toContain("moved to /forces/gravity.md");
  const edited = (await engine.agentLook({ agent: "a", session: "s", tool: "edit_note", args: { note: "physics/gravity", oldString: "attracts", newString: "attracts every other" } })).text;
  expect(edited).toContain("moved to /forces/gravity.md");
  expect((await engine.readNote("forces/gravity")).text).toContain("attracts every other");
  expect((await engine.notes()).notes.map((n) => n.id)).not.toContain("physics/gravity");
});
