// What pi's loop does that the pane's view cannot show (M35 step 6). Each test runs the loop on pi's scripted provider and
// compares what pi's events carried with what `TerminalView` holds. A passing test here is a finding, not a promise:
// it fixes in place a loss that the plan records.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";
import { shouldCompact } from "@earendil-works/pi-coding-agent";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-loss-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A tool that works until it is told to stop, as a long command does. */
const slow = (started: () => void): AgentTool => ({
  name: "slow", label: "slow", description: "Takes a while.", parameters: { type: "object", properties: {} } as never,
  execute: (_id, _params, signal) => new Promise((done, fail) => {
    started();
    const t = setTimeout(() => done({ content: [{ type: "text", text: "finished" }], details: undefined }), 5000);
    signal?.addEventListener("abort", () => { clearTimeout(t); fail(new Error("cancelled")); });
  }),
});

async function setup() {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  return { api, faux, model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
}
const settled = (host: PiHost): Promise<TerminalView> => new Promise((done) => {
  const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } });
});

test("the model's thinking is not in the view: pi sends it, the host drops it", async () => {
  const { api, faux, model, streamFn } = await setup();
  const host = new PiHost({ api, model, streamFn });
  faux.setResponses([fauxAssistantMessage([fauxThinking("Entropy is surprise, so I will say so."), fauxText("It is surprise.")])]);
  const done = settled(host);
  await host.prompt("What is entropy?");
  const view = await done;
  expect(view.turns[0]!.items).toEqual([{ kind: "text", text: "It is surprise." }]);
  expect(JSON.stringify(view)).not.toContain("so I will say so");
  // Pi did send it: the same script, run as pi's own loop, carries the thinking through its events.
  faux.setResponses([fauxAssistantMessage([fauxThinking("Entropy is surprise, so I will say so."), fauxText("It is surprise.")])]);
  const agent = new Agent({ initialState: { systemPrompt: "", model }, streamFn });
  const kinds: string[] = [];
  agent.subscribe((e: AgentEvent) => { if (e.type === "message_update") kinds.push(e.assistantMessageEvent.type); });
  await agent.prompt("What is entropy?");
  expect(kinds).toContain("thinking_delta");
});

test("stopping a tool that is running: the tool hears it, and the turn is stopped with the tool failed", async () => {
  const { api, faux, model, streamFn } = await setup();
  let started!: () => void;
  const running = new Promise<void>((r) => { started = r; });
  const host = new PiHost({ api, model, streamFn, more: () => [slow(() => started())] });
  faux.setResponses([fauxAssistantMessage([fauxToolCall("slow", {})], { stopReason: "toolUse" })]);
  const done = settled(host);
  await host.prompt("Do the slow thing");
  await running;
  const at = Date.now();
  await host.interrupt();
  const view = await done;
  expect(Date.now() - at).toBeLessThan(2000);
  expect(view.turns[0]!.state).toBe("stopped");
  expect(view.turns[0]!.items[0]).toMatchObject({ kind: "tool", name: "slow", status: "failed" });
});

test("a steer reaches the model in pi, but the host has no way to send one and would not show it", async () => {
  const { faux, model, streamFn } = await setup();
  let started!: () => void;
  const running = new Promise<void>((r) => { started = r; });
  const quick: AgentTool = { ...slow(() => started()), execute: async () => { started(); await new Promise((r) => setTimeout(r, 50)); return { content: [{ type: "text", text: "done" }], details: undefined }; } };
  const seen: string[] = [];
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("slow", {})], { stopReason: "toolUse" }),
    (context: { messages: { role: string; content: unknown }[] }) => { seen.push(JSON.stringify(context.messages.filter((m) => m.role === "user").map((m) => m.content))); return fauxAssistantMessage([fauxText("Changed course.")]); },
  ] as never);
  const agent = new Agent({ initialState: { systemPrompt: "", model, tools: [quick] }, streamFn });
  const events: string[] = [];
  agent.subscribe((e: AgentEvent) => { if (e.type === "message_start") events.push(`${(e.message as { role: string }).role}`); });
  const run = agent.prompt("Start");
  await running;
  agent.steer({ role: "user", content: [{ type: "text", text: "Actually, stop and summarise." }], timestamp: Date.now() });
  await run;
  expect(seen[0]).toContain("Actually, stop and summarise.");
  // Pi shows the steer as a user message in its events; the host's `#on` has no branch for a user message.
  expect(events.filter((r) => r === "user")).toHaveLength(2);
});

test("compaction is not an event of the loop: it is a call the host would have to make, and show", async () => {
  // Nothing in pi-agent-core's events says a context was shortened; pi-coding-agent offers the test and the work.
  expect(shouldCompact(190_000, 200_000, { enabled: true, reserveTokens: 16_000, keepRecentTokens: 20_000 })).toBe(true);
  expect(shouldCompact(50_000, 200_000, { enabled: true, reserveTokens: 16_000, keepRecentTokens: 20_000 })).toBe(false);
});
