import { expect, test } from "vitest";
import { blocks, hashText, insertAt, pending, readJournal, replay, rewriteOf, type Change, type Proposal } from "@isorite/core";
import { Engine, HERE, MemoryFiles, MemorySecrets, KEY, parseRewrite, type EngineEvent } from "../src/index.ts";
import { scripted, type Scripted } from "./scripted.ts";

const ENTROPY = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n";
const SURPRISE = "---\ntype: Concept\ntitle: Surprise\ndescription: How unexpected one outcome is.\n---\n\nAn outcome of probability $p$ carries $-\\log p$.\n\n## Units\n\nWith base 2 the unit is the bit.\n";

async function open(script: Scripted[], opts: { key?: string | null; similar?: boolean } = {}) {
  const clock = { t: Date.parse("2026-10-13T09:00:00Z"), now() { return this.t; } };
  const notes = new MemoryFiles({ "basics/entropy.md": ENTROPY, "basics/surprise.md": SURPRISE }), study = new MemoryFiles();
  const provider = scripted(script);
  const secrets = new MemorySecrets(opts.key === null ? {} : { [KEY]: opts.key ?? "sk-test" });
  const engine = await Engine.open({
    notes, study, clock, device: "laptop1", name: "information-theory", http: provider.http, secrets,
    ...(opts.similar ? { similar: async () => ({ ready: true, hits: [{ note: "basics/surprise", heading: "Units", body: "With base 2 the unit is the bit.", score: 0.81 }] }) } : {}),
  });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  /** Wait for a request to end, and say how. */
  const ended = (request: string) => new Promise<EngineEvent>((done) => {
    const seen = () => events.find((e) => "request" in e && e.request === request && ["iso-done", "iso-stopped", "iso-failed"].includes(e.type));
    const now = seen();
    if (now) return done(now);
    const stop = engine.events(() => { const e = seen(); if (e) { stop(); done(e); } });
  });
  const journal = () => readJournal(study.files.get("journal/basics/entropy.jsonl") ?? "");
  /** Ask for text after the note's first paragraph. */
  const ask = (asked = "say what it is measured in", tier: "low" | "mid" | "max" = "mid") =>
    engine.ask({ note: "basics/entropy", ...insertAt(ENTROPY, 6), asked, tier });
  return { engine, clock, notes, study, events, ended, journal, ask, ...provider };
}

test("asking puts nothing in the note's file: the reply is a proposal in the journal, with what it cost", async () => {
  const { ask, ended, notes, journal, events, sent, headers } = await open([{ text: ["Entropy is measured ", "in bits."], usage: { prompt_tokens: 1200, completion_tokens: 9, cost: 0.0041, cached: 800 } }]);
  const { request } = await ask();
  expect(await ended(request)).toMatchObject({ type: "iso-done" });
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  const [p] = pending(journal()) as Proposal[];
  expect(p).toMatchObject({
    kind: "proposal", form: "insert", who: "iso:openrouter/anthropic/claude-sonnet-5.5", asked: "say what it is measured in", text: "Entropy is measured in bits.",
    after: { text: "The average surprise of a source.", nth: 0 }, before: { text: "It is largest when every symbol is equally likely.", nth: 0 },
    cost: { model: "anthropic/claude-sonnet-5.5", tier: "mid", tokensIn: 1200, tokensOut: 9, tokensCached: 800, usd: 0.0041 }, read: [],
  });
  // What streamed is what was entered, and the events came in order.
  expect(events.filter((e) => e.type === "iso-text").map((e) => e.type === "iso-text" && e.delta).join("")).toBe("Entropy is measured in bits.");
  expect(events.filter((e) => e.type.startsWith("iso-")).map((e) => e.type)).toEqual(["iso-start", "iso-text", "iso-text", "iso-done"]);
  // What was sent: the key as a bearer, the mid tier's model, the note with the point marked, and the request.
  expect(headers[0]!.Authorization).toBe("Bearer sk-test");
  expect(sent[0]!.model).toBe("anthropic/claude-sonnet-5.5");
  const user = String(sent[0]!.messages[1]!.content);
  expect(user).toContain(`The average surprise of a source.\n\n${HERE}\n\nIt is largest`);
  expect(user).toContain("# What they ask now\n\nsay what it is measured in");
  expect(sent[0]!.tools!.map((t) => t.function.name)).toEqual(["search_notes", "outline_note", "read_note"]);
});

