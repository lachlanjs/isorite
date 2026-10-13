// The Atlas's arithmetic over a real layout of a small map.

import { describe, expect, test } from "vitest";
import { gridLayout } from "@isorite/core/atlas";
import type { MapModel } from "@isorite/core";
import { CELL, fit, indexLayout, linePath, litRoutes, openAt, restRoutes, shownAs, zoomAbout } from "./geometry.ts";

const note = (ref: string) => ({ kind: "concept" as const, id: "c:" + ref, ref, weight: 1, rank: 0 });
const dir = (ref: string, children: MapModel["root"]["children"]) => ({ kind: "dir" as const, id: "d:" + ref, ref, children });
const model: MapModel = {
  root: dir("", [dir("basics", [note("basics/a"), note("basics/b")]), dir("coding", [note("coding/c"), note("coding/d"), dir("coding/deep", [note("coding/deep/e")])])]),
  edges: [["basics/b", "basics/a", 3], ["coding/c", "basics/b", 3], ["coding/d", "coding/c", 3], ["coding/deep/e", "coding/d", 3]],
};
const L = gridLayout(model, { gridFlow: "right" }), idx = indexLayout(L);
const at = (ref: string) => L.items.findIndex((n) => n.ref === ref);

describe("what is open at a zoom", () => {
  test("zoomed far out, every top folder is one closed block and nothing in it is shown", () => {
    const open = openAt(L, 0.05);
    expect(open[at("basics")]).toBe("s");
    expect(open[at("basics/a")]).toBe("-");
    expect(shownAs(idx, open, at("coding/deep/e"))).toBe(at("coding"));
  });
  test("at zoom 1 the folders are open and their notes shown", () => {
    const open = openAt(L, 1);
    expect([...open].every((c) => c !== "-")).toBe(true);
    expect(open[at("coding/deep")]).toBe("o");
    expect(shownAs(idx, open, at("coding/deep/e"))).toBe(at("coding/deep/e"));
  });
  test("a folder knows how many notes it holds, however deep", () => {
    expect(idx.noteCount[at("coding")]).toBe(3);
    expect(idx.noteCount[at("basics")]).toBe(2);
  });
});

describe("routes", () => {
  test("at rest, closed: only the trunk between the two folders", () => {
    const rest = restRoutes(L, openAt(L, 0.05));
    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatchObject({ feed: false, study: false, count: 1 });
  });
  test("at rest, open: a route for each link drawn inside a folder as well", () => {
    expect(restRoutes(L, openAt(L, 1)).filter((r) => !r.feed).length).toBeGreaterThanOrEqual(4);
  });
  test("a lit link inside a folder takes the layout's own way, from what is required", () => {
    const { fixed, asks } = litRoutes(L, idx, openAt(L, 1), [{ a: at("basics/b"), b: at("basics/a"), kind: "requires" }]);
    expect(asks).toEqual([]);
    expect(fixed).toHaveLength(1);
    const A = L.items[at("basics/a")]!, first = fixed[0]!.pts[0]!;
    expect(first[0]).toBeGreaterThanOrEqual(A.gx);
    expect(first[0]).toBeLessThanOrEqual(A.gx + A.w);
  });
  test("a lit link between folders is found or asked for, and one inside a closed folder is not drawn", () => {
    const open = openAt(L, 1), link = { a: at("coding/c"), b: at("basics/b"), kind: "requires" as const };
    const { fixed, asks } = litRoutes(L, idx, open, [link, link]);
    expect(fixed.length + asks.length).toBe(1);
    const closed = litRoutes(L, idx, openAt(L, 0.05), [{ a: at("basics/b"), b: at("basics/a"), kind: "requires" }]);
    expect(closed).toEqual({ fixed: [], asks: [] });
  });
  test("a path is in pixels at zoom 1, corners cut", () => {
    expect(linePath([[0, 0], [10, 0]])).toBe(`M0 0L${10 * CELL} 0`);
    expect(linePath([[0, 0], [10, 0], [10, 10]])).toMatch(/^M0 0L\d+(\.\d)? 0L70 \d+(\.\d)?L70 70$/);
  });
});

describe("the view", () => {
  test("framing a block centres it, no closer than asked", () => {
    const v = fit({ gx: 10, gy: 10, w: 20, h: 10 }, 1000, 800, 1);
    expect(v.k).toBe(1);
    expect(v.x + v.k * 20 * CELL).toBe(500);
    expect(fit({ gx: 0, gy: 0, w: 1000, h: 10 }, 1000, 800).k).toBeLessThan(0.2);
  });
  test("zooming about a point leaves it where it is", () => {
    const v = { x: 30, y: -20, k: 0.5 }, z = zoomAbout(v, 2, 400, 300);
    expect(z.k).toBe(1);
    expect((400 - z.x) / z.k).toBeCloseTo((400 - v.x) / v.k);
    expect(zoomAbout(v, 1e6, 0, 0).k).toBe(3);
  });
});
