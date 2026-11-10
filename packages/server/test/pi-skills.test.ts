// Skills for isorite's own agent: where they are read from and which wins, one that cannot be read, what the model is
// told of them (the names alone, and nothing where none is on), the files `use_skill` will and will not read, and `/name`
// at the start of a message. On the scripted model.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { scriptedModel } from "../src/pi/scripted.ts";
import { BUILTIN_SKILLS, Skills, discover, skillTool } from "../src/pi/skills.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-skills-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const skill = (dir: string, name: string, description: string, body = `Instructions of ${name}.`, extra: Record<string, string> = {}) => {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
  for (const [f, text] of Object.entries(extra)) { mkdirSync(join(dir, name, f, ".."), { recursive: true }); writeFileSync(join(dir, name, f), text); }
};
const dirs = (tag: string) => ({ builtin: join(root, tag, "builtin"), user: join(root, tag, "user"), base: join(root, tag, "base") });

test("the skill isorite ships is found, with its licence beside it", async () => {
  const { skills, broken } = await discover({ builtin: BUILTIN_SKILLS, user: join(root, "none"), base: join(root, "none") });
  expect(broken).toEqual([]);
  const tutor = skills.find((s) => s.name === "socratic-tutor")!;
  expect(tutor.source).toBe("built-in");
  expect(tutor.description).toMatch(/Socratic tutoring/);
});

test("a later source wins by name, and each says where it is from", async () => {
  const d = dirs("precedence");
  skill(d.builtin, "alpha", "from the build"); skill(d.builtin, "beta", "built beta");
  skill(d.user, "alpha", "from the person"); skill(d.user, "gamma", "theirs");
  skill(d.base, "alpha", "from the base");
  const rows = await new Skills(d).list();
  expect(rows.map((r) => [r.name, r.source, r.description, r.enabled])).toEqual([
    ["alpha", "base", "from the base", true], ["beta", "built-in", "built beta", true], ["gamma", "yours", "theirs", true],
  ]);
});

test("a skill that cannot be read is listed with why and never on, and the rest still load", async () => {
  const d = dirs("broken");
  skill(d.user, "fine", "works");
  mkdirSync(join(d.user, "nodesc")); writeFileSync(join(d.user, "nodesc", "SKILL.md"), "---\nname: nodesc\n---\nBody.\n");
  mkdirSync(join(d.user, "Bad Name")); writeFileSync(join(d.user, "Bad Name", "SKILL.md"), "---\nname: Bad Name\ndescription: has a bad name\n---\nBody.\n");
  mkdirSync(join(d.user, "empty")); writeFileSync(join(d.user, "empty", "SKILL.md"), "---\nname: empty\ndescription: no body\n---\n");
  mkdirSync(join(d.user, "garbled")); writeFileSync(join(d.user, "garbled", "SKILL.md"), "---\nname: [unclosed\n  : :\n---\nBody\n");
  mkdirSync(join(d.user, "not-a-skill")); writeFileSync(join(d.user, "not-a-skill", "notes.txt"), "nothing");
  const s = new Skills(d);
  const rows = await s.list();
  expect(rows.filter((r) => r.error).map((r) => r.name).sort()).toEqual(["Bad Name", "empty", "garbled", "nodesc"]);
  expect(rows.every((r) => !r.error || (!r.enabled && r.error.length > 0))).toBe(true);
  expect((await s.enabled()).map((x) => x.name)).toEqual(["fine"]);
});

test("use_skill reads inside the skill's folder and nowhere else", async () => {
  const d = dirs("confine");
  skill(d.user, "reader", "reads", "Use the guide.", { "refs/guide.md": "The guide.", "LICENSE.md": "licence" });
  writeFileSync(join(root, "confine", "secret.txt"), "secret");
  symlinkSync(join(root, "confine", "secret.txt"), join(d.user, "reader", "refs", "link.md"));
  writeFileSync(join(d.user, "reader", "big.md"), "x".repeat(300_000));
  writeFileSync(join(d.user, "reader", "bin.dat"), Buffer.from([1, 0, 2]));
  const tool = skillTool(await new Skills(d).enabled());
  const call = async (args: Record<string, unknown>) => ((await tool.execute("1", args as never)).content[0] as { text: string }).text;
  const body = await call({ name: "reader" });
  expect(body).toContain("Use the guide.");
  expect(body).toContain("- refs/guide.md");
  expect(body).not.toContain("LICENSE");
  expect(body).not.toContain("description: reads");
  expect(await call({ name: "reader", path: "refs/guide.md" })).toBe("The guide.");
  for (const path of ["../../secret.txt", "../secret.txt", join(root, "confine", "secret.txt"), "refs/link.md", "refs/../../../secret.txt", "missing.md", "refs", "big.md", "bin.dat"]) {
    await expect(call({ name: "reader", path }), path).rejects.toThrow();
  }
  await expect(call({ name: "nothing" })).rejects.toThrow(/no skill "nothing" is on/);
});

