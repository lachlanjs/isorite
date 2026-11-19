// The app's lens helpers: an island's path of names, a lens's file name from a title, rules from one plain field, and how
// a note is taken out of an island.

import { describe, expect, it } from "vitest";
import { parseLens, resolveLens } from "@isorite/core";
import { homeOf, islandRows, lensName, parseRules, rulesText, takeOut } from "./lenses.ts";

const lens = resolveLens(parseLens("t", `[[islands]]\nname = "Combat"\nnotes = ["/a/one.md"]\nmatch = ["path:/b/**"]\n[[islands.islands]]\nname = "Weapons"\ntitle = "The weapons"\nnotes = ["/a/two.md"]\n`), [
  { id: "a/one", kind: "note", tags: [], links: [] }, { id: "a/two", kind: "note", tags: [], links: [] }, { id: "b/three", kind: "note", tags: [], links: [] },
]);

describe("lenses", () => {
  it("names each island by its path, nested as the file nests it", () => {
    expect(islandRows(lens).map((r) => [r.path, r.title, r.depth])).toEqual([["Combat", "Combat", 0], ["Combat > Weapons", "The weapons", 1]]);
    expect(homeOf(lens, "a/two")?.path).toBe("Combat > Weapons");
    expect(homeOf(lens, "nowhere")).toBeNull();
  });
  it("names a lens's file from its title", () => {
    expect(lensName("By kind")).toBe("by-kind");
    expect(lensName("  Été 2026! ")).toBe("ete-2026");
  });
  it("reads rules from one field, by commas or before the next rule", () => {
    expect(parseRules("kind:question tag:combat, path:/a b/**")).toEqual(["kind:question", "tag:combat", "path:/a b/**"]);
    expect(parseRules(rulesText(["path:/a/**", "-tag:old"]))).toEqual(["path:/a/**", "-tag:old"]);
    expect(parseRules("  ")).toEqual([]);
  });
  it("takes a listed note off the list, and one a rule holds by a rule that leaves it out", () => {
    const combat = islandRows(lens)[0]!.island;
    expect(takeOut(combat, "a/one", true)).toEqual({ notes: ["a/one"], match: [] });
    expect(takeOut(combat, "b/three", true)).toEqual({ notes: [], match: ["-path:/b/three.md"] });
    expect(takeOut(combat, "b/pic.png", false)).toEqual({ notes: [], match: ["-path:/b/pic.png"] });
  });
});
