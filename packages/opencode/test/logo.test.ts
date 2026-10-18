import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { height, lines, rows, shapes, width } from "../plugin/logo.ts";

describe("the mark", () => {
  it("has the board's 31 shapes, each on the grid and none on another", () => {
    expect(shapes).toHaveLength(31);
    const at = new Set(shapes.map((shape) => `${shape.x},${shape.y}`));
    expect(at.size).toBe(31);
    for (const shape of shapes) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.x).toBeLessThan(width);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeLessThan(height);
    }
  });

  it("is 20 cells by 15 rows in every style, a square two cells, and 10 by 15 in triangles, a square one cell", () => {
    for (const style of ["legacy", "quadrant", "simple", "triangle"] as const) {
      const drawn = lines(style);
      expect(drawn).toHaveLength(15);
      for (const line of drawn) expect([...line]).toHaveLength(style === "triangle" ? 10 : 20);
    }
  });

  it("is gold in its top two rows only", () => {
    rows().forEach((runs, y) => {
      const gold = runs.some((run) => run.growth && run.text.trim());
      expect(gold).toBe(y < 2);
    });
  });

  it("draws the trunk as whole blocks in the middle column", () => {
    for (const line of lines("legacy").slice(12)) expect(line).toBe("          ██        ");
    for (const line of lines().slice(12)) expect(line).toBe("     █    ");
  });
});

describe("the mark and the wordmark as images", () => {
  // A PNG's width and height are at bytes 16 and 20.
  const size = (name: string) => { const png = readFileSync(new URL(`../plugin/assets/${name}.png`, import.meta.url)); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };

  it("are drawn on both grounds, at the mark's proportions and the browser wordmark's", () => {
    for (const ground of ["lapis", "quartz"]) {
      const [mw, mh] = size(`mark-${ground}`), [ww, wh] = size(`wordmark-${ground}`);
      expect(mw! / mh!).toBeCloseTo(width / height, 2);
      expect(ww! / wh!).toBeCloseTo(32.4 / 9.9, 2);
    }
  });
});
