// The journal: history by replay, and the timeline.

import { describe, expect, test } from "vitest";
import {
  applyHunks, blocks, change, diffLines, hashText, journalLine, findPassage, moments, readJournal, reconcile, replay, sessionMoments, stamp, textAt, touched,
  LAYER_IDLE_MS, SNAPSHOT_EVERY, type Entry, type Stamp,
} from "../src/index.ts";

let clock = Date.parse("2026-10-13T09:00:00Z");
const at = (who: string, last: Entry | null = null, step = 1000): Stamp => stamp(who, "laptop1", last, (clock += step));
const NOTE = "---\ntype: Concept\ntitle: Entropy\n---\n\n# Entropy\n\nThe entropy of a source is its average surprise.\n\n$$\nH(X) = -\\sum_x p(x) \\log p(x)\n$$\n\nIt is largest when every outcome is equally likely.\n";

describe("blocks", () => {
  test("frontmatter is not a block; a displayed equation is one", () => {
    expect(blocks(NOTE).map((b) => b.text)).toEqual([
      "# Entropy", "The entropy of a source is its average surprise.", "$$\nH(X) = -\\sum_x p(x) \\log p(x)\n$$", "It is largest when every outcome is equally likely.",
    ]);
  });
  test("a fenced block keeps its blank lines", () => {
    const b = blocks("before\n\n```python\na = 1\n\nb = 2\n```\n\nafter\n");
    expect(b.map((x) => x.text)).toEqual(["before", "```python\na = 1\n\nb = 2\n```", "after"]);
    expect(b[1]).toMatchObject({ from: 2, to: 7 });
  });
  test("an equation on one line does not swallow what follows", () => {
    expect(blocks("$$ a = b $$\n\nnext\n").map((x) => x.text)).toEqual(["$$ a = b $$", "next"]);
  });
  test("a list and a table are each one block", () => {
    expect(blocks("- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n")).toHaveLength(2);
  });
});

describe("differences", () => {
  const cases: [string, string][] = [
    ["a\nb\nc", "a\nB\nc"], ["a\nb\nc", "a\nc"], ["a\nc", "a\nb\nc"], ["", "a\nb"], ["a\nb", ""], ["a\nb\nc\nd\ne", "x\nb\ny\nd\nz"], ["same", "same"], ["a\na\na", "a\na"],
  ];
  test.each(cases)("%j to %j", (a, b) => {
    const A = a.split("\n"), B = b.split("\n"), h = diffLines(A, B);
    expect(applyHunks(A, h)).toEqual(B);
  });
  test("one changed line is one small hunk", () => {
    expect(diffLines(["a", "b", "c"], ["a", "B", "c"])).toEqual([{ at: 1, del: ["b"], ins: ["B"] }]);
  });
  test("hunks made from another text are refused", () => {
    expect(() => applyHunks(["x", "y"], [{ at: 0, del: ["a"], ins: [] }])).toThrow();
  });
});

