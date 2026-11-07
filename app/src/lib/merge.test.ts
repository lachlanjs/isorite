// Your writing and an agent's edit, from the same text: put together when they are to different paragraphs.

import { describe, expect, test } from "vitest";
import { merge3, paragraphs } from "./merge.ts";

const note = (...ps: string[]) => `---\ntype: Concept\ntitle: T\n---\n\n${ps.join("\n\n")}\n`;
const base = note("P1 one.", "P2 two.", "P3 three.", "P4 four.");

describe("paragraphs", () => {
  test("joined, they are the text again, blank lines and all", () => {
    for (const t of [base, "a\n\n\n\nb\n", "", "one line", "a\n\nb", "```\nx\n\ny\n```\n\nz"]) expect(paragraphs(t).join("")).toBe(t);
  });
});

describe("merge3", () => {
  test("changes to different paragraphs are both kept", () => {
    const mine = base.replace("P2 two.", "P2 two, mine.");
    const theirs = base.replace("P4 four.", "P4 four, theirs.");
    expect(merge3(base, mine, theirs)).toBe(base.replace("P2 two.", "P2 two, mine.").replace("P4 four.", "P4 four, theirs."));
  });
  test("next to each other is still apart", () => {
    const mine = base.replace("P2 two.", "P2 mine.");
    const theirs = base.replace("P3 three.", "P3 theirs.");
    expect(merge3(base, mine, theirs)).toBe(base.replace("P2 two.", "P2 mine.").replace("P3 three.", "P3 theirs."));
  });
  test("a paragraph put in above what you are writing, and one taken out", () => {
    const mine = base.replace("P3 three.", "P3 three, and more of mine.");
    const theirs = base.replace("P2 two.", "New from the agent.\n\nP2 two.").replace("P4 four.\n", "").replace(/\n\n$/, "\n");
    const merged = merge3(base, mine, theirs)!;
    expect(merged).toContain("New from the agent.\n\nP2 two.");
    expect(merged).toContain("P3 three, and more of mine.");
    expect(merged).not.toContain("P4 four.");
  });
  test("the frontmatter is a paragraph like the others: a title changed there, the body here", () => {
    const mine = base.replace("P1 one.", "P1 mine.");
    const theirs = base.replace("title: T", "title: A better title");
    expect(merge3(base, mine, theirs)).toBe(base.replace("P1 one.", "P1 mine.").replace("title: T", "title: A better title"));
  });
  test("the same paragraph changed on both sides is not merged", () => {
    expect(merge3(base, base.replace("P2 two.", "P2 mine."), base.replace("P2 two.", "P2 theirs."))).toBeNull();
  });
  test("two things put in at the same place are not merged", () => {
    expect(merge3(base, base.replace("P3 three.", "Mine.\n\nP3 three."), base.replace("P3 three.", "Theirs.\n\nP3 three."))).toBeNull();
  });
  test("the same change on both sides is made once", () => {
    const both = base.replace("P2 two.", "P2 both.");
    expect(merge3(base, both, both)).toBe(both);
    const mine = both.replace("P4 four.", "P4 mine.");
    expect(merge3(base, mine, both)).toBe(mine);
  });
  test("one side unchanged: the other side", () => {
    const changed = base.replace("P1 one.", "P1 changed.");
    expect(merge3(base, base, changed)).toBe(changed);
    expect(merge3(base, changed, base)).toBe(changed);
  });
});
