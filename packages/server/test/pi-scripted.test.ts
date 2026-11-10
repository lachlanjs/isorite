// The scripted model the browser tests talk to (ISORITE_SCRIPTED=1): a prompt is a script, each step a tool call through
// the agent's own loop, then a reply. And what the host now says of each call: the note it acts on, an edit's lines, how
// long it took; and how long the turn took.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { modelFor } from "../src/pi/index.ts";
import { parse } from "../src/pi/scripted.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-scripted-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("a prompt is read as a script: steps in order, waits before them, and the reply's parts", () => {
  const s = parse("wait 30\nread basics/entropy\nsearch two words\ncite /x.md\nwhat is it?");
  expect(s.steps.map((x) => [x.name, x.wait])).toEqual([["read_note", 30], ["search_notes", 0]]);
  expect(s.cite).toEqual(["/x.md"]);
  expect(parse("edit a/b Old words. => New words.").steps[0]!.args).toEqual({ note: "a/b", oldString: "Old words.", newString: "New words." });
});

test("offered only where the environment says so", async () => {
  await expect(modelFor("scripted", "scripted", {})).rejects.toThrow();
  const { chosen } = await modelFor("scripted", "scripted", { ISORITE_SCRIPTED: "1" });
  expect(chosen.contextWindow).toBe(200_000);
});

test("a scripted turn: a read and an edit of a note, each with its note, the edit's lines and its time, then the reply", async () => {
  const base = await writeExample(join(root, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const id = (await api.notes()).notes[0]!.id;
  const text = (await api.readNote(id)).text;
  const line = text.split("\n").filter((l) => l.trim() && !l.startsWith("---") && !/^\w+:/.test(l)).at(-1)!;
  const { chosen, streamFn } = await modelFor("scripted", "scripted", { ISORITE_SCRIPTED: "1" });
  const host = new PiHost({ api, model: chosen, streamFn });
  const done = new Promise<TerminalView>((ok) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); ok(v); } }); });
  await host.prompt(`read ${id}\nedit ${id} ${line} => ${line} And more.\nwhat now?`);
  const view = await done;
  const turn = view.turns[0]!;
  expect(turn.state).toBe("done");
  expect(turn.took).toBeGreaterThanOrEqual(0);
  const tools = turn.items.filter((i) => i.kind === "tool");
  expect(tools).toMatchObject([{ name: "read_note", note: id, status: "done" }, { name: "edit_note", note: id, status: "done", diff: [`-${line}`, `+${line} And more.`] }]);
  expect(tools.every((t) => typeof t.ms === "number")).toBe(true);
  expect(turn.items.at(-1)).toMatchObject({ kind: "text", text: `Done, [as the note says](/${id}.md).` });
  expect((await api.readNote(id)).text).toContain(`${line} And more.`);
});
