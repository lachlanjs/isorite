import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/args.ts";
import { UsageError } from "../src/errors.ts";

test("no words means list", () => {
  assert.equal(parseArgs([]).command, "list");
});

test("flags are taken out of the words", () => {
  assert.deepEqual(parseArgs(["list", "--all", "--tag", "home"]), { command: "list", words: [], all: true, tag: "home" });
});

test("--tag without a name is a usage error", () => {
  assert.throws(() => parseArgs(["list", "--tag"]), UsageError);
});
