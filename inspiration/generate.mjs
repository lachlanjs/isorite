// Draws the inspiration folders' own images, in isorite's lapis palette: node inspiration/generate.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const C = { ground: "#07101C", ground2: "#0C1828", line: "#23395A", strong: "#5C7BA6", text: "#E9EEF5", lattice: "#6BA6FF", gold: "#F0BE4A", goldDeep: "#C28F1E", malachite: "#5FD3A4", rose: "#FF8FA6" };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${C.ground}"/>${body}</svg>\n`;
const f = (n) => n.toFixed(1);
const out = (path, s) => { mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true }); writeFileSync(new URL(path, import.meta.url), s); };

// 1. Notes on a crystal lattice, joined by gold veins that can only run along the lattice's edges.
{
  const W = 1200, H = 800, s = 40, h = s * Math.sqrt(3) / 2;
  const pt = (i, j) => [80 + i * s + (j % 2) * s / 2, 60 + j * h];
  let body = "";
  for (let j = 0; j < 17; j++) for (let i = 0; i < 26; i++) {
    const [x, y] = pt(i, j);
    for (const [a, b] of [[i + 1, j], [i + (j % 2), j + 1], [i - 1 + (j % 2), j + 1]]) {
      if (a < 0 || a > 25 || b > 16) continue;
      const [x2, y2] = pt(a, b);
      body += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${C.line}" stroke-width="1"/>`;
    }
  }
  const notes = [[3, 3], [9, 2], [6, 8], [14, 5], [12, 12], [19, 3], [21, 10], [17, 15], [3, 14]];
  const links = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [3, 5], [5, 6], [4, 7], [6, 7], [2, 8]];
  // A walk along lattice neighbours toward the target: a vein in a crystal, not a straight line.
  const walk = ([i, j], [ti, tj]) => {
    const path = [[i, j]];
    while (i !== ti || j !== tj) {
      const [x, y] = pt(ti, tj);
      const next = [[i + 1, j], [i - 1, j], [i + (j % 2), j + 1], [i - 1 + (j % 2), j + 1], [i + (j % 2), j - 1], [i - 1 + (j % 2), j - 1]]
        .map(([a, b]) => { const [px, py] = pt(a, b); return { a, b, d: Math.hypot(px - x, py - y) + rnd() * 6 }; })
        .sort((p, q) => p.d - q.d)[0];
      [i, j] = [next.a, next.b];
      path.push([i, j]);
    }
    return path;
  };
  for (const [a, b] of links) {
    const d = walk(notes[a], notes[b]).map(([i, j], k) => `${k ? "L" : "M"}${pt(i, j).map(f).join(" ")}`).join("");
    body += `<path d="${d}" fill="none" stroke="${C.goldDeep}" stroke-width="5" stroke-linejoin="round" opacity=".35"/><path d="${d}" fill="none" stroke="${C.gold}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  for (const [k, n] of notes.entries()) {
    const [x, y] = pt(...n);
    body += `<path d="M${x - 12} ${y - 16}h20l4 4v24h-20l-4-4z" fill="${C.ground2}" stroke="${k === 3 ? C.text : C.lattice}" stroke-width="1.5"/>`;
  }
  out("minerals/generated-lattice-veins.svg", svg(W, H, body));
}

// 2. Facets: a jittered triangle mesh lit from one side, each face a flat plane of a crystal. Lustre is just the
//    angle between a face and the light.
{
  const W = 1200, H = 800, n = 14, m = 10, P = [];
  for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++) {
    const edge = i === 0 || j === 0 || i === n || j === m;
    P.push([i * W / n + (edge ? 0 : (rnd() - .5) * 60), j * H / m + (edge ? 0 : (rnd() - .5) * 60), rnd() * 70]);
  }
  const at = (i, j) => P[j * (n + 1) + i];
  const light = [-.5, -.6, .62];
  const mix = (a, b, t) => "#" + [0, 2, 4].map((o) => Math.round(parseInt(a.slice(1 + o, 3 + o), 16) * (1 - t) + parseInt(b.slice(1 + o, 3 + o), 16) * t).toString(16).padStart(2, "0")).join("");
  let body = "";
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) for (const tri of [[at(i, j), at(i + 1, j), at(i, j + 1)], [at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]]) {
    const [a, b, c] = tri, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], l = Math.hypot(nx, ny, nz);
    const lit = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / l);
    const vein = Math.abs((a[0] + b[0] + c[0]) / 3 - 0.55 * (a[1] + b[1] + c[1]) / 3 - 420) < 40;
    const fill = vein ? mix(C.goldDeep, C.gold, lit ** 3) : mix(C.ground, mix(C.line, C.lattice, .5), lit ** 2.2);
    body += `<path d="M${tri.map((p) => p.slice(0, 2).map(f).join(" ")).join("L")}Z" fill="${fill}" stroke="${C.ground}" stroke-width=".6"/>`;
  }
  out("minerals/generated-facets-lustre.svg", svg(W, H, body));
}

// L-systems: rewrite, then walk with a turtle.
const grow = (axiom, rules, n) => { let s = axiom; for (let k = 0; k < n; k++) s = [...s].map((c) => rules[c] ?? c).join(""); return s; };
function turtle(s, { x, y, step, angle, heading = -90, jitter = 0 }) {
  const segs = [], tips = [], stack = [];
  let a = heading, depth = 0;
  for (const ch of s) {
    if (ch === "F") { const r = (a + (rnd() - .5) * jitter) * Math.PI / 180, nx = x + Math.cos(r) * step, ny = y + Math.sin(r) * step; segs.push([x, y, nx, ny, depth]); [x, y] = [nx, ny]; }
    else if (ch === "+") a += angle;
    else if (ch === "-") a -= angle;
    else if (ch === "[") { stack.push([x, y, a, depth]); depth++; }
    else if (ch === "]") { tips.push([x, y]); [x, y, a, depth] = stack.pop(); }
  }
  return { segs, tips };
}

// 3. A plant, organic and loose: thick old wood in lapis, new growth in gold, every tip a note.
{
  const W = 1000, H = 1000;
  const { segs, tips } = turtle(grow("X", { X: "F+[[X]-X]-F[-FX]+X", F: "FF" }, 6), { x: 500, y: 980, step: 5.6, angle: 22.5, jitter: 6 });
  const max = Math.max(...segs.map((s) => s[4]));
  let body = segs.map(([x1, y1, x2, y2, d]) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${d > max - 2 ? C.gold : d > max - 4 ? C.lattice : C.strong}" stroke-width="${f(Math.max(.6, 3.2 - d * .45))}" stroke-linecap="round"/>`).join("");
  body += tips.filter((_, k) => k % 45 === 0).map(([x, y]) => `<rect x="${f(x - 3)}" y="${f(y - 3)}" width="6" height="6" fill="${C.ground}" stroke="${C.gold}" stroke-width="1"/>`).join("");
  out("organic-growth/generated-lsystem-plant.svg", svg(W, H, body));
}

