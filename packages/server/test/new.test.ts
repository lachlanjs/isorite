import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { OWN_DIR } from "@isorite/core";
import { locate, newBase } from "../src/serve.ts";

// isorite new <folder> (M14): a knowledge base from nothing.
const root = mkdtempSync(join(tmpdir(), "isorite-new-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

it("makes the folder and its parents, with isorite's own folder in it, and no notes", () => {
  const at = newBase(join(root, "notes", "project"));
  expect(readdirSync(at)).toEqual([OWN_DIR]);
  expect(existsSync(join(at, OWN_DIR, ".gitattributes"))).toBe(true);
  expect(locate(at).notes).toBe(at);
  // Again on the same folder: nothing has been put in it, so it is fine.
  expect(newBase(at)).toBe(at);
});

it("refuses a folder with notes in it already, and a file, saying what to do", () => {
  const full = join(root, "full");
  mkdirSync(full);
  writeFileSync(join(full, "a.md"), "# A\n");
  expect(() => newBase(full)).toThrow(/has files in it already: open it as it is, with isorite serve/);
  expect(() => newBase(join(full, "a.md"))).toThrow(/is a file/);
});

it("serve and term on a missing folder say that isorite new makes one", () => {
  expect(() => locate(join(root, "missing"))).toThrow(/no folder at .*missing: isorite new .* makes one/);
});
