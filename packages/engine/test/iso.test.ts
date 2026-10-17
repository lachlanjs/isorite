import { expect, test } from "vitest";
import { hashText, insertAt, passageOf, pending, readJournal, replay, type Change, type Proposal, type Rewrite } from "@isorite/core";
import { CONVERSATION_BUDGET, Engine, HERE, MemoryFiles, MemorySecrets, KEY, NOTE_BUDGET, conversation, estimate, fitted, parseRewrite, windowed, type EngineEvent } from "../src/index.ts";
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
  expect(user).toContain("# Earlier in this session\n\nIn Entropy (/basics/entropy.md) they asked: say what it is measured in\n\nYou wrote:\n\nEntropy is measured in bits.\n\nThey kept it.");
});

test("the key is held and forgotten, and never given back", async () => {
  const { engine } = await open([], { key: null });
  expect(await engine.settings()).toEqual({ provider: "openrouter", key: false, connect: true, tiers: { low: "anthropic/claude-haiku-4.5", mid: "anthropic/claude-sonnet-5.5", max: "anthropic/claude-opus-5.5" } });
  expect(JSON.stringify(await engine.setKey("  sk-or-abc  "))).not.toContain("sk-or");
  expect((await engine.settings()).key).toBe(true);
  await expect(engine.setKey("two words")).rejects.toMatchObject({ status: 400 });
  expect((await engine.setKey(null)).key).toBe(false);
});

test("a key is made by signing in at the provider: PKCE, the code exchanged by the engine, the key held and never given back", async () => {
  const clock = { t: Date.parse("2026-10-13T09:00:00Z"), now() { return this.t; } };
  const secrets = new MemorySecrets({}), exchanged: { url: string; body: Record<string, string> }[] = [];
  let answer: () => Response = () => new Response(JSON.stringify({ key: "sk-or-made" }), { status: 200 });
  const fetch = (async (url: string, init?: RequestInit) => { exchanged.push({ url, body: JSON.parse(String(init?.body)) as Record<string, string> }); return answer(); }) as typeof globalThis.fetch;
  const engine = await Engine.open({ notes: new MemoryFiles({}), study: new MemoryFiles(), clock, device: "laptop1", name: "b", http: { fetch }, secrets });
  await expect(engine.connect("javascript:alert(1)")).rejects.toMatchObject({ status: 400 });

  const url = new URL((await engine.connect("http://localhost:4767/")).url);
  expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
  const q = Object.fromEntries(url.searchParams);
  expect(q).toMatchObject({ callback_url: "http://localhost:4767/", code_challenge_method: "S256", key_label: "isorite" });
  // An unknown state is refused before anything is sent.
  await expect(engine.connected("code1", "not-ours")).rejects.toMatchObject({ status: 409 });
  expect(exchanged).toEqual([]);

  const settings = await engine.connected("code1", q.state!);
  expect(settings.key).toBe(true);
  expect(JSON.stringify(settings)).not.toContain("sk-or");
  expect(await secrets.get(KEY)).toBe("sk-or-made");
  const [x] = exchanged;
  expect(x!.url).toBe("https://openrouter.ai/api/v1/auth/keys");
  expect(x!.body).toMatchObject({ code: "code1", code_challenge_method: "S256" });
  // The verifier sent is the one the challenge was made from.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x!.body.code_verifier)));
  expect(Buffer.from(digest).toString("base64url")).toBe(q.code_challenge);
  // A state is good once.
  await expect(engine.connected("code1", q.state!)).rejects.toMatchObject({ status: 409 });

  // Too late: the provider's codes last ten minutes.
  const late = new URL((await engine.connect("http://localhost:4767/")).url).searchParams.get("state")!;
  clock.t += 11 * 60_000;
  await expect(engine.connected("code2", late)).rejects.toMatchObject({ status: 409 });
  // The provider's refusal is told, and the key held is left as it was.
  answer = () => new Response(JSON.stringify({ error: { message: "Invalid code or code_verifier" } }), { status: 403 });
  const refused = new URL((await engine.connect("http://localhost:4767/")).url).searchParams.get("state")!;
  await expect(engine.connected("bad", refused)).rejects.toMatchObject({ status: 502, message: expect.stringContaining("Invalid code or code_verifier") });
  expect(await secrets.get(KEY)).toBe("sk-or-made");
});

