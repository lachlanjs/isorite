// Exercises in the engine: asked for, kept, sent for marking, wound back, listed.

import { expect, test } from "vitest";
import { insertAt, passageOf, readJournal, readRecord, type Marks } from "@isorite/core";
import { Engine, KEY, MemoryFiles, MemorySecrets, type EngineEvent } from "../src/index.ts";
import { scripted, type Scripted } from "./scripted.ts";

const ENTROPY = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise of a source: $H = -\\sum p \\log p$.\n";
const SURPRISE = "---\ntype: Concept\ntitle: Surprise\n---\n\nAn outcome of probability $p$ carries $-\\log p$.\n";
const COIN = "---\ntype: Exercise\nkind: written\ntitle: A fair coin\ntests: [basics/entropy, basics/surprise]\n---\n\nShow that the entropy of a fair coin is one bit.\n\n## Working\n\nEach side has probability 1/2.\n\nSo H = 2 bits.\n";

async function open(script: Scripted[], study: Record<string, string> = { "study/basics/a-fair-coin.md": COIN }) {
  const clock = { t: Date.parse("2026-10-15T09:00:00Z"), now() { return this.t; } };
  const notes = new MemoryFiles({ "basics/entropy.md": ENTROPY, "basics/surprise.md": SURPRISE });
  const files = new MemoryFiles(study);
  const provider = scripted(script);
  const engine = await Engine.open({ notes, own: files, clock, device: "laptop1", name: "information-theory", http: provider.http, secrets: new MemorySecrets({ [KEY]: "sk-test" }) });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  const ended = (request: string) => new Promise<EngineEvent>((done) => {
    const seen = () => events.find((e) => "request" in e && e.request === request && ["iso-done", "iso-stopped", "iso-failed"].includes(e.type));
    const now = seen();
    if (now) return done(now);
    const stop = engine.events(() => { const e = seen(); if (e) { stop(); done(e); } });
  });
  const record = () => readRecord(files.files.get("record/laptop1.jsonl") ?? "");
  const journal = (id = "@study/basics/a-fair-coin") => readJournal(files.files.get(`journal/${id}.jsonl`) ?? "");
  const answer = (text = "So H = 2 bits.", source = COIN) => passageOf(source, source.indexOf(text), source.indexOf(text) + text.length);
  return { engine, clock, notes, study: files, events, ended, record, journal, answer, ...provider };
}

const marking = (o: object) => ({ text: [JSON.stringify(o)], usage: { prompt_tokens: 900, completion_tokens: 80, cost: 0.003 } });
const WRONG = marking({
  result: "wrong",
  marks: [{ quote: "Each side has probability 1/2.", mark: "right" }, { quote: "So H = 2 bits.", mark: "wrong" }],
  moves: { "basics/entropy": { by: -0.5, why: "The sum was doubled." }, "basics/surprise": { by: 0, why: "Each outcome's surprise was right." } },
});

test("marking: one call with no tools, sent the exercise, the notes it tests whole and the answer marked; it writes a marks entry and an attempt, and nothing else", async () => {
  const { engine, ended, sent, notes, study, record, journal, answer, events } = await open([WRONG]);
  const before = new Map(notes.files), coin = study.files.get("study/basics/a-fair-coin.md");
  const done = await ended((await engine.ask({ note: "@study/basics/a-fair-coin", form: "mark", answer: answer(), tier: "mid" })).request);
  expect(done).toMatchObject({ type: "iso-done", proposal: expect.any(String), attempt: expect.any(String) });

  expect(sent).toHaveLength(1);
  expect(sent[0]!.tools).toBeUndefined();
  const user = String(sent[0]!.messages[1]!.content);
  expect(user).toContain("## Entropy (id: basics/entropy; their squares now: 0 of 6)\n\nThe average surprise of a source: $H = -\\sum p \\log p$.");
  expect(user).toContain("## Surprise (id: basics/surprise;");
  expect(user).toContain("# The exercise: A fair coin\n\nShow that the entropy of a fair coin is one bit.");
  expect(user).toContain("Each side has probability 1/2.\n\n⟦answer⟧So H = 2 bits.⟦/answer⟧");
  expect(user).toContain("# Help they asked for in this exercise since it was last marked\n\nNone.");

  // Nothing in either base's notes changed.
  expect(notes.files).toEqual(before);
  expect(study.files.get("study/basics/a-fair-coin.md")).toBe(coin);

  const marks = journal().filter((e) => e.kind === "marks") as Marks[];
  expect(marks).toHaveLength(1);
  expect(marks[0]).toMatchObject({ who: "iso:openrouter/anthropic/claude-sonnet-5.5", result: "wrong", answer: answer(), cost: { usd: 0.003 } });
  expect(marks[0]!.marks.map((m) => [m.passage.text, m.mark])).toEqual([["Each side has probability 1/2.", "right"], ["So H = 2 bits.", "wrong"]]);
  const [attempt] = record();
  expect(attempt).toMatchObject({
    event: "attempt", exercise: "basics/a-fair-coin", tests: ["basics/entropy", "basics/surprise"], result: "wrong", by: marks[0]!.who,
    moves: { "basics/entropy": { by: -0.5, why: "The sum was doubled." }, "basics/surprise": { by: 0 } }, answer: answer(), marks: marks[0]!.id,
  });
  expect(String(attempt!.working)).toContain("So H = 2 bits.");
  expect(events.some((e) => e.type === "record" && e.event === "attempt")).toBe(true);
  // What the session cost counts the marking.
  expect((await engine.context()).session).toEqual({ usd: 0.003, requests: 1 });
});

