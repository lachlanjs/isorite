// The recipes' own data (small, made up but plausible), so each recipe renders as written:
// node packages/kit/context/make-data.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("data/", import.meta.url);
mkdirSync(out, { recursive: true });
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = (s) => (rand() + rand() + rand() - 1.5) * s;
const csv = (name, head, rows) => writeFileSync(new URL(name, out), [head.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n");
const f = (x, n = 4) => +x.toFixed(n);

// A pendulum's period against its length: five trials at each of eight lengths.
const pend = [];
for (const L of [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2])
  for (let trial = 1; trial <= 5; trial++) pend.push([L, trial, f(2 * Math.PI * Math.sqrt(L / 9.81) + noise(0.02)), f(21 + noise(0.6), 1)]);
csv("pendulum.csv", ["length_m", "trial", "period_s", "temp_c"], pend);

// Two mugs cooling, one with a lid: Newton's law with different rates.
for (const [name, k] of [["mug-open.csv", 0.052], ["mug-lid.csv", 0.031]]) {
  const rows = [];
  for (let t = 0; t <= 60; t += 2) rows.push([t, f(21 + (88 - 21) * Math.exp(-k * t) + noise(0.4), 2)]);
  csv(name, ["t_min", "temp_c"], rows);
}

// A bracket, as an ASCII STL: an L of two boxes.
const box = (x0, y0, z0, x1, y1, z1) => {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]];
  return faces.map((t) => `facet normal 0 0 0\n outer loop\n${t.map((i) => `  vertex ${v[i].join(" ")}`).join("\n")}\n endloop\nendfacet`).join("\n");
};
writeFileSync(new URL("bracket.stl", out), `solid bracket\n${box(0, 0, 0, 60, 10, 30)}\n${box(0, 0, 0, 10, 50, 30)}\nendsolid bracket\n`);
console.log(`pendulum ${pend.length} rows, two mugs, bracket.stl`);
