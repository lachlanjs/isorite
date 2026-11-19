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

// ------------------------------------------------------------ changing a lens, each lens's hidden list, search in a lens

test("a lens is made and changed through the engine: each change journalled under who made it, and the revision moves", async () => {
  const { engine, own } = await open("");
  const events: string[] = [];
  engine.events((e) => events.push(e.type));
  const before = await engine.revision();
  expect(await engine.editLens("plan", { action: "create", title: "Learning" })).toEqual({ name: "plan", said: "Made the lens plan." });
  expect(await engine.revision()).not.toBe(before);
  expect(events).toContain("lenses");
  await engine.editLens("plan", { action: "add_island", island: "goal", title: "A goal", match: ["path:/a/**"] }, "agent:claude", "make me a learning plan");
  await engine.editLens("plan", { action: "add_notes", island: "goal", notes: ["/c/four.md", "b/two"] });
  expect((await engine.lens("plan")).islands[0]!.notes).toEqual(["c/four", "b/two", "a/one", "a/three"]);
  expect(own.files.get("lenses/plan.toml")).toContain('notes = ["/c/four.md", "/b/two.md"]');
  const journal = await engine.journal("@lens/plan");
  expect(journal.map((e) => e.kind === "change" && [e.who, e.asked ?? null])).toEqual([["you", null], ["agent:claude", "make me a learning plan"], ["you", null]]);
  await expect(engine.editLens("plan", { action: "add_notes", island: "goal", notes: ["/no/such.md"] })).rejects.toMatchObject({ status: 404 });
  await expect(engine.editLens("plan", { action: "create" })).rejects.toMatchObject({ status: 409 });
  await expect(engine.editLens("Bad Name", { action: "create" })).rejects.toMatchObject({ status: 400 });
  await expect(engine.editLens("folders", { action: "create" })).rejects.toMatchObject({ status: 400 });
  await expect(engine.editLens("nope", { action: "title", title: "x" })).rejects.toMatchObject({ status: 404 });
  // Renamed, its journal goes with it; removed, the journal keeps what it was.
  expect((await engine.editLens("plan", { action: "rename", to: "study" })).name).toBe("study");
  expect(own.files.has("lenses/plan.toml")).toBe(false);
  expect((await engine.lenses()).map((l) => l.name)).toEqual(["study"]);
  expect((await engine.journal("@lens/study")).length).toBe(3);
  await engine.editLens("study", { action: "delete" });
  expect(await engine.lenses()).toEqual([]);
  expect((await engine.journal("@lens/study")).at(-1)).toMatchObject({ kind: "change" });
});

test("each lens has its own hidden list, or the base's: a note hidden in one lens is shown in another", async () => {
  const { engine, own } = await open();
  own.files.set("lenses/other.toml", `title = "Other"\n[[islands]]\nname = "All"\nmatch = ["path:/**"]\n`);
  await engine.setHidden(["c"]);
  // Both lenses keep the base's list until one has its own.
  expect(await engine.hidden("other")).toEqual({ ids: ["c"], own: false });
  expect((await engine.lens("other")).hiddenItems).toEqual(["c/four"]);
  await engine.setHidden(["a/one"], "path");
  expect(await engine.hidden("path")).toEqual({ ids: ["a/one"], own: true });
  expect(own.files.get("lenses/path.toml")).toContain('hidden = ["a/one"]');
  const path = await engine.lens("path");
  expect(path.islands[0]!.notes).toEqual(["b/two"]);
  expect(path.elsewhere).toEqual(["c/four"]);
  expect((await engine.lens("other")).islands[0]!.notes).toContain("a/one");
  // The base's own list is unchanged, and changing it moves only the lenses that keep it.
  expect(await engine.hidden()).toEqual({ ids: ["c"] });
  await engine.editLens("other", { action: "unhide", ids: ["c"] });
  expect(await engine.hidden("other")).toEqual({ ids: [], own: true });
  expect((await engine.lens("other")).islands[0]!.notes).toContain("c/four");
});

test("search narrows to a lens (what its islands show, not Elsewhere or the hidden), to an island, or widens to every note; each hit says where it is", async () => {
  const { engine } = await open();
  await engine.setHidden(["a/three"], "path");
  const ids = (hits: { id: string }[]) => hits.map((h) => h.id).sort();
  expect(ids(await engine.search("body"))).toEqual(["a/one", "a/three", "b/two", "c/four"]);
  expect(ids(await engine.search("body", { lens: "path" }))).toEqual(["a/one", "b/two"]);
  expect(ids(await engine.search("body", { lens: "path", island: "Step one" }))).toEqual(["a/one", "b/two"]);
  expect(ids(await engine.search("body", { lens: "path", island: "Elsewhere" }))).toEqual(["c/four"]);
  const all = await engine.search("body", { lens: "path", all: true });
  expect(ids(all)).toEqual(["a/one", "a/three", "b/two", "c/four"]);
  expect(all.find((h) => h.id === "a/three")).toMatchObject({ hidden: true });
  expect(all.find((h) => h.id === "a/one")).toMatchObject({ lenses: [{ lens: "path", island: "Start" }] });
  expect(all.find((h) => h.id === "c/four")!.lenses).toBeUndefined();
  expect((await engine.find("body", { lens: "path" })).hits.map((h) => h.id).sort()).toEqual(["a/one", "b/two"]);
  await expect(engine.search("body", { lens: "nope" })).rejects.toMatchObject({ status: 404 });
  await expect(engine.search("body", { lens: "path", island: "Nowhere" })).rejects.toMatchObject({ status: 404 });
});