test("understanding follows Iso's moves, the study list and the squares read them, and wind back lowers every note tested", async () => {
  const right = marking({ result: "right", marks: [], moves: { "basics/entropy": { by: 1, why: "Unaided and exact." }, "basics/surprise": { by: 0.5, why: "Used, not tested." } } });
  const { engine, ended, answer, record } = await open([right]);
  expect((await engine.map()).notes["@study/basics/a-fair-coin"]!.passed).toBeUndefined();
  await ended((await engine.ask({ note: "@study/basics/a-fair-coin", form: "mark", answer: answer(), tier: "mid" })).request);
  let s = await engine.study();
  expect(s.notes["basics/entropy"]).toMatchObject({ level: 1, squares: 1, evidence: [{ event: "attempt", by: 1, why: "Unaided and exact.", exercise: "@study/basics/a-fair-coin", result: "right" }] });
  expect(s.notes["basics/surprise"]).toMatchObject({ level: 0.5, squares: 0 });
  expect(s.exercises).toEqual([{ id: "@study/basics/a-fair-coin", title: "A fair coin", kind: "written", tests: ["basics/entropy", "basics/surprise"], next: null, result: "right", last: "2026-10-15T09:00:00.000Z", squares: 0, due: false }]);
  expect(s.folders).toEqual(["", "basics"]);
  expect((await engine.map()).notes["basics/entropy"]!.step).toBe(1);
  // Its last attempt right, it is passed: the study folder's mark grows from it.
  expect((await engine.map()).notes["@study/basics/a-fair-coin"]!.passed).toBe(true);

  await engine.windBack("@study/basics/a-fair-coin");
  expect(record().filter((e) => e.event === "wind-back").map((e) => e.note)).toEqual(["basics/entropy", "basics/surprise"]);
  s = await engine.study();
  expect(s.notes["basics/entropy"]).toMatchObject({ level: 0, evidence: [{ event: "attempt" }, { event: "wind-back", by: -1 }] });
  await expect(engine.windBack("basics/entropy")).rejects.toMatchObject({ status: 400 });
});

test("the help asked for in the exercise since its last marking is sent with the next marking, and nothing before it", async () => {
  const { engine, ended, sent, answer } = await open([
    { text: ["Sum over both outcomes."] }, WRONG, { text: ["Each term is a half."] },
    marking({ result: "right", marks: [], moves: { "basics/entropy": { by: 0.5, why: "Right after a hint." }, "basics/surprise": { by: 0, why: "" } } }),
  ]);
  const ask = async (asked: string) => ended((await engine.ask({ note: "@study/basics/a-fair-coin", ...insertAt(COIN, 13), asked, tier: "mid" })).request);
  const mark = async () => ended((await engine.ask({ note: "@study/basics/a-fair-coin", form: "mark", answer: answer(), tier: "mid" })).request);
  expect(await ask("what do I sum?")).toMatchObject({ type: "iso-done" });
  await mark();
  expect(String(sent[1]!.messages[1]!.content)).toContain("They asked: what do I sum?\n\nYou wrote:\n\nSum over both outcomes.\n\nNot kept yet.");
  await ask("how big is each term?");
  await mark();
  const last = String(sent[3]!.messages[1]!.content);
  expect(last).toContain("They asked: how big is each term?");
  expect(last).not.toContain("what do I sum?");
});

