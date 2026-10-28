import { expect, test } from "vitest";
import { Engine, KEY, MemoryFiles, MemorySecrets, readTurns, type EngineEvent, type TurnItem } from "../src/index.ts";
import { scripted, type Scripted } from "./scripted.ts";

const ENTROPY = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n";
const SURPRISE = "---\ntype: Concept\ntitle: Surprise\ndescription: How unexpected one outcome is.\n---\n\nAn outcome of probability $p$ carries $-\\log p$.\n\n## Units\n\nWith base 2 the unit is the bit.\n";

async function open(script: Scripted[]) {
  const clock = { t: Date.parse("2026-10-22T09:00:00Z"), now() { return this.t; } };
  const notes = new MemoryFiles({ "basics/entropy.md": ENTROPY, "basics/surprise.md": SURPRISE }), study = new MemoryFiles();
  const provider = scripted(script);
  const engine = await Engine.open({ notes, own: study, clock, device: "laptop1", name: "information-theory", http: provider.http, secrets: new MemorySecrets({ [KEY]: "sk-test" }) });
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
  expect(sent[0]!.tools!.map((t) => t.function.name)).toEqual(["search_notes", "outline_note", "read_note", "point_to_note", "ask_question", "offer_text", "read_data"]);

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
  expect(sent[1]!.tools!.map((t) => t.function.name)).toEqual(["point_to_note", "ask_question", "offer_text", "read_data"]);
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
  // Read back while it runs, it is running (a page opened now shows it so).
  expect((await engine.conversation(conversation))!.turns[0]).toMatchObject({ state: "running" });
  await engine.stop(turn);
  release();
  expect(await ended(turn)).toMatchObject({ type: "iso-stopped" });
  expect(readTurns(study.files.get(`conversations/${conversation}.jsonl`)!)[0]).toMatchObject({ state: "stopped" });
});

test("Write mode: an edit goes into the note at once as Iso's change, a new note is made, and the turn is undone", async () => {
  const { engine, notes, study, ended, events } = await open([
    { calls: [{ name: "edit_note", arguments: { id: "basics/entropy", old: "The average surprise of a source.", new: "The average surprise of a source, in bits." } }] },
    { calls: [{ name: "write_note", arguments: { id: "basics/bit", text: "# The bit\n\nOne fair coin toss." } }] },
    { text: ["I said the unit, and made a note for it."] },
  ]);
  const { conversation, turn } = await engine.converse({ mode: "write", asked: "say the unit", tier: "mid", given: [{ kind: "note", id: "basics/entropy" }] });
  expect(await ended(turn)).toMatchObject({ type: "iso-done" });
  expect(notes.files.get("basics/entropy.md")).toContain("The average surprise of a source, in bits.");
  expect(notes.files.get("basics/bit.md")).toBe("---\ntype: Concept\ntitle: \"The bit\"\n---\n\nOne fair coin toss.");
  // In the note's journal as Iso's, and in the conversation as changes naming those entries.
  const journal = (await engine.journal("basics/entropy")).filter((e) => e.kind === "change");
  expect(journal.at(-1)).toMatchObject({ who: "iso:openrouter/anthropic/claude-sonnet-5.5", why: "edit" });
  const t = readTurns(study.files.get(`conversations/${conversation}.jsonl`)!)[0]!;
  expect(t.items.filter((i) => i.kind === "change")).toMatchObject([
    { note: "basics/entropy", why: "edit", entry: journal.at(-1)!.id, added: 1, removed: 1, title: "Entropy" },
    { note: "basics/bit", why: "create", title: "The bit" },
  ]);
  expect(events.some((e) => e.type === "note-changed" && e.id === "basics/entropy" && e.who.startsWith("iso:"))).toBe(true);

  // Undone: both notes as they were.
  expect(await engine.undoTurn(conversation, turn)).toEqual({ notes: ["basics/bit", "basics/entropy"], left: [] });
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  expect(notes.files.has("basics/bit.md")).toBe(false);
  await expect(engine.undoTurn(conversation, turn)).rejects.toMatchObject({ status: 409 });
});