test("keeping writes the proposal into the note at its place, as one journal entry that names it", async () => {
  const { engine, ask, ended, notes, journal } = await open([{ text: ["Entropy is measured in bits."] }]);
  const done = await ended((await ask()).request);
  const id = done.type === "iso-done" ? done.proposal : "";
  const kept = await engine.keep("basics/entropy", id);
  const text = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise of a source.\n\nEntropy is measured in bits.\n\nIt is largest when every symbol is equally likely.\n";
  expect(kept).toMatchObject({ text, changed: true });
  expect(notes.files.get("basics/entropy.md")).toBe(text);
  const last = journal().at(-1) as Change;
  expect(last).toMatchObject({ kind: "change", why: "keep", who: "you", proposal: id });
  expect(pending(journal())).toEqual([]);
  expect(replay(journal())!.text).toBe(text);
  await expect(engine.keep("basics/entropy", id)).rejects.toMatchObject({ status: 409 });
});

test("a proposal can be revised before it is kept, and what is kept is the revision", async () => {
  const { engine, ask, ended, notes, journal } = await open([{ text: ["Entropy is measured in bits."] }]);
  const done = await ended((await ask()).request);
  const id = done.type === "iso-done" ? done.proposal : "";
  await engine.revise("basics/entropy", id, "In bits, when the logarithm is to base 2.");
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  expect(pending(journal())[0]).toMatchObject({ text: "In bits, when the logarithm is to base 2." });
  await engine.keep("basics/entropy", id);
  expect(notes.files.get("basics/entropy.md")).toContain("source.\n\nIn bits, when the logarithm is to base 2.\n\nIt is largest");
});

test("removing a proposal leaves the note as it was and the proposal in the journal", async () => {
  const { engine, ask, ended, notes, journal } = await open([{ text: ["Entropy is measured in bits."] }]);
  const done = await ended((await ask()).request);
  const id = done.type === "iso-done" ? done.proposal : "";
  await engine.discard("basics/entropy", id);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  expect(pending(journal())).toEqual([]);
  expect(journal().map((e) => e.kind)).toEqual(["change", "proposal", "discard"]);
  await expect(engine.discard("basics/entropy", id)).rejects.toMatchObject({ status: 409 });
});

test("a proposal is kept at its place after the note has changed around it", async () => {
  const { engine, ask, ended, notes } = await open([{ text: ["Entropy is measured in bits."] }]);
  const done = await ended((await ask()).request);
  const changed = ENTROPY.replace("---\n\n", "---\n\nA new opening paragraph.\n\n") + "\nAnd a closing one.\n";
  await engine.saveNote("basics/entropy", { base: hashText(ENTROPY), text: changed });
  await engine.keep("basics/entropy", done.type === "iso-done" ? done.proposal : "");
  expect(notes.files.get("basics/entropy.md")).toContain("A new opening paragraph.\n\nThe average surprise of a source.\n\nEntropy is measured in bits.\n\nIt is largest");
});

