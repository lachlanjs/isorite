import { describe, expect, it } from "vitest";
import { glyphs } from "../plugin/logo.ts";
import { lines, rows, word } from "../plugin/wordmark.ts";

describe("the wordmark", () => {
  it("has every row as wide, so that centred it stays aligned, in every style", () => {
    for (const style of ["legacy", "quadrant", "simple", "triangle"] as const) {
      const widths = rows(style).map((runs) => [...runs.map((r) => r.text).join("")].length);
      expect(new Set(widths).size).toBe(1);
    }
  });

  it("puts Iso's diamond over the first i and the malachite one over the second, each on its stem", () => {
    const drawn = lines("quadrant"), stem = glyphs.quadrant.full;
    const [dot] = drawn, foot = drawn.at(-1)!;
    const centres = [...dot!.matchAll(new RegExp(stem, "g"))].map((m) => m.index);
    expect(centres).toHaveLength(2);
    for (const k of centres) expect(foot.slice(k, k + 2)).toBe(stem);
    expect(rows()[0]!.filter((r) => r.role !== "ink").map((r) => r.role)).toEqual(["iso", "right"]);
  });

  it("is drawn with the mark's own pieces: whole squares and the corner halves of the style", () => {
    const pieces = new Set(Object.values(glyphs.legacy).flatMap((g) => [...g]));
    for (const line of lines()) for (const ch of line) if (ch !== " ") expect(pieces).toContain(ch);
  });

  it("in OpenCode's letters, has the i one cell wide and the others four", () => {
    expect(word("iso")[1]).toBe("█ █▀▀▀ █▀▀█");
  });
});
