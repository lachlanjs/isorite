// Saying something to the agent while it works (M36, step 6): a follow-up waits until the agent would stop, a steer
// comes in after the step now running. Each shows in the turn as queued, then where the model took it up.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalItem, TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-queue-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Message = Extract<TerminalItem, { kind: "message" }>;

/** A tool that is working until the test lets it finish. */
function gate() {
  let release!: () => void;
  let started!: () => void;
  const running = new Promise<void>((r) => { started = r; });
  const open = new Promise<void>((r) => { release = r; });
  const tool: AgentTool = {
    name: "slow", label: "slow", description: "Takes a while.", parameters: { type: "object", properties: {} } as never,
    execute: async (_id, _p, signal) => { started(); await Promise.race([open, new Promise((_, no) => signal?.addEventListener("abort", () => no(new Error("cancelled"))))]); return { content: [{ type: "text", text: "finished" }], details: undefined }; },
  };
  return { tool, running, release };
}

async function setup(tool: AgentTool) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), more: () => [tool] });
  const settled = (): Promise<TerminalView> => new Promise((done) => {
    const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } });
  });
  /** What the model was shown last time it was asked: every user message so far. */
  const seen: string[][] = [];
  const reply = (text: string) => (context: { messages: { role: string; content: unknown }[] }) => {
    seen.push(context.messages.filter((m) => m.role === "user").map((m) => JSON.stringify(m.content)));
    return fauxAssistantMessage([fauxText(text)]);
  };
  return { host, faux, settled, seen, reply };
}
const messages = (v: TerminalView): Message[] => v.turns.at(-1)!.items.filter((i): i is Message => i.kind === "message");

test("a steer waits for the step running and reaches the model's next request, shown where it came in", async () => {
  const g = gate();
  const { host, faux, settled, seen, reply } = await setup(g.tool);
  faux.setResponses([fauxAssistantMessage([fauxToolCall("slow", {})], { stopReason: "toolUse" }), reply("Changed course.")] as never);
  const done = settled();
  await host.prompt("Do the slow thing");
  await g.running;
  await host.steer("Actually, only summarise.");
  expect(host.view().steer).toBe(true);
  expect(messages(host.view())).toMatchObject([{ text: "Actually, only summarise.", mode: "steer", state: "queued" }]);
  g.release();
  const view = await done;
  expect(seen[0]!.join(" ")).toContain("Actually, only summarise.");
  expect(messages(view)).toMatchObject([{ mode: "steer", state: "landed" }]);
  // It stands after the tool it waited for, before the reply that took it up.
  expect(view.turns[0]!.items.map((i) => i.kind)).toEqual(["tool", "message", "text"]);
  expect(view.turns[0]!.state).toBe("done");
});

test("a prompt sent while it works is a follow-up: it waits until the agent would stop, then is taken up", async () => {
  const g = gate();
  const { host, faux, settled, seen, reply } = await setup(g.tool);
  faux.setResponses([fauxAssistantMessage([fauxToolCall("slow", {})], { stopReason: "toolUse" }), reply("First answer."), reply("Second answer.")] as never);
  const done = settled();
  await host.prompt("Do the slow thing");
  await g.running;
  await host.prompt("And then say it twice.");
  expect(messages(host.view())).toMatchObject([{ text: "And then say it twice.", mode: "followUp", state: "queued" }]);
  g.release();
  const view = await done;
  // The first answer was given without it; the second had it.
  expect(seen[0]!.join(" ")).not.toContain("say it twice");
  expect(seen[1]!.join(" ")).toContain("say it twice");
  expect(messages(view)).toMatchObject([{ mode: "followUp", state: "landed" }]);
  expect(view.turns[0]!.items.map((i) => i.kind)).toEqual(["tool", "text", "message", "text"]);
  expect(view.turns).toHaveLength(1);
});

test("a steer when nothing is running is refused, and a stop drops what was waiting", async () => {
  const g = gate();
  const { host, faux, settled } = await setup(g.tool);
  await expect(host.steer("anything")).rejects.toThrow(/not working/);
  faux.setResponses([fauxAssistantMessage([fauxToolCall("slow", {})], { stopReason: "toolUse" })]);
  const done = settled();
  await host.prompt("Do the slow thing");
  await g.running;
  await host.prompt("A follow-up that will not be taken up");
  await host.interrupt();
  const view = await done;
  expect(view.turns[0]!.state).toBe("stopped");
  expect(messages(view)).toMatchObject([{ state: "dropped" }]);
});
