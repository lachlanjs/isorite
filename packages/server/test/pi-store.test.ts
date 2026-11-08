// The pi agent's sessions kept between runs (M36, step 5): a restart takes up the session last kept, with the model's
// earlier turns; a file that cannot be read is reported and left alone.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { FileStore, storeDir } from "../src/pi/store.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-store-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function setup(dir: string) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), store: new FileStore(dir) });
  await host.resume();
  const settled = (): Promise<TerminalView> => new Promise((done) => {
    const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } });
  });
  return { host, faux, settled };
}
const files = (dir: string) => readdirSync(dir).filter((n) => n.endsWith(".json"));

test("a restart takes up the session last kept: its turns in the pane, and the model still has them", async () => {
  const dir = join(root, "kept");
  const first = await setup(dir);
  first.faux.setResponses([fauxAssistantMessage([fauxText("Entropy is average surprise.")])]);
  let done = first.settled();
  await first.host.prompt("What is entropy?");
  await done;
  await expect.poll(() => files(dir).length).toBe(1);
  const session = first.host.view().session;

  // The server restarts: a new host over the same folder.
  const second = await setup(dir);
  const view = second.host.view();
  expect(view.session).toBe(session);
  expect(view.turns).toHaveLength(1);
  expect(view.turns[0]).toMatchObject({ asked: "What is entropy?", state: "done" });
  expect(view.title).toBe("What is entropy?");
  expect(view.problem).toBeUndefined();

  // The model is asked again with what it was asked before.
  const seen: string[] = [];
  second.faux.setResponses([(context: { messages: { role: string; content: unknown }[] }) => { seen.push(JSON.stringify(context.messages.map((m) => m.content))); return fauxAssistantMessage([fauxText("Yes.")]); }] as never);
  done = second.settled();
  await second.host.prompt("And its units?");
  const after = await done;
  expect(seen[0]).toContain("What is entropy?");
  expect(seen[0]).toContain("Entropy is average surprise.");
  expect(after.turns.map((t) => t.asked)).toEqual(["What is entropy?", "And its units?"]);
  // Still one session, now with both turns.
  await expect.poll(() => JSON.parse(readFileSync(join(dir, files(dir)[0]!), "utf8")).turns.length).toBe(2);
  expect(files(dir)).toHaveLength(1);
  // The system prompt is not kept with the messages: the agent has its own at each start.
  expect((JSON.parse(readFileSync(join(dir, files(dir)[0]!), "utf8")).messages as { role: string }[]).some((m) => m.role === "system")).toBe(false);
});

test("a turn that was running when the server went down comes back stopped", async () => {
  const dir = join(root, "interrupted");
  mkdirSync(dir, { recursive: true });
  const record = { version: 1, session: "11111111-2222-3333-4444-555555555555", title: "Slow", at: "2026-11-06T00:00:00.000Z", last: "2026-11-06T00:00:00.000Z", cost: 0, used: 0, given: [], messages: [], turns: [{ id: "t", asked: "Slow", from: "here", items: [], state: "running" }] };
  writeFileSync(join(dir, `${record.session}.json`), JSON.stringify(record));
  const { host } = await setup(dir);
  expect(host.view().turns[0]!.state).toBe("stopped");
});

test("a file that cannot be read is reported with its path, left in place, and the agent starts fresh", async () => {
  const dir = join(root, "broken");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "11111111-2222-3333-4444-555555555555.json");
  writeFileSync(file, "{ not json");
  const { host, faux, settled } = await setup(dir);
  expect(host.view().problem).toContain(file);
  expect(host.view().turns).toEqual([]);
  expect(readFileSync(file, "utf8")).toBe("{ not json");
  // It works; the broken file is still there, and the new session is kept beside it.
  faux.setResponses([fauxAssistantMessage([fauxText("Hello.")])]);
  const done = settled();
  await host.prompt("Hi");
  await done;
  expect(host.view().problem).toBeUndefined();
  await expect.poll(() => files(dir).length).toBe(2);
  expect(readFileSync(file, "utf8")).toBe("{ not json");
});

test("sessions are kept in isorite's data folder, apart from the notes", () => {
  const dir = storeDir("/some/notes", { XDG_DATA_HOME: "/data" });
  expect(dir.startsWith(join("/data", "isorite", "pi"))).toBe(true);
  expect(storeDir("/other/notes", { XDG_DATA_HOME: "/data" })).not.toBe(dir);
});
