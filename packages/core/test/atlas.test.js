// The grid Atlas's layout, cells and routes (T62, T64) on generated folder trees.
import { describe, expect, it } from "vitest";
import { gridLayout, gridRouter } from "../src/atlas/layout.js";
import { buildCells, reachedCells, maskPaths, NOTE, KEEP } from "../src/atlas/cells.js";
import { plainModel, feeders, HIGHWAY_COSTS } from "../src/atlas/layout.js";
import { greedyOrder, NOTE_W, NOTE_H } from "../src/atlas/nested.js";
import { floorplan } from "../src/atlas/floorplan.js";

const GAP = 2; // clear cells between siblings, at least

// A tree of `folders` top-level folders, every third with a subfolder, and
// links mostly inside a folder or to its neighbours; the same for the same
// arguments.
function model(folders, perFolder) {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const refs = [];
  const note = (ref, rank) => { refs.push(ref); return { kind: "concept", id: "c:" + ref, ref, weight: 1 + rand(), rank }; };
  const dir = (ref, children) => ({ kind: "dir", id: "d:" + ref, ref, children });
  const tops = [];
  for (let f = 0; f < folders; f++) {
    const kids = [];
    for (let i = 0; i < perFolder; i++) kids.push(note(`f${f}/n${i}`, i % 5));
    if (f % 3 === 0) kids.unshift(dir(`f${f}/sub`, [0, 1, 2, 3].map((i) => note(`f${f}/sub/n${i}`, i))));
    tops.push(dir(`f${f}`, kids));
  }
  const edges = [], seen = new Set();
  for (let i = 0; i < refs.length * 1.6; i++) {
    const a = refs[Math.floor(rand() * refs.length)];
    const near = refs.filter((r) => r !== a && r.split("/")[0] === a.split("/")[0]);
    // Three links in four stay in the folder; most of the rest go to a folder close by in the list.
    const f = Number(a.split("/")[0].slice(1)), close = (r) => { const g = Number(r.split("/")[0].slice(1)); return g !== f && Math.abs(g - f) <= 2; };
    const far = rand() < 0.85 ? refs.filter((r) => r !== "loose" && a !== "loose" && close(r)) : refs;
    const b = rand() < 0.75 && near.length ? near[Math.floor(rand() * near.length)] : (far.length ? far : refs)[Math.floor(rand() * (far.length || refs.length))];
    if (a === b || seen.has(a + ">" + b)) continue;
    seen.add(a + ">" + b);
    edges.push([a, b, rand() < 0.2 ? 1 : rand() < 0.5 ? 2 : 3]);
  }
  return { root: dir("", [...tops, note("loose", 0)]), edges };
}

const overlap = (a, b, gap = 0) => a.gx < b.gx + b.w + gap && b.gx < a.gx + a.w + gap && a.gy < b.gy + b.h + gap && b.gy < a.gy + a.h + gap;
const inside = (n, f) => n.gx >= f.gx && n.gy >= f.gy && n.gx + n.w <= f.gx + f.w && n.gy + n.h <= f.gy + f.h;

