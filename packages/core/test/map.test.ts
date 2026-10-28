// The Atlas's model of a base, what a note rests on, and a format 1 study base's isorite.toml, read to move it.

import { describe, expect, test } from "vitest";
import { Bundle, StudyError, isFileRef, journalPath, mapModel, parseStudyConfig, reach, recordPath, type MapDir } from "../src/index.ts";
import { gridLayout } from "../src/atlas/layout.js";

const note = (title: string, body = "") => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
const base = Bundle.fromFiles([
  { path: "basics", dir: true }, { path: "coding", dir: true },
  { path: "basics/entropy.md", text: note("Entropy") },
  { path: "basics/mutual-information.md", text: note("Mutual information", '[entropy](/basics/entropy.md "requires")') },
  { path: "coding/source-coding.md", text: note("Source coding", '[entropy](/basics/entropy.md "requires")') },
  { path: "overview.md", text: note("Overview", "[entropy](/basics/entropy.md)") },
]);

describe("a format 1 study base's isorite.toml", () => {
  test("read", () => {
    expect(parseStudyConfig('format = 1\n[base]\npath = "../information-theory"\nroot = "abc123"\n')).toEqual({ format: 1, base: { path: "../information-theory", remote: "", root: "abc123" } });
  });
  test("needs the base's path, and a format it knows", () => {
    expect(() => parseStudyConfig("[base]\n")).toThrow(StudyError);
    expect(() => parseStudyConfig('format = 2\n[base]\npath = "x"\n')).toThrow(/format 2/);
    expect(() => parseStudyConfig("not toml [")).toThrow(StudyError);
  });
});

