// What a pi agent can reach (M35 step 5): the base's tools alone by default; pi's file tools when chosen, held inside
// the project and off .git; its shell only when chosen, and then nothing confines it. The model is pi's faux provider,
// scripted to try each thing: what was tried is what the tools and the guard let through.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { fileTools, pathGuard, type Reach } from "../src/pi/files.ts";
import { PiHost } from "../src/pi/host.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-reach-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function agent(reach: Reach, ask?: (t: string) => boolean) {
  const dir = mkdtempSync(join(root, "case-"));
  const project = join(dir, "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  writeFileSync(join(project, "inside.txt"), "inside the project");
  writeFileSync(join(project, ".git", "config"), "[core]\n");
  writeFileSync(join(dir, "outside.txt"), "OUTSIDE SECRET");
  const base = await writeExample(join(dir, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), more: () => fileTools(project, reach), guard: pathGuard(project), ...(ask ? { ask } : {}) });
  /** The agent tries each call in turn; what became of each, in order. */
  const tries = async (...calls: [string, Record<string, unknown>][]) => {
    faux.setResponses([...calls.map(([name, args]) => fauxAssistantMessage([fauxToolCall(name, args as never)], { stopReason: "toolUse" })), fauxAssistantMessage([fauxText("Done.")])]);
    const done = new Promise<TerminalView>((res) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); res(v); } }); });
    await host.prompt("try these");
    const view = await done;
    return view.turns.at(-1)!.items.filter((i) => i.kind === "tool").map((i) => ({ name: (i as { name: string }).name, status: (i as { status: string }).status, output: (i as { output: string }).output }));
  };
  return { project, dir, tries, host };
}

test("by default the agent has no file or shell tool at all: what it tries to call is not there", async () => {
  const { project, tries } = await agent({ files: "off", shell: false });
  const got = await tries(["write", { path: "made.txt", content: "x" }], ["bash", { command: "echo hi > bashed.txt" }], ["read", { path: "inside.txt" }]);
  expect(got.map((g) => g.status)).toEqual(["failed", "failed", "failed"]);
  expect(existsSync(join(project, "made.txt"))).toBe(false);
  expect(existsSync(join(project, "bashed.txt"))).toBe(false);
});

test("read: it reads inside the project, and not outside it; nothing can be written, though it tries", async () => {
  const { project, tries } = await agent({ files: "read", shell: false });
  const got = await tries(
    ["read", { path: "inside.txt" }],
    ["read", { path: "../outside.txt" }],
    ["read", { path: join(project, "..", "outside.txt") }],
    ["write", { path: "made.txt", content: "x" }],
    ["edit", { path: "inside.txt", edits: [{ oldText: "inside", newText: "changed" }] }],
  );
  expect(got.map((g) => g.status)).toEqual(["done", "failed", "failed", "failed", "failed"]);
  expect([got[1]!.output, got[2]!.output]).toEqual([expect.stringContaining("outside the project folder"), expect.stringContaining("outside the project folder")]);
  expect([got[3]!.output, got[4]!.output]).toEqual(["Tool write not found", "Tool edit not found"]);
  expect(got[0]!.output).toContain("inside the project");
  expect(got[1]!.output + got[2]!.output).not.toContain("OUTSIDE SECRET");
  expect(existsSync(join(project, "made.txt"))).toBe(false);
  expect(readFileSync(join(project, "inside.txt"), "utf8")).toBe("inside the project");
});

test("write: it writes inside the project, and not outside it or into .git", async () => {
  const { project, dir, tries } = await agent({ files: "write", shell: false });
  const got = await tries(
    ["write", { path: "made.txt", content: "made" }],
    ["write", { path: "../escaped.txt", content: "no" }],
    ["write", { path: ".git/config", content: "no" }],
    ["edit", { path: ".git/config", edits: [{ oldText: "[core]", newText: "[evil]" }] }],
  );
  expect(got.map((g) => g.status)).toEqual(["done", "failed", "failed", "failed"]);
  expect(got.slice(1).map((g) => g.output)).toEqual([expect.stringContaining("outside the project folder"), "write does not reach .git", "edit does not reach .git"]);
  expect(readFileSync(join(project, "made.txt"), "utf8")).toBe("made");
  expect(existsSync(join(dir, "escaped.txt"))).toBe(false);
  expect(readFileSync(join(project, ".git", "config"), "utf8")).toBe("[core]\n");
});

test("shell: with it on, nothing confines the agent: it writes and reaches outside the project, files switched to read or not", async () => {
  const { project, dir, tries } = await agent({ files: "read", shell: true });
  const got = await tries(
    ["bash", { command: "echo bashed > bashed.txt" }],
    ["bash", { command: "echo escaped > ../escaped.txt" }],
    ["bash", { command: "cat ../outside.txt" }],
  );
  expect(got.map((g) => g.status)).toEqual(["done", "done", "done"]);
  // The limit, written down: "read-only" cannot be promised with a shell.
  expect(readFileSync(join(project, "bashed.txt"), "utf8")).toBe("bashed\n");
  expect(readFileSync(join(dir, "escaped.txt"), "utf8")).toBe("escaped\n");
  expect(got[2]!.output).toContain("OUTSIDE SECRET");
});

test("shell asked about first: refused through the pane, nothing runs", async () => {
  const { project, tries, host } = await agent({ files: "off", shell: true }, (tool) => tool === "bash");
  const running = tries(["bash", { command: "echo bashed > bashed.txt" }]);
  await expect.poll(() => host.view().asking.length).toBe(1);
  expect(host.view().asking[0]).toMatchObject({ action: "bash", tool: "bash" });
  await host.reply(host.view().asking[0]!.id, "reject");
  const got = await running;
  expect(got[0]!.status).toBe("failed");
  expect(existsSync(join(project, "bashed.txt"))).toBe(false);
});

test("a guard that cannot decide refuses the call", async () => {
  const dir = mkdtempSync(join(root, "guard-"));
  const base = await writeExample(join(dir, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), guard: () => { throw new Error("broken"); } });
  faux.setResponses([fauxAssistantMessage([fauxToolCall("search_notes", { query: "gravity" })], { stopReason: "toolUse" }), fauxAssistantMessage([fauxText("Done.")])]);
  const done = new Promise<TerminalView>((res) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); res(v); } }); });
  await host.prompt("search");
  const view = await done;
  expect(view.turns[0]!.items[0]).toMatchObject({ kind: "tool", name: "search_notes", status: "failed" });
});
