import { expect, test } from "vitest";
import { authors, change, insertAt, stamp, type Entry, type Insert, type Stamp } from "../src/index.ts";

let clock = Date.parse("2026-10-18T09:00:00Z");
const at = (who: string): Stamp => stamp(who, "laptop1", null, (clock += 1000));

test("each line is whoever last wrote it; text kept from a proposal is its proposer's", () => {
  const entries: Entry[] = [];
  const write = (text: string, who: string, why: "start" | "edit" | "keep" | "external", extra = {}) => { const e = change(entries, text, at(who), why, extra); if (e) entries.push(e); };
  const v1 = "# Loop\n\nGuess the self-energy.\n";
  write(v1, "external", "external");
  const v2 = "# Loop\n\nGuess the self-energy, say zero.\n";
  write(v2, "you", "edit");
  const p: Insert = { ...at("agent:opencode"), kind: "proposal", asked: "say how to mix", ...insertAt(v2, 3), text: "Mix half the old one." };
  entries.push(p);
  write(v2 + "\nMix half the old one.\n", "you", "keep", { proposal: p.id });
  const text = (v2 + "\nMix half the old one.\n").split("\n"), owners = authors(entries)!;
  expect(owners).toHaveLength(text.length);
  // Blank lines go with whichever side the difference puts them; the lines with text are what is asked.
  expect(text.flatMap((line, k) => (line ? [[line, owners[k]]] : []))).toEqual([
    ["# Loop", "external"], ["Guess the self-energy, say zero.", "you"], ["Mix half the old one.", "agent:opencode"],
  ]);
});

test("nothing is said of a journal whose chain is broken, or of none", () => {
  expect(authors([])).toBeNull();
  const e = change([], "a\n", at("you"), "edit")!;
  expect(authors([e, { ...change([e], "b\n", at("you"), "edit")!, before: "0000000000000000" }])).toBeNull();
});
