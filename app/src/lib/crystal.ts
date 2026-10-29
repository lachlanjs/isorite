// Iso's crystals (M24, I and K): a hundred, each an L-system. A rule for one arm, mirror-symmetric about the arm's
// own axis, turned at multiples of 180°/n so its branches fall on the crystal's own directions, and drawn n times
// round the centre. A conversation's crystal is chosen by its id, so it is the same wherever it is drawn: it grows
// while Iso works in it, and marks it in the drawer of past conversations.

/** One segment of an arm, in steps from the centre: [x1, y1, x2, y2, how far out]. */
export type Segment = [number, number, number, number, number];
export interface Crystal { n: number; segs: Segment[]; scale: number; steps: number; width: number }

function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
// Every [+X] has its [-X] at the same place, so each arm is mirror-symmetric.
const RULES = ["F[+F][-F]F", "FF[+F][-F]F", "F[+F][-F][F]", "F[++F][--F]F", "F[+F][-F]F[+F][-F]", "F[+FF][-FF]F", "FF[+F][-F][++F][--F]", "F[+F[+F][-F]][-F[+F][-F]]F"];
const FOLDS = [3, 4, 5, 6, 6, 6, 7, 8, 8];

function grow(seed: number): Crystal {
  const r = rng(seed + 1), n = FOLDS[Math.floor(r() * FOLDS.length)]!, rule = RULES[Math.floor(r() * RULES.length)]!;
  const turn = (180 / n) * (r() < 0.5 ? 1 : 2) * (n <= 4 && r() < 0.5 ? 0.5 : 1), depth = rule.length > 14 ? 2 : r() < 0.55 ? 3 : 2;
  let s = "F";
  for (let k = 0; k < depth; k++) s = s.replace(/F/g, rule);
  const segs: Segment[] = [], stack: [number, number, number, number][] = [];
  let x = 0, y = 0, a = 0, d = 0, far = 0;
  for (const c of s) {
    if (c === "F") {
      const nx = x + Math.cos((a * Math.PI) / 180), ny = y + Math.sin((a * Math.PI) / 180);
      segs.push([x, y, nx, ny, d]);
      x = nx; y = ny; d++;
      far = Math.max(far, Math.hypot(x, y));
    } else if (c === "+") a += turn;
    else if (c === "-") a -= turn;
    else if (c === "[") stack.push([x, y, a, d]);
    else if (c === "]") [x, y, a, d] = stack.pop()!;
  }
  // Drawn in a box of 48 about the centre; a crystal of many segments in a finer line.
  return { n, segs, scale: 21 / Math.max(far, 1), steps: Math.max(...segs.map((q) => q[4])) + 1, width: Math.min(1.4, Math.max(0.6, ((30 / segs.length) * n) / 6 + 0.55)) };
}

export const CRYSTALS: Crystal[] = Array.from({ length: 100 }, (_, k) => grow(k * 7919 + 13));

/** The crystal of a conversation, by its id: its number, from 0. */
export function crystalOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % CRYSTALS.length;
}

/** Its lines, all n arms, each with how far out it is (0 to 1), for growing outward. */
export function lines(c: Crystal): { x1: number; y1: number; x2: number; y2: number; out: number }[] {
  const all = [];
  for (let k = 0; k < c.n; k++) {
    const rot = (((k * 360) / c.n - 90) * Math.PI) / 180, cos = Math.cos(rot), sin = Math.sin(rot);
    const p = (x: number, y: number): [number, number] => [(x * cos - y * sin) * c.scale, (x * sin + y * cos) * c.scale];
    for (const [x1, y1, x2, y2, d] of c.segs) {
      const [a1, b1] = p(x1, y1), [a2, b2] = p(x2, y2);
      all.push({ x1: +a1.toFixed(2), y1: +b1.toFixed(2), x2: +a2.toFixed(2), y2: +b2.toFixed(2), out: d / c.steps });
    }
  }
  return all;
}
