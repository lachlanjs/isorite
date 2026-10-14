// The Atlas's arithmetic over a real layout of a small map.

import { describe, expect, test } from "vitest";
import { gridLayout } from "@isorite/core/atlas";
import type { MapModel } from "@isorite/core";
import { CELL, fit, indexLayout, linePath, litRoutes, mergeRoutes, openAt, restRoutes, shownAs, zoomAbout } from "./geometry.ts";

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
    expect(restRoutes(L, openAt(L, 1)).filter((r) => r.key.startsWith("t")).length).toBeGreaterThanOrEqual(4);
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
  test("a route that carries only weaker links is told apart, where the base rates any link as required", () => {
    const mixed: MapModel = { root: model.root, edges: [["basics/b", "basics/a", 3], ["coding/d", "coding/c", 2], ["coding/c", "basics/b", 2]] };
    const M = gridLayout(mixed, { gridFlow: "right" }), mi = indexLayout(M), of = (a: string, b: string) => mi.strong[mi.trunkAt.get(`${M.items.findIndex((n) => n.ref === a)}|${M.items.findIndex((n) => n.ref === b)}`)!];
    expect(of("basics/b", "basics/a")).toBe(true);
    expect(of("coding/d", "coding/c")).toBe(false);
    expect(of("coding", "basics")).toBe(false);
    expect(restRoutes(M, openAt(M, 1), mi.strong).filter((r) => !r.strong).length).toBeGreaterThanOrEqual(2);
    // With nothing rated "requires", every drawn link is the strongest there is.
    const plain = gridLayout({ root: model.root, edges: [["basics/b", "basics/a", 2]] }, { gridFlow: "right" });
    expect(indexLayout(plain).strong).toEqual([true]);
  });
  test("a path is in pixels at zoom 1, corners cut", () => {
    expect(linePath([[0, 0], [10, 0]])).toBe(`M0 0L${10 * CELL} 0`);
    expect(linePath([[0, 0], [10, 0], [10, 10]])).toMatch(/^M0 0L\d+(\.\d)? 0L70 \d+(\.\d)?L70 70$/);
    // A 45 degree turn stays sharp, so no run is drawn at 22.5 degrees.
    expect(linePath([[0, 0], [10, 0], [20, 10]])).toBe(`M0 0L${10 * CELL} 0L${20 * CELL} ${10 * CELL}`);
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

describe("routes merged where they overlap", () => {
  test("draws a shared stretch once, counted for each route, and parts where they part", () => {
    // Two routes share the run from (0, 0.5) to (4, 0.5), then one goes on and one turns down.
    const runs = mergeRoutes([{ pts: [[0, 0.5], [8, 0.5]] }, { pts: [[0, 0.5], [4, 0.5], [4, 4.5]], count: 2 }]);
    const by = (n: number) => runs.filter((r) => r.count === n);
    expect(by(3)).toHaveLength(1);
    expect(by(3)[0]!.pts.at(0)).toEqual([0, 0.5]);
    expect(by(3)[0]!.pts.at(-1)).toEqual([4, 0.5]);
    expect(by(1)).toHaveLength(1);
    expect(by(2)).toHaveLength(1);
  });
  test("keeps a lit run's way, and stills it where links of its kind run both ways", () => {
    const one = mergeRoutes([{ pts: [[4, 0.5], [0, 0.5]], kind: "requires" }], true);
    expect(one).toHaveLength(1);
    expect(one[0]!.pts[0]).toEqual([4, 0.5]);
    expect(one[0]!.flow).toBe(1);
    // A weaker link running back does not stop the dashes (Affine connection: a "uses" out along its "requires" in).
    const weaker = mergeRoutes([{ pts: [[4, 0.5], [0, 0.5]], kind: "requires" }, { pts: [[0, 0.5], [4, 0.5]], kind: "uses" }], true);
    expect(weaker).toHaveLength(1);
    expect(weaker[0]!).toMatchObject({ count: 2, kind: "requires", flow: 1 });
    expect(weaker[0]!.pts[0]).toEqual([4, 0.5]);
    const both = mergeRoutes([{ pts: [[4, 0.5], [0, 0.5]], kind: "requires" }, { pts: [[0, 0.5], [4, 0.5]], kind: "requires" }], true);
    expect(both[0]!).toMatchObject({ count: 2, kind: "requires", flow: 0 });
  });
});
