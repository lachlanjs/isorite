import { expect, test } from "vitest";
import { Engine, MemoryFiles, type EngineEvent } from "@isorite/engine";
import { finderTurn, NOT_A_MODEL } from "../src/index.ts";
import { loadGuide } from "../src/node.ts";

// The finder stands in for an agent on the public site (M16, an agent's turn since M25): it looks through the
// engine as any agent does over isorite's MCP, so its steps are on the Atlas.
async function guide() {
  const engine = await Engine.open({ notes: new MemoryFiles(loadGuide()), own: new MemoryFiles(), clock: { now: () => Date.now() }, device: "guide1", name: "isorite guide" });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  return { engine, events };
}

test("a question about attaching an agent finds the note on it, reads it, and says it is no model on the first turn alone", async () => {
  const { engine, events } = await guide();
  const first = await finderTurn(engine, "s1", "how do I attach my own agent?", { first: true });
  expect(first.calls.map((c) => c.tool)).toEqual(["search_notes", "read_note"]);
  expect(first.reply).toContain(NOT_A_MODEL);
  expect(first.reply).toMatch(/The note that answers it best is \[[^\]]+\]\(\/[a-z-/]+\.md\)/);
  // Its look-ups are an agent's turn on the Atlas.
  expect(events.map((e) => e.type)).toEqual(["agent-start", "agent-step", "agent-step", "agent-done"]);
  const next = await finderTurn(engine, "s1", "how do I mark a problem solved?");
  expect(next.reply).not.toContain(NOT_A_MODEL);
  expect(next.reply).toMatch(/\]\(\/[a-z-/]+\.md\)/);
});

test("nothing found is said plainly", async () => {
  const { engine } = await guide();
  expect((await finderTurn(engine, "s1", "zzqx")).reply).toContain("Nothing in the guide matches that");
});

test("a concept answers, and the problem that practises it is named as the thing to try", async () => {
  const { engine } = await guide();
  const { reply } = await finderTurn(engine, "s1", "how do I mark a problem solved?");
  expect(reply).toMatch(/The note that answers it best is \[[^\]]+\]/);
  expect(reply).toMatch(/To try it: \[[^\]]+\]\(\/[a-z-/]+\.md\)\./);
});