describe("history", () => {
  test("every version is rebuilt by replay", () => {
    const versions = [NOTE, NOTE.replace("average surprise", "expected surprise"), NOTE.replace("average surprise", "expected surprise") + "\nA last line.\n"];
    const entries: Entry[] = [];
    for (const v of versions) entries.push(change(entries, v, at("you", entries.at(-1) ?? null), "edit")!);
    expect(entries.map((e) => (e as { why: string }).why)).toEqual(["start", "edit", "edit"]);
    expect(entries[0]).toMatchObject({ before: null, text: NOTE });
    expect((entries[1] as { text?: string }).text).toBeUndefined();
    versions.forEach((v, k) => expect(textAt(entries, entries[k]!.id)).toBe(v));
    expect(replay(entries)).toMatchObject({ text: versions[2], hash: hashText(versions[2]!), broken: [] });
  });
  test("no change, no entry", () => {
    const first = change([], NOTE, at("you"), "edit")!;
    expect(change([first], NOTE, at("you", first), "edit")).toBeNull();
  });
  test("read back from its own lines, in any order, each entry once", () => {
    const a = change([], "one\n", at("you"), "edit")!, b = change([a], "two\n", at("you", a), "edit")!;
    const text = journalLine(b) + "not json\n" + journalLine(a) + journalLine(b);
    expect(readJournal(text)).toEqual([a, b]);
  });
  test("a change made elsewhere is found and entered", () => {
    const a = change([], "one\n", at("you"), "edit")!;
    expect(reconcile([a], "one\n", at("external", a))).toBeNull();
    const found = reconcile([a], "one\ntwo\n", at("external", a))!;
    expect(found).toMatchObject({ who: "external", why: "external", before: hashText("one\n") });
    expect(textAt([a, found])).toBe("one\ntwo\n");
  });
  test("a whole copy is kept at intervals", () => {
    const entries: Entry[] = [];
    for (let k = 0; k <= SNAPSHOT_EVERY; k++) entries.push(change(entries, `line ${k}\n`, at("you", entries.at(-1) ?? null), "edit")!);
    const whole = entries.map((e, k) => ((e as { text?: string }).text !== undefined ? k : -1)).filter((k) => k >= 0);
    expect(whole).toEqual([0, SNAPSHOT_EVERY]);
  });
  test("a missing entry breaks the chain, and the next change mends it with a whole copy", () => {
    const a = change([], "one\n", at("you"), "edit")!, b = change([a], "two\n", at("you", a), "edit")!, c = change([a, b], "three\n", at("you", b), "edit")!;
    const gap = [a, c];
    expect(replay(gap)).toMatchObject({ text: "one\n", broken: [c.id] });
    const mend = change(gap, "four\n", at("you", c), "edit")!;
    expect(mend.text).toBe("four\n");
    expect(replay([...gap, mend])!.text).toBe("four\n");
  });
});

describe("sessions", () => {
  test("half an hour of nothing starts a new one", () => {
    const a = at("you"), b = at("iso:x", a as Entry, 29 * 60_000), c = at("you", b as Entry, 31 * 60_000);
    expect(b.session).toBe(a.id);
    expect(c.session).toBe(c.id);
  });
});

describe("passages", () => {
  const from = NOTE.indexOf("average surprise");
  test("a passage is named by its text, and found again by it", () => {
    expect(findPassage(NOTE, { text: "average surprise", nth: 0 })).toEqual({ from, to: from + 16 });
    // Twins are told apart by their order; when the one meant is gone and one is left, that one is the place.
    const twice = "an echo, an echo, and the rest";
    expect(findPassage(twice, { text: "an echo", nth: 1 })).toEqual({ from: 9, to: 16 });
    expect(findPassage("an echo, and the rest", { text: "an echo", nth: 1 })).toEqual({ from: 0, to: 7 });
    expect(findPassage("no such thing", { text: "an echo", nth: 0 })).toBeNull();
  });
});

describe("a journal from before M25", () => {
  test("The agent's proposals, revisions and removals are passed over, the changes replay", () => {
    const start = change([], NOTE, at("you"), "edit")!;
    const old = [JSON.stringify({ ...at("iso:model", start), kind: "proposal", form: "insert", asked: "say more", after: null, before: null, text: "More." }),
      JSON.stringify({ ...at("you"), kind: "discard", proposal: "x" })].join("\n");
    const entries = readJournal(journalLine(start) + old + "\n");
    expect(entries).toEqual([start]);
    expect(textAt(entries)).toBe(NOTE);
  });
});

