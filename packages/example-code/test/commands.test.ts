import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/main.ts";

// Each test gets its own file, and runs the command as main.ts does, minus the process.
const tally = () => {
  const env = { TALLY_FILE: join(mkdtempSync(join(tmpdir(), "tally-")), "tasks.txt") };
  return (...argv: string[]) => run(argv, env, "2026-06-01");
};

test("add, done, list", () => {
  const t = tally();
  assert.equal(t("add", "buy", "milk", "+home").lines[0], "added 1: buy milk +home");
  t("add", "walk");
  assert.equal(t("done", "1").code, 0);
  assert.deepEqual(t("list").lines, ["2 [ ] walk"]);
  assert.deepEqual(t("list", "--all").lines, ["2 [ ] walk", "1 [x] buy milk +home"]);
});

test("--tag narrows the list", () => {
  const t = tally();
  t("add", "a", "+x");
  t("add", "b", "+y");
  assert.deepEqual(t("list", "--tag", "y").lines, ["2 [ ] b +y"]);
});

test("a mistake is a message and a code, not a stack", () => {
  const t = tally();
  assert.deepEqual(t("done", "9"), { lines: ["no task 9"], code: 1 });
  assert.equal(t("frob").code, 1);
  assert.equal(t("add").code, 1);
});
