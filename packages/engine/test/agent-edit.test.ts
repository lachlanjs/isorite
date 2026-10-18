import { expect, test } from "vitest";
import { findPassage } from "@isorite/core";
import { editRegions, writeRegions, type Region } from "../src/agent.ts";

const NOTE = "---\ntitle: Loop\n---\n\nGuess the self-energy.\n\n## Mixing\n\nKeep part of the old bath.\n";

/** The note with the regions applied, last first, as keeping each would leave it. */
function kept(note: string, regions: Region[]): string {
  let out = note;
  for (const r of [...regions].map((r) => ({ r, at: findPassage(note, r.old)! })).sort((x, y) => y.at.from - x.at.from)) out = out.slice(0, r.at.from) + r.r.new + out.slice(r.at.to);
  return out;
}

test("a replacement is one passage, or each of them with replaceAll", () => {
  expect(editRegions(NOTE, "old bath", "old self-energy")).toEqual([{ old: { text: "old bath", nth: 0 }, new: "old self-energy" }]);
  const twice = "a cat and a cat";
  expect(editRegions(twice, "cat", "dog", true).map((r) => r.old)).toEqual([{ text: "cat", nth: 0 }, { text: "cat", nth: 1 }]);
  expect(kept(twice, editRegions(twice, "cat", "dog", true))).toBe("a dog and a dog");
});

test("a replacement that names nothing, or names twice without replaceAll, is refused in words the agent can act on", () => {
  expect(() => editRegions(NOTE, "no such text", "x")).toThrow(/not in the note/);
  expect(() => editRegions("a cat and a cat", "cat", "dog")).toThrow(/2 times.*replaceAll/);
  expect(() => editRegions(NOTE, "", "x")).toThrow(/empty/);
  expect(() => editRegions(NOTE, "bath", "bath")).toThrow(/the same/);
});

test("a whole note written anew is offered as the passages that changed, and keeping them all gives what was written", () => {
  const after = NOTE.replace("Guess the self-energy.", "Guess the self-energy, say zero.").replace("old bath", "old self-energy");
  const regions = writeRegions(NOTE, after);
  expect(regions).toEqual([
    { old: { text: "Guess the self-energy.", nth: 0 }, new: "Guess the self-energy, say zero." },
    { old: { text: "Keep part of the old bath.", nth: 0 }, new: "Keep part of the old self-energy." },
  ]);
  expect(kept(NOTE, regions)).toBe(after);
});

test("a line added among blank lines is offered with the line before it, or at the top with the line after", () => {
  const added = NOTE.replace("## Mixing\n", "## Mixing\n\nNear the transition it swings.\n");
  const regions = writeRegions(NOTE, added);
  expect(regions).toHaveLength(1);
  expect(regions[0]!.old.text.startsWith("## Mixing")).toBe(true);
  expect(kept(NOTE, regions)).toBe(added);
  const top = "Intro.\n\nBody.";
  expect(kept(top, writeRegions(top, "New first line.\nIntro.\n\nBody."))).toBe("New first line.\nIntro.\n\nBody.");
});

test("changes a line apart are one passage; the same text twice is told apart by nth", () => {
  const note = "x\ny\nz\nw\nx\n";
  const after = "x\ny\nz\nw\nX\n";
  expect(writeRegions(note, after)).toEqual([{ old: { text: "x", nth: 1 }, new: "X" }]);
  const close = "a\nb\nc\n", changed = "A\nb\nC\n";
  expect(kept(close, writeRegions(close, changed))).toBe(changed);
  expect(writeRegions(NOTE, NOTE)).toEqual([]);
});

test("over many notes edited at random, keeping every passage offered gives exactly what was written", () => {
  let seed = 7;
  const rand = (n: number) => ((seed = (seed * 16807) % 2147483647), seed % n);
  const words = ["alpha", "beta", "", "gamma", "", "delta", "alpha"];
  for (let trial = 0; trial < 500; trial++) {
    const before = Array.from({ length: 2 + rand(8) }, () => words[rand(words.length)]!);
    if (!before.some((l) => l.trim())) before.push("text");
    const after = [...before];
    for (let k = rand(4) + 1; k > 0; k--) {
      const at = rand(after.length + 1), op = rand(3);
      if (op === 0) after.splice(at, 0, `new ${trial} ${k}`);
      else if (op === 1 && after.length > 1) after.splice(Math.min(at, after.length - 1), 1);
      else after[Math.min(at, after.length - 1)] = `changed ${trial} ${k}`;
    }
    const a = before.join("\n"), b = after.join("\n");
    expect(kept(a, writeRegions(a, b)), `trial ${trial}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`).toBe(b);
  }
});