// 4. Growth that is only allowed crystal angles (60°): organic rules, mineral geometry. A dendrite, like frost or
//    native copper.
{
  const W = 1000, H = 1000;
  let body = "";
  for (let k = 0; k < 6; k++) {
    const { segs } = turtle(grow("F", { F: "F[+F]F[-F]F" }, 4), { x: 500, y: 500, step: 4.4, angle: 60, heading: k * 60 });
    body += segs.map(([x1, y1, x2, y2, d]) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${[C.gold, C.lattice, C.strong, C.line][Math.min(d, 3)]}" stroke-width="${d ? 1 : 2}" stroke-linecap="round"/>`).join("");
  }
  out("organic-growth/generated-crystal-dendrite.svg", svg(W, H, body));
}

// 5. A space-colonisation sketch: veins grow from a root toward scattered notes, each step to the nearest still
//    unreached ones. Organic routing, the way leaf veins and slime moulds find their food.
{
  const W = 1200, H = 800, food = Array.from({ length: 260 }, () => [100 + rnd() * 1000, 80 + rnd() * 640]);
  const nodes = [{ x: 600, y: 780, p: -1, w: 0 }];
  for (let it = 0; it < 260 && food.length; it++) {
    const pull = new Map();
    for (const [fx, fy] of food) {
      let best = -1, bd = 1e9;
      nodes.forEach((n, k) => { const d = Math.hypot(n.x - fx, n.y - fy); if (d < bd) { bd = d; best = k; } });
      if (bd < 220) { const v = pull.get(best) ?? [0, 0]; pull.set(best, [v[0] + (fx - nodes[best].x) / bd, v[1] + (fy - nodes[best].y) / bd]); }
    }
    if (!pull.size) { nodes.push({ x: nodes.at(-1).x, y: nodes.at(-1).y - 8, p: nodes.length - 1, w: 0 }); continue; }
    for (const [k, [vx, vy]] of pull) { const l = Math.hypot(vx, vy) || 1; nodes.push({ x: nodes[k].x + vx / l * 8, y: nodes[k].y + vy / l * 8, p: k, w: 0 }); }
    for (let q = food.length - 1; q >= 0; q--) if (nodes.some((n) => Math.hypot(n.x - food[q][0], n.y - food[q][1]) < 12)) food.splice(q, 1);
  }
  for (let k = nodes.length - 1; k > 0; k--) nodes[nodes[k].p].w += nodes[k].w + 1;
  const body = nodes.slice(1).map((n) => { const p = nodes[n.p], w = Math.min(6, .5 + Math.sqrt(n.w) * .35); return `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(n.x)}" y2="${f(n.y)}" stroke="${w > 3 ? C.gold : w > 1.2 ? C.lattice : C.strong}" stroke-width="${f(w)}" stroke-linecap="round"/>`; }).join("");
  out("organic-growth/generated-vein-colonisation.svg", svg(W, H, body));
}
console.log("drawn");
