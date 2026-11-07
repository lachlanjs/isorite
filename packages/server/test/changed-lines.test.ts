import { expect, test } from "vitest";
import { changedLines } from "../src/acp.ts";

// What an agent's edit shows in the pane: the lines it changed, with a line around each, not the whole file twice.

test("a line appended shows as itself, after the line it follows", () => {
  expect(changedLines("a\nb\nc\nd\n", "a\nb\nc\nd\nA new line.\n")).toEqual([" d", "+A new line."]);
});

test("changes apart are shown apart, the unchanged lines between them left out", () => {
  expect(changedLines("1\n2\n3\n4\n5\n6\n7\n8\n9", "1\nX\n3\n4\n5\n6\n7\nY\n9")).toEqual([" 1", "-2", "+X", " 3", "…", " 7", "-8", "+Y", " 9"]);
});

test("a new file is all added; nothing changed is nothing shown", () => {
  expect(changedLines(null, "new\nfile")).toEqual(["+new", "+file"]);
  expect(changedLines("same\n", "same\n")).toEqual([]);
});
