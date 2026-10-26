import { expect, test } from "vitest";
import { AGE_OFF, briefingText, handOf, readHand, type HandLine } from "../src/hand.ts";
import type { Turn, TurnItem } from "../src/turn.ts";

// A conversation's working set (M15), worked out from its turns and the lines beside them.
const read = (id: string, section?: string): TurnItem => ({ kind: "look", step: { tool: "read_note", said: "", how: "read", notes: [id], opened: id, ...(section ? { section } : {}) } });
const turn = (n: number, items: TurnItem[] = []): Turn => ({ id: `t${n}`, conversation: "c", at: "", mode: "ask", asked: `ask ${n}`, given: [], tier: "low", items, state: "done" });

test("what Iso read is in hand, at the sections it read or whole, and stays while it is used", () => {
  const turns = [turn(0, [read("basics/surprise", "Units"), read("basics/surprise", "Bits")]), turn(1, [read("basics/entropy")]), turn(2, [{ kind: "text", text: "As [Surprise](/basics/surprise.md) says." }])];
  const h = handOf(turns, []);
  expect(h.held).toEqual([
    { id: "basics/surprise", sections: ["Units", "Bits"], used: 2, on: true, aged: false },
    { id: "basics/entropy", sections: "whole", used: 1, on: true, aged: false },
  ]);
  expect(h.turns.every((t) => t.on)).toBe(true);
  expect(h.ratio).toBeNull();
});

test(`a note not used for ${AGE_OFF} turns ages off; switched back on, it ages from then; one switched off stays off`, () => {
  const turns = [turn(0, [read("a")]), turn(1), turn(2), turn(3)];
  expect(handOf(turns, []).held[0]).toMatchObject({ on: false, aged: true });
  expect(handOf(turns.slice(0, 3), []).held[0]).toMatchObject({ on: true, aged: false });
  // Back on after four turns: on, then aged off again three turns later.
  const back: HandLine[] = [{ kind: "context", part: "r:a", on: true, at: 4 }];
  expect(handOf(turns, back).held[0]).toMatchObject({ on: true });
  expect(handOf([...turns, turn(4), turn(5), turn(6)], back).held[0]).toMatchObject({ on: false, aged: true });
  // Switched off by hand: off, and not said to be aged.
  expect(handOf(turns.slice(0, 2), [{ kind: "context", part: "r:a", on: false, at: 2 }]).held[0]).toMatchObject({ on: false, aged: false });
});

test("a briefing that is on stands for its turns; off, they are back; a turn switched on after it is on", () => {
  const turns = [turn(0), turn(1), turn(2)];
  const b: HandLine = { kind: "briefing", id: "b1", at: "", turns: ["t0", "t1"], settled: ["bits"], open: [], preferences: [], notes: [] };
  expect(handOf(turns, [b]).turns).toEqual([{ id: "t0", on: false, under: "b1" }, { id: "t1", on: false, under: "b1" }, { id: "t2", on: true }]);
  expect(handOf(turns, [b, { kind: "context", part: "b:b1", on: false, at: 3 }]).turns.map((t) => t.on)).toEqual([true, true, true]);
  expect(handOf(turns, [b, { kind: "context", part: "t:t1", on: true, at: 3 }]).turns.map((t) => t.on)).toEqual([false, true, true]);
  expect(handOf(turns, [{ kind: "context", part: "t:t2", on: false, at: 3 }]).turns.map((t) => t.on)).toEqual([true, true, false]);
});

test("the ratio is the provider's count over the estimate, from the last turn it said", () => {
  expect(handOf([], [{ kind: "counted", turn: "t0", estimated: 1000, counted: 1500 }, { kind: "counted", turn: "t1", estimated: 2000, counted: 2600 }]).ratio).toBeCloseTo(1.3);
});

test("the lines about the working set are read from the file, the turns' own passed over", () => {
  const text = [JSON.stringify({ kind: "turn", id: "t0" }), JSON.stringify({ kind: "context", part: "r:a", on: false, at: 1 }), "not json", JSON.stringify({ kind: "counted", turn: "t0", estimated: 1, counted: 2 })].join("\n");
  expect(readHand(text).map((l) => l.kind)).toEqual(["context", "counted"]);
});

test("a briefing is written from what was picked, with the notes as links", () => {
  const text = briefingText({ id: "b", at: "", turns: [], settled: ["Entropy is in bits."], open: ["Why base 2?"], preferences: ["Use H(X)."], notes: ["basics/entropy"] }, () => "Entropy");
  expect(text).toBe("Settled:\n- Entropy is in bits.\n\nStill open:\n- Why base 2?\n\nWhat they said they want:\n- Use H(X).\n\nThe notes it turned on: [Entropy](/basics/entropy.md)");
});