test("Write mode: an edit whose passage is not found is said to Iso; moving asks first, and a refusal leaves the note; a note changed since is left on undo", async () => {
  const { engine, notes, ended, events, sent } = await open([
    { calls: [{ name: "edit_note", arguments: { id: "basics/entropy", old: "not in the note", new: "x" } }] },
    { calls: [{ name: "move_note", arguments: { id: "basics/surprise", to: "units/surprise" } }] },
    { text: ["Left as it was."] },
    { calls: [{ name: "edit_note", arguments: { id: "basics/entropy", old: "It is largest", new: "Entropy is largest" } }] },
    { text: ["Done."] },
  ]);
  const first = await engine.converse({ mode: "write", asked: "tidy it", tier: "mid", given: [] });
  // Iso asks before moving: wait for it, and say no.
  const asked = await new Promise<Extract<EngineEvent, { type: "iso-item" }>>((done) => {
    const look = () => events.find((e): e is Extract<EngineEvent, { type: "iso-item" }> => e.type === "iso-item" && e.item.kind === "permission");
    const seen = look(); if (seen) return done(seen);
    const stop = engine.events(() => { const e = look(); if (e) { stop(); done(e); } });
  });
  expect(asked.item).toMatchObject({ kind: "permission", tool: "move_note", note: "basics/surprise", what: "move Surprise to units/surprise" });
  await engine.answer(first.turn, asked.item.kind === "permission" ? asked.item.id : "", "reject");
  await ended(first.turn);
  expect(JSON.stringify(sent[1]!.messages.at(-1))).toContain("is not in Entropy as you wrote it");
  expect(JSON.stringify(sent[2]!.messages.at(-1))).toContain("They did not allow it");
  expect(notes.files.has("basics/surprise.md")).toBe(true);

  const second = await engine.converse({ conversation: first.conversation, mode: "write", asked: "and the second line", tier: "mid", given: [] });
  await ended(second.turn);
  // You change it after Iso did: undo leaves it, and says so.
  const now = await engine.readNote("basics/entropy");
  await engine.saveNote("basics/entropy", { base: now.version, text: now.text + "\nMine.\n" });
  expect(await engine.undoTurn(first.conversation, second.turn)).toEqual({ notes: [], left: ["basics/entropy"] });
  expect(notes.files.get("basics/entropy.md")).toContain("Mine.");
});

test("given an Understanding note, Iso is sent its reading of you, asks before it explains, may rewrite it, and leaves your scratchpad alone", async () => {
  const { engine, ended, sent, study } = await open([
    { calls: [{ name: "write_understanding", arguments: { id: "basics/entropy", reading: "You can derive it." } }] },
    { text: ["Well done."] },
    { text: ["Where were we?"] },
  ]);
  await engine.saveScratchpad("basics/entropy", "My own words.", null);
  const { conversation, turn } = await engine.converse({ mode: "ask", asked: "why is it largest when even?", tier: "mid", given: [{ kind: "understanding", id: "basics/entropy" }] });
  await ended(turn);
  expect(JSON.stringify(sent[0]!.messages[0]!.content)).toContain("# Their understanding");
  expect(String(sent[0]!.messages[1]!.content)).toContain("## Their understanding of Entropy (/basics/entropy.md)\n\nYour reading so far: none yet.");
  expect(sent[0]!.tools!.map((t) => t.function.name)).toEqual(["search_notes", "outline_note", "read_note", "point_to_note", "ask_question", "offer_text", "read_data", "write_understanding"]);
  expect(await engine.understanding("basics/entropy")).toMatchObject({ reading: "You can derive it.", scratchpad: "My own words." });
  expect(study.files.get("understanding/basics/entropy.md")).toContain("## Iso's reading\n\nYou can derive it.\n\n## Scratchpad\n\nMy own words.");
  expect((await engine.journal("@understanding/basics/entropy")).at(-1)).toMatchObject({ who: "iso:openrouter/anthropic/claude-sonnet-5.5" });
  // The next turn is told the reading.
  const next = await engine.converse({ conversation, mode: "ask", asked: "go on", tier: "mid", given: [{ kind: "understanding", id: "basics/entropy" }] });
  await ended(next.turn);
  expect(String(sent[2]!.messages[1]!.content)).toContain("## Their understanding of Entropy (/basics/entropy.md)\n\nYour reading so far: You can derive it.");
});