test("Iso looks things up in rounds, each step is told as it happens, and what it read is kept with the proposal", async () => {
  const { ask, ended, events, journal, sent } = await open([
    { calls: [{ name: "search_notes", arguments: { query: "surprise" } }], usage: { prompt_tokens: 1000, completion_tokens: 20, cost: 0.003 } },
    { text: ["Let me read it."], calls: [{ name: "read_note", arguments: { id: "/basics/surprise.md", section: "Units" } }], usage: { prompt_tokens: 1300, completion_tokens: 20, cost: 0.004 } },
    { text: ["In bits, as ", "[Surprise](/basics/surprise.md) is."], usage: { prompt_tokens: 1500, completion_tokens: 15, cost: 0.005 } },
  ]);
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-done" });
  const steps = events.flatMap((e) => (e.type === "iso-step" ? [e.step] : []));
  expect(steps).toMatchObject([
    { tool: "search_notes", how: "keyword", notes: ["basics/surprise", "basics/entropy"] },
    { tool: "read_note", how: "keyword", opened: "basics/surprise", section: "Units", said: 'Read "Units" in Surprise' },
  ]);
  // Text written before a lookup was not the reply: the next text says to start again.
  const texts = events.flatMap((e) => (e.type === "iso-text" ? [[e.delta, e.again]] : []));
  expect(texts).toEqual([["Let me read it.", true], ["In bits, as ", true], ["[Surprise](/basics/surprise.md) is.", false]]);
  const [p] = pending(journal());
  expect(p).toMatchObject({ text: "In bits, as [Surprise](/basics/surprise.md) is.", read: ["basics/surprise"], cost: { tokensIn: 3800, tokensOut: 55, usd: 0.012 } });
  // The tool's answer went back to the model.
  expect(sent[2]!.messages.at(-1)).toMatchObject({ role: "tool", content: expect.stringContaining("With base 2 the unit is the bit.") });
});

test("the rounds are the tier's: after them it must reply", async () => {
  const again = { calls: [{ name: "search_notes", arguments: { query: "entropy" } }] };
  const { ask, ended, sent } = await open([again, again, again, { text: ["With what I have."] }]);
  expect(await ended((await ask("anything", "low")).request)).toMatchObject({ type: "iso-done" });
  expect(sent.map((s) => s.tool_choice)).toEqual(["auto", "auto", "auto", "none"]);
  expect(sent[0]!.model).toBe("anthropic/claude-haiku-4.5");
});

test("search by meaning is a second tool where the device can run it", async () => {
  const { ask, ended, events, sent } = await open([{ calls: [{ name: "find_similar", arguments: { text: "what unit is information counted in" } }] }, { text: ["Bits."] }], { similar: true });
  await ended((await ask()).request);
  expect(sent[0]!.tools!.map((t) => t.function.name)).toEqual(["search_notes", "find_similar", "outline_note", "read_note"]);
  expect(events.find((e) => e.type === "iso-step")).toMatchObject({ step: { how: "meaning", notes: ["basics/surprise"] } });
});

test("stopping mid-stream enters nothing", async () => {
  let release!: () => void;
  const { engine, ask, ended, journal, notes } = await open([{ text: ["Entropy is ", "never finished."], hold: new Promise<void>((r) => { release = r; }) }]);
  const { request } = await ask();
  await engine.stop(request);
  expect(await ended(request)).toMatchObject({ type: "iso-stopped" });
  release();
  expect(journal().map((e) => e.kind)).toEqual(["change"]);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
});

test("a provider's refusal is told, and enters nothing", async () => {
  const { ask, ended, journal } = await open([{ status: 401 }]);
  const end = await ended((await ask()).request);
  expect(end).toMatchObject({ type: "iso-failed", message: expect.stringContaining("The key was not accepted") });
  expect(journal().map((e) => e.kind)).toEqual(["change"]);
});

