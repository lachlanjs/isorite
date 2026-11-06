// The tool tiers of the native agent (M36, step 9): by default it can read the project's files and nothing more; write and
// shell are the settings' to turn on, take effect at the next question, and are held across restarts. The environment, if
// it sets them, wins.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { fileTools, pathGuard } from "../src/pi/files.ts";
import { PiHost } from "../src/pi/host.ts";
import { PiControl } from "../src/pi/index.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-tiers-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function setup(env: NodeJS.ProcessEnv) {
  const dir = mkdtempSync(join(root, "case-")), project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "inside.txt"), "inside the project");
  const base = await writeExample(join(dir, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider(), models = createModels();
  models.setProvider(faux.provider);
  const control = new PiControl({ XDG_DATA_HOME: join(dir, "data"), ...env });
  await control.load();
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), more: () => fileTools(project, control.reach), guard: pathGuard(project) });
  const tries = async (...calls: [string, Record<string, unknown>][]) => {
    faux.setResponses([...calls.map(([n, a]) => fauxAssistantMessage([fauxToolCall(n, a as never)], { stopReason: "toolUse" })), fauxAssistantMessage([fauxText("Done.")])]);
    const done = new Promise<TerminalView>((res) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); res(v); } }); });
    await host.prompt("try these");
    return (await done).turns.at(-1)!.items.filter((i) => i.kind === "tool").map((i) => (i as { status: string }).status);
  };
  return { project, control, tries, dir };
}

test("by default it reads the project and nothing it holds can change a file or run a command", async () => {
  const { project, control, tries } = await setup({});
  expect(control.reach).toEqual({ files: "read", shell: false });
  const got = await tries(["read", { path: "inside.txt" }], ["write", { path: "made.txt", content: "x" }], ["edit", { path: "inside.txt", edits: [{ oldText: "inside", newText: "changed" }] }], ["bash", { command: "echo hi > bashed.txt" }]);
  expect(got).toEqual(["done", "failed", "failed", "failed"]);
  expect(existsSync(join(project, "made.txt"))).toBe(false);
  expect(existsSync(join(project, "bashed.txt"))).toBe(false);
  expect(readFileSync(join(project, "inside.txt"), "utf8")).toBe("inside the project");
});

test("write and shell are turned on in the settings, apply to the next question, and are kept across restarts", async () => {
  const { project, control, tries, dir } = await setup({});
  await control.setReach({ files: "write", shell: false });
  expect(await tries(["write", { path: "made.txt", content: "made" }], ["bash", { command: "echo hi > bashed.txt" }])).toEqual(["done", "failed"]);
  expect(readFileSync(join(project, "made.txt"), "utf8")).toBe("made");
  await control.setReach({ files: "write", shell: true });
  expect(await tries(["bash", { command: "echo hi > bashed.txt" }])).toEqual(["done"]);
  expect(existsSync(join(project, "bashed.txt"))).toBe(true);
  // A restart: the same data folder gives the same reach.
  const again = new PiControl({ XDG_DATA_HOME: join(dir, "data") });
  await again.load();
  expect(again.reach).toEqual({ files: "write", shell: true });
  // And turned off again.
  await again.setReach({ files: "off", shell: false });
  expect((await new PiControl({ XDG_DATA_HOME: join(dir, "data") }).state()).reach).toEqual({ files: "off", shell: false });
});

test("the environment, where it sets the reach, wins over the settings, and says so", async () => {
  const { control } = await setup({ ISORITE_PI_FILES: "off" });
  await control.setReach({ files: "write", shell: true });
  expect(control.reach).toEqual({ files: "off", shell: false });
  expect((await control.state()).reachFromEnvironment).toBe(true);
  await expect(new PiControl({ ISORITE_PI_FILES: "everything" }).load()).rejects.toThrow(/off, read or write/);
});
