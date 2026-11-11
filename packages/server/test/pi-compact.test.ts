// `/compact` in the Agent pane: the session's earlier turns summarised now, at the person's word, with the words after it
// as the summary's focus. On the scripted model, as the browser tests have it.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { TerminalItem, TerminalView } from "@isorite/engine";
import { compactAsked, PiHost } from "../src/pi/host.ts";
import { scriptedModel } from "../src/pi/scripted.ts";
import type { Skill } from "../src/pi/skills.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-compact-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Compaction = Extract<TerminalItem, { kind: "compaction" }>;
const compactionOf = (v: TerminalView): Compaction | undefined => v.turns.at(-1)?.items.find((i): i is Compaction => i.kind === "compaction");

async function setup(skills: Skill[] = []) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const { chosen, streamFn } = scriptedModel();
  // What each request to the model carried, as text: a test can see what reached it.
  const sent: string[] = [];
  const watched = ((model: never, context: { messages: unknown[] }, options: never) => { sent.push(JSON.stringify(context.messages)); return (streamFn as (...a: unknown[]) => unknown)(model, context, options); }) as never;
  const host = new PiHost({ api, model: chosen!, streamFn: watched, skills: { enabled: async () => skills } });
  const settled = (): Promise<TerminalView> => new Promise((done) => {
    const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } });
  });
  const ask = async (text: string): Promise<TerminalView> => { const done = settled(); await host.prompt(text); return done; };
  return { host, sent, ask };
}

test("/compact is the command, with the words after it as the focus; anything else is not", () => {
  expect(compactAsked("/compact")).toBe("");
  expect(compactAsked("  /compact  ")).toBe("");
  expect(compactAsked("/compact keep the decisions about X")).toBe("keep the decisions about X");
  expect(compactAsked("/compact\nkeep the open questions")).toBe("keep the open questions");
  expect(compactAsked("/compactly")).toBeNull();
  expect(compactAsked("please /compact")).toBeNull();
  expect(compactAsked("/socratic-tutor")).toBeNull();
});

test("/compact summarises the earlier turns now, keeps the last exchange, and the gauge follows", async () => {
  const { host, sent, ask } = await setup();
  await ask("First question, about entropy.");
  await ask("Second question, about surprise.");
  const before = sent.length;
  const view = await ask("/compact keep the decisions about bits");
  // One request, the summary's: nothing was prompted.
  expect(sent.length).toBe(before + 1);
  expect(sent.at(-1)).toContain("<conversation>");
  expect(sent.at(-1)).toContain("Additional focus: keep the decisions about bits");
  const turn = view.turns.at(-1)!;
  expect(turn).toMatchObject({ asked: "/compact keep the decisions about bits", state: "done" });
  expect(turn.items.map((i) => i.kind)).toEqual(["compaction"]);
  const c = compactionOf(view)!;
  expect(c).toMatchObject({ state: "done", asked: true, summary: "Earlier, they asked about the notes. Kept: keep the decisions about bits" });
  expect(c.before).toBeGreaterThan(0);
  expect(view.tokens.input).toBe(c.after);
  // The next request begins with the summary, keeps the last exchange, and no longer carries the first.
  await ask("Third question.");
  const next = sent.at(-1)!;
  expect(next).toContain("Kept: keep the decisions about bits");
  expect(next).toContain("Second question, about surprise.");
  expect(next).not.toContain("First question, about entropy.");
  expect(next).not.toContain("/compact");
  expect(host.view().turns.at(-1)!.state).toBe("done");
});

test("/compact after a single exchange summarises all of it, and again carries the earlier summary in", async () => {
  const { sent, ask } = await setup();
  await ask("Only question, about channels.");
  expect(compactionOf(await ask("/compact"))).toMatchObject({ state: "done", asked: true });
  expect(sent.at(-1)).not.toContain("Additional focus");
  await ask("Another question, about codes.");
  expect(sent.at(-1)).not.toContain("Only question, about channels.");
  await ask("Yet another, about noise.");
  const view = await ask("/compact");
  expect(compactionOf(view)).toMatchObject({ state: "done" });
  expect(sent.at(-1)).toContain("<previous-summary>");
});

test("/compact with nothing to compact, or while the agent works, is refused with a reason", async () => {
  const { host, ask } = await setup();
  await expect(host.prompt("/compact")).rejects.toThrow(/nothing to compact/i);
  expect(host.view().turns).toHaveLength(0);
  const done = new Promise<void>((ok) => { const off = host.listen((v) => { if (!v.busy && v.turns.length) { off(); ok(); } }); });
  await host.prompt("wait 400\nsay slowly");
  await expect(host.prompt("/compact")).rejects.toThrow(/wait for the agent/i);
  await done;
  await ask("say ready");
  expect(host.view().turns).toHaveLength(2);
});

test("a skill named compact is not invoked by /compact: the pane's command comes first", async () => {
  const dir = join(root, `skill-${Math.random().toString(36).slice(2)}`, "compact");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  writeFileSync(file, "---\nname: compact\ndescription: A skill that would shadow it.\n---\n\nSHADOWING SKILL BODY\n");
  const { sent, ask } = await setup([{ name: "compact", description: "A skill that would shadow it.", source: "yours", dir, file }]);
  await ask("A question first.");
  const view = await ask("/compact");
  expect(compactionOf(view)).toMatchObject({ state: "done", asked: true });
  expect(sent.join("\n")).not.toContain("SHADOWING SKILL BODY");
});
