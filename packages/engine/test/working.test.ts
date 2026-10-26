import { expect, test } from "vitest";
import { Engine, KEY, MemoryFiles, MemorySecrets, OPENROUTER, type EngineEvent, type ProviderConfig } from "../src/index.ts";
import { scripted, type Scripted } from "./scripted.ts";

// A conversation's working set in the engine (M15): what Iso read stays in hand and ages off to a pointer, every
// part can be switched, earlier turns are summed up by hand or at the limit, and nothing else is cut.
const ENTROPY = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise of a source.\n\n## Units\n\nIn bits, with base 2.\n\n## Bounds\n\nAt most log n.\n";
const SURPRISE = "---\ntype: Concept\ntitle: Surprise\n---\n\nAn outcome of probability $p$ carries $-\\log p$.\n";

async function open(script: Scripted[], o: { provider?: Partial<ProviderConfig>; files?: Record<string, string> } = {}) {
  const clock = { t: Date.parse("2026-10-26T09:00:00Z"), now() { return (this.t += 1000); } };
  const notes = new MemoryFiles({ "basics/entropy.md": ENTROPY, "basics/surprise.md": SURPRISE, ...o.files }), own = new MemoryFiles();
  const provider = scripted(script);
  const engine = await Engine.open({ notes, own, clock, device: "laptop1", name: "information-theory", http: provider.http, secrets: new MemorySecrets({ [KEY]: "sk-test" }), provider: { ...OPENROUTER, context: 200_000, ...o.provider } });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  const ended = (turn: string) => new Promise<EngineEvent>((done) => {
    const seen = () => events.find((e) => "request" in e && e.request === turn && ["iso-done", "iso-stopped", "iso-failed"].includes(e.type));
    const now = seen();
    if (now) return done(now);
    const stop = engine.events(() => { const e = seen(); if (e) { stop(); done(e); } });
  });
  /** A turn, run to its end. */
  const ask = async (asked: string, conversation?: string, extra: { off?: string[] } = {}) => {
    const r = await engine.converse({ ...(conversation ? { conversation } : {}), mode: "ask", asked, tier: "low", given: [], ...extra });
    await ended(r.turn);
    return r.conversation;
  };
  return { engine, notes, own, ask, ...provider };
}
const userOf = (sent: { messages: { content: unknown }[] }) => String(sent.messages[1]!.content);

test("a section Iso read is in hand in later turns, not read again; unused for three turns it is set aside as a pointer", async () => {
  const { engine, ask, sent } = await open([
    { calls: [{ name: "read_note", arguments: { id: "basics/entropy", section: "Units" } }] }, { text: ["In bits."] },
    { text: ["Yes."] }, { text: ["Still."] }, { text: ["Again."] }, { text: ["Done."] },
  ]);
  const c = await ask("what is entropy measured in?");
  await ask("always?", c);
  const second = userOf(sent[2]!);
  expect(second).toContain('# Notes you read earlier in this conversation\n\n## Entropy (/basics/entropy.md), the section "Units"\n\n## Units\n\nIn bits, with base 2.');
  expect(second).not.toContain("At most log n");
  expect(JSON.stringify(sent[2]!.messages[0]!.content)).toContain("do not read it again");
  const ctx = await engine.turnContext({ conversation: c, mode: "ask", tier: "low", given: [] });
  expect(ctx.rows!.find((r) => r.key === "r:basics/entropy")).toMatchObject({ group: "notes", kind: "read", title: "Entropy", detail: "Units", by: "iso", on: true });
  // Unused in turns 2, 3 and 4: set aside before the fifth, as a pointer.
  await ask("and then?", c);
  await ask("and next?", c);
  await ask("last?", c);
  const fifth = userOf(sent[5]!);
  expect(fifth).not.toContain("# Notes you read earlier");
  expect(fifth).toContain("# Read earlier, set aside\n\n- Entropy (/basics/entropy.md)");
  expect((await engine.turnContext({ conversation: c, mode: "ask", tier: "low", given: [] })).rows!.find((r) => r.key === "r:basics/entropy")).toMatchObject({ on: false, aged: true });
});