describe("the layout", () => {
  for (const flow of ["up", "right"]) {
    const L = gridLayout(model(6, 9), { gridFlow: flow }), C = buildCells(L);
    it(`flowing ${flow}: every block inside its folder under the title, siblings clear, parents first`, () => {
      expect(L.flow).toBe(flow);
      expect(L.items.filter((n) => n.kind === "note")).toHaveLength(6 * 9 + 2 * 4 + 1);
      L.items.forEach((n, i) => {
        expect(n.parent).toBeLessThan(i);
        expect(n.gx >= 0 && n.gy >= 0 && n.gx + n.w <= L.W && n.gy + n.h <= L.H).toBe(true);
        if (n.kind === "note") expect([n.w, n.h]).toEqual([NOTE_W, NOTE_H]);
        if (n.parent >= 0) { expect(inside(n, L.items[n.parent])).toBe(true); expect(n.gy).toBeGreaterThan(L.items[n.parent].gy + 1); }
      });
      L.items.forEach((a, i) => L.items.forEach((b, j) => { if (j > i && a.parent === b.parent) expect(overlap(a, b, GAP)).toBe(false); }));
    });
    it(`flowing ${flow}: a trunk joins two items of one folder, and its path runs square or at 45 degrees from one's edge to the other's, through no block`, () => {
      const drawn = L.trunks.filter((t) => t.pts);
      expect(drawn.length).toBeGreaterThan(20);
      expect(L.trunks.filter((t) => !t.pts).every((t) => t.back || t.implied)).toBe(true);
      const onEdge = ([x, y], n) => (x >= n.gx && x <= n.gx + n.w && (y === n.gy || y === n.gy + n.h)) || (y >= n.gy && y <= n.gy + n.h && (x === n.gx || x === n.gx + n.w));
      for (const t of L.trunks) expect(L.items[t.a].parent).toBe(L.items[t.b].parent);
      for (const t of drawn) {
        const P = t.pts, a = L.items[t.a], b = L.items[t.b];
        expect(onEdge(P[0], b)).toBe(true);
        expect(onEdge(P[P.length - 1], a)).toBe(true);
        for (let k = 1; k < P.length; k++) {
          const dx = P[k][0] - P[k - 1][0], dy = P[k][1] - P[k - 1][1];
          if (dx && dy) { // a slant: at 45 degrees, and every cell it passes is free
            expect(Math.abs(dx)).toBe(Math.abs(dy));
            const n = Math.abs(dx) * 4;
            for (let s = 1; s < n; s++) {
              const c = Math.floor(P[k - 1][1] + (dy * s) / n) * C.W + Math.floor(P[k - 1][0] + (dx * s) / n);
              expect(C.noteAt[c]).toBe(-1);
              expect(C.owner[c]).toBe(a.parent);
            }
            continue;
          }
          // the cells a run passes, its ends apart, hold no note and belong to the trunk's folder alone
          const [x0, x1] = [Math.min(P[k][0], P[k - 1][0]), Math.max(P[k][0], P[k - 1][0])], [y0, y1] = [Math.min(P[k][1], P[k - 1][1]), Math.max(P[k][1], P[k - 1][1])];
          for (let y = Math.floor(y0 + 0.5); y <= Math.ceil(y1 - 0.5) - (y1 > y0 ? 0 : 0) && y < y1 + 0.01; y++) for (let x = Math.floor(x0 + 0.5); x < x1 + 0.01; x++) {
            if (y1 === y0 && (x < Math.ceil(x0) || x >= Math.floor(x1))) continue;
            if (x1 === x0 && (y < Math.ceil(y0) || y >= Math.floor(y1))) continue;
            const cx = x1 === x0 ? Math.floor(x0) : x, cy = y1 === y0 ? Math.floor(y0) : y;
            expect(C.noteAt[cy * C.W + cx]).toBe(-1);
            expect(C.owner[cy * C.W + cx]).toBe(a.parent);
          }
        }
      }
    });
    it(`flowing ${flow}: what a trunk requires comes earlier along the flow, turning at each level`, () => {
      for (const t of L.trunks.filter((x) => !x.back)) {
        const a = L.items[t.a], b = L.items[t.b], along = (a.depth % 2 === 1) === (flow === "up") ? "up" : "right";
        if (along === "up") expect(b.gy).toBeGreaterThanOrEqual(a.gy + a.h);
        else expect(b.gx + b.w).toBeLessThanOrEqual(a.gx);
      }
    });
  }
  it("gives each link the lowest folder that holds both ends, and marks those that run against the layout", () => {
    const L = gridLayout(model(6, 9), {});
    const up = (i) => { const out = []; for (let p = L.items[i].parent; p >= 0; p = L.items[p].parent) out.push(p); return out; };
    expect(L.links.length).toBeGreaterThan(50);
    for (const l of L.links) { const A = up(l.a), B = up(l.b); expect(l.level).toBe(A.find((p) => B.includes(p)) ?? -1); if (l.s < 2) expect(l.placed).toBe(false); }
    const back = L.trunks.filter((t) => t.back);
    expect(L.links.filter((l) => l.s >= 2 && !l.placed).length).toBe(back.reduce((t, b) => t + b.count, 0));
  });
  it("orders a cycle so that only its lightest link runs back", () => {
    const pos = greedyOrder(3, [[0, 1, 3], [1, 2, 3], [2, 0, 2]]);
    expect([pos[0] < pos[1], pos[1] < pos[2], pos[2] < pos[0]]).toEqual([true, true, false]);
    expect(greedyOrder(3, [])).toEqual([0, 1, 2]);
  });
  it("is the same for the same bundle, wider than tall flowing right and the other way flowing up", () => {
    expect(gridLayout(model(6, 9), {})).toEqual(gridLayout(model(6, 9), { gridFlow: "up" }));
    const big = model(40, 28), t = performance.now(), U = gridLayout(big, {}), R = gridLayout(big, { gridFlow: "right" });
    console.log(`layout at 1177 notes: up ${U.W} by ${U.H}, right ${R.W} by ${R.H} cells, ${(performance.now() - t).toFixed(0)} ms for both`);
    // A guard against a layout gone badly wrong, not a measure: about 11 s on a desktop, 23 s on GitHub's runner.
    expect(performance.now() - t).toBeLessThan(60000);
  }, 90000);
});