describe("the timeline", () => {
  test("your edits in a row are one moment", () => {
    const e: Entry[] = [];
    const push = (x: Entry | null) => { e.push(x!); return x!; };
    push(change(e, NOTE, at("you"), "edit"));
    push(change(e, NOTE + "a\n", at("you", e.at(-1)!), "edit"));
    push(change(e, NOTE + "a\nb\n", at("you", e.at(-1)!), "edit"));
    push(change(e, NOTE + "a\nb\nc\n", at("iso:m", e.at(-1)!), "edit", { asked: "say more" }));
    expect(moments(e).map((m) => [m.who, m.what, m.ids.length])).toEqual([["you", "wrote", 1], ["you", "edited", 2], ["iso:m", "edited", 1]]);
    expect(moments(e)[2]).toMatchObject({ asked: "say more" });
  });
  test("a moment says how many lines it put in and took out; ten minutes with no edit begins a new one (M24, T)", () => {
    const e: Entry[] = [];
    const push = (x: Entry | null) => { e.push(x!); return x!; };
    push(change(e, NOTE, at("you"), "edit"));
    push(change(e, NOTE + "a\n", at("you", e.at(-1)!), "edit"));
    push(change(e, NOTE.replace("average surprise", "mean surprise") + "a\nb\n", at("you", e.at(-1)!, 60_000), "edit"));
    // Ten minutes and a second later: a layer of its own, in the same session.
    push(change(e, NOTE + "a\nb\n", at("you", e.at(-1)!, LAYER_IDLE_MS + 1000), "edit"));
    const m = moments(e);
    expect(m.map((x) => [x.what, x.ids.length, x.added, x.removed])).toEqual([["wrote", 1, NOTE.split("\n").length, 0], ["edited", 2, 3, 1], ["edited", 1, 1, 1]]);
    expect(m[1]!.session).toBe(m[2]!.session);
  });
  test("a note the journal first meets already written is found, not written", () => {
    const found = reconcile([], NOTE, at("external"))!;
    expect(moments([found])[0]).toMatchObject({ what: "found", who: "external" });
  });
});

describe("what a moment touched", () => {
  test("the lines a moment put in, carried through later changes into today's text", () => {
    const e: Entry[] = [];
    const push = (text: string, who = "you", why: "edit" | "keep" = "edit") => { const c = change(e, text, at(who, e.at(-1) ?? null), why)!; e.push(c); return c; };
    const v0 = "a\nb\nc\n", start = push(v0);
    const add = push("a\nb\nNEW1\nNEW2\nc\n");                     // two lines in after b
    const top = push("TOP\na\nb\nNEW1\nNEW2\nc\n");               // a line at the top moves them down
    push("TOP\na\nb\nNEW1\nc\n");                                   // one of them taken out later
    expect(touched(e, [add.id])).toEqual({ runs: [{ from: 3, to: 4 }], removed: false });
    expect(touched(e, [top.id])).toEqual({ runs: [{ from: 0, to: 1 }], removed: false });
    // The first entry put every line in; those still there are its own.
    expect(touched(e, [start.id]).runs).toEqual([{ from: 1, to: 3 }, { from: 4, to: 6 }]);
    // A moment whose lines are all gone says so.
    const gone = push("TOP\na\nb\nNEW1\nc\nLATE\n");
    push("TOP\na\nb\nNEW1\nc\n");
    expect(touched(e, [gone.id])).toEqual({ runs: [], removed: true });
    // A run of edits folded into one moment touches what any of them put in.
    expect(touched(e, [add.id, top.id]).runs).toEqual([{ from: 0, to: 1 }, { from: 3, to: 4 }]);
  });

  test("an id that is in no entry touches nothing", () => {
    const e: Entry[] = [change([], NOTE, at("you"), "edit")!];
    expect(touched(e, ["none"])).toEqual({ runs: [], removed: false });
  });

  test("a session's moments across notes, in the order they began", () => {
    const a = [change([], "a\n", at("you"), "edit")!], b = [change([], "b\n", at("you", a[0]!), "edit")!];
    a.push(change(a, "a\nmore\n", at("you", b[0]!), "edit")!);
    const all = sessionMoments(new Map([["n/a", a], ["n/b", b]]));
    expect(all.map((m) => [m.note, m.what])).toEqual([["n/a", "wrote"], ["n/b", "wrote"], ["n/a", "edited"]]);
  });
});
