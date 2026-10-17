// The journal: history by replay, Iso's unkept text out of the file, and the
// timeline. Placing a proposal after the note has changed has the most cases,
// since nothing before isorite did it.

import { describe, expect, test } from "vitest";
import {
  applyHunks, blocks, change, diffLines, hashText, insertAt, journalLine, locate, findPassage, moments, passageOf, pending, readJournal, reconcile, replay, sessionMoments, stamp, textAt, touched, written,
  SNAPSHOT_EVERY, type Entry, type Insert, type Rewrite, type Stamp,
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

const insert = (note: string, line: number, text: string, s: Stamp): Insert => ({ ...s, kind: "proposal", asked: "say more", ...insertAt(note, line), text });

describe("Iso's text, not in the file", () => {
  const start = change([], NOTE, at("you"), "edit")!;
  const line = blocks(NOTE)[2]!.to; // after the equation
  const p = insert(NOTE, line, "Its unit is the bit when the logarithm is to base 2.", at("iso:model", start));

  test("pending until kept or discarded", () => {
    expect(pending([start, p])).toEqual([p]);
    const kept = change([start, p], written(NOTE, p)!, at("you", p), "keep", { proposal: p.id })!;
    expect(pending([start, p, kept])).toEqual([]);
    expect(pending([start, p, { ...at("you", p), kind: "discard", proposal: p.id }])).toEqual([]);
  });
  test("the journal's note is unchanged by a proposal", () => {
    expect(textAt([start, p])).toBe(NOTE);
  });
  test("written in at its place, with one blank line either side", () => {
    expect(written(NOTE, p)).toBe(NOTE.replace("$$\n\nIt is", () => "$$\n\nIts unit is the bit when the logarithm is to base 2.\n\nIt is"));
  });
  test("an edit before keeping is kept", () => {
    const r: Entry = { ...at("you", p), kind: "revise", proposal: p.id, text: "Its unit is the bit." };
    expect((pending([start, p, r])[0] as Insert).text).toBe("Its unit is the bit.");
  });

  describe("after the note has changed", () => {
    const place = (note: string) => locate(note, p);
    test("text added above: it moves down with its neighbours", () => {
      const note = NOTE.replace("# Entropy\n", "# Entropy\n\nA new opening paragraph.\n");
      expect(place(note)).toEqual({ form: "insert", line: line + 2 });
    });
    test("the block after it rewritten: it stays after the block before", () => {
      const note = NOTE.replace("It is largest when every outcome is equally likely.", "Uniform sources maximise it.");
      expect(written(note, p)).toContain("$$\n\nIts unit is the bit when the logarithm is to base 2.\n\nUniform sources");
    });
    test("the block before it rewritten: it goes before the block after", () => {
      const note = NOTE.replace("-\\sum_x", "\\sum_x");
      expect(written(note, p)).toContain("$$\n\nIts unit is the bit when the logarithm is to base 2.\n\nIt is largest");
    });
    test("both neighbours gone: not placed, and not lost", () => {
      const note = "---\ntype: Concept\n---\n\n# Entropy\n\nRewritten from nothing.\n";
      expect(place(note)).toBeNull();
      expect(written(note, p)).toBeNull();
      expect(pending([start, p])).toEqual([p]);
    });
    test("a paragraph between its neighbours: it keeps to the block before", () => {
      const note = NOTE.replace("$$\n\nIt is", () => "$$\n\nA paragraph of yours.\n\nIt is");
      expect(written(note, p)).toContain("$$\n\nIts unit is the bit when the logarithm is to base 2.\n\nA paragraph of yours.");
    });
  });

  test("at the very start and the very end", () => {
    const first = insert(NOTE, 0, "Opening.", at("iso:m")), last = insert(NOTE, 999, "Closing.", at("iso:m"));
    expect(first).toMatchObject({ after: null });
    expect(last).toMatchObject({ before: null });
    expect(written(NOTE, first)).toContain("---\n\nOpening.\n\n# Entropy");
    expect(written(NOTE, last)!.trimEnd().endsWith("equally likely.\n\nClosing.")).toBe(true);
  });
  test("into an empty note", () => {
    const e = insert("", 0, "First words.", at("iso:m"));
    expect(written("", e)).toBe("First words.\n");
  });
  test("two blocks with the same text are told apart", () => {
    const note = "again\n\nmiddle\n\nagain\n\nend\n";
    const second = insert(note, 5, "new", at("iso:m"));
    expect(second.after).toEqual({ text: "again", nth: 1 });
    expect(written(note, second)).toBe("again\n\nmiddle\n\nagain\n\nnew\n\nend\n");
    // One of the two is deleted: the one that is left is the place.
    expect(written("middle\n\nagain\n\nend\n", second)).toBe("middle\n\nagain\n\nnew\n\nend\n");
  });
});

describe("a rewrite of chosen passages", () => {
  const from = NOTE.indexOf("average surprise"), last = blocks(NOTE).at(-1)!.text;
  const p: Rewrite = {
    ...at("iso:model"), kind: "proposal", form: "rewrite", asked: "tighten",
    regions: [
      { old: passageOf(NOTE, from, from + "average surprise".length), new: "mean surprise" }, // a few words inside a sentence
      { old: passageOf(NOTE, NOTE.indexOf(last), NOTE.indexOf(last) + last.length), new: "" }, // a whole paragraph, taken out
    ],
  };
  test("a passage is named by its text, and found again by it", () => {
    expect(p.regions[0]!.old).toEqual({ text: "average surprise", nth: 0 });
    expect(findPassage(NOTE, p.regions[0]!.old)).toEqual({ from, to: from + 16 });
    // Twins are told apart by their order; when the one meant is gone and one is left, that one is the place.
    const twice = "an echo, an echo, and the rest";
    expect(passageOf(twice, 9, 16)).toEqual({ text: "an echo", nth: 1 });
    expect(findPassage(twice, { text: "an echo", nth: 1 })).toEqual({ from: 9, to: 16 });
    expect(findPassage("an echo, and the rest", { text: "an echo", nth: 1 })).toEqual({ from: 0, to: 7 });
    expect(findPassage("no such thing", { text: "an echo", nth: 0 })).toBeNull();
  });
  test("changes those passages and not a character else", () => {
    expect(written(NOTE, p)).toBe(NOTE.replace("average surprise", "mean surprise").replace(last, ""));
    expect(written(NOTE, p, 0)).toBe(NOTE.replace("average surprise", "mean surprise"));
    expect(written(NOTE, p, 1)).toBe(NOTE.replace(last, ""));
  });
  test("each region is placed on its own: one edited away does not unplace the others", () => {
    const edited = NOTE.replace("average surprise", "expected surprise");
    expect(locate(edited, p)).toMatchObject({ form: "rewrite", regions: [null, { from: edited.indexOf(last) }] });
    expect(written(edited, p)).toBeNull();
    expect(written(edited, p, 1)).toBe(edited.replace(last, ""));
  });
  test("each region is kept or removed on its own, and the rewrite waits while any does", () => {
    const open = () => (pending(e)[0] as Rewrite | undefined)?.open;
    const e: Entry[] = [change([], NOTE, at("you"), "edit")!, p];
    expect(open()).toEqual([0, 1]);
    e.push(change(e, written(NOTE, p, 0)!, at("you"), "keep", { proposal: p.id, region: 0 })!);
    expect(e.at(-1)).toMatchObject({ why: "keep", proposal: p.id, region: 0 });
    expect(open()).toEqual([1]);
    // What is still open is written without the one already kept.
    expect(written(textAt(e)!, pending(e)[0]!)).toBe(NOTE.replace("average surprise", "mean surprise").replace(last, ""));
    e.push({ ...at("you"), kind: "discard", proposal: p.id, region: 1 });
    expect(pending(e)).toEqual([]);
    // All at once: a keep or a discard that names no region settles every one still open.
    expect(pending([p, { ...at("you"), kind: "discard", proposal: p.id }])).toEqual([]);
    const start = change([], NOTE, at("you"), "edit")!;
    expect(pending([start, p, change([start], written(NOTE, p)!, at("you"), "keep", { proposal: p.id })!])).toEqual([]);
  });
  test("revised region by region", () => {
    const r: Entry = { ...at("you"), kind: "revise", proposal: p.id, regions: ["Mine.", "Kept after all."] };
    expect((pending([p, r])[0] as Rewrite).regions.map((x) => x.new)).toEqual(["Mine.", "Kept after all."]);
  });
});

describe("the timeline", () => {
  test("your edits in a row are one moment; a proposal is one moment that says how it ended", () => {
    const e: Entry[] = [];
    const push = (x: Entry | null) => { e.push(x!); return x!; };
    push(change(e, NOTE, at("you"), "edit"));
    push(change(e, NOTE + "a\n", at("you", e.at(-1)!), "edit"));
    push(change(e, NOTE + "a\nb\n", at("you", e.at(-1)!), "edit"));
    const p1 = push(insert(NOTE + "a\nb\n", 999, "kept text", at("iso:m", e.at(-1)!))) as Insert;
    push(change(e, written(textAt(e)!, p1)!, at("you", e.at(-1)!), "keep", { proposal: p1.id }));
    push(change(e, textAt(e)! + "c\n", at("you", e.at(-1)!), "edit"));
    const p2 = push(insert(textAt(e)!, 999, "unwanted", at("iso:m", e.at(-1)!)));
    push({ ...at("you", e.at(-1)!), kind: "discard", proposal: p2.id });
    const p3 = push(insert(textAt(e)!, 999, "waiting", at("iso:m", e.at(-1)!)));
    expect(moments(e).map((m) => [m.who, m.what, m.ids.length])).toEqual([
      ["you", "wrote", 1], ["you", "edited", 2], ["iso:m", "kept", 2], ["you", "edited", 1], ["iso:m", "discarded", 2], ["iso:m", "offered", 1],
    ]);
    expect(moments(e)[2]).toMatchObject({ asked: "say more" });
    expect(pending(e).map((x) => x.id)).toEqual([p3.id]);
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

  test("Iso's text not kept touches nothing", () => {
    const e: Entry[] = [change([], NOTE, at("you"), "edit")!];
    const p = insert(NOTE, 6, "More.", at("iso:m", e[0]!));
    e.push(p);
    expect(touched(e, [p.id])).toEqual({ runs: [], removed: false });
  });

  test("a session's moments across notes, in the order they began", () => {
    const a = [change([], "a\n", at("you"), "edit")!], b = [change([], "b\n", at("you", a[0]!), "edit")!];
    a.push(change(a, "a\nmore\n", at("you", b[0]!), "edit")!);
    const all = sessionMoments(new Map([["n/a", a], ["n/b", b]]));
    expect(all.map((m) => [m.note, m.what])).toEqual([["n/a", "wrote"], ["n/b", "wrote"], ["n/a", "edited"]]);
  });
});
