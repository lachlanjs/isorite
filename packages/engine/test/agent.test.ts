import { expect, test } from "vitest";
import { pending } from "@isorite/core";
import { Engine, MemoryFiles, type EngineEvent } from "../src/index.ts";

const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
const NOTES = {
  "basics/entropy.md": note("Entropy", "The average surprise. It rests on [surprise](/basics/surprise.md \"requires\").\n\n## Units\n\nBits, with logarithms to base two."),
  "basics/surprise.md": note("Surprise", "Minus the logarithm of a probability."),
  "codes/huffman.md": note("Huffman codes", "Shortest prefix codes for known probabilities."),
};

async function open(similar = false, withStudy = true) {
  const clock = { t: Date.parse("2026-10-18T09:00:00Z"), now() { return this.t; } };
  const engine = await Engine.open({
    notes: new MemoryFiles(NOTES), study: withStudy ? new MemoryFiles() : null, clock, device: "laptop1", name: "information-theory",
    ...(similar ? { similar: async () => ({ ready: true, hits: [{ note: "codes/huffman", heading: "", body: "Shortest prefix codes", score: 0.8 }] }) } : {}),
  });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  return { engine, events };
}

test("an agent is offered a brief of the base and Iso's look-ups, find_similar only where there is a search by meaning", async () => {
  const names = async (similar: boolean) => (await (await open(similar)).engine.agentTools()).map((t) => t.function.name);
  expect(await names(false)).toEqual(["brief_base", "search_notes", "outline_note", "read_note", "propose_note_edit", "propose_note_write"]);
  expect(await names(true)).toEqual(["brief_base", "search_notes", "find_similar", "outline_note", "read_note", "propose_note_edit", "propose_note_write"]);
});

test("the brief names the base, its folders and how many notes each holds, and is no step on the map", async () => {
  const { engine, events } = await open();
  const { text } = await engine.agentLook({ agent: "opencode", session: "s1", tool: "brief_base", args: {} });
  expect(text).toContain("information-theory: a knowledge base of 3 notes in 2 folders");
  expect(text).toContain("- basics (2)");
  expect(text).toContain("- codes (1)");
  expect(events).toEqual([]);
});

test("an agent's look-ups are one turn, from busy to idle, each step published with how the note was reached", async () => {
  const { engine, events } = await open();
  await engine.agentStatus("opencode", "s1", true);
  const found = await engine.agentLook({ agent: "opencode", session: "s1", tool: "search_notes", args: { query: "average surprise" } });
  expect(found.text).toContain("Entropy (/basics/entropy.md)");
  await engine.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "basics/entropy", section: "Units" } });
  const followed = await engine.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "/basics/surprise.md" } });
  expect(followed.text).toContain("Minus the logarithm");
  await engine.agentStatus("opencode", "s1", false);

  expect(events.map((e) => e.type)).toEqual(["agent-start", "agent-step", "agent-step", "agent-step", "agent-done"]);
  const request = (events[0] as { request: string }).request;
  expect(events.every((e) => "request" in e && e.request === request)).toBe(true);
  const steps = events.flatMap((e) => (e.type === "agent-step" ? [e.step] : []));
  expect(steps[0]).toMatchObject({ tool: "search_notes", how: "keyword", query: "average surprise" });
  expect(steps[1]).toMatchObject({ how: "keyword", opened: "basics/entropy", section: "Units" });
  expect(steps[2]).toMatchObject({ how: "link", opened: "basics/surprise", from: "basics/entropy", rel: "requires" });
  expect(events.every((e) => "session" in e && e.session === "s1")).toBe(true);
});

test("a look-up outside a turn starts one; sessions and agents keep turns of their own; idle twice ends once", async () => {
  const { engine, events } = await open();
  await engine.agentLook({ agent: "opencode", session: "s1", tool: "search_notes", args: { query: "huffman" } });
  await engine.agentLook({ agent: "opencode", session: "s2", tool: "search_notes", args: { query: "huffman" } });
  await engine.agentLook({ agent: "claude-code", session: "s1", tool: "search_notes", args: { query: "huffman" } });
  const starts = events.filter((e) => e.type === "agent-start");
  expect(starts).toHaveLength(3);
  expect(new Set(starts.map((e) => (e as { request: string }).request)).size).toBe(3);
  await engine.agentStatus("opencode", "s1", false);
  await engine.agentStatus("opencode", "s1", false);
  expect(events.filter((e) => e.type === "agent-done")).toHaveLength(1);
});

test("a failed look-up is a failed step, said in words the agent can act on", async () => {
  const { engine, events } = await open();
  const { text } = await engine.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "no/such" } });
  expect(text).toMatch(/There is no note no\/such/);
  expect(events.at(-1)).toMatchObject({ type: "agent-step", step: { failed: true } });
});

