// Context from the tray (M36, step 10): a block given with a chip is tagged with it, and taking the chip out withdraws
// the block from every later request, while the turn it came in stays in the pane, marked. Put in again, it is given
// afresh. The withdrawal is kept with the session.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { Given, TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { FileStore } from "../src/pi/store.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-withdraw-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const render = (parts: Given[]): string => parts.map((p) => (p.kind === "passage" ? `PASSAGE[${p.text}]` : `NOTE[${p.id}]`)).join("\n");
const note: Given = { kind: "note", id: "basics/entropy" };
const passage: Given = { kind: "passage", id: "basics/entropy", text: "average surprise in bits" };

async function setup(dir = join(root, `c-${Math.random().toString(36).slice(2)}`)) {
  const base = await writeExample(join(dir, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider(), models = createModels();
  models.setProvider(faux.provider);
  const sent: string[] = [];
  const make = () => new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), store: new FileStore(join(dir, "store")) });
  const ask = async (host: PiHost, text: string, given: Given[]): Promise<TerminalView> => {
    faux.setResponses([((ctx: { messages: { role: string; content: unknown }[] }) => { sent.push(JSON.stringify(ctx.messages.filter((m) => m.role === "user").map((m) => m.content))); return fauxAssistantMessage([fauxText("ok")]); }) as never]);
    const done = new Promise<TerminalView>((res) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); res(v); } }); });
    await host.give(given, render);
    await host.prompt(text);
    return done;
  };
  return { make, ask, sent, dir };
}

test("a chip taken out is withdrawn from later requests; the turn it came in stays, marked; the other chip stays", async () => {
  const { make, ask, sent } = await setup();
  const host = make();
  await ask(host, "first", [note, passage]);
  expect(sent[0]).toContain("PASSAGE[average surprise in bits]");
  expect(sent[0]).toContain("NOTE[basics/entropy]");
  // Still in the tray: carried on in the next request without being given again.
  await ask(host, "second", [note, passage]);
  expect(sent[1]).toContain("PASSAGE[average surprise in bits]");
  expect(sent[1]!.match(/PASSAGE\[/g)).toHaveLength(1);

  expect(await host.withdraw(passage)).toBe(true);
  const view = await ask(host, "third", [note]);
  expect(sent[2]).not.toContain("average surprise in bits");
  expect(sent[2]).toContain("was withdrawn");
  expect(sent[2]).toContain("NOTE[basics/entropy]");
  // The pane keeps the first turn as it was, and says the passage was taken out.
  expect(view.turns[0]!.given).toEqual([note, passage]);
  expect(view.turns[0]!.withdrawn).toEqual([1]);
  expect(view.turns[2]!.withdrawn).toBeUndefined();
  // Nothing to take out for a chip that was never given.
  expect(await host.withdraw({ kind: "note", id: "other/note" })).toBe(false);
});

test("put in again, it is given afresh; the old block stays withdrawn", async () => {
  const { make, ask, sent } = await setup();
  const host = make();
  await ask(host, "first", [passage]);
  await host.withdraw(passage);
  await ask(host, "second", []);
  const view = await ask(host, "third", [passage]);
  expect(sent[2]!.match(/PASSAGE\[average surprise in bits\]/g)).toHaveLength(1);
  expect(sent[2]).toContain("was withdrawn");
  expect(view.turns[0]!.withdrawn).toEqual([0]);
  expect(view.turns[2]!.withdrawn).toBeUndefined();
});

test("the withdrawal is kept with the session across a restart, and a restart alone withdraws nothing", async () => {
  const { make, ask, sent, dir } = await setup();
  const host = make();
  await ask(host, "first", [note, passage]);
  await host.withdraw(passage);
  await ask(host, "second", [note]);
  await new Promise((r) => setTimeout(r, 300));
  const again = make();
  await again.resume();
  // The page was reloaded: an empty tray is not a chip being taken out.
  await ask(again, "third", []);
  expect(sent[2]).not.toContain("average surprise in bits");
  expect(sent[2]).toContain("NOTE[basics/entropy]");
  expect(again.view().turns[0]!.withdrawn).toEqual([1]);
  void dir;
});
