// An exercise's file, Iso's marking of it, and the study list.

import { describe, expect, test } from "vitest";
import { ExerciseError, exercise, exerciseText, markingReply, passageOf, placeMarks, studyList, understanding, withNext, type LearnerEvent } from "../src/index.ts";

const FILE = `---
type: Exercise
kind: written
title: A fair coin
tests: [Fundamentals/entropy]
next: Fundamentals/a-die
---

Show that the entropy of a fair coin is one bit.

## Working

The coin has two outcomes, each with probability 1/2.

$$
H = -\\tfrac12\\log_2\\tfrac12 - \\tfrac12\\log_2\\tfrac12
$$

So H = 1 bit.
`;

describe("reading an exercise", () => {
  test("its question, its working and where the working starts", () => {
    const e = exercise(FILE);
    expect(e).toMatchObject({ kind: "written", title: "A fair coin", tests: ["Fundamentals/entropy"], next: "Fundamentals/a-die", question: "Show that the entropy of a fair coin is one bit.", headed: true });
    expect(FILE.slice(e.from)).toBe(e.working);
    expect(e.working.startsWith("\nThe coin has two outcomes")).toBe(true);
  });
  test("without a heading, everything is the question and the working is empty", () => {
    const e = exercise("---\ntype: Exercise\ntests: a\n---\n\nWhat is it?\n");
    expect(e).toMatchObject({ question: "What is it?", working: "", headed: false, tests: ["a"], next: null, kind: "written" });
  });
  test("a new exercise's file reads back, and `next` can be set and taken out", () => {
    const text = exerciseText({ title: "A die", tests: ["Fundamentals/entropy"], question: "What is the entropy of a fair die?", by: "iso:m", at: "2026-10-15T10:00:00Z" });
    expect(exercise(text)).toMatchObject({ title: "A die", question: "What is the entropy of a fair die?", working: "\n", headed: true, next: null });
    const linked = withNext(text, "Fundamentals/a-coin");
    expect(exercise(linked)).toMatchObject({ next: "Fundamentals/a-coin", question: "What is the entropy of a fair die?" });
    expect(exercise(withNext(linked, null)).next).toBeNull();
  });
});

describe("Iso's marking", () => {
  const tests = ["Fundamentals/entropy"];
  const move = { "Fundamentals/entropy": { by: 0.5, why: "Right, after one hint." } };
  const reply = (o: object) => JSON.stringify(o);

  test("passages quoted from the working, each marked, with a move for each note tested", () => {
    const m = markingReply(reply({ result: "partly", marks: [{ quote: "two outcomes, each with probability 1/2", mark: "right" }, { quote: "So H = 1 bit.", mark: "wrong" }], moves: move }), FILE, tests);
    expect(m.result).toBe("partly");
    expect(m.dropped).toBe(0);
    expect(m.moves).toEqual(move);
    expect(m.marks.map((x) => [x.passage.text, x.mark])).toEqual([["two outcomes, each with probability 1/2", "right"], ["So H = 1 bit.", "wrong"]]);
  });
  test("a quote is found inside the working only, and despite different white space", () => {
    const m = markingReply(reply({ result: "right", marks: [{ quote: "fair coin is one bit", mark: "right" }, { quote: "The coin  has\ntwo", mark: "right" }], moves: move }), FILE, tests);
    expect(m.dropped).toBe(1); // the first is in the question
    expect(m.marks[0]!.passage.text).toBe("The coin has two");
  });
  test("words or a code fence around the object are read past", () => {
    const m = markingReply("Here is the marking:\n```json\n" + reply({ result: "wrong", marks: [], moves: { "Fundamentals/entropy": { by: -1, why: "x" } } }) + "\n```\n", FILE, tests);
    expect(m).toMatchObject({ result: "wrong", marks: [], dropped: 0 });
  });
  test("what is not a marking is refused", () => {
    expect(() => markingReply("It looks right to me.", FILE, tests)).toThrow(ExerciseError);
    expect(() => markingReply(reply({ result: "fine", marks: [], moves: move }), FILE, tests)).toThrow(/result/);
    expect(() => markingReply(reply({ result: "right", marks: [{ quote: "x", mark: "maybe" }], moves: move }), FILE, tests)).toThrow(/mark/);
    expect(() => markingReply(reply({ result: "right", marks: [], moves: {} }), FILE, tests)).toThrow(/Fundamentals\/entropy/);
    expect(() => markingReply(reply({ result: "right", marks: [], moves: { ...move, other: { by: 1, why: "" } } }), FILE, tests)).toThrow(/does not test/);
    expect(() => markingReply(reply({ result: "right", marks: [], moves: { "Fundamentals/entropy": { by: 2, why: "" } } }), FILE, tests)).toThrow(/move/);
    expect(() => markingReply(reply({ result: "right", marks: [], moves: { "Fundamentals/entropy": { by: 0.3, why: "" } } }), FILE, tests)).toThrow(/move/);
  });
  test("a passage quoted twice marks its two places in turn", () => {
    const twice = FILE + "\nSo H = 1 bit.\n";
    const m = markingReply(reply({ result: "partly", marks: [{ quote: "So H = 1 bit.", mark: "wrong" }, { quote: "So H = 1 bit.", mark: "right" }], moves: move }), twice, tests);
    expect(m.marks.map((x) => x.passage.nth)).toEqual([0, 1]);
  });
});

