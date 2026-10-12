// Measure the grid Atlas's layout (T117): how straight its trunks run, how often
// they bend and cross, how many columns the notes stand in, and how long it takes.
//
//     node bench/atlas_layout.mjs                       # the table, for every fixture
//     node bench/atlas_layout.mjs --save before         # and .bench/results/atlas-layout-before.json
//     node bench/atlas_layout.mjs --against bench/baselines/2026-10-11-t117-before.json
//     node bench/atlas_layout.mjs --snapshot            # rewrite the fixtures from built sites
//
// The fixtures are models kept in bench/fixtures/atlas (folders, notes and rated
// links, no text), so a run now and a run later lay out the same thing:
//   this-base   this repository's knowledge base, as it stood when snapshotted
//   nanosim     the dummy codebase's notes (bench/nanosim.py)
//   mockup      the 19 notes and 5 folders of the isorite brand canvas's Atlas board
//   synth-*     the generated trees the unit tests use
//
// Trunks the layout draws are measured as drawn. A back trunk the layout gives
// no path (all of them, before T117) is routed as the app routes it (router.js)
// and measured with the rest.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const GRID = join(REPO, "packages/core/src/atlas");
const { nestedLayout, NOTE_W, NOTE_H } = await import(join(GRID, "nested.js"));
const { buildCells } = await import(join(GRID, "cells.js"));
const { makeRouter, routeAll } = await import(join(GRID, "router.js"));
const FIXTURES = join(REPO, "bench/fixtures/atlas");

const RATING = { requires: 3, uses: 2, "see also": 1 };
const note = (ref) => ({ kind: "concept", id: "c:" + ref, ref, weight: 1, rank: 0 });
const dir = (ref, children) => ({ kind: "dir", id: "d:" + ref, ref, children });

// A built site's concepts and tree, as the map's plain model.
function fromSite(data) {
  const concepts = JSON.parse(readFileSync(join(data, "concepts.json"), "utf8")), tree = JSON.parse(readFileSync(join(data, "tree.json"), "utf8"));
  const known = new Set(concepts.map((c) => c.id)), strongest = new Map();
  for (const c of concepts) for (const l of c.links) {
    if (l.broken || l.kind !== "concept" || !known.has(l.target) || l.target === c.id) continue;
    const key = c.id + "\n" + l.target;
    strongest.set(key, Math.max(strongest.get(key) || 0, RATING[l.rel] || 2));
  }
  const make = (id) => dir(id, [...tree[id].children.filter((x) => tree[x]).map(make), ...tree[id].concepts.map(note)]);
  return { root: make(""), edges: [...strongest].map(([key, s]) => [...key.split("\n"), s]) };
}

// The generated tree of grid.test.js: every third folder has a subfolder, and three links in four stay in their folder.
function synth(folders, perFolder) {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const refs = [], add = (ref) => { refs.push(ref); return note(ref); }, tops = [];
  for (let f = 0; f < folders; f++) {
    const kids = [];
    for (let i = 0; i < perFolder; i++) kids.push(add(`f${f}/n${i}`));
    if (f % 3 === 0) kids.unshift(dir(`f${f}/sub`, [0, 1, 2, 3].map((i) => add(`f${f}/sub/n${i}`))));
    tops.push(dir(`f${f}`, kids));
  }
  const edges = [], seen = new Set();
  for (let i = 0; i < refs.length * 1.6; i++) {
    const a = refs[Math.floor(rand() * refs.length)], f = Number(a.split("/")[0].slice(1));
    const near = refs.filter((r) => r !== a && r.split("/")[0] === a.split("/")[0]);
    const close = (r) => { const g = Number(r.split("/")[0].slice(1)); return g !== f && Math.abs(g - f) <= 2; };
    const far = rand() < 0.85 ? refs.filter(close) : refs;
    const b = rand() < 0.75 && near.length ? near[Math.floor(rand() * near.length)] : (far.length ? far : refs)[Math.floor(rand() * (far.length || refs.length))];
    if (a === b || seen.has(a + ">" + b)) continue;
    seen.add(a + ">" + b);
    edges.push([a, b, rand() < 0.2 ? 1 : rand() < 0.5 ? 2 : 3]);
  }
  return { root: dir("", tops), edges };
}

