import { expect, test } from "vitest";
import { Engine, KEY, MemoryFiles, MemorySecrets, SPEND_CAP, type Http } from "../src/index.ts";

const NOW = Date.parse("2026-10-25T09:00:00Z");

/** Records of what turns cost, in this and the months before. */
const record = (...lines: [string, string, number][]) => lines.map(([id, at, usd]) => JSON.stringify({ id, at, device: "laptop1", event: "iso-turn", usd })).join("\n") + "\n";

async function open(files: Record<string, string>, secrets: Record<string, string>, http?: Http) {
  const clock = { t: NOW, now() { return this.t; } };
  const engine = await Engine.open({ notes: new MemoryFiles({ "a.md": "---\ntype: Concept\ntitle: A\n---\n\nText.\n" }), own: new MemoryFiles(files), clock, device: "laptop1", name: "b", secrets: new MemorySecrets(secrets), ...(http ? { http } : {}) });
  return { engine, clock };
}

const SPENT = { "record/laptop1.jsonl": record(["01J000000000000000000000A1", "2026-09-10T10:00:00Z", 3], ["01J000000000000000000000A2", "2026-10-02T10:00:00Z", 0.5], ["01J000000000000000000000A3", "2026-10-20T10:00:00Z", 0.25]) };

test("with no cap, this month's spend is measured against the most spent in any month", async () => {
  const { engine } = await open(SPENT, {});
  expect(await engine.spend()).toEqual({ usd: 0.75, cap: 3, per: "month", source: "history" });
});

test("with nothing spent there is no cap to fill toward", async () => {
  const { engine } = await open({}, {});
  expect(await engine.spend()).toEqual({ usd: 0, cap: null, per: "month", source: "history" });
});

test("a monthly cap is a setting of the device, and replaces the history", async () => {
  const { engine } = await open(SPENT, {});
  expect((await engine.setSpendCap(5)).spendCap).toBe(5);
  expect(await engine.spend()).toEqual({ usd: 0.75, cap: 5, per: "month", source: "setting" });
  expect((await engine.setSpendCap(null)).spendCap).toBeNull();
  await expect(engine.setSpendCap(-1)).rejects.toThrow(/above nothing/);
});

test("a cap written by hand in the configuration is read", async () => {
  const { engine } = await open(SPENT, { [SPEND_CAP]: "2" });
  expect((await engine.spend()).cap).toBe(2);
});

const answering = (data: unknown, calls: string[] = []): Http => ({ fetch: (async (url: unknown, init?: RequestInit) => {
  calls.push(`${String(url)} ${(init?.headers as Record<string, string> | undefined)?.Authorization ?? ""}`);
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch });

test("OpenRouter's own limit for the key is used, over its own period, and asked at most once a minute", async () => {
  const calls: string[] = [];
  const { engine, clock } = await open(SPENT, { [KEY]: "sk-test", [SPEND_CAP]: "9" }, answering({ limit: 10, limit_remaining: 7.5, limit_reset: "weekly" }, calls));
  expect(await engine.spend()).toEqual({ usd: 2.5, cap: 10, per: "week", source: "key" });
  await engine.spend();
  expect(calls).toEqual(["https://openrouter.ai/api/v1/key Bearer sk-test"]);
  clock.t += 61_000;
  await engine.spend();
  expect(calls).toHaveLength(2);
});

test("a key with no limit falls back to the setting", async () => {
  const { engine } = await open(SPENT, { [KEY]: "sk-test", [SPEND_CAP]: "9" }, answering({ limit: null, limit_remaining: null, limit_reset: null }));
  expect(await engine.spend()).toMatchObject({ cap: 9, source: "setting" });
});

test("the context window is the model's own, from the provider's list", async () => {
  const { engine } = await open({}, { [KEY]: "sk-test" }, answering([{ id: "anthropic/claude-sonnet-5.5", context_length: 1_000_000 }]));
  expect((await engine.turnContext({ mode: "ask", given: [], tier: "mid" })).limit).toBe(1_000_000);
});
