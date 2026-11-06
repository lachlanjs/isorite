// Several sessions for the native agent (M36, step 11): the pane lists the sessions kept, shows one with its own turns and
// cost, starts new ones, forks one, forgets one, and finds them all again after a restart.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { FileStore } from "../src/pi/store.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-sessions-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function setup() {
  const dir = join(root, `c-${Math.random().toString(36).slice(2)}`);
  const base = await writeExample(join(dir, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider({ models: [{ id: "priced", cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const seen: string[] = [];
  const make = () => new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), store: new FileStore(join(dir, "store")) });
  const ask = async (host: PiHost, text: string, words = 1): Promise<TerminalView> => {
    faux.setResponses([((ctx: { messages: { role: string; content: unknown }[] }) => { seen.push(JSON.stringify(ctx.messages.filter((m) => m.role === "user").map((m) => m.content))); return fauxAssistantMessage([fauxText("word ".repeat(words))]); }) as never]);
    const done = new Promise<TerminalView>((res) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); res(v); } }); });
    await host.prompt(text);
    return done;
  };
  const settle = () => new Promise((r) => setTimeout(r, 300));
  return { make, ask, seen, settle, dir };
}

test("two sessions: the pane switches between them, each with its own turns", async () => {
  const { make, ask, seen, settle } = await setup();
  const host = make();
  const a = await ask(host, "About entropy", 200);
  const idA = a.session!;
  await settle();
  await host.fresh("pi");
  expect(host.view().turns).toEqual([]);
  const b = await ask(host, "About Huffman codes", 5);
  const idB = b.session!;
  expect(idB).not.toBe(idA);
  await settle();
  // Both are listed, the one shown first (it changed last), each kept.
  expect(b.sessions!.map((s) => s.session)).toEqual([idB, idA]);
  expect(b.sessions!.map((s) => s.title)).toEqual(["About Huffman codes", "About entropy"]);
  // Back to the first: its own turns, its own cost, and the model carries on from its own messages only.
  await host.follow("pi", idA);
  let v = host.view();
  expect(v.session).toBe(idA);
  expect(v.turns.map((t) => t.asked)).toEqual(["About entropy"]);
  await ask(host, "More on entropy");
  expect(seen.at(-1)).toContain("About entropy");
  expect(seen.at(-1)).not.toContain("Huffman");
  await settle();
  await host.follow("pi", idB);
  v = host.view();
  expect(v.turns.map((t) => t.asked)).toEqual(["About Huffman codes"]);
  expect(v.sessions!.find((s) => s.session === idA)!.turns).toBe(2);
});

test("each session keeps its own cost, and a fork starts its cost again", async () => {
  const { make, dir } = await setup();
  const store = new FileStore(join(dir, "store"));
  const record = (session: string, cost: number, last: string) => ({ version: 1 as const, session, title: `S ${cost}`, at: last, last, cost, used: 100, given: [], messages: [], turns: [{ id: session, asked: `S ${cost}`, from: "here" as const, items: [], state: "done" as const, at: last }] });
  const A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
  await store.save(record(A, 0.42, "2026-11-06T01:00:00.000Z"));
  await store.save(record(B, 1.5, "2026-11-06T02:00:00.000Z"));
  const host = make();
  await host.resume();
  expect(host.view().session).toBeDefined();
  await host.follow("pi", A);
  expect(host.view().cost).toBe(0.42);
  await host.follow("pi", B);
  expect(host.view().cost).toBe(1.5);
  await host.fork("pi", B);
  expect(host.view().cost).toBe(0);
  await host.follow("pi", A);
  expect(host.view().cost).toBe(0.42);
});

test("it is refused while the agent works, and a session that is not kept is said not to be", async () => {
  const { make, ask, settle } = await setup();
  const host = make();
  const a = await ask(host, "One");
  await settle();
  await expect(host.follow("pi", "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/not kept/);
  await expect(host.follow("pi", "../../etc/passwd")).rejects.toThrow(/not kept/);
  expect(host.view().session).toBe(a.session);
});

test("a fork begins where its original is, goes its own way, and starts its cost again; the original is unchanged", async () => {
  const { make, ask, seen, settle } = await setup();
  const host = make();
  const a = await ask(host, "About entropy", 50);
  await settle();
  await host.fork("pi", a.session!);
  const forked = host.view();
  expect(forked.session).not.toBe(a.session);
  expect(forked.title).toBe("About entropy (fork)");
  expect(forked.turns.map((t) => t.asked)).toEqual(["About entropy"]);
  expect(forked.cost).toBe(0);
  await ask(host, "Take it somewhere else");
  expect(seen.at(-1)).toContain("About entropy");
  await settle();
  await host.follow("pi", a.session!);
  expect(host.view().turns.map((t) => t.asked)).toEqual(["About entropy"]);
  expect(host.view().sessions).toHaveLength(2);
});

test("forgetting removes only that session, including the one shown; a restart finds the rest", async () => {
  const { make, ask, settle, dir } = await setup();
  const host = make();
  const a = await ask(host, "First");
  await settle();
  await host.fresh("pi");
  const b = await ask(host, "Second");
  await settle();
  await host.fresh("pi");
  const c = await ask(host, "Third");
  await settle();
  await host.forget("pi", a.session!);
  expect(host.view().sessions!.map((s) => s.session).sort()).toEqual([b.session, c.session].sort());
  // The one shown goes too, and the pane is empty for a new one.
  await host.forget("pi", c.session!);
  expect(host.view().session).toBeNull();
  expect(host.view().turns).toEqual([]);
  expect(readdirSync(join(dir, "store")).filter((n) => n.endsWith(".json"))).toEqual([`${b.session}.json`]);
  const again = make();
  await again.resume();
  expect(again.view().session).toBe(b.session);
  expect(again.view().sessions!.map((s) => s.title)).toEqual(["Second"]);
});
