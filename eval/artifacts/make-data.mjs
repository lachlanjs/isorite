// Writes the data the artifact eval's cases draw from, measured from a small N-body run like the example base's notes:
// G = 1, softened gravity, three bodies on the figure-eight orbit and a fourth, light one passing by.
// node eval/artifacts/make-data.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("data/", import.meta.url);
mkdirSync(out, { recursive: true });

const start = () => [
  { name: "a", m: 1, p: [0.97000436, -0.24308753, 0], v: [0.466203685, 0.43236573, 0.02] },
  { name: "b", m: 1, p: [-0.97000436, 0.24308753, 0], v: [0.466203685, 0.43236573, -0.02] },
  { name: "c", m: 1, p: [0, 0, 0], v: [-0.93240737, -0.86473146, 0] },
  { name: "d", m: 0.05, p: [2.6, 1.4, 0.4], v: [-0.32, -0.08, -0.03] },
];
const EPS = 0.02;

function accel(bodies) {
  const a = bodies.map(() => [0, 0, 0]);
  for (let i = 0; i < bodies.length; i++)
    for (let j = 0; j < bodies.length; j++) {
      if (i === j) continue;
      const d = [0, 1, 2].map((k) => bodies[j].p[k] - bodies[i].p[k]);
      const r2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 + EPS ** 2, f = bodies[j].m / (r2 * Math.sqrt(r2));
      for (let k = 0; k < 3; k++) a[i][k] += f * d[k];
    }
  return a;
}
function energy(bodies) {
  let kin = 0, pot = 0;
  for (const b of bodies) kin += 0.5 * b.m * (b.v[0] ** 2 + b.v[1] ** 2 + b.v[2] ** 2);
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const r2 = [0, 1, 2].reduce((s, k) => s + (bodies[j].p[k] - bodies[i].p[k]) ** 2, 0) + EPS ** 2;
      pot -= bodies[i].m * bodies[j].m / Math.sqrt(r2);
    }
  return { kin, pot, total: kin + pot };
}
const step = {
  euler(bodies, dt) {
    const a = accel(bodies);
    bodies.forEach((b, i) => { for (let k = 0; k < 3; k++) { b.p[k] += dt * b.v[k]; b.v[k] += dt * a[i][k]; } });
  },
  leapfrog(bodies, dt) {
    let a = accel(bodies);
    bodies.forEach((b, i) => { for (let k = 0; k < 3; k++) { b.v[k] += 0.5 * dt * a[i][k]; b.p[k] += dt * b.v[k]; } });
    a = accel(bodies);
    bodies.forEach((b, i) => { for (let k = 0; k < 3; k++) b.v[k] += 0.5 * dt * a[i][k]; });
  },
};
const f = (x, n = 6) => +x.toFixed(n);

/** One run: positions every `every` steps, and the energy at the same times. */
function run(integrator, dt, T, every) {
  const bodies = start(), e0 = energy(bodies).total, orbits = [], energies = [];
  const steps = Math.round(T / dt);
  let worst = 0;
  for (let s = 0; s <= steps; s++) {
    const e = energy(bodies), rel = (e.total - e0) / Math.abs(e0);
    worst = Math.max(worst, Math.abs(rel));
    if (s % every === 0) {
      const t = f(s * dt, 4);
      for (const b of bodies) orbits.push([t, b.name, b.m, ...b.p.map((x) => f(x)), ...b.v.map((x) => f(x))]);
      energies.push([t, f(e.kin), f(e.pot), f(e.total), f(rel, 9)]);
    }
    if (s < steps) step[integrator](bodies, dt);
  }
  return { orbits, energies, worst, steps };
}
const csv = (name, head, rows) => writeFileSync(new URL(name, out), [head.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n");

const lf = run("leapfrog", 0.005, 12, 20), eu = run("euler", 0.005, 12, 20);
csv("orbits.csv", ["t", "body", "mass", "x", "y", "z", "vx", "vy", "vz"], lf.orbits);
csv("energy-leapfrog.csv", ["t", "kinetic", "potential", "total", "rel_error"], lf.energies);
csv("energy-euler.csv", ["t", "kinetic", "potential", "total", "rel_error"], eu.energies);

const sweep = [];
for (const integrator of ["euler", "leapfrog"])
  for (const dt of [0.04, 0.02, 0.01, 0.005, 0.0025]) {
    const r = run(integrator, dt, 6, 1e9);
    sweep.push([integrator, dt, r.steps, f(r.worst, 9), r.steps * (integrator === "leapfrog" ? 2 : 1)]);
  }
csv("timesteps.csv", ["integrator", "dt", "steps", "max_rel_error", "force_evals"], sweep);
console.log(`orbits ${lf.orbits.length} rows, energies ${lf.energies.length} each, sweep ${sweep.length}`);
