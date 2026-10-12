// The core's link graph: edges by strength, pagerank, and implied links.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { impliedLinks, noteIds, pagerank, strengthEdges, type Edge } from "../src/index.ts";
import { loadBundle } from "../src/node.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const bundles = readdirSync(ROOT + "fixtures/bundles").sort();

describe.each(bundles)("%s", (name) => {
  const b = loadBundle(`${ROOT}fixtures/bundles/${name}`);
  const ids = noteIds(b);
  const edges = strengthEdges(b, ids);
  test("one edge for each pair of notes, between notes that exist", () => {
    const known = new Set(ids), pairs = edges.map(([a, c]) => a + "\n" + c);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const [a, c, s] of edges) {
      expect(known.has(a) && known.has(c) && a !== c).toBe(true);
      expect([1, 2, 3]).toContain(s);
    }
  });
  test("pagerank gives every note a share, and the shares sum to one", () => {
    const rank = pagerank(ids, edges);
    expect([...rank.keys()].sort()).toEqual([...ids].sort());
    if (ids.length) expect([...rank.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(1, 6);
  });
});

test("implied links skip see also and cycles", () => {
  const ids = ["a", "b", "c", "x", "y"];
  const edges: Edge[] = [["a", "b", 3], ["b", "c", 3], ["a", "c", 3], ["a", "x", 1], ["x", "c", 1], ["x", "y", 3], ["y", "x", 3]];
  expect([...impliedLinks(ids, edges)]).toEqual(["a\nc"]);
});