describe("a changed base (V5)", () => {
  // The share of pairs of top-level folders standing the same way round (left of or above each other) in both.
  const kept = (A, B) => {
    const tops = (L) => new Map(L.items.filter((n) => n.parent === -1 && n.kind === "folder").map((n) => [n.ref, n]));
    const a = tops(A), b = tops(B), refs = [...a.keys()].filter((r) => b.has(r));
    const way = (m, p, q) => [Math.sign(m.get(p).gx - m.get(q).gx), Math.sign(m.get(p).gy - m.get(q).gy)].join();
    let same = 0, all = 0;
    for (const p of refs) for (const q of refs) if (p < q) { all++; if (way(a, p, q) === way(b, p, q)) same++; }
    return same / all;
  };
  it("starts from where things stood: a note added keeps the folders as they were, and costs the layout little", () => {
    const before = model(9, 6), was = gridLayout(before, { blocks: true });
    const after = structuredClone(before), f4 = after.root.children.find((c) => c.ref === "f4");
    f4.children.push({ kind: "concept", id: "c:f4/new", ref: "f4/new", weight: 1, rank: 0 });
    after.edges.push(["f4/n1", "f4/new", 2], ["f5/n2", "f4/new", 1]);
    const fresh = gridLayout(after, { blocks: true }), warm = gridLayout(after, { blocks: true, from: was.orders });
    console.log(`folders kept the same way round: ${kept(was, warm).toFixed(2)} from the layout before, ${kept(was, fresh).toFixed(2)} afresh; area ${warm.W * warm.H} against ${fresh.W * fresh.H}`);
    expect(kept(was, warm)).toBeGreaterThanOrEqual(0.9);
    expect(kept(was, warm)).toBeGreaterThanOrEqual(kept(was, fresh));
    expect(warm.W * warm.H).toBeLessThanOrEqual(fresh.W * fresh.H * 1.25);
    expect(warm.items.some((n) => n.ref === "f4/new")).toBe(true);
  });
  it("is the same as before when nothing changed", () => {
    const m = model(6, 5), was = gridLayout(m, { blocks: true });
    expect(kept(was, gridLayout(m, { blocks: true, from: was.orders }))).toBe(1);
  });
});

describe("the cells", () => {
  const L = gridLayout(model(6, 9), {}), C = buildCells(L);
  it("know their height, their folder and what blocks them", () => {
    L.items.forEach((n, i) => {
      const c = n.gy * C.W + n.gx;
      if (n.kind === "note") {
        expect(C.blocked[c]).toBe(NOTE);
        expect(C.noteAt[c]).toBe(i);
        expect(C.owner[c]).toBe(n.parent);
        expect(C.elev[c]).toBe(n.depth - 1);
      } else {
        expect(C.blocked[c]).toBe(0); // a folder's title is on its edge: no cell is closed for it
        expect(C.elev[c]).toBe(n.depth);
        expect(C.owner[c]).toBe(i);
      }
    });
    expect(C.elev[0]).toBe(0);
  });
  it("mark reached ground around reached notes, inside folders only", () => {
    const first = L.items.findIndex((n) => n.kind === "note" && n.parent >= 0);
    const mask = reachedCells(L, C, (i) => i === first), n = L.items[first];
    expect(mask[(n.gy - 1) * C.W + n.gx - 1]).toBe(1);
    expect(mask.reduce((t, v) => t + v, 0)).toBe((n.w + 2) * (n.h + 2));
    const { area, edge } = maskPaths(mask, C.W, C.H);
    expect(area.split("M").length - 1).toBe(n.h + 2);
    expect(edge.split("M").length - 1).toBe(4);
  });
});