// A host on the scripted model, with what each request carried kept for a test to read.
async function setup(skills: Skills | undefined) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const { chosen, streamFn } = scriptedModel();
  const sent: { messages: { role?: string; content?: unknown; sections?: Record<string, string | null> }[]; tools?: { name: string }[] }[] = [];
  const spy = ((m: never, c: { messages: never[]; tools?: never[] }, o: never) => { sent.push({ messages: structuredClone(c.messages), tools: c.tools }); return (streamFn as unknown as (...a: unknown[]) => unknown)(m, c, o); }) as never;
  const host = new PiHost({ api, model: chosen!, streamFn: spy, ...(skills ? { skills } : {}) });
  const turn = async (text: string): Promise<TerminalView> => {
    const done = new Promise<TerminalView>((ok) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); ok(v); } }); });
    await host.prompt(text);
    return done;
  };
  /** The skills section the model was last sent, and the tools it had. */
  const last = () => {
    const r = sent.at(-1)!;
    let section: string | null = null;
    for (const m of r.messages) if (m.role === "system" && m.sections && "skills" in m.sections) section = m.sections.skills ?? null;
    const added = r.messages.flatMap((m) => (m.role === "system" ? ((m as { toolsAdded?: { name: string }[] }).toolsAdded ?? []).map((t) => t.name) : []));
    const tools = [...new Set([...added, ...(r.tools ?? []).map((t) => t.name)])];
    return { section, tools, messages: r.messages };
  };
  return { api, turn, last };
}

test("only the names and descriptions of the skills that are on are in what the model is sent, with the tool; none on, neither", async () => {
  const d = dirs("prompt");
  skill(d.user, "alpha", "does the alpha thing", "SECRET BODY ALPHA"); skill(d.user, "beta", "does the beta thing");
  const { api, turn, last } = await setup(new Skills(d, async () => [...off]));
  const off = new Set<string>();
  await turn("hello");
  expect(last().section).toContain("- alpha: does the alpha thing");
  expect(last().section).toContain("- beta: does the beta thing");
  expect(last().section).not.toContain("SECRET BODY");
  expect(last().tools).toContain("use_skill");
  // Beta off: it goes from the section (a patch), alpha stays.
  off.add("beta");
  await turn("again");
  expect(last().section).toContain("alpha");
  expect(last().section).not.toContain("beta");
  // None on: no section and no tool.
  off.add("alpha");
  await turn("and again");
  expect(last().section).toBeNull();
  expect(JSON.stringify(last().messages.filter((m) => m.role === "user"))).not.toContain("SECRET BODY");
  void api;
});

test("with no skills at all the model is sent no section and no use_skill", async () => {
  const d = dirs("none");
  const { turn, last } = await setup(new Skills(d));
  await turn("hello");
  expect(last().section).toBeNull();
  expect(last().tools).not.toContain("use_skill");
  const { turn: plain, last: lastPlain } = await setup(undefined);
  await plain("hello");
  expect(lastPlain().section).toBeNull();
  expect(lastPlain().tools).not.toContain("use_skill");
});

test("the agent uses a skill by calling use_skill, and reads a file of it", async () => {
  const d = dirs("use");
  skill(d.user, "alpha", "does the alpha thing", "Alpha says: ask first.", { "refs/more.md": "More of alpha." });
  const { turn } = await setup(new Skills(d));
  const view = await turn("skill alpha\nskill alpha refs/more.md\nskill alpha ../../x");
  const calls = view.turns.at(-1)!.items.filter((i) => i.kind === "tool");
  expect(calls.map((c) => (c as { name?: string }).name ?? (c as { tool?: string }).tool)).toEqual(["use_skill", "use_skill", "use_skill"]);
  const shown = JSON.stringify(view.turns.at(-1)!.items);
  expect(shown).toContain("Alpha says: ask first.");
  expect(shown).toContain("More of alpha.");
  expect(shown).toMatch(/has no file/);
});

test("/name at the start of a message loads that skill for the turn; the pane shows what was typed", async () => {
  const d = dirs("slash");
  skill(d.user, "alpha", "does the alpha thing", "Alpha says: ask first.");
  skill(d.user, "beta", "does the beta thing", "Beta says: be brief.");
  const off = new Set(["beta"]);
  const { turn, last } = await setup(new Skills(d, async () => [...off]));
  const view = await turn("/alpha explain entropy");
  expect(view.turns.at(-1)!.asked).toBe("/alpha explain entropy");
  const user = last().messages.filter((m) => m.role === "user").at(-1)!;
  const blocks = (user.content as { text: string }[]).map((b) => b.text);
  expect(blocks.at(-1)).toBe("explain entropy");
  expect(blocks.join("\n")).toContain("Alpha says: ask first.");
  expect(blocks.join("\n")).toContain("invoked the skill alpha");
  // A skill that is off, or none by that name, is just text.
  await turn("/beta explain entropy");
  const plain = (last().messages.filter((m) => m.role === "user").at(-1)!.content as { text: string }[]).map((b) => b.text);
  expect(plain).toEqual(["/beta explain entropy"]);
  await turn("/usr/bin/env is what");
  expect((last().messages.filter((m) => m.role === "user").at(-1)!.content as { text: string }[]).map((b) => b.text)).toEqual(["/usr/bin/env is what"]);
  // With no request after the name, the skill begins.
  await turn("/alpha");
  expect((last().messages.filter((m) => m.role === "user").at(-1)!.content as { text: string }[]).map((b) => b.text).at(-1)).toMatch(/begin as the skill says/);
});

test("what a base switches off is kept in its settings, and read back", async () => {
  const base = await writeExample(join(root, `settings-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  expect(await api.agentSkillsOff()).toEqual({ off: [] });
  await api.setAgentSkillsOff(["socratic-tutor", "alpha", "alpha"]);
  expect(await api.agentSkillsOff()).toEqual({ off: ["alpha", "socratic-tutor"] });
  const again = await openEngine(locate(base.notes), "testdev1", null);
  expect((await again.agentSkillsOff()).off).toEqual(["alpha", "socratic-tutor"]);
  await again.setAgentSkillsOff([]);
  expect(await again.agentSkillsOff()).toEqual({ off: [] });
});
