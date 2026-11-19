// The agent's lens tools on the scripted model (pi/host.ts): a lens made and given an island in a call each, what it was
// asked journalled with the change, read back with read_lens, and refused where agents may not change the notes.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { scriptedModel } from "../src/pi/scripted.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-lens-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function setup() {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const { chosen, streamFn } = scriptedModel(undefined, { tokensPerSecond: 0 });
  const results: string[][] = [];
  const watched = ((model: never, context: { messages: { role?: string; content?: unknown }[] }, options: never) => {
    const text = (m: { content?: unknown }) => (Array.isArray(m.content) ? (m.content as { text?: string }[]).map((b) => b.text ?? "").join("\n") : String(m.content ?? ""));
    const last = context.messages.map((m) => m.role).lastIndexOf("user");
    results.push(context.messages.slice(last).filter((m) => m.role === "toolResult").map(text));
    return (streamFn as (...a: unknown[]) => unknown)(model, context, options);
  }) as never;
  const host = new PiHost({ api, model: chosen!, streamFn: watched });
  const settled = (): Promise<TerminalView> => new Promise((done) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } }); });
  const ask = async (text: string) => { const done = settled(); await host.prompt(text); return done; };
  return { api, ask, results, notes: base.notes };
}

test("the agent makes a lens and an island in a call each, journalled with what it was asked, and reads it back", async () => {
  const { api, ask, results, notes } = await setup();
  await ask(`Plan my learning.\nlens learning create {"title":"Learning"}\nlens learning add_island {"island":"integrators","title":"Integrators","notes":["path:/integrators/**"]}`);
  const said = results.at(-1)!;
  expect(said[0]).toMatch(/^Made the lens learning\. Notes under \/learning\/ are hidden everywhere else/);
  expect(said[1]).toBe("Added the island integrators.");
  // read_lens is offered from the next prompt on, once the base has a lens (the tools are read again for each).
  await ask("What is in it?\nreadlens learning");
  expect(results.at(-1)![0]).toContain("## Integrators (integrators)\n- ");
  expect(readFileSync(join(notes, ".isorite", "lenses", "learning.toml"), "utf8")).toContain('match = ["path:/integrators/**"]');
  const journal = await api.journal("@lens/learning");
  expect(journal.at(-1)).toMatchObject({ who: expect.stringMatching(/^agent:/), asked: expect.stringContaining("Plan my learning.") });
});

test("where agents may not change the notes, edit_lens is refused and nothing is written", async () => {
  const { api, ask, results } = await setup();
  await api.setAgentNotes(false);
  await ask(`lens learning create {"title":"Learning"}`);
  expect(results.at(-1)![0]).toContain("switched off agents' changes");
  expect(await api.lenses()).toEqual([]);
});