test("a marking that cannot be read records nothing but its cost; an answer not in the working is refused before anything is sent", async () => {
  const { engine, ended, sent, record, journal, answer } = await open([{ text: ["It looks right to me."], usage: { prompt_tokens: 100, completion_tokens: 5, cost: 0.001 } }]);
  await expect(engine.ask({ note: "@study/basics/a-fair-coin", form: "mark", answer: answer("Show that the entropy", COIN), tier: "mid" })).rejects.toMatchObject({ status: 409 });
  await expect(engine.ask({ note: "basics/entropy", form: "mark", answer: answer(), tier: "mid" })).rejects.toMatchObject({ status: 400 });
  expect(sent).toEqual([]);
  const done = await ended((await engine.ask({ note: "@study/basics/a-fair-coin", form: "mark", answer: answer(), tier: "mid" })).request);
  expect(done).toMatchObject({ type: "iso-failed", message: expect.stringContaining("no marking") });
  expect(journal().some((e) => e.kind === "marks")).toBe(false);
  await new Promise((r) => setTimeout(r, 10));
  expect(record().map((e) => e.event)).toEqual(["iso-unused"]);
});

test("an exercise is asked for in a folder, written by Iso in one call with no tools, and kept as a plain note there in its place in the chain", async () => {
  const { engine, ended, sent, study, journal } = await open([
    { text: ["# the entropy of a die\n\nFind the entropy of a fair six-sided die, in bits."] },
  ]);
  await expect(engine.createExerciseDraft("nowhere", ["basics/entropy"])).rejects.toMatchObject({ status: 400 });
  await expect(engine.createExerciseDraft("basics", ["basics/none"])).rejects.toMatchObject({ status: 400 });
  const draft = await engine.createExerciseDraft("basics", ["basics/entropy"], "@study/basics/a-fair-coin");
  expect(await engine.drafts()).toEqual([{ id: draft.id, title: "an exercise on Entropy", exercise: true }]);
  await expect(engine.ask({ note: draft.id, form: "note", tier: "mid" })).rejects.toBeTruthy();

  const done = await ended((await engine.ask({ note: draft.id, form: "exercise", tier: "mid" })).request);
  expect(done).toMatchObject({ type: "iso-done" });
  expect(sent[0]!.tools).toBeUndefined();
  const user = String(sent[0]!.messages[1]!.content);
  expect(user).toContain("# What it is to test\n\n## Entropy (id: basics/entropy;");
  expect(user).toContain("# Exercises already there\n\n## A fair coin\n\nShow that the entropy of a fair coin is one bit.");
  expect(user).toContain("# The exercise it follows");
  expect(user).toContain("# What they ask\n\nAn exercise on Entropy.");

  const kept = await engine.keepExercise(draft.id, done.type === "iso-done" ? done.proposal : "");
  expect(kept.id).toBe("@study/basics/the-entropy-of-a-die");
  const file = study.files.get("study/basics/the-entropy-of-a-die.md")!;
  expect(file).toMatch(/^---\ntype: Exercise\nkind: written\ntitle: the entropy of a die\ntests:\n {2}- basics\/entropy\ngenerated:\n {2}by: iso:openrouter\/anthropic\/claude-sonnet-5.5\n {2}at: .+\n---\n\nFind the entropy of a fair six-sided die, in bits.\n\n## Working\n\n$/);
  // Its journal: begun by you, the question offered by Iso and kept.
  expect(journal("@study/basics/the-entropy-of-a-die").map((e) => [e.kind, e.who])).toEqual([["change", "you"], ["proposal", "iso:openrouter/anthropic/claude-sonnet-5.5"], ["change", "you"]]);
  // The coin now leads to it, and the draft is gone.
  expect(study.files.get("study/basics/a-fair-coin.md")).toContain("next: basics/the-entropy-of-a-die");
  expect(await engine.drafts()).toEqual([]);
  const s = await engine.study();
  expect(s.exercises.find((e) => e.id === "@study/basics/a-fair-coin")!.next).toBe("@study/basics/the-entropy-of-a-die");
});

test("in an exercise, the header's count is what marking it would send", async () => {
  const { engine } = await open([]);
  const report = await engine.context("@study/basics/a-fair-coin");
  expect(report.parts.find((p) => p.name === "linked notes")).toMatchObject({ detail: "2 tested, sent whole" });
  expect(report.parts.find((p) => p.name === "instructions and tools")).toMatchObject({ detail: "no tools" });
});
