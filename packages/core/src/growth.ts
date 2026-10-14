// The grown mark: a plant drawn by an L-system (X › F[+X]F[-X]+X, turning 45°), as on the boards. The same
// seed and depth always grow the same plant, so a study folder keeps its own.

export interface Plant {
  /** The stems, as an SVG path. */
  d: string;
  /** A small square at the end of each branch, as an SVG path. */
  tips: string;
  viewBox: string;
  /** Width over height. */
  ratio: number;
}

const DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1];

/** Grow a plant. `depth` is how many times the rule is applied (0 is a bare shoot); `step` the length of a stroke. */
export function sprout(seed: number, depth: number, { step = 1, pad = 0.5 }: { step?: number; pad?: number } = {}): Plant {
  let s = "X", r = (Math.abs(Math.trunc(seed)) * 7919 + 13) % 2147483647;
  const rnd = (): number => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < Math.max(0, Math.min(depth, 6)); i++) s = s.replace(/[XF]/g, (c) => (c === "X" ? "F[+X]F[-X]+X" : "FF"));
  if (s === "X") s = "F";
  let x = 0, y = 0, d = 0, g = 1, pen = false, x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  const stack: [number, number, number, number][] = [], out: string[] = [], tips: string[] = [], t = step / 2;
  for (const c of s) {
    if (c === "F") {
      if (!pen) { out.push(`M${x} ${y}`); pen = true; }
      x += DX[d]! * step; y += DY[d]! * step; out.push(`L${x} ${y}`);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    } else if (c === "+") d = (d + g + 8) % 8;
    else if (c === "-") d = (d - g + 8) % 8;
    else if (c === "[") { stack.push([x, y, d, g]); if (rnd() < 0.5) g = -g; }
    else if (c === "]") { tips.push(`M${x - t / 2} ${y - t / 2}h${t}v${t}h${-t}z`); [x, y, d, g] = stack.pop()!; pen = false; }
  }
  const w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  return { d: out.join(""), tips: tips.join(""), viewBox: `${x0 - pad} ${y0 - pad} ${w} ${h}`, ratio: w / h };
}
