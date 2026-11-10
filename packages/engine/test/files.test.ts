// Code in the notes (docs/files.md): what the walk leaves out, and what the map and a file's answer say of the rest.

import { expect, test } from "vitest";
import { Engine, MemoryFiles } from "../src/index.ts";

const NOTE = "---\ntype: Concept\ntitle: Step\n---\n\nThe loop is [here](/sim/step.py).\n";

async function open(files: Record<string, string> = {}) {
  const notes = new MemoryFiles({ "sim/step.md": NOTE, ...files });
  return Engine.open({ notes, own: new MemoryFiles(), clock: { now: () => 0 }, device: "laptop1", name: "sim" });
}

test("code files are items in the map, of the kind code, and are given as text", async () => {
  const engine = await open({ "sim/step.py": "def step():\n    pass\n", "tools/run.sh": "echo hi\n" });
  const map = await engine.map();
  expect(map.files).toMatchObject({ "sim/step.py": { kind: "code", title: "step.py" }, "tools/run.sh": { kind: "code" } });
  const got = await engine.file("sim/step.py");
  expect(got?.type).toBe("text/plain");
  expect(new TextDecoder().decode(got!.bytes)).toBe("def step():\n    pass\n");
});

test("node_modules, caches and what the top .gitignore names are not files of the base; a note never is left out", async () => {
  const engine = await open({
    ".gitignore": "*.log\nbuild/\n*.md\n",
    "node_modules/x/index.js": "1", "tools/__pycache__/a.py": "1", "run.log": "x", "build/out.js": "x", "keep.js": "x",
    "sim/other.md": "---\ntype: Concept\ntitle: Other\n---\n\nStill a note.\n",
  });
  const map = await engine.map();
  expect(Object.keys(map.files ?? {})).toEqual(["keep.js"]);
  expect(map.notes["sim/other"]?.title).toBe("Other");
});

test("a file over the limit is not an item", async () => {
  const notes = new MemoryFiles({ "a.md": "---\ntype: Concept\ntitle: A\n---\n\nx\n" });
  await notes.writeBytes("big.bin", new Uint8Array(20_000_001));
  await notes.writeBytes("small.bin", new Uint8Array(10));
  const engine = await Engine.open({ notes, own: new MemoryFiles(), clock: { now: () => 0 }, device: "laptop1", name: "x" });
  expect(Object.keys((await engine.map()).files ?? {})).toEqual(["small.bin"]);
});

test("code files are in no search result", async () => {
  const engine = await open({ "sim/step.py": "def uniquewordzzz():\n    pass\n" });
  expect((await engine.search("uniquewordzzz")).length).toBe(0);
});