// The Atlas board of the brand canvas: a link here is [what requires, what is required, rating].
function mockup() {
  const d = (name, notes, more = []) => dir(name, [...more, ...notes.map((n) => note(name + "/" + n))]);
  const root = dir("", [
    d("dynamics", ["forces", "softening", "leapfrog", "energy-drift", "timestep"]),
    d("methods", ["integrators", "tree-code", "mesh", "fft", "accuracy"]),
    d("design", ["architecture", "io-format", "tests"], [d("design/outputs", ["snapshots", "logs"])]),
    d("practice", ["exercise-1", "exercise-2", "review", "explain-back"]),
  ]);
  const R = 3, U = 2;
  const edges = [
    ["dynamics/softening", "dynamics/forces", R], ["dynamics/leapfrog", "dynamics/forces", R], ["dynamics/energy-drift", "dynamics/softening", R],
    ["dynamics/timestep", "dynamics/leapfrog", R], ["dynamics/timestep", "dynamics/energy-drift", R],
    ["methods/tree-code", "methods/integrators", R], ["methods/mesh", "methods/integrators", R], ["methods/fft", "methods/tree-code", R],
    ["methods/accuracy", "methods/mesh", R], ["methods/accuracy", "methods/fft", R], ["methods/integrators", "dynamics/softening", R],
    ["design/architecture", "dynamics/leapfrog", U], ["practice/exercise-1", "methods/integrators", U], ["design/outputs/snapshots", "design/architecture", U],
    ["design/io-format", "design/architecture", R], ["design/outputs/logs", "design/outputs/snapshots", R],
    ["practice/review", "practice/exercise-1", R], ["practice/exercise-2", "practice/exercise-1", R], ["practice/explain-back", "practice/exercise-2", R],
  ];
  return { root, edges };
}

function fixtures() {
  const kept = (name) => JSON.parse(readFileSync(join(FIXTURES, name + ".json"), "utf8"));
  return [["this-base", kept("this-base")], ["nanosim", kept("nanosim")], ["mockup", mockup()], ["synth-6x9", synth(6, 9)], ["synth-12x12", synth(12, 12)]];
}

const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const crosses = (a, b, c, d) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

export function measure(model, flow = "up") {
  const times = [];
  let L;
  for (let k = 0; k < 5; k++) { const t = performance.now(); L = nestedLayout(model, { flow }); times.push(performance.now() - t); }
  const notes = L.items.filter((i) => i.kind === "note");
  const drawn = L.trunks.filter((t) => t.pts), back = L.trunks.filter((t) => t.back && !t.pts), implied = L.trunks.filter((t) => t.implied);
  // Back trunks, routed as the app routes them.
  const t0 = performance.now(), cells = buildCells(L);
  const routed = back.length ? routeAll(makeRouter(L, cells), back.map(({ a, b }) => ({ a, b })), cells.W, cells.H).routes : [];
  const routeMs = performance.now() - t0;
  const lines = [...drawn.map((t) => ({ a: t.a, b: t.b, pts: t.pts, back: t.back })), ...back.map((t, k) => routed[k] && { a: t.a, b: t.b, pts: routed[k].pts, back: true }).filter(Boolean)];
  // Each line's corners, with a tiny shift of its own so that two meeting at a cell's centre either cross or do not.
  const corners = lines.map((l, i) => {
    const e = [((i * 0.618) % 1) * 0.02 - 0.01, ((i * 0.414) % 1) * 0.02 - 0.01], P = l.pts;
    return P.filter((p, k) => k === 0 || k === P.length - 1 || Math.abs((p[0] - P[k - 1][0]) * (P[k + 1][1] - p[1]) - (p[1] - P[k - 1][1]) * (P[k + 1][0] - p[0])) > 1e-6).map((p) => [p[0] + e[0], p[1] + e[1]]);
  });
  const bends = corners.map((p) => p.length - 2), forwardBends = bends.filter((_, i) => !lines[i].back);
  let crossings = 0, length = 0, direct = 0, through = 0;
  corners.forEach((P) => {
    for (let k = 1; k < P.length; k++) length += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    direct += Math.hypot(P[0][0] - P.at(-1)[0], P[0][1] - P.at(-1)[1]);
  });
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue; // lines that share an end meet, they do not cross
    for (let p = 1; p < corners[i].length; p++) for (let q = 1; q < corners[j].length; q++) if (crosses(corners[i][p - 1], corners[i][p], corners[j][q - 1], corners[j][q])) crossings++;
  }
  // A line through a note that is not one of its ends.
  const blocks = L.items.map((it, k) => [k, it]).filter(([, it]) => it.kind === "note");
  lines.forEach((l, i) => {
    const P = corners[i];
    for (const [k, b] of blocks) {
      if (k === l.a || k === l.b) continue;
      let hit = false;
      for (let s = 1; s < P.length && !hit; s++) for (let u = 0; u <= 40 && !hit; u++) {
        const x = P[s - 1][0] + ((P[s][0] - P[s - 1][0]) * u) / 40, y = P[s - 1][1] + ((P[s][1] - P[s - 1][1]) * u) / 40;
        hit = x > b.gx + 0.1 && x < b.gx + b.w - 0.1 && y > b.gy + 0.1 && y < b.gy + b.h - 0.1;
      }
      if (hit) through++;
    }
  });
  const round = (x, d = 2) => +x.toFixed(d), sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    notes: notes.length, folders: L.items.length - notes.length, grid: [L.W, L.H],
    trunks: L.trunks.length, drawn: drawn.filter((t) => !t.back).length, back: L.trunks.filter((t) => t.back).length, implied: implied.length, lost: back.length - routed.filter(Boolean).length,
    straight: bends.filter((b) => b === 0).length, straightShare: round(bends.filter((b) => b === 0).length / (bends.length || 1)),
    straightForward: forwardBends.filter((b) => b === 0).length,
    meanBends: round(sum(bends) / (bends.length || 1)), maxBends: Math.max(0, ...bends),
    slanted: corners.filter((P) => P.some((p, k) => k && Math.abs(p[0] - P[k - 1][0]) > 0.1 && Math.abs(p[1] - P[k - 1][1]) > 0.1)).length,
    crossings, throughNotes: through, detour: round(length / (direct || 1)),
    columns: new Set(notes.map((n) => n.gx)).size, rows: new Set(notes.map((n) => n.gy)).size,
    ink: round((notes.length * NOTE_W * NOTE_H) / (L.W * L.H), 3),
    layoutMs: round(median(times), 1), routeMs: round(routeMs, 0),
  };
}