// The router draws what the layout leaves to it: back trunks, and the links lit under the pointer, note to note.
describe("the routes", () => {
  const L = gridLayout(model(6, 9), {}), C = buildCells(L);
  const asks = L.links.filter((l) => l.s >= 2).map(({ a, b }) => ({ a, b }));
  const { routes, measures } = gridRouter(L)(asks);
  const onEdge = ([x, y], n) => (x >= n.gx && x <= n.gx + n.w && (y === n.gy || y === n.gy + n.h)) || (y >= n.gy && y <= n.gy + n.h && (x === n.gx || x === n.gx + n.w));
  it("find a way for every link, note to note, through folder walls", () => {
    expect(measures.lost).toBe(0);
    expect(routes.every(Boolean)).toBe(true);
    expect(L.links.some((l) => l.s >= 2 && L.items[l.a].parent !== L.items[l.b].parent)).toBe(true);
  });
  it("end on the edges of the blocks they join", () => {
    routes.forEach((r, i) => {
      expect(onEdge(r.pts[0], L.items[asks[i].a])).toBe(true);
      expect(onEdge(r.pts[r.pts.length - 1], L.items[asks[i].b])).toBe(true);
    });
  });
  it("never enter a note, and move one cell at a time", () => {
    for (const r of routes) {
      const mid = r.pts.slice(1, -1);
      for (const [x, y] of mid) expect(C.blocked[Math.floor(y) * C.W + Math.floor(x)]).toBe(0);
      for (let k = 1; k < mid.length; k++) expect(Math.max(Math.abs(mid[k][0] - mid[k - 1][0]), Math.abs(mid[k][1] - mid[k - 1][1]))).toBe(1);
    }
  });
  it("are the same for the same layout, and the router can be asked again", () => {
    const run = gridRouter(L), again = run(asks);
    expect(again.routes).toEqual(routes);
    expect(run(asks).measures).toEqual(measures);
  });
  it("join folders as well as notes, and are measured", () => {
    const tops = L.items.map((n, i) => (n.kind === "folder" && n.depth === 1 ? i : -1)).filter((i) => i >= 0);
    const trunks = gridRouter(L)([{ a: tops[0], b: tops[1] }, { a: tops[2], b: tops[5] }]);
    expect(trunks.measures.lost).toBe(0);
    expect(onEdge(trunks.routes[0].pts[0], L.items[tops[0]])).toBe(true);
    expect(measures.routes).toBe(asks.length);
    expect(measures.beside).toBeGreaterThan(0);
    expect(measures.beside).toBeLessThanOrEqual(1);
  });
  it("take a few milliseconds each at a thousand notes", () => {
    const big = gridLayout(model(40, 28), {});
    const some = big.links.filter((l) => l.s >= 2 && big.items[l.a].parent !== big.items[l.b].parent).slice(0, 40).map(({ a, b }) => ({ a, b }));
    const t = performance.now(), out = gridRouter(big)(some), ms = performance.now() - t;
    console.log(`router at 1177 notes, ${big.W} by ${big.H} cells: ${some.length} links between folders in ${ms.toFixed(0)} ms`);
    expect(out.measures.lost).toBe(0);
    // As with the layout, a guard, not a measure: about 27 s on a desktop, 55 s on GitHub's runner.
    expect(ms).toBeLessThan(150000);
  }, 200000);
});