test("a conversation from before M12 reads: Understand mode as Ask, and what it recorded passed over", () => {
  const lines = [
    { kind: "turn", id: "01K7A000000000000000000001", conversation: "01K7A000000000000000000000", at: "2026-10-22T09:00:00Z", session: "s", mode: "understand", asked: "why?", given: [], tier: "mid" },
    { kind: "item", turn: "01K7A000000000000000000001", item: { kind: "understood", note: "basics/entropy", event: "e", by: 1, why: "w" } },
    { kind: "item", turn: "01K7A000000000000000000001", item: { kind: "text", text: "Because." } },
    { kind: "end", turn: "01K7A000000000000000000001", state: "done" },
  ].map((l) => JSON.stringify(l)).join("\n");
  const [t] = readTurns(lines);
  expect(t).toMatchObject({ mode: "ask", state: "done", items: [{ kind: "text", text: "Because." }] });
});

const PROBLEM = "---\ntype: Problem\ntitle: Entropy of two coins\nuses: [basics/entropy]\n---\n\nTwo fair coins: what is the entropy?\n\nEach is 1 bit, so 2 bits.\n";
const OPEN_Q = "---\ntype: Question\ntitle: Why is even largest?\nabout: [basics/entropy]\n---\n";

test("Iso asks a question back: put to you in Ask mode and made yours with +; made by Iso where it may write", async () => {
  const { engine, ended, notes, events } = await open([
    { calls: [{ name: "ask_question", arguments: { title: "What if one symbol is certain?", text: "", about: ["basics/entropy"] } }] },
    { text: ["Think about that."] },
    { calls: [{ name: "ask_question", arguments: { title: "Is surprise ever negative?", text: "For p at most 1.", about: ["/basics/surprise.md", "nothing/here"] } }] },
    { text: ["Asked."] },
  ]);
  const first = await engine.converse({ mode: "ask", asked: "explain entropy", tier: "mid", given: [] });
  await ended(first.turn);
  let [t] = (await engine.conversation(first.conversation))!.turns;
  const q = t!.items[0] as Extract<TurnItem, { kind: "question" }>;
  expect(q).toMatchObject({ kind: "question", title: "What if one symbol is certain?", about: ["basics/entropy"] });
  expect(q.made).toBeUndefined();
  expect(notes.files.has("basics/what-if-one-symbol-is-certain.md")).toBe(false);
  // Taken: a question note, yours, about the note.
  expect(await engine.takeItem(first.conversation, first.turn, q.id)).toEqual({ note: "basics/what-if-one-symbol-is-certain" });
  expect(notes.files.get("basics/what-if-one-symbol-is-certain.md")).toBe("---\ntype: Question\ntitle: \"What if one symbol is certain?\"\nabout: [basics/entropy]\n---\n\n");
  expect((await engine.journal("basics/what-if-one-symbol-is-certain")).at(-1)).toMatchObject({ who: "you" });
  expect(events.at(-1)).toMatchObject({ type: "iso-taken", item: q.id });
  [t] = (await engine.conversation(first.conversation))!.turns;
  expect(t!.items[0]).toMatchObject({ made: "basics/what-if-one-symbol-is-certain" });
  await expect(engine.takeItem(first.conversation, first.turn, q.id)).rejects.toMatchObject({ status: 409 });

  const second = await engine.converse({ conversation: first.conversation, mode: "write", asked: "ask me something", tier: "mid", given: [] });
  await ended(second.turn);
  const made = (await engine.conversation(first.conversation))!.turns[1]!.items;
  expect(made.map((i) => i.kind)).toEqual(["question", "change", "text"]);
  expect(made[0]).toMatchObject({ about: ["basics/surprise"], made: "basics/is-surprise-ever-negative" });
  expect(notes.files.get("basics/is-surprise-ever-negative.md")).toContain("about: [basics/surprise]\n---\n\nFor p at most 1.\n");
  expect((await engine.journal("basics/is-surprise-ever-negative")).at(-1)!.who).toMatch(/^iso:/);
});