describe("paths in .isorite/", () => {
  test("a journal for each note, a record for each device", () => {
    expect(journalPath("basics/entropy")).toBe("journal/basics/entropy.jsonl");
    expect(journalPath("@draft/01k7")).toBe("journal/@draft/01k7.jsonl");
    expect(recordPath("laptop1")).toBe("record/laptop1.jsonl");
  });
  test("an id cannot climb out of the folder", () => {
    for (const bad of ["../x", "/etc/passwd", "a/../../b", "a//b", ""]) expect(() => journalPath(bad)).toThrow(/not a note's id/);
  });
});

describe("the map", () => {
  const model = mapModel(base);
  const names = (d: MapDir) => d.children.map((c) => c.ref);
  test("folders, then notes, each in order", () => {
    expect(names(model.root)).toEqual(["basics", "coding", "overview"]);
    expect(names(model.root.children[0] as MapDir)).toEqual(["basics/entropy", "basics/mutual-information"]);
  });
  test("each link once, with its strength", () => {
    expect(model.edges).toContainEqual(["basics/mutual-information", "basics/entropy", 3]);
    expect(model.edges).toContainEqual(["overview", "basics/entropy", 2]);
  });
  test("the layout takes it as it is", () => {
    const layout = gridLayout(model, {});
    expect(layout.items.filter((i) => i.kind === "note")).toHaveLength(4);
    expect(layout.trunks.length).toBeGreaterThan(0);
  });
});

describe("what a note rests on", () => {
  const edges: [string, string, number][] = [
    ["c", "b", 3], ["b", "a", 3], ["a", "c", 3], // a cycle
    ["d", "c", 3], ["d", "a", 2], // "uses" does not count where links are rated
    ["e", "e", 3], ["x", "d", 3],
  ];
  test("what it requires, all the way back, and what builds on it directly", () => {
    const r = reach({ edges }, "d");
    expect(r.requires).toEqual(["c", "b", "a"]);
    expect(r.builds).toEqual(["x"]);
    expect(r.links).toContainEqual({ from: "a", to: "c", kind: "requires" });
    expect(r.links).not.toContainEqual({ from: "d", to: "a", kind: "requires" });
    expect(r.links).toContainEqual({ from: "x", to: "d", kind: "builds" });
  });
  test("how far back each is, the way to it, and the weaker links of the note itself", () => {
    const r = reach({ edges: [...edges, ["f", "d", 2], ["d", "g", 1], ["b", "h", 2]] }, "d");
    expect(r.depth).toEqual({ c: 1, b: 2, a: 3 });
    expect(r.via).toEqual({ c: "d", b: "c", a: "b" });
    expect(r.uses).toEqual(["f"]); // d uses a too, which it also requires a longer way; b's own "uses" is not d's
    expect(r.also).toEqual(["g"]);
    expect(r.links).toContainEqual({ from: "f", to: "d", kind: "uses" });
    expect(r.links.filter((l) => l.kind === "uses")).toHaveLength(1);
  });
  test("a link a longer way already makes is spare, and never both of two that make each other", () => {
    const r = reach({ edges: [["x", "y", 3], ["y", "z", 3], ["x", "z", 3]] }, "x");
    expect(r.links).toEqual([{ from: "x", to: "y", kind: "requires" }, { from: "x", to: "z", kind: "requires", spare: true }, { from: "y", to: "z", kind: "requires" }]);
    const knot = reach({ edges: [["x", "y", 3], ["x", "z", 3], ["y", "z", 3], ["z", "y", 3]] }, "x");
    expect(knot.links.filter((l) => l.from === "x" && l.spare)).toHaveLength(1);
  });
  test("a note nothing joins, or that only names itself", () => {
    const nothing = { requires: [], depth: {}, via: {}, builds: [], uses: [], also: [], links: [] };
    expect(reach({ edges }, "e")).toEqual(nothing);
    expect(reach({ edges }, "nowhere")).toEqual(nothing);
  });
  test("where no link is rated, every link counts", () => {
    expect(reach({ edges: [["b", "a", 2], ["c", "b", 2]] }, "c").requires).toEqual(["b", "a"]);
  });
});

test("a folder holding only pictures is one item on the Atlas (M23, Q110), not a folder; an empty one is a folder (M22)", () => {
  const b = Bundle.fromFiles([
    { path: "combat", dir: true }, { path: "combat/hitboxes", dir: true }, { path: "art", dir: true }, { path: "art/sprites", dir: true }, { path: "later", dir: true },
    { path: "combat/hitboxes.md", text: note("Hitboxes", "![p](hitboxes/p.png)") }, { path: "combat/hitboxes/p.png" },
    { path: "art/sprites/player.png" },
  ]);
  const names = (d: MapDir): string[] => d.children.flatMap((c) => (c.kind === "dir" ? [c.ref, ...names(c)] : []));
  const m = mapModel(b);
  expect(names(m.root)).toEqual(["art", "combat", "later"]);
  const items = (d: MapDir): string[] => d.children.flatMap((c) => (c.kind === "dir" ? items(c) : [`${c.ref}${c.of ? ` ${c.of}` : ""}`]));
  expect(items(m.root)).toEqual(["art/sprites/ image", "combat/hitboxes", "combat/hitboxes/ image"]);
  // The note that shows a picture is joined to its folder's item.
  expect(m.edges).toContainEqual(["combat/hitboxes", "combat/hitboxes/", 2]);
});

test("every file of the notes is an item in its folder, joined to the notes that cite it (M23)", () => {
  const b = Bundle.fromFiles([
    { path: "sim/run.md", text: note("Run", "[the dashboard](dash.html) and [data](runs.csv)") }, { path: "sim/dash.html" }, { path: "sim/runs.csv" }, { path: "sim/paper.pdf" },
  ]);
  const m = mapModel(b), sim = m.root.children.find((c) => c.ref === "sim") as MapDir;
  expect(sim.children.map((c) => [c.ref, c.kind === "concept" ? c.of ?? "" : "dir"])).toEqual([["sim/run", ""], ["sim/dash.html", "artifact"], ["sim/paper.pdf", "document"], ["sim/runs.csv", "data"]]);
  expect(m.edges).toEqual([["sim/run", "sim/dash.html", 2], ["sim/run", "sim/runs.csv", 2]]);
  expect([isFileRef("sim/dash.html"), isFileRef("sim/run"), isFileRef("art/sprites/")]).toEqual([true, false, true]);
});
