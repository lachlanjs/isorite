import { expect, test } from "vitest";
import { can, cellsOf, edit } from "./tables.ts";

const rows = [["a", "b"], ["---", ":--:"], ["1", "2"], ["3", "4"]];

test("the cells of a line are split at unescaped pipes, with or without outer pipes", () => {
  expect(cellsOf("| a | b |")).toEqual(["a", "b"]);
  expect(cellsOf("a | b")).toEqual(["a", "b"]);
  expect(cellsOf("| a \\| x | b |")).toEqual(["a \\| x", "b"]);
});

test("a row is inserted below the rule at the least, and not above the header or its rule", () => {
  expect(edit(rows, { row: 0, col: 0 }, "row-below").rows[2]).toEqual(["", ""]);
  expect(edit(rows, { row: 2, col: 1 }, "row-above").at).toEqual({ row: 2, col: 1 });
  expect(can({ rows, at: { row: 0, col: 0 } }, "row-above")).toBe(false);
  expect(can({ rows, at: { row: 1, col: 0 } }, "row-delete")).toBe(false);
  expect(can({ rows, at: { row: 2, col: 0 } }, "row-delete")).toBe(true);
});

test("a column is inserted with a rule of its own, and the last one cannot be deleted", () => {
  const r = edit(rows, { row: 2, col: 0 }, "col-right");
  expect(r.rows.map((x) => x.length)).toEqual([3, 3, 3, 3]);
  expect(r.rows[1]![1]).toBe("---");
  expect(r.at.col).toBe(1);
  expect(edit(rows, { row: 2, col: 1 }, "col-delete").rows[0]).toEqual(["a"]);
  expect(can({ rows: [["a"], ["---"], ["1"]], at: { row: 2, col: 0 } }, "col-delete")).toBe(false);
});
