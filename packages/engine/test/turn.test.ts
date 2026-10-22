import { expect, test } from "vitest";
import { Engine, KEY, MemoryFiles, MemorySecrets, readTurns, type EngineEvent } from "../src/index.ts";
import { scripted, type Scripted } from "./scripted.ts";

const ENTROPY = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n";
const SURPRISE = "---\ntype: Concept\ntitle: Surprise\ndescription: How unexpected one outcome is.\n---\n\nAn outcome of probability $p$ carries $-\\log p$.\n\n## Units\n\nWith base 2 the unit is the bit.\n";

async function open(script: Scripted[]) {
  const clock = { t: Date.parse("2026-10-22T09:00:00Z"), now() { return this.t; } };
  const notes = new MemoryFiles({ "basics/entropy.md": ENTROPY, "basics/surprise.md": SURPRISE }), study = new MemoryFiles();
  const provider = scripted(script);
  const engine = await Engine.open({ notes, study, clock, device: "laptop1", name: "information-theory", http: provider.http, secrets: new MemorySecrets({ [KEY]: "sk-test" }) });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  const ended = (turn: string) => new Promise<EngineEvent>((done) => {
    const seen = () => events.find((e) => "request" in e && e.request === turn && ["iso-done", "iso-stopped", "iso-failed"].includes(e.type));
    const now = seen();
    if (now) return done(now);
    const stop = engine.events(() => { const e = seen(); if (e) { stop(); done(e); } });
  });
  return { engine, notes, study, events, ended, clock, ...provider };
}

test("a turn in Ask mode: what was given is sent, what Iso looks up and points to is kept with its reply, and nothing is written", async () => {
  const { engine, notes, study, events, ended, sent } = await open([
    { calls: [{ name: "read_note", arguments: { id: "basics/surprise", section: "Units" } }] },
    { calls: [{ name: "point_to_note", arguments: { id: "basics/surprise", why: "It has the units." } }] },
    { text: ["In bits, ", "with base 2."], usage: { prompt_tokens: 900, completion_tokens: 12, cost: 0.003 } },
  ]);
  const { conversation, turn } = await engine.converse({ mode: "ask", asked: "what is it measured in?", tier: "mid", given: [{ kind: "note", id: "basics/entropy" }, { kind: "passage", id: "basics/surprise", text: "An outcome of probability $p$ carries $-\\log p$." }] });
  // Its cost is all three calls'.
  expect(await ended(turn)).toMatchObject({ type: "iso-done", cost: { usd: 0.011 } });

  // What was sent: Ask mode's rules and tools, the note and the passage given, and the question.
  const system = JSON.stringify(sent[0]!.messages[0]!.content), user = String(sent[0]!.messages[1]!.content);
  expect(system).toContain("Ask mode");
  expect(user).toContain("## Entropy (/basics/entropy.md)");
  expect(user).toContain("## A passage they chose in Surprise (/basics/surprise.md)\n\n> An outcome of probability $p$ carries $-\\log p$.");
  expect(user).toContain("# What they ask now\n\nwhat is it measured in?");
  expect(sent[0]!.tools!.map((t) => t.function.name)).toEqual(["search_notes", "outline_note", "read_note", "point_to_note"]);

  // Kept in the conversation's file, in order; the notes are as they were.
  const [t] = readTurns(study.files.get(`conversations/${conversation}.jsonl`)!);
  expect(t).toMatchObject({ id: turn, mode: "ask", asked: "what is it measured in?", state: "done", cost: { usd: 0.011 } });
  expect(t!.items.map((i) => i.kind)).toEqual(["look", "point", "text"]);
  expect(t!.items[1]).toEqual({ kind: "point", note: "basics/surprise", why: "It has the units." });
  expect(t!.items[2]).toEqual({ kind: "text", text: "In bits, with base 2." });
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  expect(events.filter((e) => e.type.startsWith("iso-")).map((e) => e.type)).toEqual(["iso-start", "iso-step", "iso-item", "iso-item", "iso-text", "iso-text", "iso-item", "iso-done"]);
  expect(await engine.conversation()).toMatchObject({ id: conversation, turns: [{ id: turn }] });
});

test("a second turn is sent the first; one turn at a time; Iso kept from looking further has no look-ups", async () => {
  const { engine, ended, sent } = await open([{ text: ["Bits."] }, { text: ["Yes."] }]);
  const first = await engine.converse({ mode: "ask", asked: "what is it measured in?", tier: "low", given: [] });
  await expect(engine.converse({ conversation: first.conversation, mode: "ask", asked: "again", tier: "low", given: [] })).rejects.toMatchObject({ status: 409 });
  await ended(first.turn);
  const second = await engine.converse({ conversation: first.conversation, mode: "ask", asked: "always?", tier: "low", given: [], lookup: false });
  await ended(second.turn);
  const user = String(sent[1]!.messages[1]!.content);
  expect(user).toContain("# Earlier in this conversation\n\nIn ask mode they asked: what is it measured in?\n\nYou wrote:\n\nBits.");
  expect(sent[1]!.tools!.map((t) => t.function.name)).toEqual(["point_to_note"]);
  expect((await engine.conversation(first.conversation))!.turns.map((t) => t.asked)).toEqual(["what is it measured in?", "always?"]);
  // What a turn would send, part by part.
  const ctx = await engine.turnContext({ conversation: first.conversation, mode: "ask", tier: "mid", given: [{ kind: "folder", id: "basics" }] });
  expect(ctx.parts.map((p) => p.name)).toEqual(["instructions and tools", "earlier in this conversation", "what you gave", "your message"]);
  expect(ctx.parts[1]).toMatchObject({ detail: "2 turns" });
  expect(ctx.session.usd).toBeCloseTo(0.008);
});

test("Build is the terminal's, a note outside the base is not given, and a stopped turn is kept as stopped", async () => {
  let release!: () => void;
  const { engine, ended, study } = await open([{ text: ["Bi", "ts."], hold: new Promise<void>((r) => (release = r)) }]);
  await expect(engine.converse({ mode: "build", asked: "x", tier: "mid", given: [] })).rejects.toMatchObject({ status: 409 });
  await expect(engine.converse({ mode: "ask", asked: "x", tier: "mid", given: [{ kind: "note", id: "@study/x" }] })).rejects.toThrow(/only notes of the base/);
  const { conversation, turn } = await engine.converse({ mode: "ask", asked: "what is it measured in?", tier: "mid", given: [] });
  await new Promise((r) => setTimeout(r, 20));
  await engine.stop(turn);
  release();
  expect(await ended(turn)).toMatchObject({ type: "iso-stopped" });
  expect(readTurns(study.files.get(`conversations/${conversation}.jsonl`)!)[0]).toMatchObject({ state: "stopped" });
});