test("a provider without a sign-in page can only be given a key by pasting it", async () => {
  const engine = await Engine.open({ notes: new MemoryFiles({}), study: new MemoryFiles(), clock: { now: () => 0 }, device: "laptop1", name: "b", secrets: new MemorySecrets({}), provider: { name: "custom", url: "http://x/v1", cacheMarks: false, tiers: { low: "a", mid: "b", max: "c" }, prices: {} } });
  expect((await engine.settings()).connect).toBe(false);
  await expect(engine.connect("http://localhost:4767/")).rejects.toMatchObject({ status: 409 });
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

// ------------------------------------------------------------ rewriting chosen passages

/** A passage of the note, by its text. */
const passage = (text: string) => { const at = ENTROPY.indexOf(text); return passageOf(ENTROPY, at, at + text.length); };
/** Ask for a rewrite of two passages: a few words inside the first sentence, and the whole second paragraph. Iso's word on it goes at the end. */
const two = () => ({ note: "basics/entropy", form: "rewrite" as const, regions: [passage("average surprise"), passage("It is largest when every symbol is equally likely.")], after: null, before: null, tier: "mid" as const });

test("a rewrite marks the chosen passages where they stand, and offers each change apart, with what Iso says of them as text of its own", async () => {
  const { engine, ended, notes, journal, sent } = await open([{ text: ["Some chat first.\n⟦1⟧ expected surprise ⟦/1⟧\n", "⟦3⟧A passage nobody chose.⟦/3⟧\n⟦note⟧I used the standard term, and left the second sentence alone.⟦/note⟧"] }]);
  const done = await ended((await engine.ask({ ...two(), asked: "use the textbook term" })).request);
  expect(done).toMatchObject({ type: "iso-done" });
  const user = String(sent[0]!.messages[1]!.content);
  expect(user).toContain("The ⟦1⟧average surprise⟦/1⟧ of a source.\n\n⟦2⟧It is largest when every symbol is equally likely.⟦/2⟧");
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);

  const [changes, said] = pending(journal()) as [Rewrite, Proposal];
  // Only the passage it changed is offered; the reply is set between the old one's neighbours, spaces and all.
  expect(changes).toMatchObject({
    form: "rewrite", open: [0], notice: "Iso also wrote outside the passages you chose. That part was left out.",
    regions: [{ old: { text: "average surprise", nth: 0 }, new: "expected surprise" }],
    cost: { usd: 0.004 },
  });
  expect(said).toMatchObject({ form: "insert", after: null, before: null, text: "I used the standard term, and left the second sentence alone.", asked: "use the textbook term" });
  expect(said.cost).toBeUndefined(); // one request, paid for once
  expect(done).toMatchObject({ proposal: changes.id, said: said.id });
  expect((await engine.context("basics/entropy")).session).toEqual({ usd: 0.004, requests: 1 });

  // Kept: those words change, and not a character else. What Iso said is still waiting, to be kept or removed like any text of its.
  await engine.keep("basics/entropy", changes.id, 0);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY.replace("average surprise", "expected surprise"));
  expect(journal().at(-1)).toMatchObject({ why: "keep", proposal: changes.id, region: 0 });
  expect(pending(journal()).map((p) => p.id)).toEqual([said.id]);
  await engine.discard("basics/entropy", said.id);
  expect(pending(journal())).toEqual([]);
});

test("each change is kept or removed on its own; an empty one takes its passage out", async () => {
  const { engine, ended, notes, journal } = await open([{ text: ["⟦1⟧mean surprise⟦/1⟧⟦2⟧⟦/2⟧"] }]);
  await ended((await engine.ask({ ...two(), asked: "shorten, and drop the second" })).request);
  const [p] = pending(journal()) as Rewrite[];
  expect(p).toMatchObject({ regions: [{ new: "mean surprise" }, { new: "" }], open: [0, 1] });
  expect(pending(journal())).toHaveLength(1); // it said nothing of them, so there is no second block

  await engine.discard("basics/entropy", p!.id, 0);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  expect((pending(journal())[0] as Rewrite).open).toEqual([1]);
  await expect(engine.keep("basics/entropy", p!.id, 0)).rejects.toMatchObject({ status: 409 });
  await engine.keep("basics/entropy", p!.id, 1);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY.replace("It is largest when every symbol is equally likely.", ""));
  expect(pending(journal())).toEqual([]);
});

