import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The one test that starts the real command, to show main.ts runs as a script.
test("the command runs as a script", () => {
  const env = { ...process.env, TALLY_FILE: join(mkdtempSync(join(tmpdir(), "tally-")), "tasks.txt") };
  const main = new URL("../src/main.ts", import.meta.url).pathname;
  execFileSync("node", [main, "add", "hello"], { env });
  assert.equal(execFileSync("node", [main], { env }).toString(), "1 [ ] hello\n");
});