test("an agent's edit to a note waits to be kept: a rewrite from agent:<name>, the file untouched until it is", async () => {
  const { engine } = await open();
  await engine.agentLook({ agent: "opencode", session: "s1", tool: "read_note", args: { id: "basics/entropy" } });
  const before = (await engine.readNote("basics/entropy")).text;
  const said = await engine.agentPropose({ agent: "opencode", session: "s1", note: "basics/entropy.md", asked: "say it is measured in bits", edit: { oldString: "The average surprise.", newString: "The average surprise, in bits." } });
  expect(said.text).toMatch(/waits for the person to keep it/);
  expect((await engine.readNote("basics/entropy")).text).toBe(before);
  const waiting = pending(await engine.journal("basics/entropy"));
  expect(waiting).toHaveLength(1);
  expect(waiting[0]).toMatchObject({ who: "agent:opencode", form: "rewrite", asked: "say it is measured in bits", read: ["basics/entropy"], regions: [{ old: { text: "The average surprise.", nth: 0 }, new: "The average surprise, in bits." }] });
  await engine.keep("basics/entropy", waiting[0]!.id);
  expect((await engine.readNote("basics/entropy")).text).toContain("The average surprise, in bits.");
  expect((await engine.journal("basics/entropy")).at(-1)).toMatchObject({ kind: "change", why: "keep" });
});

test("a whole note written anew is offered as the passages that changed", async () => {
  const { engine } = await open();
  const text = (await engine.readNote("basics/surprise")).text;
  await engine.agentPropose({ agent: "opencode", session: "s1", note: "basics/surprise", asked: "", edit: { content: text.replace("Minus the logarithm", "The negative logarithm") + "\nIt is measured in bits.\n" } });
  const [p] = pending(await engine.journal("basics/surprise"));
  expect(p).toMatchObject({ form: "rewrite", asked: "an edit" });
  expect(p!.form === "rewrite" && p!.regions.length).toBe(1);
});

test("a new note waits as a note for review, its title from what was written", async () => {
  const { engine } = await open();
  const said = await engine.agentPropose({ agent: "opencode", session: "s1", note: "codes/arithmetic.md", asked: "add a note on arithmetic coding", edit: { content: "---\ntype: Concept\ntitle: Arithmetic coding\n---\n\nCodes a whole message as one number.\n" } });
  expect(said.text).toMatch(/"Arithmetic coding" waits .* as a note for review/);
  expect(said.text).toContain("you meant codes");
  const [draft] = await engine.drafts();
  expect(draft).toMatchObject({ title: "Arithmetic coding" });
  const [p] = pending(await engine.journal(draft!.id));
  expect(p).toMatchObject({ who: "agent:opencode", form: "insert", text: "Codes a whole message as one number.\n", asked: "add a note on arithmetic coding" });
  expect((await engine.notes()).notes.map((n) => n.id)).not.toContain("codes/arithmetic");
});

test("an edit to no note, an edit that names nothing, and an edit with no study base are refused, saying why", async () => {
  const { engine } = await open();
  await expect(engine.agentPropose({ agent: "opencode", session: "s1", note: "no/such", asked: "", edit: { oldString: "a", newString: "b" } })).rejects.toThrow(/no note no\/such.*write the whole/);
  await expect(engine.agentPropose({ agent: "opencode", session: "s1", note: "basics/entropy", asked: "", edit: { oldString: "not there", newString: "b" } })).rejects.toThrow(/not in the note/);
  const bare = await open(false, false);
  await expect(bare.engine.agentPropose({ agent: "opencode", session: "s1", note: "basics/entropy", asked: "", edit: { oldString: "The", newString: "A" } })).rejects.toThrow(/no study base/);
});

test("proposing through the tools is proposing: what was asked rides along; a refusal is an error", async () => {
  const { engine } = await open();
  await engine.agentLook({ agent: "opencode", session: "s1", tool: "propose_note_edit", asked: "plainer", args: { note: "/basics/surprise.md", oldString: "Minus the logarithm", newString: "The negative logarithm" } });
  expect(pending(await engine.journal("basics/surprise"))[0]).toMatchObject({ who: "agent:opencode", asked: "plainer" });
  await expect(engine.agentLook({ agent: "opencode", session: "s1", tool: "propose_note_edit", args: { note: "basics/surprise" } })).rejects.toThrow(/needs oldString/);
});

test("a search by meaning keeps how alike each note found was", async () => {
  const { engine, events } = await open(true);
  await engine.agentLook({ agent: "opencode", session: "s1", tool: "find_similar", args: { text: "short codes" } });
  expect(events.at(-1)).toMatchObject({ type: "agent-step", step: { how: "meaning", query: "short codes", scores: { "codes/huffman": 0.8 } } });
});

test("a note or a passage sent from the browser is published with what the agent is told; its taking is published too", async () => {
  const { engine, events } = await open();
  const { id } = await engine.agentSend({ note: "basics/entropy", passage: "  Bits, with logarithms to base two.  ", said: "check my units" });
  expect(events.at(-1)).toMatchObject({ type: "agent-sent", id, note: "basics/entropy", title: "Entropy", passage: "Bits, with logarithms to base two.", said: "check my units" });
  const told = (events.at(-1) as { text: string }).text;
  expect(told).toContain('this passage of their note "Entropy" (/basics/entropy.md):\n\nBits, with logarithms to base two.');
  expect(told).toContain("They said: check my units");
  await engine.agentSend({ note: "basics/surprise", said: "" });
  expect((events.at(-1) as { text: string }).text).toBe('The person sent you, from the browser, their note "Surprise" (/basics/surprise.md). Read it with read_note if you need it.');
  await engine.agentReceived(id, "opencode");
  expect(events.at(-1)).toEqual({ type: "agent-received", id, agent: "opencode" });
  await expect(engine.agentSend({ note: "no/such", said: "" })).rejects.toThrow(/no such note/);
});
