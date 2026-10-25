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
  expect(await engine.brokenNews("iso")).toEqual([{ id: "sim/step", title: "The step", href: "code:src/old.py" }]);
  expect(await engine.brokenNews("iso")).toEqual([]);
  expect(await engine.brokenNews("agent")).toHaveLength(1);
  // Put back, it mends at the next look (the repository changes outside isorite).
  await repo.write("src/old.py", "");
  clock.t += 11_000;
  expect((await engine.map()).notes["sim/step"]!.links![1]).not.toHaveProperty("broken");
});
