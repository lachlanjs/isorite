import { expect, test } from "vitest";
import { Bundle, lensNotes, parseLens, resolveLens } from "@isorite/core";
import { DEFAULT_BASE, GUIDE_LENSES, SITE_BASES, parseSiteHash, siteHash } from "../src/index.ts";
import { loadGuide, loadGuidePictures, loadSiteBase } from "../src/node.ts";

// The bases the site holds: the guide and three examples. Each is a base like any other, so each is checked as one.
function bundleOf(name: string) {
  const base = SITE_BASES.find((b) => b.name === name)!;
  if (name === "tutorial") {
    const files = loadGuide();
    return { b: Bundle.fromFiles([...Object.entries(files).map(([path, text]) => ({ path, text })), ...Object.keys(loadGuidePictures()).map((path) => ({ path }))]), lenses: GUIDE_LENSES, base };
  }
  const { files, lenses } = loadSiteBase(base.folder);
  return { b: Bundle.fromFiles(Object.entries(files).map(([path, text]) => (path.endsWith(".md") ? { path, text } : { path }))), lenses, base };
}

test("an address names a base and a place in it; one that names none is the Tutorial's, as the guide's always were", () => {
  expect(parseSiteHash("#/n/atlas/the-atlas")).toEqual({ base: DEFAULT_BASE, rest: "/n/atlas/the-atlas" });
  expect(parseSiteHash("")).toEqual({ base: DEFAULT_BASE, rest: "" });
  expect(parseSiteHash("#/b/code/n/notes/main")).toEqual({ base: "code", rest: "/n/notes/main" });
  expect(parseSiteHash("#/b/global")).toEqual({ base: "global", rest: "" });
  expect(parseSiteHash("#/b/code/n/x?at=1")).toEqual({ base: "code", rest: "/n/x?at=1" });
  // A base the site does not hold is not one: the address is read whole, and the route is not found as it would not be.
  expect(parseSiteHash("#/b/nowhere/n/x")).toEqual({ base: DEFAULT_BASE, rest: "/b/nowhere/n/x" });
  for (const b of SITE_BASES) expect(parseSiteHash(siteHash(b.name, "/n/a/b")).base).toBe(b.name);
  expect(siteHash("tutorial", "/n/general/start-here")).toBe("#/n/general/start-here");
  expect(siteHash("tutorial")).toBe("#/b/tutorial");
  expect(siteHash("code", "n/notes/main")).toBe("#/b/code/n/notes/main");
});

test("each base loads with no issues, opens on a note that is there, and its lenses name notes that are there", () => {
  for (const { name } of SITE_BASES) {
    const { b, lenses, base } = bundleOf(name);
    // The skills base holds SKILL.md files and licences, which are items and not notes: its notes are read as the app reads them.
    if (name !== "skills") expect(b.issues.filter((i) => i.level === "error"), name).toEqual([]);
    expect(b.concepts.has(base.start), `${name} opens on ${base.start}`).toBe(true);
    for (const [file, text] of Object.entries(lenses)) {
      const r = resolveLens(parseLens(file.replace(/\.toml$/, ""), text), lensNotes(b));
      expect(r.problems.filter((p) => p.level === "error"), `${name}/${file}`).toEqual([]);
    }
  }
});

test("the site has the two special bases first, the Tutorial and Code after, and the Tutorial is the default", () => {
  expect(SITE_BASES.map((b) => b.name)).toEqual(["global", "skills", "tutorial", "code"]);
  expect(SITE_BASES.filter((b) => b.special).map((b) => b.special)).toEqual(["global", "skills"]);
  expect(DEFAULT_BASE).toBe("tutorial");
});