const COLUMNS = [["notes", "notes"], ["trunks", "drawn+back"], ["straight", "straight"], ["bends", "bends mean/max"], ["slanted", "slant"], ["crossings", "cross"], ["through", "thru"], ["detour", "detour"], ["columns", "cols/rows"], ["grid", "grid"], ["ms", "ms lay/route"]];
const row = (m) => ({ notes: `${m.notes}/${m.folders}`, trunks: `${m.drawn}+${m.back}`, straight: `${m.straight} (${Math.round(m.straightShare * 100)}%)`, bends: `${m.meanBends} / ${m.maxBends}`, slanted: m.slanted ?? 0, crossings: m.crossings, through: m.throughNotes, detour: m.detour, columns: `${m.columns}/${m.rows}`, grid: m.grid.join("x"), ms: `${m.layoutMs} / ${m.routeMs}` });
function table(results, base) {
  const lines = [["fixture", ...COLUMNS.map(([, h]) => h)]];
  for (const [name, m] of Object.entries(results)) {
    if (base?.[name]) lines.push([name + " (was)", ...COLUMNS.map(([k]) => String(row(base[name])[k]))]);
    lines.push([name, ...COLUMNS.map(([k]) => String(row(m)[k]))]);
  }
  const wide = lines[0].map((_, c) => Math.max(...lines.map((l) => l[c].length)));
  return lines.map((l) => l.map((x, c) => x.padEnd(wide[c])).join("  ")).join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (name) => { const k = args.indexOf(name); return k < 0 ? null : args[k + 1]; };
  if (args.includes("--snapshot")) {
    mkdirSync(FIXTURES, { recursive: true });
    for (const [name, data] of [["this-base", join(REPO, ".rdstudio/site/data")], ["nanosim", join(homedir(), "Repositories/nanosim/.rdstudio/site/data")]]) {
      if (!existsSync(data)) { console.error(`no built site at ${data}: ${name} kept as it is`); continue; }
      writeFileSync(join(FIXTURES, name + ".json"), JSON.stringify(fromSite(data)) + "\n");
      console.log(`${name}: snapshotted from ${data}`);
    }
  }
  const results = Object.fromEntries(fixtures().map(([name, model]) => [name, measure(model)]));
  const against = opt("--against");
  console.log(table(results, against && JSON.parse(readFileSync(against, "utf8")).results));
  const save = opt("--save");
  if (save) {
    const out = join(REPO, ".bench/results");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `atlas-layout-${save}.json`), JSON.stringify({ label: save, at: new Date().toISOString(), results }, null, 1) + "\n");
    console.log(`\nsaved ${join(out, `atlas-layout-${save}.json`)}`);
  }
}