describe("room for routes (T71)", () => {
  for (const flow of ["up", "right"]) {
    const L = gridLayout(model(6, 9), { gridFlow: flow });
    it(`flowing ${flow}: siblings stand 6 cells apart, and a trunk keeps ${KEEP} clear of every note it passes`, () => {
      L.items.forEach((a, i) => L.items.forEach((b, j) => { if (j > i && a.parent === b.parent) expect(overlap(a, b, 5)).toBe(false); }));
      const notes = L.items.map((n, i) => i).filter((i) => L.items[i].kind === "note");
      const inside = (i, f) => { for (let p = i; p >= 0; p = L.items[p].parent) if (p === f) return true; return false; };
      let near = 0, run = 0;
      for (const t of L.trunks.filter((t) => t.pts)) {
        for (let k = 1; k < t.pts.length; k++) {
          const [x0, y0] = t.pts[k - 1], [x1, y1] = t.pts[k], steps = Math.max(1, Math.round(Math.abs(x1 - x0) + Math.abs(y1 - y0)));
          for (let s = 0; s <= steps; s++) {
            const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
            run++;
            for (const i of notes) {
              if (inside(i, t.a) || inside(i, t.b)) continue; // its own ends, and what is in them
              const n = L.items[i], dx = Math.max(n.gx - x, x - (n.gx + n.w), 0), dy = Math.max(n.gy - y, y - (n.gy + n.h), 0);
              if (Math.max(dx, dy) < KEEP - 0.5) near++;
            }
          }
        }
      }
      expect(run).toBeGreaterThan(200);
      expect(near).toBe(0);
    });
  }
});

describe("the folderless view (T71)", () => {
  const m = model(6, 9), flat = plainModel(m, true), L = gridLayout(flat, { gridFlow: "up" });
  it("every note is an item of one layout, with no folders, none overlapping", () => {
    expect(L.items.every((n) => n.kind === "note" && n.parent === -1)).toBe(true);
    expect(L.items).toHaveLength(6 * 9 + 2 * 4 + 1);
    L.items.forEach((a, i) => L.items.forEach((b, j) => { if (j > i) expect(overlap(a, b, 5)).toBe(false); }));
  });
  it("links that fit the order are drawn as trunks, and each of the rest is a back trunk or implied by a longer way", () => {
    const strong = m.edges.filter(([, , s]) => s >= 2).length;
    expect(L.trunks.filter((t) => t.pts).length).toBeGreaterThan(strong * 0.5);
    expect(L.trunks.filter((t) => !t.pts).every((t) => t.back || t.implied)).toBe(true);
    expect(L.trunks.filter((t) => t.back).length).toBeLessThan(strong * 0.2);
  });
});

