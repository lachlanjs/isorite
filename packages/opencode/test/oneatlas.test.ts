import { expect, test } from "vitest";
import { drawAtlas, runsOf, wrapTitle } from "../plugin/oneatlas.ts";

const text = (grid: { ch: string }[][]) => grid.map((r) => r.map((c) => c.ch).join("").trimEnd());

test("the board's note: four it requires, three that build on it, routes joined into trunks", () => {
  const grid = drawAtlas(
    { id: "sc", title: "self-consistency condition" },
    [{ id: "w", title: "weiss field", gold: true }, { id: "m", title: "lattice to impurity map" }, { id: "g", title: "local green's function" }, { id: "h", title: "hybridisation function" }],
    [{ id: "l", title: "the dmft loop" }, { id: "b", title: "bethe lattice closure" }, { id: "t", title: "mott transition" }],
    80,
  );
  const lines = text(grid);
  console.log(lines.join("\n"));
  expect(lines).toHaveLength(19);
  // The note is drawn heavier, in the middle, its title on two lines.
  expect(lines.join("\n")).toMatch(/┃ self-consistency +┃/);
  expect(lines.join("\n")).toMatch(/┃ condition +┃/);
  // What builds on it is dashed; the box being read is gold.
  expect(lines.join("\n")).toMatch(/╎ the dmft loop +╎/);
  // Each box on the right is reached: a route ends at its edge.
  expect(lines.filter((l) => /─╎ /.test(l))).toHaveLength(3);
  expect(grid.flat().filter((c) => c.role === "gold").length).toBeGreaterThan(0);
  // Every route meets the note: the trunks join at its middle row on both sides.
  const mid = lines.findIndex((l) => l.includes("┃ self-consistency"));
  expect(lines[mid]).toMatch(/[┤┼├┬┴─]─*┃ self-consistency +┃─*[├┼┤┬┴─]/);
  expect(grid.flat().filter((c) => c.role === "req").length).toBeGreaterThan(10);
  expect(grid.flat().filter((c) => c.role === "bld").length).toBeGreaterThan(10);
});

test("a note with nothing either side is its box alone; a narrow panel narrows the boxes", () => {
  expect(text(drawAtlas({ id: "a", title: "alone" }, [], [], 60)).filter((l) => l.trim())).toHaveLength(4);
  expect(drawAtlas({ id: "a", title: "a" }, [{ id: "b", title: "b" }], [], 46)[0]!.length).toBe(3 * 12 + 10);
});

test("titles wrap on two lines and are cut past that", () => {
  expect(wrapTitle("lattice to impurity map", 18)).toEqual(["lattice to", "impurity map"]);
  expect(wrapTitle("a very long title that goes on and on", 12)[1]!.endsWith("…")).toBe(true);
  expect(runsOf([{ ch: "a", role: "text" }, { ch: "b", role: "text" }, { ch: "─", role: "req" }])).toEqual([{ text: "ab", role: "text", bold: false }, { text: "─", role: "req", bold: false }]);
});
