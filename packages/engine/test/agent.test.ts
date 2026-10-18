import { expect, test } from "vitest";
import { Engine, MemoryFiles, type EngineEvent } from "../src/index.ts";

const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
const NOTES = {
  "basics/entropy.md": note("Entropy", "The average surprise. It rests on [surprise](/basics/surprise.md \"requires\").\n\n## Units\n\nBits, with logarithms to base two."),
  "basics/surprise.md": note("Surprise", "Minus the logarithm of a probability."),
  "codes/huffman.md": note("Huffman codes", "Shortest prefix codes for known probabilities."),
};

async function open(similar = false) {
  const clock = { t: Date.parse("2026-10-18T09:00:00Z"), now() { return this.t; } };
  const engine = await Engine.open({
    notes: new MemoryFiles(NOTES), study: new MemoryFiles(), clock, device: "laptop1", name: "information-theory",
    ...(similar ? { similar: async () => ({ ready: true, hits: [{ note: "codes/huffman", heading: "", body: "Shortest prefix codes", score: 0.8 }] }) } : {}),
  });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  return { engine, events };
}

test("an agent is offered a brief of the base and Iso's look-ups, find_similar only where there is a search by meaning", async () => {
  const names = async (similar: boolean) => (await (await open(similar)).engine.agentTools()).map((t) => t.function.name);
  expect(await names(false)).toEqual(["brief_base", "search_notes", "outline_note", "read_note"]);
  expect(await names(true)).toEqual(["brief_base", "search_notes", "find_similar", "outline_note", "read_note"]);
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
  expect(steps[0]).toMatchObject({ tool: "search_notes", how: "keyword" });
  expect(steps[1]).toMatchObject({ how: "keyword", opened: "basics/entropy", section: "Units" });
  expect(steps[2]).toMatchObject({ how: "link", opened: "basics/surprise", from: "basics/entropy" });
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
