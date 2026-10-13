// The study base's files, and the two bases as one map for the Atlas.

import { describe, expect, test } from "vitest";
import { Bundle, StudyError, dumpStudyConfig, journalPath, mapModel, parseStudyConfig, reach, recordPath, sprout, testsOf, type MapDir } from "../src/index.ts";
import { gridLayout } from "../src/atlas/layout.js";

const note = (title: string, body = "") => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
const base = Bundle.fromFiles([
  { path: "basics", dir: true }, { path: "coding", dir: true },
  { path: "basics/entropy.md", text: note("Entropy") },
  { path: "basics/mutual-information.md", text: note("Mutual information", '[entropy](/basics/entropy.md "requires")') },
  { path: "coding/source-coding.md", text: note("Source coding", '[entropy](/basics/entropy.md "requires")') },
  { path: "overview.md", text: note("Overview", "[entropy](/basics/entropy.md)") },
]);
const study = Bundle.fromFiles([
  { path: "basics", dir: true },
  { path: "basics/entropy-of-a-coin.md", text: "---\ntype: Exercise\ntests: [basics/entropy, /basics/mutual-information.md]\n---\n\nQuestion.\n" },
  { path: "gone/old.md", text: "---\ntype: Exercise\ntests: basics/entropy\n---\n" },
]);

describe("isorite.toml", () => {
  test("written and read back", () => {
    const config = { format: 1, base: { path: "../information-theory", remote: "", root: "abc123" } };
    expect(parseStudyConfig(dumpStudyConfig(config))).toEqual(config);
  });
  test("needs the base's path, and a format it knows", () => {
    expect(() => parseStudyConfig("[base]\n")).toThrow(StudyError);
    expect(() => parseStudyConfig('format = 2\n[base]\npath = "x"\n')).toThrow(/format 2/);
    expect(() => parseStudyConfig("not toml [")).toThrow(StudyError);
  });
});

describe("paths", () => {
  test("a journal for each note, a record for each device", () => {
    expect(journalPath("basics/entropy")).toBe("journal/basics/entropy.jsonl");
    expect(journalPath("@study/basics/entropy-of-a-coin")).toBe("journal/@study/basics/entropy-of-a-coin.jsonl");
    expect(recordPath("laptop1")).toBe("record/laptop1.jsonl");
  });
  test("an id cannot climb out of the study base", () => {
    for (const bad of ["../x", "/etc/passwd", "a/../../b", "a//b", ""]) expect(() => journalPath(bad)).toThrow(StudyError);
  });
});

describe("the two bases as one map", () => {
  const model = mapModel(base, study);
  const names = (d: MapDir) => d.children.map((c) => c.ref);
  test("what a study note tests, in either spelling", () => {
    expect(testsOf(study.concepts.get("basics/entropy-of-a-coin")!.meta)).toEqual(["basics/entropy", "basics/mutual-information"]);
  });
  test("a study folder stands beside the folder it studies", () => {
    expect(names(model.root)).toEqual(["basics", "@study/basics", "coding", "overview", "@study"]);
    const beside = model.root.children[1] as MapDir;
    expect(beside).toMatchObject({ kind: "dir", study: true });
    expect(names(beside)).toEqual(["@study/basics/entropy-of-a-coin"]);
  });
  test("a study note whose folder the base no longer has falls to the nearest above", () => {
    expect(names(model.root.children.at(-1) as MapDir)).toEqual(["@study/gone/old"]);
  });
  test("each study note is joined to what it tests", () => {
    expect(model.edges).toContainEqual(["@study/basics/entropy-of-a-coin", "basics/entropy", 2]);
    expect(model.edges).toContainEqual(["basics/mutual-information", "basics/entropy", 3]);
  });
  test("without a study base, the knowledge base alone", () => {
    expect(names(mapModel(base).root)).toEqual(["basics", "coding", "overview"]);
  });
  test("the layout takes it as it is: study folders are folders, study notes are notes", () => {
    const layout = gridLayout(model, {});
    const byRef = new Map(layout.items.map((i) => [i.ref, i]));
    expect(byRef.get("@study/basics")).toMatchObject({ kind: "folder" });
    expect(byRef.get("@study/basics/entropy-of-a-coin")).toMatchObject({ kind: "note" });
    expect(layout.items.filter((i) => i.kind === "note")).toHaveLength(6);
    expect(layout.trunks.length).toBeGreaterThan(0);
  });
});

describe("what a note rests on", () => {
  const edges: [string, string, number][] = [
    ["c", "b", 3], ["b", "a", 3], ["a", "c", 3], // a cycle
    ["d", "c", 3], ["d", "a", 2], // "uses" does not count where links are rated
    ["e", "e", 3], ["@study/x", "d", 2], // a study note requires what it tests
  ];
  test("what it requires, all the way back, and what builds on it directly", () => {
    const r = reach({ edges }, "d");
    expect(r.requires).toEqual(["c", "b", "a"]);
    expect(r.builds).toEqual(["@study/x"]);
    expect(r.links).toContainEqual({ from: "a", to: "c", kind: "requires" });
    expect(r.links).not.toContainEqual({ from: "d", to: "a", kind: "requires" });
    expect(r.links).toContainEqual({ from: "@study/x", to: "d", kind: "builds" });
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
  test("a study note lights what it tests, and what that requires", () => {
    expect(reach({ edges }, "@study/x").requires).toEqual(["d", "c", "b", "a"]);
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

describe("the grown mark", () => {
  test("the same seed grows the same plant, and another seed another", () => {
    expect(sprout(3, 3)).toEqual(sprout(3, 3));
    expect(sprout(3, 3).d).not.toBe(sprout(4, 3).d);
  });
  test("it grows with depth, from a bare shoot", () => {
    expect(sprout(1, 0).d).toBe("M0 0L0 -1");
    expect(sprout(1, 2).d.length).toBeGreaterThan(sprout(1, 1).d.length);
    expect(sprout(1, 2).viewBox.split(" ")).toHaveLength(4);
  });
});
