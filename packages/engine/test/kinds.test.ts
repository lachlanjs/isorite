// Open questions and problems in the engine (M12): resolved and solved by you alone, on the map, and followed when
// a note they name moves.

import { expect, test } from "vitest";
import { splitFrontmatter } from "@isorite/core";
import { Engine, EngineError, MemoryFiles } from "../src/index.ts";

const GB = "---\ntype: Concept\ntitle: Gauss–Bonnet theorem\n---\n\nTotal curvature is 2πχ.\n\n**Compact:**\n\n[[!where-is-compactness-used]]\n";
const Q = "---\ntype: Question\ntitle: Where is compactness used?\nabout: [global/euler]\n---\n\nThe proof never says.\n";
const P = "---\ntype: Problem\ntitle: Angles of a geodesic triangle\nuses: [global/gauss-bonnet, global/euler]\n---\n\nShow it.\n";
const EULER = "---\ntype: Concept\ntitle: Euler characteristic\n---\n\nχ = V − E + F.\n";

async function open() {
  const clock = { t: Date.parse("2026-10-25T09:00:00Z"), now() { return this.t; } };
  const notes = new MemoryFiles({ "global/gauss-bonnet.md": GB, "global/where-is-compactness-used.md": Q, "global/angles.md": P, "global/euler.md": EULER });
  const engine = await Engine.open({ notes, own: new MemoryFiles(), clock, device: "laptop1", name: "dg" });
  return { engine, notes };
}
const meta = (text: string | undefined) => splitFrontmatter(text ?? "")[0];

test("a question is resolved today by you, and opened again; a note is neither", async () => {
  const { engine, notes } = await open();
  const { version } = await engine.readNote("global/where-is-compactness-used");
  const done = await engine.setDone("global/where-is-compactness-used", true, version);
  expect(meta(notes.files.get("global/where-is-compactness-used.md"))).toMatchObject({ resolved: "2026-10-25" });
  expect((await engine.map()).notes["global/where-is-compactness-used"]).toMatchObject({ done: "2026-10-25" });
  await engine.setDone("global/where-is-compactness-used", false, done.version);
  expect(meta(notes.files.get("global/where-is-compactness-used.md"))).not.toHaveProperty("resolved");
  expect((await engine.journal("global/where-is-compactness-used")).at(-1)).toMatchObject({ who: "you" });
  await expect(engine.setDone("global/euler", true, (await engine.readNote("global/euler")).version)).rejects.toBeInstanceOf(EngineError);
});

test("a change by Iso or an agent never resolves or solves: the field stays as it was", async () => {
  const { engine, notes } = await open();
  const said = await engine.agentWrite({ agent: "opencode", session: "s1", note: "global/angles", asked: "mark it solved", edit: { content: P.replace("uses:", "solved: 2026-10-25\nuses:").replace("Show it.", "Show it. Done.") } });
  expect(said.text).toBeTruthy();
  const after = notes.files.get("global/angles.md")!;
  expect(after).toContain("Show it. Done.");
  expect(meta(after)).not.toHaveProperty("solved");
});

test("a note moved: the questions and problems that name it, and the embeds of it, follow", async () => {
  const { engine, notes } = await open();
  await engine.moveNote("global/euler", "topology/euler", (await engine.readNote("global/euler")).version);
  expect(meta(notes.files.get("global/where-is-compactness-used.md"))).toMatchObject({ about: ["topology/euler"] });
  expect(meta(notes.files.get("global/angles.md"))).toMatchObject({ uses: ["global/gauss-bonnet", "topology/euler"] });
  // An embed by name still finds it when the name is unchanged; renamed, it is written anew.
  await engine.moveNote("global/where-is-compactness-used", "global/compactness", (await engine.readNote("global/where-is-compactness-used")).version);
  expect(notes.files.get("global/gauss-bonnet.md")).toContain("\n[[!compactness]]\n");
  expect(engine.bundle.concepts.get("global/compactness")!.attached).toEqual(["topology/euler", "global/gauss-bonnet"]);
});

test("code links point into the repository the notes are in, unless the settings name another; the name kept beside what else the settings hold", async () => {
  const clock = { t: Date.parse("2026-10-25T09:00:00Z"), now() { return this.t; } };
  const repo = new MemoryFiles({ "src/sim.py": "def step(): pass\n" });
  const notes = new MemoryFiles({ "sim/step.md": "---\ntype: Concept\ntitle: The step\n---\n\nIn [gone](code:src/old.py).\n" });
  const found = await Engine.open({ notes, own: new MemoryFiles(), clock, device: "laptop1", name: "nbody", foundRepository: "..", repository: (p) => (p === ".." ? repo : null) });
  expect((await found.notes()).notes.find((n) => n.id === "sim/step")).toMatchObject({ broken: ["code:src/old.py"] });
  expect(await found.nameRepository("../elsewhere")).toBe(false);

  const own = new MemoryFiles();
  const outside = await Engine.open({ notes, own, clock, device: "laptop1", name: "nbody" });
  await outside.setAgentNotes(false);
  expect(await outside.nameRepository("../code")).toBe(true);
  expect((await outside.settingsOfBase())).toEqual({ agents_write_notes: false, repository: "../code" });
  await outside.setAgentNotes(true);
  expect((await outside.settingsOfBase())).toEqual({ repository: "../code" });
});