describe("feeders (T72)", () => {
  for (const flow of ["up", "right"]) {
    const L = gridLayout(model(6, 9), { gridFlow: flow }), C = buildCells(L);
    const inside = (i, f) => { for (let p = L.items[i].parent; p >= 0; p = L.items[p].parent) if (p === f) return true; return false; };
    it(`flowing ${flow}: every drawn trunk that ends on a folder is fed from the items in it that hold its links, and the counts add up`, () => {
      expect(L.feeders.length).toBeGreaterThan(10);
      // Those from subfolders are drawn; those from notes are kept for tracing a link, and no subfolder's joins one.
      expect(L.feeders.some((f) => !f.leaf) && L.feeders.some((f) => f.leaf)).toBe(true);
      for (const f of L.feeders) { expect(f.leaf).toBe(L.items[f.item].kind === "note"); if (!f.leaf && f.via >= 0) expect(L.feeders[f.via].leaf).toBe(false); if (f.via >= 0) expect(L.feeders[f.via].folder).toBe(f.folder); }
      expect(feeders(L)).toEqual(L.feeders); // the same layout, the same feeders
      L.trunks.forEach((t, k) => {
        if (!t.pts) return;
        for (const end of [t.a, t.b]) {
          if (L.items[end].kind !== "folder") continue;
          const fed = L.feeders.filter((f) => f.trunk === k && f.folder === end);
          expect(fed.length).toBeGreaterThan(0);
          expect(fed.reduce((n, f) => n + f.count, 0)).toBe(t.count);
          for (const f of fed) expect(L.items[f.item].parent).toBe(end);
        }
      });
    });
    it(`flowing ${flow}: a feeder runs from its item's edge, inside its folder, through no note and no other folder, to the trunk's foot or a branch already going there`, () => {
      for (const f of L.feeders) {
        const F = L.items[f.folder], X = L.items[f.item], [x0, y0] = f.pts[0];
        expect(x0 >= X.gx && x0 <= X.gx + X.w && y0 >= X.gy && y0 <= X.gy + X.h).toBe(true);
        for (const [x, y] of f.pts) expect(x >= F.gx && x <= F.gx + F.w && y >= F.gy && y <= F.gy + F.h).toBe(true);
        for (const [x, y] of f.pts.slice(1, -1)) expect(C.blocked[Math.floor(y) * C.W + Math.floor(x)]).toBe(0);
        for (const [x, y] of f.pts.slice(1, -1)) expect(C.owner[Math.floor(y) * C.W + Math.floor(x)]).toBe(f.folder); // on its folder's own ground: through no other folder
      }
      // The first branch to each foot ends on the wall, at the trunk's end; the rest end there or on another branch.
      const first = new Map();
      for (const f of L.feeders) {
        const key = f.trunk + "|" + f.folder, t = L.trunks[f.trunk], foot = f.folder === t.a && inside(f.item, t.a) && L.items[f.item].parent === t.a ? t.pts[t.pts.length - 1] : t.pts[0];
        if (!first.has(key) && L.items[f.folder].parent === L.items[t.a].parent) { first.set(key, f); expect(f.pts[f.pts.length - 1]).toEqual(foot); }
      }
    });
  }
});

describe("highways", () => {
  // Every pair the trunks join has a way; each runs from b's wall to a's over their folder's floor, never through
  // a note or another folder, and its steps are along the grid's eight directions.
  for (const grain of ["fine", "coarse", "coarser"]) {
    it(`a way between every pair of linked neighbours, on the folder's floor (the ${grain} grid)`, () => {
      const L = gridLayout(model(8, 10), { gridFlow: "right", grain }), cells = buildCells(L), { W, owner, blocked } = cells;
      expect(L.highways.trunks).toHaveLength(L.trunks.length);
      for (const t of L.highways.trunks) {
        expect(t.pts).toBeDefined();
        const inner = t.pts.slice(1, -1), region = L.items[t.a].parent;
        for (const [x, y] of inner) {
          const c = Math.floor(y) * W + Math.floor(x);
          expect(blocked[c]).toBe(0);
          expect(owner[c]).toBe(region);
        }
        for (let k = 2; k < inner.length; k++) {
          const dx = inner[k][0] - inner[k - 1][0], dy = inner[k][1] - inner[k - 1][1];
          expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
        }
      }
    });
  }
  it("gathers the gates close together on one side of a folder into one", () => {
    const L = gridLayout(model(8, 10), { gridFlow: "right" }), near = HIGHWAY_COSTS.gather / L.cell, at = new Map();
    for (const h of L.highways.trunks) for (const [i, p] of [[h.b, h.pts[0]], [h.a, h.pts.at(-1)]]) {
      const F = L.items[i];
      if (F.kind !== "folder") continue;
      const across = Math.abs(p[1] - F.gy) < 1e-6 || Math.abs(p[1] - F.gy - F.h) < 1e-6, key = `${i}|${across ? p[1] : p[0]}`;
      at.set(key, new Set([...(at.get(key) || []), across ? p[0] : p[1]]));
    }
    for (const gates of at.values()) {
      const ts = [...gates].sort((p, q) => p - q);
      for (let k = 1; k < ts.length; k++) expect(ts[k] - ts[k - 1]).toBeGreaterThan(near);
    }
  });
  it("is straight between two notes that face each other, through the middle of what they share", () => {
    const m = { root: { kind: "dir", id: "d:", ref: "", children: [{ kind: "dir", id: "d:f", ref: "f", children: ["a", "b"].map((r) => ({ kind: "concept", id: "c:f/" + r, ref: "f/" + r, weight: 1, rank: 0 })) }] }, edges: [["f/b", "f/a", 3]] };
    const L = gridLayout(m, { gridFlow: "right" }), t = L.highways.trunks[0], A = L.items[t.a], B = L.items[t.b];
    const ys = new Set(t.pts.map(([, y]) => y)), xs = new Set(t.pts.map(([x]) => x));
    expect(ys.size === 1 || xs.size === 1).toBe(true);
    if (ys.size === 1) expect([...ys][0]).toBe(Math.floor((Math.max(A.gy, B.gy) + Math.min(A.gy + A.h, B.gy + B.h)) / 2 - 0.5 + 1e-9) + 0.5);
  });
  it("is fed from inside folders as the trunks are, over each folder's own floor, branches joining branches", () => {
    const L = gridLayout(model(8, 10), { gridFlow: "right" }), { W, owner, blocked } = buildCells(L), F = L.highways.feeders;
    expect(F.length).toBeGreaterThan(0);
    expect(F.some((f) => f.via >= 0)).toBe(true);
    for (const f of F) {
      expect(L.highways.trunks[f.trunk].pts).toBeDefined();
      expect(f.leaf).toBe(L.items[f.item].kind === "note");
      for (const [x, y] of f.pts.slice(1, -1)) { const c = Math.floor(y) * W + Math.floor(x); expect(blocked[c]).toBe(0); expect(owner[c]).toBe(f.folder); }
      if (f.via < 0) continue;
      // It ends on the branch it joins, in the same folder (to the same gate, perhaps for another highway through
      // it), and a subfolder's only on a subfolder's.
      const on = F[f.via];
      expect(on.folder).toBe(f.folder);
      if (!f.leaf) expect(on.leaf).toBe(false);
      expect(on.pts.some(([x, y]) => x === f.pts.at(-1)[0] && y === f.pts.at(-1)[1])).toBe(true);
    }
  });
});