test("all the changes still waiting are kept at once, or removed at once", async () => {
  const reply = { text: ["⟦1⟧mean surprise⟦/1⟧⟦2⟧It peaks when all symbols are equally likely.⟦/2⟧"] };
  const { engine, ended, notes, journal } = await open([reply, reply]);
  await ended((await engine.ask({ ...two(), asked: "tighten" })).request);
  await engine.discard("basics/entropy", pending(journal())[0]!.id);
  expect(pending(journal())).toEqual([]);
  await ended((await engine.ask({ ...two(), asked: "tighten" })).request);
  await engine.keep("basics/entropy", pending(journal())[0]!.id);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY.replace("average surprise", "mean surprise").replace("It is largest when every symbol is equally likely.", "It peaks when all symbols are equally likely."));
  expect(pending(journal())).toEqual([]);
});

test("a change whose passage was edited meanwhile cannot be kept; the others can", async () => {
  const { engine, ended, journal } = await open([{ text: ["⟦1⟧mean surprise⟦/1⟧⟦2⟧It peaks then.⟦/2⟧"] }]);
  await ended((await engine.ask({ ...two(), asked: "tighten" })).request);
  const p = pending(journal())[0]!;
  await engine.saveNote("basics/entropy", { base: hashText(ENTROPY), text: ENTROPY.replace("average surprise", "usual surprise") });
  await expect(engine.keep("basics/entropy", p.id)).rejects.toMatchObject({ status: 409 });
  await expect(engine.keep("basics/entropy", p.id, 0)).rejects.toMatchObject({ status: 409 });
  expect((await engine.keep("basics/entropy", p.id, 1)).text).toContain("usual surprise of a source.\n\nIt peaks then.");
});

test("a reply with no change and nothing said offers nothing; one that only says something offers that", async () => {
  const { engine, ended, journal } = await open([{ text: ["I think both are fine as they are."] }, { text: ["⟦1⟧average surprise⟦/1⟧"] }, { text: ["⟦note⟧Both read well already; I would leave them.⟦/note⟧"] }]);
  const ask = () => engine.ask({ ...two(), asked: "improve" });
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-failed", message: expect.stringContaining("not with a rewrite") });
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-failed", message: "Iso left what you chose as it is." });
  expect(pending(journal())).toEqual([]);
  expect(await ended((await ask()).request)).toMatchObject({ type: "iso-done" });
  expect(pending(journal())).toMatchObject([{ form: "insert", text: "Both read well already; I would leave them.", cost: { usd: 0.004 } }]);
});

test("passages that are not in the note, or that overlap, cannot be asked about", async () => {
  const { engine, sent } = await open([]);
  const ask = (regions: { text: string; nth: number }[]) => engine.ask({ ...two(), regions, asked: "x" });
  await expect(ask([{ text: "Not in the note.", nth: 0 }])).rejects.toMatchObject({ status: 409 });
  await expect(ask([])).rejects.toMatchObject({ status: 400 });
  await expect(ask([passage("average surprise of"), passage("surprise of a source")])).rejects.toMatchObject({ status: 400, message: "the passages chosen overlap" });
  expect(sent).toEqual([]);
});

