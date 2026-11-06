// A pi agent serving the Iso pane (M35): its turn is folded into the pane's view, its look-ups are the base's own, and
// it asks through the pane before a tool it was told to ask about. The model is pi's faux provider, scripted: no network.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { EngineEvent, TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { piHostFor } from "../src/pi/index.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function setup(ask?: (tool: string) => boolean) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const events: EngineEvent[] = [];
  api.events((e) => { events.push(e); });
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), ...(ask ? { ask } : {}) });
  const views: TerminalView[] = [];
  host.listen((v) => views.push(v));
  const settled = (): Promise<TerminalView> => new Promise((done) => {
    const check = (v: TerminalView) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } };
    const off = host.listen(check);
  });
  return { api, host, faux, events, views, settled };
}

test("a turn is folded into the pane's view: the question, a look-up in the base, and the answer", async () => {
  const { host, faux, events, settled } = await setup();
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("search_notes", { query: "entropy" })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxText("It is the average surprise.")]),
  ]);
  const done = settled();
  await host.prompt("What is entropy?");
  expect(host.view()).toMatchObject({ connected: true, agentId: "pi", busy: true, turns: [{ asked: "What is entropy?", from: "here", state: "running" }] });
  const view = await done;
  expect(view.turns).toHaveLength(1);
  const turn = view.turns[0]!;
  expect(turn.state).toBe("done");
  expect(turn.items.map((i) => i.kind)).toEqual(["tool", "text"]);
  expect(turn.items[0]).toMatchObject({ kind: "tool", name: "search_notes", title: "entropy", status: "done" });
  expect((turn.items[0] as { output: string }).output.length).toBeGreaterThan(0);
  expect(turn.items[1]).toMatchObject({ kind: "text", text: "It is the average surprise." });
  expect(view.title).toBe("What is entropy?");
  expect(view.sessions).toMatchObject([{ agent: "pi", live: true, busy: false, turns: 1 }]);
  // The base saw it: the look-up is a step on the Atlas, by this agent.
  expect(events.some((e) => e.type === "agent-step" && e.agent === "pi")).toBe(true);
});

test("what was given goes before the question once, and the agent cannot be asked while it works", async () => {
  const { host, faux, settled } = await setup();
  const seen: string[] = [];
  faux.setResponses([
    (context: { messages: { role: string; content: unknown }[] }) => { seen.push(JSON.stringify(context.messages.at(-1)?.content)); return fauxAssistantMessage([fauxText("Noted.")]); },
    (context: { messages: { role: string; content: unknown }[] }) => { seen.push(JSON.stringify(context.messages.at(-1)?.content)); return fauxAssistantMessage([fauxText("Again.")]); },
  ] as never);
  const passage = { kind: "passage" as const, id: "basics/entropy", text: "The average surprise." };
  await host.give([passage], (parts) => `From ${parts[0]!.id}:\n> ${(parts[0] as { text: string }).text}`);
  let done = settled();
  await host.prompt("Say more.");
  await expect(host.prompt("Another")).rejects.toThrow(/working/);
  const first = await done;
  expect(first.turns[0]).toMatchObject({ given: [passage] });
  // Given again with the question: not repeated in the same session.
  await host.give([passage], (parts) => `From ${parts[0]!.id}:\n> ${(parts[0] as { text: string }).text}`);
  done = settled();
  await host.prompt("And?");
  await done;
  expect(seen[0]).toContain("> The average surprise.");
  expect(seen[0]).toContain("Say more.");
  expect(seen[1]).not.toContain("average surprise");
});

test("a tool it was told to ask about waits for the pane: allowed, it runs; refused, it does not", async () => {
  const { host, faux, settled } = await setup((tool) => tool === "read_note");
  const call = () => fauxAssistantMessage([fauxToolCall("read_note", { id: "basics/entropy" })], { stopReason: "toolUse" });

  faux.setResponses([call(), fauxAssistantMessage([fauxText("Read it.")])]);
  let done = settled();
  await host.prompt("Read the note");
  await expect.poll(() => host.view().asking.length).toBe(1);
  expect(host.view().asking[0]).toMatchObject({ action: "read_note", tool: "read_note" });
  await host.reply(host.view().asking[0]!.id, "once");
  let view = await done;
  expect(view.turns[0]!.items[0]).toMatchObject({ kind: "tool", name: "read_note", status: "done" });
  expect(view.asking).toEqual([]);

  faux.setResponses([call(), fauxAssistantMessage([fauxText("I could not.")])]);
  done = settled();
  await host.prompt("Read it again");
  await expect.poll(() => host.view().asking.length).toBe(1);
  await host.reply(host.view().asking[0]!.id, "reject");
  view = await done;
  expect(view.turns[1]!.items[0]).toMatchObject({ kind: "tool", name: "read_note", status: "failed" });
  await expect(host.reply("nothing", "once")).rejects.toThrow(/not asking/);
});

test("stopping ends the turn as stopped", async () => {
  const { host, faux, settled } = await setup((tool) => tool === "read_note");
  faux.setResponses([fauxAssistantMessage([fauxToolCall("read_note", { id: "basics/entropy" })], { stopReason: "toolUse" })]);
  const done = settled();
  await host.prompt("Read the note");
  await expect.poll(() => host.view().asking.length).toBe(1);
  await host.interrupt();
  const view = await done;
  expect(view.turns[0]!.state).toBe("stopped");
  expect(view.turns[0]!.items.some((i) => i.kind === "text")).toBe(false);
  expect(view.asking).toEqual([]);
});

test("ISORITE_PI chooses the pi agent for the pane, and says what is wrong when it cannot be had", async () => {
  const { api } = await setup();
  expect(await piHostFor(api, {})).toBeNull();
  await expect(piHostFor(api, { ISORITE_PI: "claude" })).rejects.toThrow(/<provider>\/<model>/);
  await expect(piHostFor(api, { ISORITE_PI: "nowhere/model" })).rejects.toThrow(/no provider "nowhere"/);
  await expect(piHostFor(api, { ISORITE_PI: "anthropic/not-a-model" })).rejects.toThrow(/no model "not-a-model"/);
  const host = await piHostFor(api, { ISORITE_PI: "anthropic/claude-sonnet-4-6", ISORITE_PI_ASK: "read_note, edit_note", XDG_DATA_HOME: join(root, "data") });
  expect(host?.view()).toMatchObject({ connected: true, agentId: "pi", session: null });
});
