import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { sha256, sha256Pure } from "@isorite/core";
import "../src/nodefiles.ts";

test("the shell's hasher is installed and agrees with the pure one", () => {
  const inputs = ["", "abc", "word ".repeat(1600), "naïve ✓ 😀", "\ud800 lone", new Uint8Array([0, 1, 2, 255])];
  for (const m of inputs) {
    expect(sha256(m)).toBe(sha256Pure(m));
    expect(sha256(m)).toBe(createHash("sha256").update(m).digest("hex"));
  }
});
