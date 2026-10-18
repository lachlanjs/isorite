import { expect, test } from "vitest";
import { parseSources } from "../plugin/sources.ts";

test("a sources block is read a line a source; other lines are passed over", () => {
  expect(parseSources("sources\n[1] dmft/the-dmft-loop § Mixing\n[2] /dmft/self-consistency-condition.md\n\nnot a source\n[3]   lattice-models/mott-transition §  The gap  ")).toEqual([
    { n: "1", note: "dmft/the-dmft-loop", section: "Mixing" },
    { n: "2", note: "dmft/self-consistency-condition" },
    { n: "3", note: "lattice-models/mott-transition", section: "The gap" },
  ]);
  expect(parseSources("")).toEqual([]);
});
