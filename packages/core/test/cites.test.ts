// Artifacts and pictures cited from notes (T76): links to files in the bundle
// that are not notes, and embeds (image syntax).
import { expect, test } from "vitest";
import { Bundle, citeKind } from "../src/index.ts";

const note = (body: string) => `---\ntype: Note\ntitle: N\n---\n\n${body}\n`;

test("a note cites artifacts and pictures: linked or shown, with a rating or a place, broken when the file is not there", () => {
  const b = Bundle.fromFiles([
    { path: "a/n.md", text: note('See [the figure](fig.html "uses") and ![a plot](/a/fig.html).\n\n![A sphere](../img/sphere.png "left") and ![gone](missing.svg "center").\n\n[a note](m.md), [the web](https://example.com/x.html), [data](table.csv).') },
    { path: "a/m.md", text: note("Nothing.") },
    { path: "a/fig.html" }, { path: "img/sphere.png" }, { path: "a/table.csv" },
  ]);
  const c = b.concepts.get("a/n")!;
  expect(c.cites).toEqual([
    { target: "a/fig.html", kind: "artifact", embed: false, broken: false, rel: "uses", align: null },
    { target: "a/fig.html", kind: "artifact", embed: true, broken: false, rel: null, align: null, alt: "a plot" },
    { target: "img/sphere.png", kind: "image", embed: true, broken: false, rel: null, align: "left", alt: "A sphere" },
    { target: "a/missing.svg", kind: "image", embed: true, broken: true, rel: null, align: "center", alt: "gone" },
    { target: "a/table.csv", kind: "data", embed: false, broken: false, rel: null, align: null },
  ]);
  // Links to notes are as they were; every other file is a citation (M23); an address is not looked at.
  expect(c.links.map((l) => l.target)).toEqual(["a/m"]);
  expect(b.issues.filter((i) => i.code === "broken-link").map((i) => i.message)).toEqual(["picture not in the notes: a/missing.svg"]);
  expect(b.files.has("a/fig.html") && b.files.has("a/table.csv")).toBe(true);
  expect([citeKind("x.html"), citeKind("x.HTM"), citeKind("x.jpeg"), citeKind("x.md"), citeKind("x.csv"), citeKind("a/x.pdf"), citeKind("part.glb"), citeKind("notes"), citeKind(".gitignore")])
    .toEqual(["artifact", "artifact", "image", null, "data", "document", "misc", null, null]);
});

test("a cite of any kind is kept, and a broken one reported (M23)", () => {
  const b = Bundle.fromFiles([
    { path: "n.md", text: note("[runs](runs.csv), [paper](paper.pdf), [part](part.glb) and [gone](gone.parquet).") },
    { path: "runs.csv" }, { path: "paper.pdf" }, { path: "part.glb" },
  ]);
  expect(b.concepts.get("n")!.cites.map((c) => [c.target, c.kind, c.broken])).toEqual([
    ["runs.csv", "data", false], ["paper.pdf", "document", false], ["part.glb", "misc", false], ["gone.parquet", "data", true],
  ]);
  expect(b.issues.filter((i) => i.code === "broken-link").map((i) => i.message)).toEqual(["broken link to gone.parquet"]);
});

test("an artifact is not a note: it is not a concept, and is in no folder's listing", () => {
  const b = Bundle.fromFiles([{ path: "a/n.md", text: note("x") }, { path: "a/fig.html" }]);
  expect([...b.concepts.keys()]).toEqual(["a/n"]);
  expect(b.renderIndex("a")).not.toContain("fig");
});