describe("floorplan", () => {
  // Blocks never overlap, keep the room asked between them, and the same input is always placed the same way.
  it("places blocks apart, as asked, the same way each time", () => {
    const sizes = [[30, 20], [12, 40], [18, 5], [18, 5], [50, 30], [8, 8]], joins = [[0, 1, 3], [1, 4, 2], [2, 3, 1], [0, 4, 1], [5, 2, 1]];
    for (const way of ["right", "up"]) {
      const r = floorplan(sizes, joins, () => 6, way);
      for (let i = 0; i < sizes.length; i++) for (let j = i + 1; j < sizes.length; j++) {
        const apartX = r.x[j] >= r.x[i] + sizes[i][0] + 6 || r.x[i] >= r.x[j] + sizes[j][0] + 6;
        const apartY = r.y[j] >= r.y[i] + sizes[i][1] + 6 || r.y[i] >= r.y[j] + sizes[j][1] + 6;
        expect(apartX || apartY).toBe(true);
      }
      for (let i = 0; i < sizes.length; i++) { expect(r.x[i] + sizes[i][0]).toBeLessThanOrEqual(r.w); expect(r.y[i] + sizes[i][1]).toBeLessThanOrEqual(r.h); }
      expect(floorplan(sizes, joins, () => 6, way)).toEqual(r);
    }
  });
  it("puts what is required before what requires it, along the way", () => {
    const r = floorplan([[20, 20], [20, 20]], [[0, 1, 5]], () => 6, "right");
    expect(r.x[0]).toBeLessThan(r.x[1]);
  });
  it("lays out folders of folders as blocks, each inside its folder, with every highway found", () => {
    const L = gridLayout(model(8, 10), { gridFlow: "right", blocks: true });
    for (const n of L.items) {
      if (n.parent < 0) continue;
      const F = L.items[n.parent];
      expect(n.gx).toBeGreaterThanOrEqual(F.gx); expect(n.gy).toBeGreaterThan(F.gy);
      expect(n.gx + n.w).toBeLessThanOrEqual(F.gx + F.w); expect(n.gy + n.h).toBeLessThanOrEqual(F.gy + F.h);
    }
    expect(L.highways.trunks.every((t) => t.pts)).toBe(true);
  });
});
