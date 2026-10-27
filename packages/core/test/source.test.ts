import { describe, expect, test } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FrontmatterError, editFrontmatter, spliceText, splitSource } from "../src/index.ts";
import { readFolder } from "../src/node.ts";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/bundles", import.meta.url));

describe("a note's file taken apart", () => {
  test("the prefix and the body are exactly the file", () => {
    for (const text of ["---\ntype: Concept\n---\n\n\nBody.\n", "No frontmatter.\n", "---\ntype: A\n---", "---\r\ntype: A\r\n---\r\n\r\nBody.\r\n", ""]) {
      const [prefix, , body] = splitSource(text);
      expect(prefix + body).toBe(text);
    }
    expect(splitSource("---\ntype: Concept\ntitle: T\n---\n\nBody.\n")).toEqual(["---\ntype: Concept\ntitle: T\n---\n\n", "type: Concept\ntitle: T\n", "Body.\n"]);
    expect(splitSource("Just text.")).toEqual(["", null, "Just text."]);
  });

  test("every file of the conformance fixtures splits into exactly itself", () => {
    let seen = 0;
    for (const name of readdirSync(FIXTURES)) {
      for (const file of readFolder(join(FIXTURES, name))) {
        if (file.text === undefined) continue;
        let parts: ReturnType<typeof splitSource>;
        try { parts = splitSource(file.text); } catch (e) { expect(e).toBeInstanceOf(FrontmatterError); continue; } // a block never closed
        expect(parts[0] + parts[2], `${name}/${file.path}`).toBe(file.text);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe("frontmatter edits", () => {
  const raw = [
    "type: Idea # what kind",
    "title: Motivation",
    "tags: [a, b]",
    "generated: { by: \"human:lachlan\", at: 2026-09-11T15:12:00Z }",
    "sources:",
    "  - {resource: x, title: y}",
    "# a closing comment",
    "",
  ].join("\n");

  test("only the changed field's lines change", () => {
    expect(editFrontmatter(raw, { title: "Why isorite" })).toBe(raw.replace("title: Motivation", "title: Why isorite"));
  });
  test("a block value is replaced whole, and the comment after it stays", () => {
    const out = editFrontmatter(raw, { sources: [{ resource: "z" }] });
    expect(out).toContain("sources:\n- resource: z\n# a closing comment\n");
    expect(out.startsWith("type: Idea # what kind\ntitle: Motivation\n")).toBe(true);
  });
  test("removing a field removes its lines; a new field goes at the end", () => {
    const out = editFrontmatter(raw, { tags: null, status: "draft" });
    expect(out).not.toContain("tags:");
    expect(out.endsWith("# a closing comment\nstatus: draft\n")).toBe(true);
  });
  test("a new type goes first", () => {
    expect(editFrontmatter("title: A\n", { type: "Note" })).toBe("type: Note\ntitle: A\n");
  });
  test("a title that YAML would misread is quoted", () => {
    expect(editFrontmatter("title: A\n", { title: "Entropy: a measure" })).toBe('title: "Entropy: a measure"\n');
    expect(editFrontmatter("title: A\n", { tags: ["x", "y z"] })).toBe("title: A\ntags: [x, y z]\n");
  });
});

describe("a file with fields changed and its body replaced", () => {
  const file = "---\ntype: Concept\ntitle: Old\n---\n\nBody.\n";
  test("the body alone", () => {
    expect(spliceText(file, {}, "New body.\n")).toBe("---\ntype: Concept\ntitle: Old\n---\n\nNew body.\n");
  });
  test("a field alone keeps the body and the gap above it", () => {
    expect(spliceText(file, { title: "New" }, null)).toBe("---\ntype: Concept\ntitle: New\n---\n\nBody.\n");
  });
  test("a note with no frontmatter gains one", () => {
    expect(spliceText("Body.\n", { type: "Concept" }, null)).toBe("---\ntype: Concept\n---\n\nBody.\n");
  });
  test("line endings and a byte-order mark are kept", () => {
    const crlf = "﻿---\r\ntype: Concept\r\n---\r\n\r\nBody.\r\n";
    expect(spliceText(crlf, { title: "T" }, "New.\n")).toBe("﻿---\r\ntype: Concept\r\ntitle: T\r\n---\r\n\r\nNew.\r\n");
  });
  test("nothing changed gives the file back to the character", () => {
    expect(spliceText(file, {}, null)).toBe(file);
  });
});