test("every part switches: a note Iso read, an earlier turn, a part given, AGENTS.md; switched back, it is sent again", async () => {
  const { engine, ask, sent } = await open([
    { calls: [{ name: "read_note", arguments: { id: "basics/surprise" } }] }, { text: ["It is -log p."] }, { text: ["One."] }, { text: ["Two."] }, { text: ["Three."] },
  ], { files: { "AGENTS.md": "Write logarithms in base 2.\n" } });
  const c = await ask("what is surprise?");
  expect(userOf(sent[0]!)).toContain("# Their instructions for this knowledge base (AGENTS.md)\n\nWrite logarithms in base 2.");
  const turn = (await engine.conversation(c))!.turns[0]!.id;
  await engine.setContext(c, "r:basics/surprise", false);
  await engine.setContext(c, `t:${turn}`, false);
  await ask("and entropy?", c, { off: ["agents"] });
  const u = userOf(sent[2]!);
  expect(u).not.toContain("what is surprise?");
  expect(u).not.toContain("AGENTS.md");
  expect(u).toContain("# Read earlier, set aside\n\n- Surprise (/basics/surprise.md)");
  const ctx = await engine.turnContext({ conversation: c, mode: "ask", tier: "low", given: [{ kind: "note", id: "basics/entropy" }], off: ["g:note:basics/entropy"] });
  expect(ctx.rows!.map((r) => [r.key.replace(/:[0-9A-Z]{26}$/, ":<id>"), r.on])).toEqual([
    ["g:note:basics/entropy", false], ["r:basics/surprise", false], ["t:<id>", false], ["t:<id>", true], ["instructions", true], ["agents", true], ["message", true],
  ]);
  await engine.setContext(c, "r:basics/surprise", true);
  await engine.setContext(c, `t:${turn}`, true);
  await ask("once more?", c);
  expect(userOf(sent[3]!)).toContain("what is surprise?");
  expect(userOf(sent[3]!)).toContain("## Surprise (/basics/surprise.md)\n\n");
  await expect(engine.setContext(c, "x:nothing", true)).rejects.toThrow(/a part is/);
});

test("summed up by hand: a briefing written from typed fields stands for the earlier turns, and switched off gives them back", async () => {
  const brief = JSON.stringify({ settled: ["Entropy is measured in bits."], open: ["Why base 2?"], preferences: ["Use H(X)."], notes: ["/basics/entropy.md", "no/such-note"] });
  const { engine, ask, sent, own } = await open([{ text: ["Bits."] }, { text: ["Because."] }, { text: ["Sure."] }, { text: [brief], usage: { prompt_tokens: 300, completion_tokens: 40, cost: 0.0004 } }, { text: ["Go on."] }]);
  const c = await ask("what unit?");
  await ask("why that unit?", c);
  await ask("thanks", c);
  const done = await engine.compact(c);
  expect(done.briefing).toBe("Settled:\n- Entropy is measured in bits.\n\nStill open:\n- Why base 2?\n\nWhat they said they want:\n- Use H(X).\n\nThe notes it turned on: [Entropy](/basics/entropy.md)");
  expect(done.usd).toBeCloseTo(0.0004);
  // Asked of the low tier, with the turns but the last.
  expect(sent[3]!.model).toBe(OPENROUTER.tiers.low);
  expect(userOf(sent[3]!)).toContain("what unit?");
  expect(userOf(sent[3]!)).not.toContain("thanks");
  await ask("go on", c);
  const u = userOf(sent[4]!);
  expect(u).toContain("# Earlier in this conversation, summed up\n\nSettled:\n- Entropy is measured in bits.");
  expect(u).not.toContain("what unit?");
  expect(u).toContain("thanks");
  const rows = (await engine.turnContext({ conversation: c, mode: "ask", tier: "low", given: [] })).rows!.filter((r) => r.group === "conversation");
  expect(rows.map((r) => [r.kind, r.on, r.under ? "under" : ""])).toEqual([["briefing", true, ""], ["turn", false, "under"], ["turn", false, "under"], ["turn", true, ""], ["turn", true, ""]]);
  // Its cost is counted with Iso's.
  expect([...own.files.keys()].some((k) => k.startsWith("record/"))).toBe(true);
  await engine.setContext(c, rows[0]!.key, false);
  expect((await engine.turnContext({ conversation: c, mode: "ask", tier: "low", given: [] })).rows!.filter((r) => r.kind === "turn").every((r) => r.on)).toBe(true);
  await expect(engine.compact(c, 10)).rejects.toThrow(/nothing earlier to sum up/);
});

