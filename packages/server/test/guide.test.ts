import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { writeGuide } from "../src/guide.ts";

// isorite guide (M16): the guide written into a folder once, opened as you left it after.
const temp = () => mkdtempSync(join(tmpdir(), "isorite-guide-test-"));

test("the guide is written into a new folder, with its AGENTS.md; run again, what you changed is kept", () => {
  const at = join(temp(), "guide");
  expect(writeGuide(at)).toEqual({ notes: at, fresh: true });
  expect(readFileSync(join(at, "general", "start-here.md"), "utf8")).toMatch(/^---\ntype: Concept\ntitle: Start here/);
  expect(existsSync(join(at, "AGENTS.md"))).toBe(true);
  writeFileSync(join(at, "general", "your-notes.md"), "---\ntype: Concept\ntitle: Your notes\n---\n\nMine.\n");
  expect(writeGuide(at)).toEqual({ notes: at, fresh: false });
  expect(readFileSync(join(at, "general", "your-notes.md"), "utf8")).toContain("Mine.");
});

test("a guide written before its notes were put in islands is still the guide", () => {
  const at = temp();
  writeFileSync(join(at, "start-here.md"), "---\ntype: Concept\ntitle: Start here\n---\n");
  expect(writeGuide(at)).toEqual({ notes: at, fresh: false });
});

test("a folder with other files in it is refused, an empty one is written into", () => {
  const busy = temp();
  writeFileSync(join(busy, "mine.md"), "# mine\n");
  expect(() => writeGuide(busy)).toThrow(/not the guide/);
  const empty = temp();
  expect(writeGuide(empty).fresh).toBe(true);
});
