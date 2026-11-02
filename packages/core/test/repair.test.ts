import { expect, test } from "vitest";
import { repairFrontmatter, splitFrontmatter } from "../src/index.ts";

test("an unquoted colon in a field is quoted, and nothing else is touched", () => {
  const src = "---\ntype: Concept\ntitle: Gaussian curvature: the product\ndescription: Uses a: b and c: d\ntags: [x, y]\n---\n\nBody: stays.\n";
  expect(() => splitFrontmatter(src)).toThrow();
  const r = repairFrontmatter(src)!;
  expect(r.fixed).toEqual(["title", "description"]);
  const [meta, body] = splitFrontmatter(r.text);
  expect(meta).toMatchObject({ type: "Concept", title: "Gaussian curvature: the product", description: "Uses a: b and c: d", tags: ["x", "y"] });
  expect(body).toBe("Body: stays.\n");
  expect(r.text.endsWith("\n---\n\nBody: stays.\n")).toBe(true);
});

test("values starting with a backtick, % or @ are quoted too; CRLF and a BOM are kept", () => {
  const src = "﻿---\r\ntype: Concept\r\ntitle: `code` first\r\ndescription: @here: now\r\n---\r\nBody\r\n";
  const r = repairFrontmatter(src)!;
  expect(r.text.startsWith("﻿---\r\n")).toBe(true);
  expect(splitFrontmatter(r.text)[0]).toMatchObject({ title: "`code` first", description: "@here: now" });
});

test("readable frontmatter, none, and what quotes cannot mend are left alone", () => {
  expect(repairFrontmatter("---\ntype: Concept\ntitle: Fine\n---\n\nx\n")).toBeNull();
  expect(repairFrontmatter("no frontmatter\n")).toBeNull();
  expect(repairFrontmatter("---\ntype: Concept\ntags: [a, b\n---\n\nx\n")).toBeNull();
  expect(repairFrontmatter("---\ntype: Concept\ntitle: \"quoted: fine\"\nnote: it: breaks\n---\n")?.fixed).toEqual(["note"]);
});