describe("marks over the working as it is now", () => {
  const at = (s: string, t: string) => passageOf(FILE, FILE.indexOf(t), FILE.indexOf(t) + t.length);
  const marks = [{ passage: at(FILE, "two outcomes"), mark: "right" as const }, { passage: at(FILE, "So H = 1 bit."), mark: "wrong" as const }];
  test("unchanged, each mark is where it was", () => {
    expect(placeMarks(FILE, marks).map((m) => FILE.slice(m.from, m.to))).toEqual(["two outcomes", "So H = 1 bit."]);
  });
  test("an edit above moves them; an edit inside one drops it; an edit below leaves them", () => {
    const above = FILE.replace("Show that", "Prove that");
    expect(placeMarks(above, marks).map((m) => above.slice(m.from, m.to))).toEqual(["two outcomes", "So H = 1 bit."]);
    const inside = FILE.replace("So H = 1 bit.", "So H = 2 bits.");
    expect(placeMarks(inside, marks).map((m) => m.mark)).toEqual(["right"]);
    const below = FILE + "\nAnd that is all.\n";
    expect(placeMarks(below, marks)).toHaveLength(2);
  });
});

describe("the study list", () => {
  const DAY = 86_400_000, T0 = Date.parse("2026-10-01T10:00:00Z");
  let n = 0;
  const ev = (day: number, exercise: string, tests: string[], by: number, result = "right"): LearnerEvent =>
    ({ id: "01J" + String(n++).padStart(23, "0"), at: new Date(T0 + day * DAY).toISOString(), event: "attempt", exercise, tests, result, by: "iso:m", moves: Object.fromEntries(tests.map((t) => [t, { by, why: "" }])) });
  const exercises = [{ id: "a1", tests: ["a"] }, { id: "b1", tests: ["b"] }, { id: "c1", tests: ["c"] }, { id: "new", tests: ["d"] }];

  test("due first, then never tried, then fewest squares, then longest since", () => {
    // a: level 1 at day 0, holds one day, so due by day 5. b: level 2 at day 4. c: level 1 at day 4.5.
    const events = [ev(0, "a1", ["a"], 1), ev(4, "b1", ["b"], 1), ev(4, "b1", ["b"], 1, "partly"), ev(4.5, "c1", ["c"], 1, "wrong")];
    const now = T0 + 5 * DAY;
    const list = studyList(exercises, events, understanding(events, now));
    expect(list.map((x) => x.id)).toEqual(["a1", "new", "c1", "b1"]);
    expect(list.find((x) => x.id === "b1")).toMatchObject({ result: "partly", squares: 2, due: false });
    expect(list.find((x) => x.id === "new")).toMatchObject({ result: null, last: null, squares: 0 });
  });
});
