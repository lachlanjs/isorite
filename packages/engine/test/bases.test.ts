// Several bases at once (M20): a base whose server lends it others. An agent looks and writes in any of them with
// `base`, or a note named memory:<id>.

import { expect, test } from "vitest";
import { Engine, MemoryFiles, type EngineEvent } from "../src/index.ts";

const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;

async function open() {
  const clock = { t: Date.parse("2026-10-26T09:00:00Z"), now() { return this.t; } };
  const engines = new Map<string, Engine>();
  let lent = ["memory"];
  const elsewhere = { lent: () => lent.map((name) => ({ name, about: name === "memory" ? "What the agent keeps across projects." : "" })), base: (name: string) => engines.get(name) ?? null };
  const memoryFiles = new MemoryFiles({ "AGENTS.md": "# What the agent keeps across projects.\n", "tools/opencode.md": note("OpenCode's config", "Kept in ~/.config/opencode, with the plugin named there.") });
  const memory = await Engine.open({ notes: memoryFiles, own: new MemoryFiles(), clock, device: "laptop1", name: "memory", elsewhere });
  const projectFiles = new MemoryFiles({ "basics/entropy.md": note("Entropy", "The average surprise.") });
  const own = new MemoryFiles();
  const project = await Engine.open({ notes: projectFiles, own, clock, device: "laptop1", name: "isorite", elsewhere });
  engines.set("memory", memory).set("isorite", project);
  const events = { memory: [] as EngineEvent[], project: [] as EngineEvent[] };
  memory.events((e) => events.memory.push(e));
  project.events((e) => events.project.push(e));
  return { memory, project, memoryFiles, projectFiles, own, events, lend: (names: string[]) => { lent = names; } };
}

test("every tool takes a base; the brief names the bases lent, with a line on each", async () => {
  const { project } = await open();
  const tools = await project.agentTools();
  expect(tools.every((t) => "base" in (t.function.parameters.properties as object))).toBe(true);
  const { text } = await project.agentLook({ agent: "opencode", session: "s1", tool: "brief_base", args: {} });
  expect(text).toContain("isorite: a knowledge base of 1 notes");
  expect(text).toContain("- memory: What the agent keeps across projects.");
  const there = await project.agentLook({ agent: "opencode", session: "s1", tool: "brief_base", args: { base: "memory" } });
  expect(there.text).toContain("memory: a knowledge base of 1 notes");
  expect(there.text).toContain("(From the base memory:");
});

test("an agent's look in a lent base is drawn on that base's Atlas, and ends with its turn here", async () => {
  const { project, events } = await open();
  await project.agentStatus("opencode", "s1", true);
  const found = await project.agentLook({ agent: "opencode", session: "s1", tool: "search_notes", args: { query: "opencode config", base: "memory" } });
  expect(found.text).toContain("OpenCode's config (/tools/opencode.md)");
  const read = await project.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "memory:tools/opencode" } });
  expect(read.text).toContain("Kept in ~/.config/opencode");
  await project.agentStatus("opencode", "s1", false);
  expect(events.memory.map((e) => e.type)).toEqual(["agent-start", "agent-step", "agent-step", "agent-done"]);
  expect(events.memory.flatMap((e) => (e.type === "agent-step" ? [e.step.opened] : []))).toEqual([undefined, "tools/opencode"]);
  expect(events.project.map((e) => e.type)).toEqual(["agent-start", "agent-done"]);
});

test("an agent writes in a lent base under its name, as in its own", async () => {
  const { project, memoryFiles, projectFiles } = await open();
  const made = await project.agentLook({ agent: "opencode", session: "s1", tool: "write_note", args: { base: "memory", note: "you/prefers-they", content: note("They/them", "Use they/them for Lachlan.") }, asked: "remember this" });
  expect(made.text).toContain("Made They/them");
  expect(memoryFiles.files.get("you/prefers-they.md")).toContain("Use they/them");
  expect(projectFiles.files.has("you/prefers-they.md")).toBe(false);
  await project.agentLook({ agent: "opencode", session: "s1", tool: "edit_note", args: { note: "memory:you/prefers-they", oldString: "Use", newString: "Always use" } });
  expect(memoryFiles.files.get("you/prefers-they.md")).toContain("Always use they/them");
});

test("a base not lent is refused, in words the agent can act on; its own name is this base", async () => {
  const { project, lend } = await open();
  await expect(project.agentLook({ agent: "opencode", session: "s1", tool: "search_notes", args: { query: "x", base: "work" } })).rejects.toThrow(/no base work lent here: the bases are memory/);
  lend([]);
  await expect(project.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "memory:tools/opencode" } })).rejects.toThrow(/no base memory lent here: leave base out/);
  const own = await project.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "basics/entropy", base: "isorite" } });
  expect(own.text).toContain("The average surprise");
});

test("a link to the global base is on the map, broken where the global base has no such note; the skills base says what it is", async () => {
  const clock = { t: Date.parse("2026-11-11T09:00:00Z"), now() { return this.t; } };
  const engines = new Map<string, Engine>();
  const elsewhere = { lent: () => [], base: (name: string) => engines.get(name) ?? null };
  const global = await Engine.open({ notes: new MemoryFiles({ "conventions/naming.md": note("Naming", "Name things.") }), own: new MemoryFiles(), clock, device: "laptop1", name: "global", special: "global", elsewhere });
  const skills = await Engine.open({ notes: new MemoryFiles(), own: new MemoryFiles(), clock, device: "laptop1", name: "skills", special: "skills", elsewhere });
  const project = await Engine.open({ notes: new MemoryFiles({ "a.md": note("A", "[n](global:conventions/naming.md) and [g](global:nothing.md).") }), own: new MemoryFiles(), clock, device: "laptop1", name: "isorite", elsewhere });
  engines.set("global", global).set("skills", skills).set("isorite", project);
  expect((await global.session()).special).toBe("global");
  expect((await project.session()).special).toBeUndefined();
  expect(await skills.about()).toMatch(/^The skills you can load/);
  const links = (await project.map()).notes.a!.links!;
  expect(links).toEqual([
    { kind: "global", href: "global:conventions/naming.md", text: "n" },
    { kind: "global", href: "global:nothing.md", text: "g", broken: true },
  ]);
  // Renaming a note of the global base changes links to it in the global base only: a base's own note is left as it is.
  await global.createNote("conventions/uses", note("Uses", "[naming](/conventions/naming.md)"));
  await global.moveNote("conventions/naming", "conventions/names", (await global.readNote("conventions/naming")).version);
  expect((await global.readNote("conventions/uses")).text).toContain("(/conventions/names.md)");
  expect((await project.readNote("a")).text).toContain("global:conventions/naming.md");
});
