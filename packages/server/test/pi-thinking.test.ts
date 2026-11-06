// What the model thought, and the earlier conversation shortened to fit (M36, step 7). Both on pi's scripted provider.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalItem, TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-think-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function setup(options: { window?: number; compaction?: { reserveTokens: number; keepRecentTokens: number } } = {}) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = options.window ? { ...faux.getModel(), contextWindow: options.window } : faux.getModel();
  const host = new PiHost({ api, model, streamFn: models.streamSimple.bind(models), ...(options.compaction ? { compaction: options.compaction } : {}) });
  const settled = (): Promise<TerminalView> => new Promise((done) => {
    const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } });
  });
  return { host, faux, settled };
}

test("the model's thinking is a collapsed item ahead of what it answered, kept whole", async () => {
  const { host, faux, settled } = await setup();
  faux.setResponses([
    fauxAssistantMessage([fauxThinking("Entropy is surprise, so say so."), fauxToolCall("search_notes", { query: "entropy" })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxThinking("The note agrees."), fauxText("It is surprise.")]),
  ]);
  const done = settled();
  await host.prompt("What is entropy?");
  const view = await done;
  expect(view.turns[0]!.items.map((i) => i.kind)).toEqual(["thinking", "tool", "thinking", "text"]);
  expect(view.turns[0]!.items.filter((i): i is Extract<TerminalItem, { kind: "thinking" }> => i.kind === "thinking").map((i) => i.text)).toEqual(["Entropy is surprise, so say so.", "The note agrees."]);
});

test("a conversation near the model's window is summarised before the next prompt, and the recent part is kept", async () => {
  const { host, faux, settled } = await setup({ window: 3600, compaction: { reserveTokens: 200, keepRecentTokens: 500 } });
  const seen: string[][] = [];
  const respond = (context: { messages: { role: string; content: unknown }[] }) => {
    const summarising = JSON.stringify(context.messages.at(-1)?.content).includes("<conversation>");
    if (!summarising) seen.push(context.messages.filter((m) => m.role === "user").map((m) => JSON.stringify(m.content)));
    return fauxAssistantMessage([fauxText(summarising ? "THE SUMMARY OF EARLIER" : "Noted.")]);
  };
  faux.setResponses(Array.from({ length: 30 }, () => respond) as never);
  const long = (tag: string) => `${tag} ${"The integrator advances the state by one small step. ".repeat(30)}`;
  let compaction: Extract<TerminalItem, { kind: "compaction" }> | undefined;
  let turns = 0;
  for (; turns < 8 && !compaction; turns++) {
    const done = settled();
    await host.prompt(long(`Question ${turns + 1}.`));
    const view = await done;
    compaction = view.turns.at(-1)!.items.find((i): i is Extract<TerminalItem, { kind: "compaction" }> => i.kind === "compaction");
  }
  expect(compaction, "it summarised before some prompt").toBeDefined();
  expect(compaction).toMatchObject({ state: "done", summary: "THE SUMMARY OF EARLIER" });
  expect(compaction!.after!).toBeLessThan(compaction!.before);
  // The request after it began with the summary, kept the recent question, and no longer carried the first.
  const last = seen.at(-1)!.join(" ");
  expect(last).toContain("THE SUMMARY OF EARLIER");
  expect(last).not.toContain("Question 1.");
  expect(last).toContain(`Question ${turns}.`);
  expect(host.view().tokens.input).toBeGreaterThan(0);
  // It carries on: another turn works, and the summary stays at the front.
  const done = settled();
  await host.prompt("One more.");
  await done;
  expect(seen.at(-1)![0]).toContain("THE SUMMARY OF EARLIER");
});

test("a summary that cannot be made leaves the conversation as it was, and the turn says so", async () => {
  const { host, faux, settled } = await setup({ window: 2400, compaction: { reserveTokens: 100, keepRecentTokens: 200 } });
  faux.setResponses(Array.from({ length: 30 }, () => (context: { messages: { content: unknown }[] }) => (JSON.stringify(context.messages.at(-1)?.content).includes("<conversation>") ? fauxAssistantMessage([], { stopReason: "error", errorMessage: "the summary model is down" }) : fauxAssistantMessage([fauxText("Noted.")]))) as never);
  const long = (tag: string) => `${tag} ${"The integrator advances the state by one small step. ".repeat(30)}`;
  let failed: Extract<TerminalItem, { kind: "compaction" }> | undefined;
  for (let n = 0; n < 8 && !failed; n++) {
    const done = settled();
    await host.prompt(long(`Question ${n + 1}.`));
    failed = (await done).turns.at(-1)!.items.find((i): i is Extract<TerminalItem, { kind: "compaction" }> => i.kind === "compaction");
  }
  expect(failed).toMatchObject({ state: "failed" });
  expect(failed!.error).toBeTruthy();
  expect(host.view().turns.at(-1)!.state).toBe("done");
});