test("your answers offered back are inserted at the end of the note as yours", async () => {
  const { engine, ended, notes } = await open([
    { calls: [{ name: "offer_text", arguments: { id: "basics/entropy", text: "When one symbol is certain, there is no surprise: 0 bits." } }] },
    { text: ["That is your answer."] },
  ]);
  const { conversation, turn } = await engine.converse({ mode: "ask", asked: "if one is certain there's no surprise, so 0 bits", tier: "mid", given: [{ kind: "note", id: "basics/entropy" }] });
  await ended(turn);
  const offer = (await engine.conversation(conversation))!.turns[0]!.items[0]!;
  expect(offer).toMatchObject({ kind: "offer", note: "basics/entropy" });
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY);
  await engine.takeItem(conversation, turn, (offer as { id: string }).id);
  expect(notes.files.get("basics/entropy.md")).toBe(ENTROPY + "\nWhen one symbol is certain, there is no surprise: 0 bits.\n");
  expect((await engine.journal("basics/entropy")).at(-1)).toMatchObject({ who: "you" });
  expect((await engine.conversation(conversation))!.turns[0]!.items[0]).toMatchObject({ taken: true });
});

test("a problem given is checked, never marked; a note goes with its open questions, each of which can be taken out", async () => {
  const { engine, ended, notes, sent } = await open([{ text: ["Each coin is independent, so the bits add."] }]);
  await engine.createNote("basics/two-coins", PROBLEM);
  await engine.createNote("basics/why-even", OPEN_Q);
  const ctx = await engine.turnContext({ mode: "ask", tier: "mid", given: [{ kind: "note", id: "basics/entropy" }] });
  expect(ctx.items).toEqual([{ id: "q:basics/why-even", kind: "question", title: "Why is even largest?", tokens: expect.any(Number), on: true }]);
  const off = await engine.turnContext({ mode: "ask", tier: "mid", given: [{ kind: "note", id: "basics/entropy" }], off: ["q:basics/why-even"] });
  expect(off.items[0]).toMatchObject({ on: false });
  expect(off.parts[2]!.tokens).toBeLessThan(ctx.parts[2]!.tokens);

  const { turn } = await engine.converse({ mode: "write", asked: "check my solution", tier: "mid", given: [{ kind: "note", id: "basics/two-coins" }, { kind: "note", id: "basics/entropy" }] });
  await ended(turn);
  const system = JSON.stringify(sent[0]!.messages[0]!.content), user = String(sent[0]!.messages[1]!.content);
  expect(system).toContain("# Checking a solution");
  expect(system).toContain("Never say it is solved");
  expect(user).toContain("## A problem: Entropy of two coins (/basics/two-coins.md)");
  expect(user).toContain("Open questions about it:\n- Why is even largest? (/basics/why-even.md)");
  expect(notes.files.get("basics/two-coins.md")).toBe(PROBLEM);
});