test("a rewrite's reply is taken apart by its marks, and each passage set back between its neighbours", () => {
  expect(parseRewrite("⟦1⟧A⟦/1⟧\n\n⟦2⟧\nB\nB2\n⟦/2⟧", 2)).toEqual({ regions: ["A", "\nB\nB2\n"], say: "", outside: false });
  expect(parseRewrite("⟦2⟧ B ⟦/2⟧ ⟦note⟧ Why. ⟦/note⟧", 2)).toEqual({ regions: [null, " B "], say: "Why.", outside: false });
  expect(parseRewrite("⟦1⟧⟦/1⟧", 1)).toEqual({ regions: [""], say: "", outside: false });
  expect(parseRewrite("Sure!\n⟦1⟧A⟦/1⟧", 1)).toMatchObject({ regions: ["A"], outside: true });
  // One passage and no marks at all: the reply is the passage.
  expect(parseRewrite("Just the new passage.", 1)).toEqual({ regions: ["Just the new passage."], say: "", outside: false });
  expect(parseRewrite("Just some talk.", 2)).toMatchObject({ regions: [null, null], outside: true });
  // A note that was never closed is still what it says.
  expect(parseRewrite("⟦1⟧A⟦/1⟧⟦note⟧Cut off here", 1)).toEqual({ regions: ["A"], say: "Cut off here", outside: false });

  expect(fitted("average surprise", "  mean surprise\n")).toBe("mean surprise");
  expect(fitted(" average surprise ", "mean surprise")).toBe(" mean surprise ");
  expect(fitted("A paragraph.\n\n", "\nAnother.\n")).toBe("Another.\n\n");
  expect(fitted("x", "   ")).toBe("");
});

// ------------------------------------------------------------ the session: context and cost

test("the conversation is the session's exchanges across its notes, until it is cleared; nothing is deleted", async () => {
  const { engine, ask, ended, sent, study, journal } = await open([{ text: ["Bits."] }, { text: ["Minus log p."] }, { text: ["Third."] }]);
  await ended((await ask("the unit")).request);
  // In another note of the same session, Iso is told what it wrote in the first.
  await ended((await engine.ask({ note: "basics/surprise", form: "insert", after: null, before: null, asked: "the formula", tier: "mid" })).request);
  expect(String(sent[1]!.messages[1]!.content)).toContain("In Entropy (/basics/entropy.md) they asked: the unit\n\nYou wrote:\n\nBits.\n\nIt is still waiting in the note, not yet kept.");

  await engine.clearConversation();
  expect(study.files.get("record/laptop1.jsonl")).toContain('"event":"context-cleared"');
  await ended((await engine.ask({ note: "basics/surprise", form: "insert", after: null, before: null, asked: "once more", tier: "mid" })).request);
  const user = String(sent[2]!.messages[1]!.content);
  expect(user).not.toContain("# Earlier in this session");
  // The text still waiting in this note is still named, so it is not written twice; and the journal is whole.
  expect(user).toContain("Text you offered in this note that they have not kept yet");
  expect(journal().filter((e) => e.kind === "proposal")).toHaveLength(1);
});

test("the context report names the five parts, sums them, and counts what the session has cost", async () => {
  const { engine, ask, ended } = await open([
    { calls: [{ name: "read_note", arguments: { id: "basics/surprise" } }], usage: { prompt_tokens: 1000, completion_tokens: 10, cost: 0.01 } },
    { text: ["Bits."], usage: { prompt_tokens: 1200, completion_tokens: 5, cost: 0.02 } },
    { text: ["No marks, two paragraphs."], usage: { prompt_tokens: 900, completion_tokens: 5, cost: 0.005 } },
  ]);
  const before = await engine.context("basics/entropy");
  expect(before.parts.map((p) => p.name)).toEqual(["instructions and tools", "study record", "your prompts and Iso's answers", "this note", "linked notes"]);
  expect(before).toMatchObject({ limit: 200_000, session: { usd: 0, requests: 0 } });
  expect(before.tokens).toBe(before.parts.reduce((n, p) => n + p.tokens, 0));
  expect(before.parts[2]).toMatchObject({ tokens: 0, detail: "" });

  await ended((await ask()).request);
  const after = await engine.context("basics/entropy");
  expect(after.session).toEqual({ usd: 0.03, requests: 1 });
  expect(after.parts[2]).toMatchObject({ detail: "1 moment" });
  expect(after.parts[2]!.tokens).toBeGreaterThan(0);
  expect(after.parts[3]).toMatchObject({ detail: "Entropy" });
  expect(after.parts[4]).toMatchObject({ detail: "1 read" });
  expect(after.parts[4]!.tokens).toBeGreaterThan(0);

  // A reply that was paid for and offered nothing is still counted.
  const failed = await ended((await engine.ask({ ...two(), asked: "improve" })).request);
  expect(failed.type).toBe("iso-failed");
  await new Promise((r) => setTimeout(r, 0));
  const both2 = (await engine.context("basics/entropy")).session;
  expect(both2.requests).toBe(2);
  expect(both2.usd).toBeCloseTo(0.035, 6);
  // With no note open there is still the conversation and the cost.
  expect(await engine.context()).toMatchObject({ session: { requests: 2 }, parts: [{}, {}, { detail: "1 moment" }, { detail: "none open", tokens: 0 }, {}] });
});

