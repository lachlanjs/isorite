// Lenses in the engine: served per revision, followed through a move, and read by an agent.

import { expect, test } from "vitest";
import { hashText } from "@isorite/core";
import { Engine, MemoryFiles } from "../src/index.ts";

const note = (title: string, extra = "") => `---\ntype: Concept\ntitle: ${title}\n${extra}---\n\n${title} body.\n`;
const LENS = `title = "Path"\n[[islands]]\nname = "Start"\ntitle = "Step one"\nnotes = ["/b/two.md", "/a/one.md"]\n[[islands]]\nname = "Rest"\nmatch = ["path:/a/**"]\n`;

async function open(lens = LENS) {
  const notes = new MemoryFiles({ "a/one.md": note("One"), "a/three.md": note("Three"), "b/two.md": note("Two"), "c/four.md": note("Four") });
  const own = new MemoryFiles(lens ? { "lenses/path.toml": lens } : {});
  const clock = { now: () => Date.parse("2026-11-11T09:00:00Z") };
  return { engine: await Engine.open({ notes, own, clock, device: "d", name: "base" }), notes, own };
}

test("a lens is served resolved, and the revision moves when its file changes, even outside isorite", async () => {
  const { engine, own } = await open();
  expect(await engine.lenses()).toEqual([{ name: "path", title: "Path", islands: 2, problems: 0 }]);
  const lens = await engine.lens("path");
  expect(lens.islands.map((i) => [i.title, i.notes])).toEqual([["Step one", ["b/two", "a/one"]], ["Rest", ["a/three"]]]);
  expect(lens.elsewhere).toEqual(["c/four"]);
  const before = await engine.revision();
  expect(await engine.revision()).toBe(before);
  own.files.set("lenses/path.toml", LENS.replace("Rest", "Remainder"));
  expect(await engine.revision()).not.toBe(before);
  expect((await engine.lens("path")).islands[1]!.name).toBe("Remainder");
  await expect(engine.lens("nope")).rejects.toMatchObject({ status: 404 });
});

test("a note moved, or a folder, is followed in the lens file", async () => {
  const { engine, own } = await open();
  const text = (await engine.readNote("b/two")).text;
  await engine.moveNote("b/two", "z/second", hashText(text));
  expect(own.files.get("lenses/path.toml")).toContain('"/z/second.md", "/a/one.md"');
  await engine.moveFolder("a", "alpha");
  const now = own.files.get("lenses/path.toml")!;
  expect(now).toContain('"/alpha/one.md"');
  expect(now).toContain('"path:/alpha/**"');
  expect((await engine.lens("path")).problems).toEqual([]);
});

test("an agent is offered read_lens only where there are lenses, and search takes the lens and island", async () => {
  const { engine } = await open();
  const names = (await engine.agentTools()).map((t) => t.function.name);
  expect(names).toContain("read_lens");
  const brief = (await engine.agentLook({ agent: "a", session: "s", tool: "brief_base", args: {} })).text;
  expect(brief).toContain("Lenses (");
  expect(brief).toContain("path (Path)");
  const read = (await engine.agentLook({ agent: "a", session: "s", tool: "read_lens", args: { name: "path" } })).text;
  expect(read.indexOf("(/b/two.md)")).toBeLessThan(read.indexOf("(/a/one.md)"));
  expect(read).toContain("## Step one");
  expect(read).toContain("## Elsewhere");
  expect((await engine.agentLook({ agent: "a", session: "s", tool: "read_lens", args: {} })).text).toContain("- path (Path): 2 islands");
  const found = (await engine.agentLook({ agent: "a", session: "s", tool: "search_notes", args: { query: "body", lens: "path", island: "Step one" } })).text;
  expect(found).toContain("/a/one.md");
  expect(found).toContain("/b/two.md");
  expect(found).not.toContain("/a/three.md");
  expect((await engine.agentLook({ agent: "a", session: "s", tool: "search_notes", args: { query: "body", lens: "nope" } })).text).toMatch(/no lens nope/);
});

test("with no lens, the tools and the brief are as they were", async () => {
  const { engine } = await open("");
  expect((await engine.agentTools()).map((t) => t.function.name)).not.toContain("read_lens");
  expect((await engine.agentLook({ agent: "a", session: "s", tool: "brief_base", args: {} })).text).not.toContain("Lenses (");
});
