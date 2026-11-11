import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.ts";

const fresh = (text?: string) => {
  const path = join(mkdtempSync(join(tmpdir(), "tally-")), "tasks.txt");
  if (text !== undefined) writeFileSync(path, text);
  return path;
};

test("a missing file is an empty list", () => {
  assert.deepEqual(new Store(fresh()).tasks(), []);
});

test("lines that are not tasks survive a save", () => {
  const path = fresh("# mine\n[ ] a\n\n[ ] b\n");
  const store = new Store(path);
  store.remove(1);
  store.save();
  assert.equal(readFileSync(path, "utf8"), "# mine\n\n[ ] b\n");
});

test("ids count tasks, not lines", () => {
  const store = new Store(fresh("# note\n[ ] a\n[x] b\n"));
  assert.deepEqual(store.tasks().map((t) => t.id), [1, 2]);
  assert.equal(store.update(2, (t) => ({ ...t, text: "c" })), true);
  assert.equal(store.update(3, (t) => t), false);
});
