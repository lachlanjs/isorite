import { expect, test } from "vitest";
import { handoffText } from "./handoff.ts";

test("nothing chosen is nothing to paste", () => {
  expect(handoffText([])).toBe("");
});

test("notes, folders and passages are named for the agent to read with isorite's tools", () => {
  const text = handoffText([
    { kind: "note", id: "basics/entropy", title: "Entropy" },
    { kind: "folder", id: "basics", title: "Basics" },
    { kind: "passage", id: "basics/entropy", title: "Entropy", text: "The average surprise.\nIn bits." },
  ], "Say more about this.");
  expect(text).toContain("read_note");
  expect(text).toContain("- Entropy (basics/entropy)");
  expect(text).toContain("- Basics (basics)");
  expect(text).toContain("> The average surprise.\n> In bits.");
  // A quote may be out of date: the agent is told to read the note, and the id to read is there.
  expect(text).toMatch(/Read the note for the current text/);
  expect(text.endsWith("Say more about this.")).toBe(true);
});

test("a passage with no other part still names its note, and no empty sections are written", () => {
  const text = handoffText([{ kind: "passage", id: "a/b", title: "B", text: "x" }]);
  expect(text).toContain("From B (a/b):");
  expect(text).not.toContain("Notes (");
  expect(text).not.toContain("Folders (");
});