test("what cannot be asked is refused before anything is sent", async () => {
  const none = await open([], { key: null });
  await expect(none.ask()).rejects.toMatchObject({ status: 409, message: expect.stringContaining("no provider key") });
  const { engine, ask, sent } = await open([]);
  await expect(ask("   ")).rejects.toMatchObject({ status: 400 });
  await expect(engine.ask({ note: "basics/entropy", form: "insert", after: { text: "A paragraph that is not there.", nth: 0 }, before: { text: "Nor this.", nth: 0 }, asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 409 });
  await expect(engine.ask({ note: "no/such", form: "insert", after: null, before: null, asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 404 });
  expect(sent).toEqual([]);
});

test("a second request in the session is told what was asked before and what became of it", async () => {
  const { engine, ask, ended, sent } = await open([{ text: ["Entropy is measured in bits."] }, { text: ["Shannon, 1948."] }]);
  const first = await ended((await ask()).request);
  await engine.keep("basics/entropy", first.type === "iso-done" ? first.proposal : "");
  await ended((await engine.ask({ note: "basics/entropy", form: "insert", after: null, before: null, asked: "who named it", tier: "mid" })).request);
  const user = String(sent[1]!.messages[1]!.content);
  expect(user).toContain("They asked: say what it is measured in\n\nYou wrote:\n\nEntropy is measured in bits.\n\nThey kept it.");
});

test("the key is held and forgotten, and never given back", async () => {
  const { engine } = await open([], { key: null });
  expect(await engine.settings()).toEqual({ provider: "openrouter", key: false, tiers: { low: "anthropic/claude-haiku-4.5", mid: "anthropic/claude-sonnet-5.5", max: "anthropic/claude-opus-5.5" } });
  expect(JSON.stringify(await engine.setKey("  sk-or-abc  "))).not.toContain("sk-or");
  expect((await engine.settings()).key).toBe(true);
  await expect(engine.setKey("two words")).rejects.toMatchObject({ status: 400 });
  expect((await engine.setKey(null)).key).toBe(false);
});

test("a prompt sent twice is one request: a note is asked one thing at a time", async () => {
  let release!: () => void;
  const { engine, ask, ended, journal, sent } = await open([{ text: ["Entropy is ", "measured in bits."], hold: new Promise<void>((r) => { release = r; }) }, { text: ["A second answer."] }]);
  const [first, second] = await Promise.allSettled([ask(), ask()]);
  expect(first.status).toBe("fulfilled");
  expect(second).toMatchObject({ status: "rejected", reason: { status: 409 } });
  release();
  await ended(first.status === "fulfilled" ? first.value.request : "");
  expect(sent).toHaveLength(1);
  expect(journal().filter((e) => e.kind === "proposal")).toHaveLength(1);
  // Once it has ended the note can be asked again, and another note could be asked meanwhile.
  await ended((await engine.ask({ note: "basics/entropy", form: "insert", after: null, before: null, asked: "again", tier: "mid" })).request);
  expect(journal().filter((e) => e.kind === "proposal")).toHaveLength(2);
});

test("a request that is refused does not leave the note claimed", async () => {
  const { engine, ask, ended } = await open([{ text: ["Bits."] }]);
  await expect(engine.ask({ note: "basics/entropy", form: "insert", after: { text: "Not there.", nth: 0 }, before: { text: "Nor this.", nth: 0 }, asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 409 });
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-done" });
});

// ------------------------------------------------------------ rewriting chosen paragraphs

/** Ask for a rewrite of the note's two paragraphs. */
const both = () => rewriteOf(ENTROPY, [0, 1]).blocks.map((b) => b.old);

test("a rewrite marks the chosen paragraphs, and what comes back is offered for those and nothing else", async () => {
  const { engine, ended, notes, journal, sent } = await open([{ text: ["Some chat first.\n⟦1⟧\nEntropy is the average surprise of a source.\n⟦/1⟧\n", "⟦3⟧\nA paragraph nobody chose.\n⟦/3⟧\nAnd a closing remark."] }]);
  expect(blocks(ENTROPY).map((b) => b.text)).toEqual(["The average surprise of a source.", "It is largest when every symbol is equally likely."]);
  const done = await ended((await engine.ask({ note: "basics/entropy", form: "rewrite", blocks: both(), asked: "make the first a full sentence", tier: "mid" })).request);
  expect(done).toMatchObject({ type: "iso-done" });
  const user = String(sent[0]!.messages[1]!.content);
  expect(user).toContain("⟦1⟧\nThe average surprise of a source.\n⟦/1⟧\n\n⟦2⟧\nIt is largest when every symbol is equally likely.\n⟦/2⟧");
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  const [p] = pending(journal());
  expect(p).toMatchObject({
    form: "rewrite", notice: "Iso also wrote outside the paragraphs you chose. That part was left out.",
    blocks: [
      { old: { text: "The average surprise of a source.", nth: 0 }, new: "Entropy is the average surprise of a source." },
      { old: { text: "It is largest when every symbol is equally likely.", nth: 0 }, new: "It is largest when every symbol is equally likely." }, // left as it was
    ],
  });
  // Kept: the one paragraph changes, and not a character else.
  await engine.keep("basics/entropy", p!.id);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY.replace("The average surprise of a source.", "Entropy is the average surprise of a source."));
});

test("a rewrite is revised block by block, and an empty block takes its paragraph out", async () => {
  const { engine, ended, notes, journal } = await open([{ text: ["⟦1⟧\nRewritten.\n⟦/1⟧\n⟦2⟧\n⟦/2⟧"] }]);
  await ended((await engine.ask({ note: "basics/entropy", form: "rewrite", blocks: both(), asked: "shorten, and drop the second", tier: "mid" })).request);
  const [p] = pending(journal());
  expect(p).toMatchObject({ blocks: [{ new: "Rewritten." }, { new: "" }] });
  await expect(engine.revise("basics/entropy", p!.id, "one text")).rejects.toMatchObject({ status: 400 });
  await engine.revise("basics/entropy", p!.id, ["Rewritten by me.", ""]);
  await engine.keep("basics/entropy", p!.id);
  expect(notes.files.get("basics/entropy.md")).toBe("---\ntype: Concept\ntitle: Entropy\n---\n\nRewritten by me.\n");
});

test("a reply that rewrites nothing offers nothing, and says which way it failed", async () => {
  const { engine, ended, journal } = await open([{ text: ["I think both paragraphs are fine as they are."] }, { text: ["⟦1⟧\nThe average surprise of a source.\n⟦/1⟧"] }]);
  const ask = () => engine.ask({ note: "basics/entropy", form: "rewrite", blocks: both(), asked: "improve", tier: "mid" });
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-failed", message: expect.stringContaining("not with a rewrite") });
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-failed", message: "Iso left the paragraphs as they are." });
  expect(pending(journal())).toEqual([]);
});

test("paragraphs that are no longer in the note cannot be asked about", async () => {
  const { engine, sent } = await open([]);
  await expect(engine.ask({ note: "basics/entropy", form: "rewrite", blocks: [{ text: "Not in the note.", nth: 0 }], asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 409 });
  await expect(engine.ask({ note: "basics/entropy", form: "rewrite", blocks: [], asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 400 });
  const twice = both()[0]!;
  await expect(engine.ask({ note: "basics/entropy", form: "rewrite", blocks: [twice, twice], asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 409 });
  expect(sent).toEqual([]);
});

test("a rewrite's reply is taken apart by its marks", () => {
  expect(parseRewrite("⟦1⟧\nA\n⟦/1⟧\n\n⟦2⟧\nB\nB2\n⟦/2⟧", 2)).toEqual({ blocks: ["A", "B\nB2"], outside: false });
  expect(parseRewrite("⟦2⟧ B ⟦/2⟧", 2)).toEqual({ blocks: [null, "B"], outside: false });
  expect(parseRewrite("⟦1⟧\n⟦/1⟧", 1)).toEqual({ blocks: [""], outside: false });
  expect(parseRewrite("Sure!\n⟦1⟧\nA\n⟦/1⟧", 1)).toEqual({ blocks: ["A"], outside: true });
  // One paragraph and no marks at all: the reply is the paragraph.
  expect(parseRewrite("Just the new paragraph.", 1)).toEqual({ blocks: ["Just the new paragraph."], outside: false });
  expect(parseRewrite("Just some talk.", 2)).toEqual({ blocks: [null, null], outside: true });
  // A code block comes back whole, indentation and all.
  expect(parseRewrite("⟦1⟧\n```python\nif x:\n    pass\n```\n⟦/1⟧", 1).blocks[0]).toBe("```python\nif x:\n    pass\n```");
});
