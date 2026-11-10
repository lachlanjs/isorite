// Finding a program on PATH, which the setup wizard's detection of harnesses is built on.

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { onPath } from "../src/detect.ts";

test.skipIf(process.platform === "win32")("a program on PATH is found; none on an empty PATH", () => {
  const dir = mkdtempSync(join(tmpdir(), "isorite-bin-"));
  writeFileSync(join(dir, "claude"), "#!/bin/sh\n");
  chmodSync(join(dir, "claude"), 0o755);
  expect(onPath("claude", { PATH: dir })).toBe(join(dir, "claude"));
  expect(onPath("claude", { PATH: "" })).toBeNull();
});
