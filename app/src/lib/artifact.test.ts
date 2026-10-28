// The artifact host's paths (M23): what an artifact names, relative to it, and links to files followed.
import { expect, test } from "vitest";
import { within } from "./artifact.ts";
import { fileOf, noteOf } from "./editor/noteOf.ts";

test("a file an artifact names is found beside it, and never out of the notes", () => {
  expect(within("simulation/run.html", "orbits.csv")).toBe("simulation/orbits.csv");
  expect(within("simulation/run.html", "./data/a.csv")).toBe("simulation/data/a.csv");
  expect(within("simulation/run.html", "../physics/b.csv")).toBe("physics/b.csv");
  expect(within("run.html", "../b.csv")).toBeNull();
});

test("a link followed: a note by its id, a file of the notes by its path (M23)", () => {
  expect([noteOf("/a/b.md"), fileOf("/a/b.md")]).toEqual(["a/b", null]);
  expect([noteOf("/a/fig.html"), fileOf("/a/fig.html#x")]).toEqual([null, "a/fig.html"]);
  expect([fileOf("/a/run%20one.csv"), fileOf("https://x.org/a.html"), fileOf("//x.org/a.html"), fileOf("/a/notes")]).toEqual(["a/run one.csv", null, null, null]);
});

test("an artifact a note shows is found by its address, beside the note or from the top (M23)", async () => {
  const { artifactOf } = await import("./artifact.ts");
  expect([artifactOf("/sim/run.html", "a/n"), artifactOf("run.html", "sim/n"), artifactOf("../x/f.htm#a", "sim/n"), artifactOf("p.png", "a/n"), artifactOf("https://x.org/a.html", "a/n")])
    .toEqual(["sim/run.html", "sim/run.html", "x/f.htm", null, null]);
});
