// Code and other files in the base (docs/files.md): their kind, what is ignored, and where they sit on the map.

import { expect, test } from "vitest";
import { Bundle, citeKind, fileType, ignoredBy, isFileRef, mapModel, skippedName, type MapDir } from "../src/index.ts";

const note = (title: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\nBody.\n`;

test("source and configuration are code; a file of no known kind is still misc", () => {
  for (const p of ["src/sim.py", "a/b.ts", "x/Main.RS", "svelte.config.js", "ci/build.yml", "run.sh"]) expect([p, citeKind(p)]).toEqual([p, "code"]);
  expect(citeKind("data/runs.csv")).toBe("data");
  expect(citeKind("blob.xyz")).toBe("misc");
  expect(citeKind("Makefile")).toBeNull();
  expect(fileType("src/sim.py")).toBe("text/plain");
  expect(fileType("blob.xyz")).toBe("application/octet-stream");
});

test("dotfiles and dependency folders are skipped; a file called node_modules is a file", () => {
  expect(skippedName(".git", true)).toBe(true);
  expect(skippedName("node_modules", true)).toBe(true);
  expect(skippedName("node_modules", false)).toBe(false);
  expect(skippedName("src", true)).toBe(false);
});

test("a .gitignore's simple patterns, from the base's root", () => {
  const ignored = ignoredBy("# build\n*.log\nout/\n/scratch\nsecrets.txt\n!keep.log\nsrc/**/gen\n\n");
  const yes: [string, boolean][] = [["a.log", false], ["deep/er/a.log", false], ["out", true], ["out/x.py", false], ["scratch/x.py", false], ["docs/secrets.txt", false]];
  for (const [p, dir] of yes) expect([p, ignored(p, dir)]).toEqual([p, true]);
  const no: [string, boolean][] = [["keep.log.md", false], ["notes/scratch/x.py", false], ["src/out.py", false], ["out", false], ["src/a/gen", true]];
  for (const [p, dir] of no) expect([p, ignored(p, dir)]).toEqual([p, false]);
  expect(ignoredBy("")("anything", false)).toBe(false);
});

test("a code file is an item in its folder, joined to the notes that link to it, with no links of its own", () => {
  const base = Bundle.fromFiles([
    { path: "sim", dir: true },
    { path: "sim/step.md", text: note("Step") + "\n[the loop](/sim/step.py)\n" },
    { path: "sim/step.py" },
    { path: "sim/helpers.py" },
    { path: "tools/build.sh" },
  ]);
  const model = mapModel(base);
  const dirs = (d: MapDir): MapDir[] => [d, ...d.children.flatMap((c) => (c.kind === "dir" ? dirs(c) : []))];
  const where = Object.fromEntries(dirs(model.root).flatMap((d) => d.children.flatMap((c) => (c.kind === "concept" ? [[c.ref, [d.ref, c.of]]] : []))));
  expect(where).toMatchObject({ "sim/step": ["sim", undefined], "sim/step.py": ["sim", "code"], "sim/helpers.py": ["sim", "code"], "tools/build.sh": ["tools", "code"] });
  expect(model.edges).toContainEqual(["sim/step", "sim/step.py", expect.any(Number)]);
  expect(model.edges.filter(([a]) => a.endsWith(".py"))).toEqual([]);
  expect(isFileRef("sim/step.py")).toBe(true);
});

test("a base of thousands of files maps without searching them all for each", () => {
  const files = Array.from({ length: 6000 }, (_, i) => ({ path: `d${i % 300}/f${i}.${i % 2 ? "png" : "py"}` }));
  const t = performance.now();
  const model = mapModel(Bundle.fromFiles(files));
  expect(model.root.children.length).toBeGreaterThan(0);
  expect(performance.now() - t).toBeLessThan(5000);
});
