import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { unwrap } from "../src/unwrap.ts";

describe("unwrap", () => {
  it("joins a paragraph and a list item onto one line each", () => {
    expect(unwrap("One line\nand the next.\n\n- an item\n  carried on\n- another")).toBe("One line and the next.\n\n- an item carried on\n- another");
  });
  it("leaves frontmatter, code, maths, tables and headings", () => {
    const text = "---\ntype: Concept\ntitle: T\n---\n\n# A\nB\n\n```\nx\ny\n```\n\n$$\na = b\n+ c\n$$\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    expect(unwrap(text)).toBe(text);
  });
  it("keeps a hard break", () => {
    expect(unwrap("first  \nsecond\nthird")).toBe("first  \nsecond third");
  });
  it("joins a quoted paragraph", () => {
    expect(unwrap("> said\n> again\n\nafter")).toBe("> said again\n\nafter");
  });
  it("leaves indented code after a blank line", () => {
    expect(unwrap("text\n\n    code\n    more")).toBe("text\n\n    code\n    more");
  });
  it("renders as before", () => {
    const md = new MarkdownIt({ html: true }), norm = (s: string) => md.render(s).replace(/\s+/g, " ");
    const wrapped = "A paragraph that was\nwrapped at a width, with *emphasis\nacross* the break and $x +\ny$ maths.\n\n1. An item\n   that goes on\n2. Two\n\n> Quoted\n> text";
    expect(norm(unwrap(wrapped))).toBe(norm(wrapped));
    for (const f of ["../../../docs/taste.md", "../../example/notes/physics/softening.md"]) {
      const s = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(unwrap(s)).toBe(s); // already one line per paragraph
    }
  });
});
