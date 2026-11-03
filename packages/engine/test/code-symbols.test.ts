// Code links by symbol (M29): the lines a function or class has now, wherever it has moved to.

import { expect, test } from "vitest";
import { Engine, MemoryFiles } from "../src/index.ts";

const BEFORE = "import math\n\ndef leapfrog(x, v, a, dt):\n    v = v + 0.5 * dt * a(x)\n    return x, v\n\n\nclass Body:\n    def step(self, dt):\n        self.x += dt\n";
const AFTER = "# a new header\n# of three\n# lines\nimport math\n\ndef other():\n    pass\n\ndef leapfrog(x, v, a, dt):\n    v = v + 0.5 * dt * a(x)\n    return x, v\n\n\nclass Body:\n    def step(self, dt):\n        self.x += dt\n";

async function open(repo: MemoryFiles | null) {
  const notes = new MemoryFiles({ "sim/step.md": "---\ntype: Concept\ntitle: The step\n---\n\n![the step](code:sim.py#leapfrog)\n\nSee [the body's step](code:sim.py#Body.step) and [gone](code:sim.py#vanished) and [lines](code:sim.py#L1-L2).\n" });
  return Engine.open({ notes, own: new MemoryFiles(), clock: { now: () => 0 }, device: "laptop1", name: "nbody", foundRepository: "..", ...(repo ? { repository: () => repo } : {}) });
}

test("a symbol's lines are found where it is now; the link need not change when the code moves", async () => {
  const repo = new MemoryFiles({ "sim.py": BEFORE });
  const engine = await open(repo);
  expect(await engine.code("code:sim.py#leapfrog")).toMatchObject({ state: "ok", symbol: "leapfrog", start: 3, end: 5, total: 10 });
  expect((await engine.code("code:sim.py#leapfrog") as { text: string }).text).toBe("def leapfrog(x, v, a, dt):\n    v = v + 0.5 * dt * a(x)\n    return x, v");
  expect(await engine.code("code:sim.py#Body.step")).toMatchObject({ state: "ok", start: 9, end: 10 });
  await repo.write("sim.py", AFTER);
  expect(await engine.code("code:sim.py#leapfrog")).toMatchObject({ state: "ok", start: 9, end: 11 });
  expect(await engine.code("code:sim.py#Body.step")).toMatchObject({ state: "ok", start: 15, end: 16 });
});

test("lines, the whole file, and what cannot be shown say why", async () => {
  const repo = new MemoryFiles({ "sim.py": BEFORE, "a.rb": "def f; end\n" });
  const engine = await open(repo);
  expect(await engine.code("code:sim.py#L1-L2")).toMatchObject({ state: "ok", start: 1, end: 2, text: "import math\n" });
  expect(await engine.code("code:sim.py#L9")).toMatchObject({ state: "ok", start: 9, end: 9 });
  expect(await engine.code("code:sim.py")).toMatchObject({ state: "ok", start: 1, end: 10 });
  expect(await engine.code("code:sim.py#nope")).toEqual({ state: "no-symbol", path: "sim.py", symbol: "nope" });
  expect(await engine.code("code:gone.py#f")).toEqual({ state: "no-file", path: "gone.py", symbol: "f" });
  expect(await engine.code("code:a.rb#f")).toEqual({ state: "unsupported", path: "a.rb", symbol: "f" });
  expect(await (await open(null)).code("code:sim.py#leapfrog")).toMatchObject({ state: "no-repository" });
  await expect(engine.code("https://x.y")).rejects.toThrow();
});

test("a symbol no longer in its file is a broken link, as a missing file is; an embed of code is a link out of the note", async () => {
  const engine = await open(new MemoryFiles({ "sim.py": BEFORE }));
  const note = (await engine.notes()).notes.find((n) => n.id === "sim/step");
  expect(note?.broken).toEqual(["code:sim.py#vanished"]);
  expect((await engine.map()).notes["sim/step"]!.links?.map((l) => l.href)).toEqual(["code:sim.py#Body.step", "code:sim.py#vanished", "code:sim.py#L1-L2", "code:sim.py#leapfrog"]);
});

test("the whole file is given to the reader, the lines a link names marked, past the lines shown in place", async () => {
  const repo = new MemoryFiles(), engine = await open(repo);
  const long = Array.from({ length: 200 }, (_, i) => `# ${i + 1}`).join("\n");
  await repo.write("sim/long.py", `${long}\ndef tail(x):\n    return x\n`);
  const whole = await engine.code("code:sim/long.py#tail", true);
  expect(whole).toMatchObject({ state: "ok", start: 1, end: 202, total: 202, mark: { start: 201, end: 202 } });
  expect(whole.state === "ok" && whole.text.split("\n")).toHaveLength(202);
  expect(await engine.code("code:sim/long.py#gone", true)).toMatchObject({ state: "ok", total: 202 });
  expect((await engine.code("code:sim/long.py#L5-L6", true) as { mark?: unknown }).mark).toEqual({ start: 5, end: 6 });
});
