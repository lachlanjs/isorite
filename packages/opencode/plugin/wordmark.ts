// isorite's name where OpenCode's home draws its own. As the browser draws it (`Logo.svelte`): seven turtle words,
// the i's each a stem that branches, with a gold diamond for Iso over the first i and a malachite one, for what you
// got right, over the second. Its strokes are drawn in quarter blocks, the mark's way of drawing a diagonal: a unit
// of the path is two cells across and a row down, so its 45° strokes stay 45°.
//
// Where the home is too small for that, the name in the letters of OpenCode's own logo, as it draws "open" and
// "code": "iso" muted and "rite" bold.

/** The browser's wordmark, `Logo.svelte`'s first path: the letters, from the baseline (0) up. */
export const PATH =
  "M2 0L2 -2L0 -4M2 -2L2 -4L4 -6M5.6 0L6.6 0L7.6 -1L5.6 -3L6.6 -4L7.6 -4M11.2 0L13.2 -2L11.2 -4L9.2 -2ZM14.8 0L14.8 -2L15.8 -3L16.8 -4M14.8 -2L14.8 -4M20.4 0L20.4 -2L18.4 -4M20.4 -2L20.4 -4L22.4 -6M26 0L25 -1L25 -4L24 -4M25 -4L26 -4M25 -4L25 -5M30.6 0L29.6 0L27.6 -2L29.6 -4L31.6 -2L27.6 -2";
/** Where its i's stand: the diamonds go over them. */
const I = [2, 20.4];

export type Role = "ink" | "iso" | "right";
export interface Run { text: string; role: Role }

type Point = [number, number];

function segments(path: string): [Point, Point][] {
  const out: [Point, Point][] = [];
  let at: Point = [0, 0], start: Point = [0, 0];
  for (const [, cmd, x, y] of path.matchAll(/([MLZ])\s*(-?[\d.]+)?\s*(-?[\d.]+)?/g)) {
    if (cmd === "Z") { out.push([at, start]); at = start; continue; }
    const p: Point = [Number(x), Number(y)];
    if (cmd === "M") at = start = p;
    else { out.push([at, p]); at = p; }
  }
  return out;
}

// A cell is two quarter blocks across and two down; a unit of the path is four across and two down.
const ACROSS = 4, DOWN = 2, PEN = 2, HEIGHT = 6;
const QUARTERS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";
// A diamond with 45° sides, centred on a stem a cell wide.
const CAP = [" ▄█▄ ", "█████", " ▀█▀ "];

/** The wordmark's rows, as runs in one colour each. */
export function rows(path = PATH): Run[][] {
  const lit = new Set<string>();
  let width = 0;
  for (const [[x0, y0], [x1, y1]] of segments(path)) {
    for (let k = 0; k <= 400; k++) {
      const t = k / 400, x = Math.round((x0 + (x1 - x0) * t) * ACROSS + 0.4), y = Math.round((y0 + (y1 - y0) * t) * DOWN) + HEIGHT * DOWN + 1;
      for (let d = 0; d < PEN; d++) lit.add(`${x + d},${y}`);
      width = Math.max(width, x + PEN);
    }
  }
  const cols = Math.ceil(width / 2), on = (x: number, y: number) => (lit.has(`${x},${y}`) ? 1 : 0);
  const letters: string[] = [];
  for (let y = 0; y < (HEIGHT + 1) * DOWN; y += 2) {
    let line = "";
    for (let c = 0; c < cols; c++) line += QUARTERS[on(2 * c, y) | (on(2 * c + 1, y) << 1) | (on(2 * c, y + 1) << 2) | (on(2 * c + 1, y + 1) << 3)];
    if (line.trim()) letters.push(line);
  }
  // Each diamond centred on its i's stem, above the letters.
  const stems = I.map((x) => Math.floor(Math.round(x * ACROSS + 0.4) / 2));
  const caps = CAP.map((cap): Run[] => {
    const runs: Run[] = [];
    let at = 0;
    stems.forEach((stem, k) => {
      const from = stem - 2;
      runs.push({ text: " ".repeat(from - at), role: "ink" }, { text: cap, role: k ? "right" : "iso" });
      at = from + cap.length;
    });
    // Every row as wide as the letters, so that centred they stay aligned.
    return [...runs, { text: " ".repeat(cols - at), role: "ink" }];
  });
  return [...caps, ...letters.map((text): Run[] => [{ text, role: "ink" }])];
}

/** The wordmark as plain lines. */
export function lines(path = PATH): string[] {
  return rows(path).map((runs) => runs.map((r) => r.text).join("").trimEnd());
}

// ------------------------------------------------------------ small: in OpenCode's letters
// A letter is three rows high, with a row above it for what rises, in half blocks, and four cells wide but for the i.
// As in OpenCode's, `_` is a cell of the letter's shade, `^` an upper half block on it.

const LETTERS: Record<string, string[]> = {
  i: ["▀", "█", "█", "▀"],
  s: ["    ", "█▀▀▀", "^^^█", "▀▀▀▀"],
  o: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  r: ["    ", "█▀▀▀", "█   ", "▀   "],
  t: [" ▄  ", "▀█▀▀", " █__", " ▀▀▀"],
  e: ["    ", "█▀▀█", "█^^^", "▀▀▀▀"],
};

/** A word's four rows, its letters a cell apart. */
export function word(text: string): string[] {
  return [0, 1, 2, 3].map((row) => [...text].map((ch) => LETTERS[ch]![row]).join(" "));
}

export const left = word("iso");
export const right = word("rite");

/** A row as runs to draw: plain, or on the letter's shade. */
export function runs(row: string): { text: string; shaded: boolean }[] {
  const out: { text: string; shaded: boolean }[] = [];
  for (const c of row) {
    const shaded = c === "_" || c === "^", ch = c === "_" ? " " : c === "^" ? "▀" : c;
    const last = out.at(-1);
    if (last && last.shaded === shaded) last.text += ch;
    else out.push({ text: ch, shaded });
  }
  return out;
}
