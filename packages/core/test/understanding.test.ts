// Understanding, worked out from the study record.

import { describe, expect, test } from "vitest";
import { INTERVALS, lowest, stepOf, understanding, type LearnerEvent } from "../src/index.ts";

const DAY = 86_400_000, T0 = Date.parse("2026-10-01T10:00:00Z");
let n = 0;
const id = () => "01J" + String(n++).padStart(23, "0");
/** An attempt that Iso judged moves each note it tests by `by` (a number for all, or one per note). */
const attempt = (day: number, result: string, tests: string[], by: number | Record<string, number> = result === "right" ? 1 : result === "wrong" ? -1 : 0): LearnerEvent =>
  ({ id: id(), at: new Date(T0 + day * DAY).toISOString(), event: "attempt", exercise: "x", tests, result, by: "iso:model",
    moves: Object.fromEntries(tests.map((t) => [t, { by: typeof by === "number" ? by : by[t] ?? 0, why: "" }])) });
const windBack = (day: number, note: string): LearnerEvent => ({ id: id(), at: new Date(T0 + day * DAY).toISOString(), event: "wind-back", note });
const read = (events: LearnerEvent[], day: number, note = "a") => understanding(events, T0 + day * DAY).get(note);

describe("the level", () => {
  test("nothing in the record, nothing known", () => {
    expect(understanding([], T0).size).toBe(0);
  });
  test("Iso's moves raise it, to six", () => {
    const events = Array.from({ length: 8 }, (_, k) => attempt(k * 0.01, "right", ["a"]));
    expect(read(events.slice(0, 3), 0.1)).toMatchObject({ level: 3, squares: 3, step: 2 });
    expect(read(events, 0.1)).toMatchObject({ level: 6, squares: 6, step: 3 });
  });
  test("the result moves nothing by itself: the move Iso judged does", () => {
    expect(read([attempt(0, "right", ["a"], 0)], 0.1)).toMatchObject({ level: 0, last: T0 });
    expect(read([attempt(0, "right", ["a"]), attempt(0, "right", ["a"], 0.5)], 0.1)).toMatchObject({ level: 1.5, squares: 1 });
    expect(read([attempt(0, "right", ["a"]), attempt(0, "right", ["a"]), attempt(0, "wrong", ["a"], -0.5)], 0.1)).toMatchObject({ level: 1.5 });
    expect(read([attempt(0, "wrong", ["a"])], 0.1)).toMatchObject({ level: 0, squares: 0, step: 0 });
  });
  test("an attempt without moves counts as tested and moves nothing; a move past one is held to one", () => {
    const bare: LearnerEvent = { id: id(), at: new Date(T0).toISOString(), event: "attempt", exercise: "x", tests: ["a"], result: "right", by: "iso:model" };
    expect(read([bare], 0.1)).toMatchObject({ level: 0, last: T0 });
    expect(read([attempt(0, "right", ["a"], 3)], 0.1)).toMatchObject({ level: 1 });
  });
  test("winding back takes one square and is itself evidence", () => {
    const events = [attempt(0, "right", ["a"]), attempt(0, "right", ["a"]), windBack(0.01, "a")];
    expect(read(events, 0.1)).toMatchObject({ level: 1, evidence: events.map((e) => e.id) });
  });
  test("an exercise on two notes moves both, and shows the lower", () => {
    const events = [attempt(0, "right", ["a"]), attempt(0, "right", ["a", "b"], { a: 1, b: 0.5 })];
    const all = understanding(events, T0 + 0.1 * DAY);
    expect([all.get("a")!.squares, all.get("b")!.level]).toEqual([2, 0.5]);
    expect(lowest(all, ["a", "b"])).toMatchObject({ squares: 0 });
    expect(lowest(all, ["a", "never-tested"])).toMatchObject({ squares: 0 });
    expect(lowest(all, [])).toMatchObject({ squares: 0 });
  });
  test("events after the moment asked about do not count", () => {
    expect(read([attempt(0, "right", ["a"]), attempt(5, "right", ["a"])], 1)).toMatchObject({ level: 1 });
  });
});

describe("the recall curve", () => {
  const two = [attempt(0, "right", ["a"]), attempt(0, "right", ["a"])]; // level 2 holds 3 days
  test("holds for its interval, is then due, and lapses at twice it", () => {
    expect(INTERVALS[1]).toBe(3);
    expect(read(two, 2.9)).toMatchObject({ squares: 2, due: false, lapsed: false });
    expect(read(two, 3.1)).toMatchObject({ squares: 2, due: true, lapsed: false });
    expect(read(two, 6.1)).toMatchObject({ level: 2, squares: 1, due: true, lapsed: true });
  });
  test("tested again, it holds again", () => {
    expect(read([...two, attempt(6.5, "right", ["a"])], 7)).toMatchObject({ level: 3, squares: 3, due: false });
  });
});

test("six squares read as four steps on the Atlas", () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(stepOf)).toEqual([0, 1, 1, 2, 2, 3, 3]);
});