test("an agent's search says where each note is at home in the lenses, briefly; with no lens nothing is added", async () => {
  const { engine } = await open();
  const found = (await engine.agentLook({ agent: "a", session: "s", tool: "search_notes", args: { query: "one" } })).text;
  expect(found.split("\n")[0]).toBe("- One (/a/one.md), Concept [path: Start]");
  const inLens = (await engine.agentLook({ agent: "a", session: "s", tool: "search_notes", args: { query: "body", lens: "path" } })).text;
  expect(inLens).not.toContain("/c/four.md");
  const bare = await open("");
  expect((await bare.engine.agentLook({ agent: "a", session: "s", tool: "search_notes", args: { query: "one" } })).text.split("\n")[0]).toBe("- One (/a/one.md), Concept");
});

test("an agent changes a lens with edit_lens, under its name and what it was asked; read_lens gives names and the hidden list; refused where agents may not write", async () => {
  const { engine, own } = await open("");
  expect((await engine.agentTools()).map((t) => t.function.name)).toContain("edit_lens");
  const call = (args: Record<string, unknown>) => engine.agentLook({ agent: "pi", session: "s", tool: "edit_lens", args, asked: "teach me" });
  expect((await call({ lens: "plan", action: "create", title: "Learning" })).text).toBe("Made the lens plan.");
  expect((await call({ lens: "plan", action: "add_island", island: "entropy", title: "Entropy", match: ["path:/a/**"] })).text).toBe("Added the island entropy.");
  expect((await call({ lens: "plan", action: "hide", notes: ["/a/three.md"] })).text).toBe("Hidden in this lens: 1.");
  expect((await engine.journal("@lens/plan")).at(-1)).toMatchObject({ who: "agent:pi", asked: "teach me" });
  const read = (await engine.agentLook({ agent: "pi", session: "s", tool: "read_lens", args: { name: "plan" } })).text;
  expect(read).toContain("## Entropy (entropy)\n- One (/a/one.md)");
  expect(read).not.toContain("/a/three.md)");
  expect(read).toContain("Hidden in this lens: /a/three");
  await expect(call({ lens: "plan", action: "fly" })).rejects.toThrow(/no action fly/);
  await expect(call({ lens: "plan", action: "add_notes", island: "entropy" })).resolves.toMatchObject({ text: expect.stringContaining("Nothing new") });
  await engine.setAgentNotes(false);
  await expect(call({ lens: "plan", action: "remove_island", island: "entropy" })).rejects.toMatchObject({ status: 403 });
  expect(own.files.get("lenses/plan.toml")).toContain('name = "entropy"');
});

test("the learning lens, made, hides /learning/ from the base and every lens with a list of its own, and shows it itself", async () => {
  const { engine, notes, own } = await open();
  notes.files.set("learning/entropy/ledger.md", note("Ledger"));
  await engine.reload();
  own.files.set("lenses/mine.toml", `hidden = ["c"]\n[[islands]]\nname = "All"\nmatch = ["path:/**"]\n`);
  await engine.agentLook({ agent: "pi", session: "s", tool: "edit_lens", args: { lens: "learning", action: "create" }, asked: "teach me" });
  await engine.agentLook({ agent: "pi", session: "s", tool: "edit_lens", args: { lens: "learning", action: "add_island", island: "entropy", notes: ["path:/learning/entropy/**"] }, asked: "teach me" });
  expect((await engine.hidden()).ids).toEqual(["learning"]);
  expect(await engine.hidden("learning")).toEqual({ ids: [], own: true });
  expect((await engine.hidden("mine")).ids).toEqual(["c", "learning"]);
  expect((await engine.hidden("path")).ids).toEqual(["learning"]);
  expect((await engine.lens("learning")).islands[0]!.notes).toEqual(["learning/entropy/ledger"]);
  expect((await engine.search("ledger")).map((h) => [h.id, h.hidden])).toEqual([["learning/entropy/ledger", true]]);
  expect((await engine.search("ledger", { lens: "path" })).length).toBe(0);
  expect((await engine.search("ledger", { lens: "learning" })).map((h) => h.id)).toEqual(["learning/entropy/ledger"]);
  const agent = (args: Record<string, unknown>, tool = "search_notes") => engine.agentLook({ agent: "pi", session: "s", tool, args });
  expect((await agent({ query: "ledger", lens: "learning" })).text).toContain("/learning/entropy/ledger.md), Concept [learning: entropy]");
  expect((await agent({ query: "ledger" })).text).toContain("Concept [hidden; learning: entropy]");
  expect((await agent({ id: "learning/entropy/ledger" }, "read_note")).text).toContain("Ledger body.");
  expect((await engine.journal("@lens/learning"))[0]).toMatchObject({ who: "agent:pi", asked: "teach me" });
});
