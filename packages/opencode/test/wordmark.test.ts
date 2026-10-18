import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { glyphs } from "../plugin/logo.ts";
import { lines, PATH, rows, word } from "../plugin/wordmark.ts";

describe("the wordmark", () => {
  it("is drawn, by default, from the browser's own path", () => {
    const svelte = readFileSync(new URL("../../../app/src/lib/components/Logo.svelte", import.meta.url), "utf8");
    expect(/<path d="([^"]+)"/.exec(svelte)?.[1]).toBe(PATH);
  });

  it("has every row as wide, so that centred it stays aligned, in every style", () => {
    for (const style of ["legacy", "quadrant", "simple", "triangle"] as const) {
      const widths = rows(style).map((runs) => [...runs.map((r) => r.text).join("")].length);
      expect(new Set(widths).size).toBe(1);
    }
  });

  it("has Iso's diamond, then the malachite one, and a shadow behind the letters", () => {
    for (const row of rows().slice(0, 3)) {
      const diamonds = row.map((r) => r.role).filter((r) => r === "iso" || r === "right");
      expect(diamonds.filter((r, k) => r !== diamonds[k - 1])).toEqual(["iso", "right"]);
    }
    const runs = rows().flat();
    expect(runs.map((r) => r.role)).toContain("shadow");
    // A shadow under a letter in the same cell fills the rest of it.
    expect(runs.some((r) => r.role === "ink" && r.bg === "shadow")).toBe(true);
  });

  it("is drawn with quarter blocks by default, and with the mark's own pieces in the other styles", () => {
    for (const ch of lines().join("")) expect(" ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█").toContain(ch);
    for (const style of ["legacy", "triangle"] as const) {
      const pieces = new Set(Object.values(glyphs[style]).flatMap((g) => [...g]));
      for (const line of lines(style)) for (const ch of line) if (ch !== " ") expect(pieces).toContain(ch);
    }
  });

  it("in OpenCode's letters, has the i one cell wide and the others four", () => {
    expect(word("iso")[1]).toBe("█ █▀▀▀ █▀▀█");
  });
});
