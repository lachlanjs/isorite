import { expect, test } from "vitest";
import { Engine, MemoryFiles } from "@isorite/engine";
import { slimBrief, slimLook, slimResult, slimTools, MAX_NOTE_CHARS } from "../src/pi/slim.ts";

const note = (t: string, body: string) => `---\ntype: Concept\ntitle: ${t}\n---\n\n${body}\n`;
async function open() {
  return Engine.open({ notes: new MemoryFiles({ "a/one.md": note("One", "Body.") }), own: new MemoryFiles(), clock: { now: () => 1 }, device: "d", name: "demo" });
}
const look = (e: Engine) => (tool: string, args: Record<string, unknown>) => e.agentLook({ agent: "x", session: "s", tool, args });

test("brief_base gives the map and the person's instructions; the writing and artifact parts are asked for", async () => {
  const e = await open();
  await e.saveAgents("Write in British English.");
  const whole = (await look(e)("brief_base", {})).text;
  const base = (await slimLook(look(e), "brief_base", {})).text;
  expect(base).toContain("# demo: a knowledge base of 1 notes");
  expect(base).toContain("# Their instructions for this knowledge base (AGENTS.md)\n\nWrite in British English.");
  for (const gone of ["# Their knowledge base", "# Keeping it well", "# Writing and teaching", "# Artifacts"]) expect(base).not.toContain(gone);
  expect(base.length).toBeLessThan(whole.length / 3);
  const writing = (await slimLook(look(e), "brief_base", { part: "writing" })).text;
  expect(writing).toContain("# Their knowledge base");
  expect(writing).toContain("# Writing and teaching");
  expect(writing).not.toContain("# Artifacts");
  expect(writing).not.toContain("AGENTS.md");
  expect((await slimLook(look(e), "brief_base", { part: "artifacts" })).text).toMatch(/^# Artifacts/);
  expect((await slimLook(look(e), "brief_base", { part: "all" })).text).toBe(whole);
});

test("what an agent is told it may not do survives the trimming of the brief", async () => {
  const e = await open();
  await e.setAgentNotes(false);
  expect((await slimLook(look(e), "brief_base", {})).text).toContain("switched off");
});

test("brief_base takes a part, edit and write say it shorter, the rest are as the engine has them", async () => {
  const e = await open(), defs = await e.agentTools(), slim = slimTools(defs);
  expect(slim.map((d) => d.function.name)).toEqual(defs.map((d) => d.function.name));
  const brief = slim[0]!.function.parameters as { properties: Record<string, unknown> };
  expect(Object.keys(brief.properties)).toContain("part");
  expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(defs).length + 200);
  expect(slim.find((d) => d.function.name === "read_note")).toEqual(defs.find((d) => d.function.name === "read_note"));
});

test("a note read whole is cut at a line, with the way to read the rest", () => {
  const long = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
  const cut = slimResult("read_note", {}, long);
  expect(cut.length).toBeLessThan(MAX_NOTE_CHARS + 300);
  expect(cut).toContain("[Cut here:");
  expect(slimResult("read_note", {}, "short")).toBe("short");
  expect(slimResult("read_artifact", {}, long)).toBe(long);
  expect(slimBrief("# x\n\nmap", undefined)).toContain("map");
});