test("code links point into the repository named in the settings: a missing file is broken, and Iso is told once", async () => {
  const clock = { t: Date.parse("2026-10-25T09:00:00Z"), now() { return this.t; } };
  const repo = new MemoryFiles({ "src/sim.py": "def step(): pass\n" });
  const notes = new MemoryFiles({ "sim/step.md": "---\ntype: Concept\ntitle: The step\n---\n\nIn [the code](code:src/sim.py#L1), and [gone](code:src/old.py); see [the paper](https://arxiv.org/abs/1).\n" });
  const engine = await Engine.open({ notes, own: new MemoryFiles(), clock, device: "laptop1", name: "nbody", repository: (p) => (p === "../code" ? repo : null) });
  // No repository named: nothing is broken.
  expect((await engine.map()).notes["sim/step"]!.links).toEqual([
    { kind: "code", href: "code:src/sim.py#L1", text: "the code" },
    { kind: "code", href: "code:src/old.py", text: "gone" },
    { kind: "web", href: "https://arxiv.org/abs/1", text: "the paper" },
  ]);
  expect(await engine.nameRepository("../code")).toBe(true);
  expect(await engine.nameRepository("../elsewhere")).toBe(false);
  expect((await engine.map()).notes["sim/step"]!.links![1]).toEqual({ kind: "code", href: "code:src/old.py", text: "gone", broken: true });
  expect((await engine.notes()).notes.find((n) => n.id === "sim/step")).toMatchObject({ broken: ["code:src/old.py"] });
  expect(await engine.brokenNews()).toEqual([{ id: "sim/step", title: "The step", href: "code:src/old.py" }]);
  expect(await engine.brokenNews()).toEqual([]);
  // Put back, it mends at the next look (the repository changes outside isorite).
  await repo.write("src/old.py", "");
  clock.t += 11_000;
  expect((await engine.map()).notes["sim/step"]!.links![1]).not.toHaveProperty("broken");
});

test("an empty folder is made, listed, and refused where a note is or the path is bad (M31)", async () => {
  const { engine, notes } = await open();
  await engine.makeFolder("/topology/surfaces/");
  expect((await engine.notes()).dirs).toEqual(expect.arrayContaining(["topology", "topology/surfaces"]));
  expect(await notes.list("topology")).toEqual([{ name: "surfaces", dir: true }]);
  // A note moved into it lands there, links followed.
  await engine.moveNote("global/euler", "topology/surfaces/euler", (await engine.readNote("global/euler")).version);
  expect((await engine.notes()).notes.find((n) => n.id === "topology/surfaces/euler")).toMatchObject({ dir: "topology/surfaces" });
  await expect(engine.makeFolder("topology/surfaces/euler")).rejects.toMatchObject({ status: 409 });
  for (const bad of ["", "../x", "a//b", ".hidden", "@understanding"]) await expect(engine.makeFolder(bad)).rejects.toBeInstanceOf(EngineError);
});

test("an empty folder is deleted, and one that holds a note is refused", async () => {
  const { engine } = await open();
  await engine.makeFolder("scratch/inner");
  await engine.makeFolder("held");
  await engine.moveNote("global/euler", "held/euler", (await engine.readNote("global/euler")).version);
  await expect(engine.deleteFolder("held")).rejects.toMatchObject({ status: 409 });
  await engine.deleteFolder("scratch");
  expect((await engine.notes()).dirs).not.toContain("scratch");
  expect((await engine.notes()).dirs).not.toContain("scratch/inner");
  await expect(engine.deleteFolder("scratch")).rejects.toMatchObject({ status: 404 });
  for (const bad of ["", "../x", "@understanding"]) await expect(engine.deleteFolder(bad)).rejects.toBeInstanceOf(EngineError);
});

test("a folder is moved with its notes, and refused into itself or onto a note", async () => {
  const { engine } = await open();
  await engine.makeFolder("a/empty");
  await engine.moveNote("global/euler", "a/euler", (await engine.readNote("global/euler")).version);
  await expect(engine.moveFolder("a", "a/b")).rejects.toBeInstanceOf(EngineError);
  await engine.moveFolder("a", "z/a");
  const listed = await engine.notes();
  expect(listed.notes.find((n) => n.id === "z/a/euler")).toBeTruthy();
  expect(listed.dirs).toEqual(expect.arrayContaining(["z/a", "z/a/empty"]));
  expect(listed.dirs).not.toContain("a");
  await expect(engine.moveFolder("a", "q")).rejects.toMatchObject({ status: 404 });
});