test("a long conversation is cut to its budget: the newest whole, older ones shortened, the oldest left out", () => {
  const long = "x".repeat(12_000);
  const all = Array.from({ length: 60 }, (_, k) => ({ id: String(k).padStart(2, "0"), note: "n", text: `In N (/n.md) they asked: q${k}\n\nYou wrote:\n\n${long}\n\nThey kept it.` }));
  const sent = conversation(all);
  expect(estimate(sent)).toBeLessThanOrEqual(CONVERSATION_BUDGET + 50);
  expect(sent).toContain(`q59\n\nYou wrote:\n\n${long}\n\nThey kept it.`); // the newest, whole
  expect(sent).toContain("q58\n\nYou wrote:\n\n" + "x".repeat(400) + " […]\n\nThey kept it."); // no room for it whole: shortened
  expect(sent).toMatch(/^\[\d+ earlier exchanges of this session left out for length\.\]/);
  expect(conversation(all.slice(0, 2))).not.toContain("left out");
});

test("a long note is cut to its budget round the place asked about, keeping its headings and saying what is left out", () => {
  const lines = ["---", "type: Concept", "---", ""];
  for (let s = 0; s < 40; s++) { lines.push(`## Section ${s}`, ""); for (let k = 0; k < 8; k++) lines.push(`Section ${s}, paragraph ${k}. ` + "word ".repeat(60), ""); }
  const at = lines.indexOf("## Section 20") + 2;
  lines.splice(at, 0, HERE);
  const sent = windowed(lines, [at]);
  expect(estimate(lines.join("\n"))).toBeGreaterThan(NOTE_BUDGET * 2);
  expect(estimate(sent)).toBeLessThan(NOTE_BUDGET * 1.15);
  expect(sent).toContain(HERE);
  expect(sent).toContain("Section 20, paragraph 0.");
  expect(sent).toContain("## Section 0\n[… ");
  expect(sent).toContain("## Section 39");
  expect(sent).not.toContain("Section 0, paragraph 3.");
  expect(sent).toContain("type: Concept");
  // A short note is sent whole.
  expect(windowed(["a", "b"], [0])).toBe("a\nb");
});

// ------------------------------------------------------------ a note for Iso