test("over the model's limit, the earliest turns are summed up before the turn is sent; still over, it is not sent, saying why", async () => {
  const long = "word ".repeat(2400);
  // Counted as the provider would count them, so the sizes are not scaled down.
  const { engine, ask, sent } = await open([{ text: [long], usage: { prompt_tokens: 2000, completion_tokens: 3000, cost: 0 } }, { text: [long], usage: { prompt_tokens: 5000, completion_tokens: 3000, cost: 0 } }, { text: ['{"settled":["Long answers."],"open":[],"preferences":[],"notes":[]}'] }, { text: ["Short now."] }], { provider: { context: 6000 } });
  const c = await ask("tell me everything");
  await ask("and more", c);
  await ask("briefly?", c);
  // The third call summed up the first turn; the fourth, the turn itself, was sent the briefing and the second turn.
  expect(String(sent[2]!.messages[0]!.content)).toContain("You sum up the earlier turns");
  expect(userOf(sent[3]!)).toContain("Settled:\n- Long answers.");
  expect(userOf(sent[3]!)).toContain("and more");
  // A note too big for the model on its own is refused, with what is largest.
  const big = await open([], { provider: { context: 3000 }, files: { "basics/big.md": `---\ntype: Concept\ntitle: Big\n---\n\n${"x".repeat(20_000)}\n` } });
  await expect(big.engine.converse({ mode: "ask", asked: "read it", tier: "low", given: [{ kind: "note", id: "basics/big" }] })).rejects.toMatchObject({ status: 413, message: expect.stringMatching(/more than the 3k the model takes\. The largest part is what you gave \(\d+k\)/) });
});

test("sizes are as the provider counted, once it has: the estimate times its count for it", async () => {
  const { engine, ask } = await open([{ text: ["Bits."], usage: { prompt_tokens: 4000, completion_tokens: 2, cost: 0.001 } }]);
  const before = await engine.turnContext({ mode: "ask", tier: "low", given: [] });
  expect(before.counted).toBe(false);
  const c = await ask("unit?");
  const after = await engine.turnContext({ conversation: c, mode: "ask", tier: "low", given: [] });
  expect(after.counted).toBe(true);
  // The instructions alone were estimated near what the first turn was: counted, they are scaled up to match.
  expect(after.rows!.find((r) => r.key === "instructions")!.tokens).toBeGreaterThan(before.rows!.find((r) => r.key === "instructions")!.tokens * 1.5);
});

test("a new conversation from here starts from a briefing of the old one, and is sent it", async () => {
  const { engine, ask, sent } = await open([{ text: ["Bits."] }, { text: ['{"settled":["They use bits."],"open":["Nats?"],"preferences":[],"notes":["basics/entropy"]}'] }, { text: ["Nats are base e."] }]);
  const old = await ask("what unit?");
  const { conversation } = await engine.branch(old);
  expect(conversation).not.toBe(old);
  expect((await engine.conversation(conversation))!.turns).toEqual([]);
  expect((await engine.turnContext({ conversation, mode: "ask", tier: "low", given: [] })).rows!.find((r) => r.kind === "briefing")).toMatchObject({ detail: "from an earlier conversation", on: true });
  await ask("and nats?", conversation);
  expect(userOf(sent[2]!)).toContain("Settled:\n- They use bits.\n\nStill open:\n- Nats?");
  expect(userOf(sent[2]!)).not.toContain("what unit?");
});
