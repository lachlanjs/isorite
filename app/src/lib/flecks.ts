// The flecks at the ends of a pointer, ">---<": a short branching twig at each end, grown by a small L-system
// (F → F[+F][-F]) and pruned at random, so each pointer has a look of its own and none is crowded. Seeded by the
// pointer's number, so the same pointer is always drawn the same.

const rand = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A twig from (x, y) growing at `angle` (radians): its trunk, then at the end two branches, each shorter. */
function twig(next: () => number, x: number, y: number, angle: number, len: number, depth: number, out: string[]): void {
  const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
  out.push(`M${x.toFixed(1)} ${y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  if (depth === 0) return;
  const spread = 0.5 + next() * 0.25;
  twig(next, x2, y2, angle + spread, len * 0.62, depth - 1, out);
  if (next() < 0.7) twig(next, x2, y2, angle - spread, len * 0.62, depth - 1, out);
}

/** The path (SVG `d`) of both twigs of a pointer: the left from (xl, y) leftwards, the right from (xr, y) rightwards. */
export function flecks(seed: number, xl: number, xr: number, y: number): string {
  const next = rand(seed + 1), out: string[] = [];
  twig(next, xl, y, Math.PI + (next() - 0.5) * 0.3, 5.5, 2, out);
  twig(next, xr, y, (next() - 0.5) * 0.3, 5.5, 2, out);
  return out.join("");
}
