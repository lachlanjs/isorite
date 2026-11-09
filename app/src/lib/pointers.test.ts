import { describe, expect, test } from "vitest";
import { askedParts, expand, full, idOf, markOf, relocate, used, type Pointer } from "./pointers.ts";

const note = (id: number, over: Partial<Pointer> = {}): Pointer => ({ id, kind: "note", ref: "basics/bit", title: "Bit", from: 3, to: 4, text: "A bit is a choice\nbetween two.", ...over });
const table = (...ps: Pointer[]) => (id: number) => ps.find((p) => p.id === id);

describe("a pointer's character", () => {
  test("is its own, and is told back", () => {
    expect(idOf(markOf(0))).toBe(0);
    expect(idOf(markOf(41))).toBe(41);
    expect(idOf("a")).toBeNull();
  });
});

describe("a prompt with pointers is sent as a sentence and what each points at", () => {
  test("a label where each stood, the file, its lines and its words below; the same pointer twice is one", () => {
    const a = note(1), b = note(2, { ref: "coding/huffman", title: "Huffman", from: 9, to: 9, text: "Shorter codes for commoner symbols." });
    const out = expand(`What does ${markOf(1)} mean next to ${markOf(2)}? Say ${markOf(1)} simply.`, table(a, b));
    expect(out.startsWith("What does [^1] mean next to [^2]? Say [^1] simply.\n\n")).toBe(true);
    expect(out).toContain("[^1]: /basics/bit.md L3–4\n    > A bit is a choice\n    > between two.");
    expect(out).toContain("[^2]: /coding/huffman.md L9\n    > Shorter codes for commoner symbols.");
    expect(out.match(/\[\^1\]: /g)).toHaveLength(1);
    // Taken apart for showing: what was written, and the footnotes folded away.
    const parts = askedParts(out);
    expect(parts.body).toBe("What does [^1] mean next to [^2]? Say [^1] simply.");
    expect(parts.notes).toEqual([{ n: 1, where: "/basics/bit.md L3–4", quote: "A bit is a choice\nbetween two." }, { n: 2, where: "/coding/huffman.md L9", quote: "Shorter codes for commoner symbols." }]);
    expect(askedParts("No pointers here.").notes).toEqual([]);
  });
  test("an answer of the agent's has no lines; a code file is named by its path", () => {
    const t: Pointer = { id: 3, kind: "turn", ref: "", title: "the agent", from: 0, to: 0, text: "Entropy is average surprise." };
    const c: Pointer = { id: 4, kind: "code", ref: "src/huff.ts", title: "huff.ts", from: 10, to: 20, text: "function build() {}" };
    const out = expand(`Rewrite ${markOf(3)} using ${markOf(4)}`, table(t, c));
    expect(out).toContain("[^1]: the agent's earlier answer\n    > Entropy is average surprise.");
    expect(out).toContain("[^2]: src/huff.ts L10–20\n    > function build() {}");
  });
  test("with no pointers the prompt is what was typed; a character that is nobody's is dropped", () => {
    expect(expand("Just a question.", table())).toBe("Just a question.");
    expect(expand(`Ask ${markOf(9)} this`, table())).toBe("Ask  this");
    expect(used(`${markOf(1)}${markOf(1)}${markOf(2)}`, table(note(1), note(2)))).toHaveLength(2);
  });
  test("for the clipboard: where it is, then the words", () => {
    expect(full(note(1))).toBe("/basics/bit.md, lines 3–4:\n> A bit is a choice\n> between two.");
    expect(full(note(1, { moved: true, from: 5, to: 5 }))).toContain("line 5 (it may have moved)");
  });
});

describe("a pointer against the file as it is now", () => {
  const file = ["---", "title: Bit", "---", "A bit is a choice", "between two.", "", "More."].join("\n");
  test("kept where its words still are", () => { expect(relocate(file, note(1, { from: 4, to: 5 }))).toMatchObject({ from: 4, to: 5, moved: false }); });
  test("followed to where they are now, the nearest if there are two", () => {
    const moved = ["new line", "new line", "x", ...file.split("\n"), "A bit is a choice", "between two."].join("\n");
    expect(relocate(moved, note(1, { from: 4, to: 5 }))).toMatchObject({ from: 7, to: 8, moved: false });
  });
  test("said to have moved where the words are gone; an answer is left alone", () => {
    expect(relocate("nothing like it", note(1))).toMatchObject({ from: 3, to: 4, moved: true });
    const t: Pointer = { id: 3, kind: "turn", ref: "", title: "the agent", from: 0, to: 0, text: "x" };
    expect(relocate("anything", t)).toBe(t);
  });
});