test("a note for Iso is a draft outside the base; sent, its reply is kept as a note with its own history, and the draft is gone", async () => {
  const { engine, ended, notes, study, sent } = await open([{ text: ["# Self-information\n\nThe surprise of one outcome is $-\\log p$, as [Surprise](/basics/surprise.md) says.\n\nYour picture holds."] }]);
  const draft = await engine.createDraft();
  expect(draft.id).toMatch(/^@draft\/[0-9a-z]{26}$/);
  expect([...study.files.keys()].filter((k) => k.startsWith("drafts/"))).toHaveLength(1);
  expect((await engine.notes()).notes.map((n) => n.id)).toEqual(["basics/entropy", "basics/surprise"]); // not in the base
  // Nothing written yet: there is nothing to send.
  await expect(engine.ask({ note: draft.id, form: "note", tier: "mid" })).rejects.toMatchObject({ status: 400 });

  const text = '---\ntype: Concept\ntitle: "Self-information, in my own words"\n---\n\nI think the surprise of an outcome is what [Surprise](/basics/surprise.md "requires") defines. Write it up, and say where I am wrong.\n';
  const saved = await engine.saveNote(draft.id, { base: draft.version, text });
  expect(await engine.drafts()).toEqual([{ id: draft.id, title: "Self-information, in my own words" }]);
  // Only a draft is sent whole, and a draft is sent no other way.
  await expect(engine.ask({ note: "basics/entropy", form: "note", tier: "mid" })).rejects.toMatchObject({ status: 400 });
  await expect(engine.ask({ note: draft.id, form: "insert", after: null, before: null, asked: "x", tier: "mid" })).rejects.toMatchObject({ status: 400 });

  const done = await ended((await engine.ask({ note: draft.id, form: "note", tier: "mid" })).request);
  expect(done).toMatchObject({ type: "iso-done" });
  // What they wrote went as the request, with the note they linked beside it.
  const user = String(sent[0]!.messages[1]!.content);
  expect(user).toContain('# What they wrote for you, under the title "Self-information, in my own words"');
  expect(user).toContain("# The notes they linked\n\n## Surprise (/basics/surprise.md)\n\nAn outcome of probability $p$ carries");
  expect(String((sent[0]!.messages[0]!.content as { text: string }[])[0]!.text)).toContain("They have written a note\n  *for you*");

  const id = done.type === "iso-done" ? done.proposal : "";
  await expect(engine.keepDraft("basics/entropy", id, "basics")).rejects.toMatchObject({ status: 400 });
  const kept = await engine.keepDraft(draft.id, id, "basics");
  expect(kept.id).toBe("basics/self-information-in-my-own-words");
  // The title line Iso added against its instructions is gone: the title is theirs.
  expect(notes.files.get("basics/self-information-in-my-own-words.md")).toBe('---\ntype: Concept\ntitle: "Self-information, in my own words"\n---\n\nThe surprise of one outcome is $-\\log p$, as [Surprise](/basics/surprise.md) says.\n\nYour picture holds.\n');
  // The new note's journal: begun by you, offered by Iso with what you asked, kept by you.
  const journal = readJournal(study.files.get("journal/basics/self-information-in-my-own-words.jsonl")!);
  expect(journal.map((e) => [e.kind, e.who])).toEqual([["change", "you"], ["proposal", "iso:openrouter/anthropic/claude-sonnet-5.5"], ["change", "you"]]);
  expect(journal[1]).toMatchObject({ asked: expect.stringContaining("Write it up, and say where I am wrong.") });
  expect(journal[2]).toMatchObject({ why: "keep" });
  // The draft is gone from the study base; its journal stays.
  expect(await engine.drafts()).toEqual([]);
  expect([...study.files.keys()].some((k) => k.startsWith("drafts/"))).toBe(false);
  expect([...study.files.keys()].some((k) => k.startsWith("journal/@draft/"))).toBe(true);
  expect((await engine.notes()).notes.map((n) => n.id)).toContain("basics/self-information-in-my-own-words");
  void saved;
  // The reply is in two journals now, and is one request, paid for once, and one exchange, told as kept.
  expect((await engine.context()).session).toEqual({ usd: 0.004, requests: 1 });
  expect(journal[1]).toMatchObject({ copyOf: id });
  sent.length = 0;
});

test("a draft needs a title to be kept, and can be thrown away", async () => {
  const { engine, ended, study } = await open([{ text: ["A note."] }]);
  const draft = await engine.createDraft();
  await engine.saveNote(draft.id, { base: draft.version, text: draft.text + "Write something on entropy.\n" });
  const done = await ended((await engine.ask({ note: draft.id, form: "note", tier: "low" })).request);
  await expect(engine.keepDraft(draft.id, done.type === "iso-done" ? done.proposal : "", "")).rejects.toMatchObject({ message: "give the note a title before keeping it" });
  await engine.discardDraft(draft.id);
  expect(await engine.drafts()).toEqual([]);
  expect([...study.files.keys()].some((k) => k.startsWith("drafts/"))).toBe(false);
  await expect(engine.discardDraft("basics/entropy")).rejects.toMatchObject({ status: 400 });
});