test("Write mode builds an artifact (M23): a recipe, the data's shape, a file refused while a rule is broken, then written with its manifest, journalled, run, and undone with the turn", async () => {
  const BODY = (y: string) => `<iso-page><iso-panel><h2>Energy</h2><iso-chart data="runs.csv" x="t" y="${y}"></iso-chart></iso-panel></iso-page>`;
  const { engine, notes, study, ended, sent } = await open([
    { calls: [{ name: "artifact_recipe", arguments: { name: "dashboard" } }, { name: "read_data", arguments: { path: "basics/runs.csv" } }] },
    { calls: [{ name: "write_artifact", arguments: { path: "basics/energy.html", title: "Energy", description: "The run's energy.", uses: ["runs.csv"], html: BODY("energy") + '<style>h2{color:#fff}</style>' } }] },
    { calls: [{ name: "write_artifact", arguments: { path: "basics/energy.html", title: "Energy", description: "The run's energy.", uses: ["runs.csv"], html: BODY("e") } }] },
    { text: ["It charts [the energy](/basics/energy.html)."] },
  ]);
  await notes.write("basics/runs.csv", "t,e\n0,1\n1,0.5\n");
  const ran: string[] = [];
  (engine as unknown as { opts: { renderArtifact: (p: string, h: string) => Promise<unknown> } }).opts.renderArtifact = async (p) => { ran.push(p); return { rendered: true, errors: ["<iso-chart>: a complaint"], drawn: 12 }; };
  const { conversation, turn } = await engine.converse({ mode: "write", asked: "chart the run", tier: "low", given: [] });
  expect(await ended(turn)).toMatchObject({ type: "iso-done" });
  // Write mode's own tools, the rounds an artifact takes, and what the recipe and the data said.
  expect(sent[0]!.tools!.map((t) => t.function.name)).toContain("write_artifact");
  expect(JSON.stringify(sent[0]!.messages[0]!.content)).toContain("# Artifacts");
  const results = sent[1]!.messages.filter((m) => m.role === "tool").map((m) => String(m.content));
  expect(results[0]).toContain("# The kit (isorite kit 1)");
  expect(results[0]).toContain("# The recipe: dashboard");
  expect(results[1]).toBe("basics/runs.csv: 2 rows, 2 columns\n- t: number, 0 to 1 (mean 0.5)\n- e: number, 0.5 to 1 (mean 0.75)\nFirst rows:\nt,e\n0,1\n1,0.5");
  // The first write broke two rules and wasn't written; the second was, and was run.
  const refused = String(sent[2]!.messages.at(-1)!.content);
  expect(refused).toMatch(/^Not written: rules are broken\./);
  expect(refused).toContain('runs.csv has no column "energy" (it has t, e)');
  expect(refused).toContain("a colour of its own (#fff)");
  expect(String(sent[3]!.messages.at(-1)!.content)).toBe("Written: basics/energy.html. It was run, with every control touched, and:\n- it reported: <iso-chart>: a complaint\nFix these and call write_artifact again with the whole file.");
  expect(ran).toEqual(["basics/energy.html"]);
  const html = notes.files.get("basics/energy.html")!;
  expect(html).toContain("<title>Energy</title>");
  expect(html).toContain('<meta name="isorite:uses" content="runs.csv">');
  expect(html).toContain('<meta name="author" content="Iso">');
  expect(html).toContain('<meta name="date" content="2026-10-22">');
  // Journalled as a note is, and undone with the turn.
  expect((await engine.journal("basics/energy.html")).at(-1)).toMatchObject({ kind: "change", who: expect.stringMatching(/^iso:openrouter\//) });
  const t = readTurns(study.files.get(`conversations/${conversation}.jsonl`)!)[0]!;
  expect(t.items.filter((i) => i.kind === "change")).toMatchObject([{ note: "basics/energy.html", why: "create", title: "Energy" }]);
  expect(await engine.undoTurn(conversation, turn)).toEqual({ notes: ["basics/energy.html"], left: [] });
  expect(notes.files.has("basics/energy.html")).toBe(false);
});
