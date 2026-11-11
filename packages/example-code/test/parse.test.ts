import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLine, parseLine } from "../src/parse.ts";

test("a line gives its text, tags and due day", () => {
  assert.deepEqual(parseLine("[ ] buy milk +home due:2026-12-01"), { done: false, text: "buy milk", tags: ["home"], due: "2026-12-01" });
});

test("a line that is not a task is null", () => {
  assert.equal(parseLine("# a comment"), null);
  assert.equal(parseLine(""), null);
});

test("formatting puts the tags and due day after the text", () => {
  const task = parseLine("[x] +home due:2026-12-01 buy milk")!;
  assert.equal(formatLine(task), "[x] buy milk +home due:2026-12-01");
});