test("a folder holding pictures is moved with them, and the links to them follow", async () => {
  const { engine, notes } = await open();
  await engine.makeFolder("a");
  await engine.savePicture("a/fig.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  await engine.moveNote("global/euler", "a/euler", (await engine.readNote("global/euler")).version);
  const v = await engine.readNote("a/euler");
  await engine.saveNote("a/euler", { base: v.version, text: `${v.text}\n![fig](/a/fig.png)\n` });
  await engine.moveFolder("a", "z/a");
  expect(await notes.readBytes("z/a/fig.png")).not.toBeNull();
  expect(await notes.readBytes("a/fig.png")).toBeNull();
  expect(notes.files.get("z/a/euler.md")).toContain("](/z/a/fig.png)");
  expect((await engine.notes()).dirs).not.toContain("a");
});

test("what is hidden is kept in the base's settings, tidied, and the other settings are left alone", async () => {
  const { engine } = await open();
  expect(await engine.hidden()).toEqual({ ids: [] });
  await engine.setAgentNotes(false);
  await engine.setHidden(["/global/euler/", "global", "global/euler", ""]);
  expect(await engine.hidden()).toEqual({ ids: ["global", "global/euler"] });
  expect(await engine.agentNotes()).toEqual({ may: false });
  await engine.setHidden([]);
  expect(await engine.hidden()).toEqual({ ids: [] });
  expect(await engine.agentNotes()).toEqual({ may: false });
});

test("find joins the words and the meaning: both first, then words, then meaning", async () => {
  const notes = new MemoryFiles({ "global/gauss-bonnet.md": GB, "global/euler.md": EULER, "global/angles.md": P });
  const similar = async () => ({ ready: true, hits: [
    { note: "global/euler", heading: "Euler", body: "", score: 0.6 },
    { note: "global/angles", heading: "Angles", body: "", score: 0.55 },
    { note: "global/gauss-bonnet", heading: "GB", body: "", score: 0.1 },
  ] });
  const engine = await Engine.open({ notes, own: new MemoryFiles(), clock: { now: () => 0 }, device: "d", name: "dg", similar });
  const found = await engine.find("euler characteristic");
  expect(found.meaning).toBe("on");
  expect(found.hits.map((h) => [h.id, h.by])).toEqual([["global/euler", "both"], ["global/angles", "meaning"]]);
  expect((await engine.find("")).hits).toEqual([]);
});

test("what is hidden is one id a line in its own file, merged by lines in git; the old place in the settings is moved out", async () => {
  const own = new MemoryFiles({ "settings.toml": "repository = \"../code\"\nhidden = [ \"old/one\" ]\n", ".gitattributes": "*.jsonl merge=union\n" });
  const engine = await Engine.open({ notes: new MemoryFiles({ "global/euler.md": EULER }), own, clock: { now: () => 0 }, device: "d", name: "dg" });
  expect((await engine.hidden()).ids).toEqual(["old/one"]);
  await engine.setHidden(["old/one", "global/euler"]);
  expect(own.files.get("hidden.txt")).toBe("global/euler\nold/one\n");
  expect(own.files.get("settings.toml")).not.toContain("hidden");
  expect(own.files.get("settings.toml")).toContain("repository");
  expect(own.files.get(".gitattributes")).toBe("*.jsonl merge=union\nhidden.txt merge=union\n");
  // Lines git left as markers are not ids.
  own.files.set("hidden.txt", "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> theirs\n");
  expect((await engine.hidden()).ids).toEqual(["a", "b"]);
});

test("a note git left in conflict is listed and mapped as one; a note that shows the markers in a code block is not", async () => {
  const conflict = "---\ntype: Concept\ntitle: Torn\n<<<<<<< HEAD\ntags: [a]\n=======\ntags: [b]\n>>>>>>> theirs\n---\n\nText.\n";
  const shows = "---\ntype: Concept\ntitle: Shows\n---\n\nGit writes:\n\n```\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n```\n";
  const engine = await Engine.open({ notes: new MemoryFiles({ "torn.md": conflict, "shows.md": shows, "global/euler.md": EULER }), own: new MemoryFiles(), clock: { now: () => 0 }, device: "d", name: "dg" });
  const listed = (await engine.notes()).notes;
  expect(listed.find((n) => n.id === "torn")).toMatchObject({ conflicted: true });
  expect(listed.find((n) => n.id === "shows")).not.toHaveProperty("conflicted");
  expect(listed.find((n) => n.id === "global/euler")).not.toHaveProperty("conflicted");
  expect((await engine.map()).notes.torn).toMatchObject({ conflicted: true });
});
