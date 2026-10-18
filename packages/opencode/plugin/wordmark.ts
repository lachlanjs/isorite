// isorite's name where OpenCode's home draws its own, as the browser draws it (`Logo.svelte`): seven letters of
// strokes at 45°, the i's each a stem that branches, with a gold diamond for Iso over the first i and a malachite one,
// for what you got right, over the second. By default (`quadrant`) the browser's own path drawn in quarter blocks,
// with a drop shadow a cell down and to the right (Lachlan's choice of the variants). In the other styles, drawn as
// the mark is (`logo.ts`): every shape a full square or a corner half; the i is the mark made small.
//
// Where the home is too small for that, the name in the letters of OpenCode's own logo, as it draws "open" and
// "code": "iso" muted and "rite" bold.

import { blank, glyphs, type Corner, type Style } from "./logo.ts";

export type Role = "ink" | "iso" | "right" | "shadow";
/** A run of one colour, on the colour of another where a cell holds both. */
export interface Run { text: string; role: Role; bg?: Role }

// A letter, a row a string, a square a character: `F` full, and a corner half by the corner it leaves empty, `a` the
// top left (◢), `b` the bottom right (◤), `c` the bottom left (◥), `d` the top right (◣).
const SQUARE: Record<string, Corner | "full"> = { F: "full", a: "tl", b: "br", c: "bl", d: "tr" };

// In squares two cells wide (`legacy`, `quadrant`, `simple`): strokes a square thick, at 45°. Rows 0 and 1 are for
// what rises above the letters, row 6 the baseline.
const IN_SQUARES = {
  letters: {
    i: ["...ab", "..ab.", "cdF..", ".cF..", "..F..", "..F..", "..F.."],
    s: ["...", "...", "aFF", "cd.", ".cd", ".ab", "FF."],
    o: [".....", ".....", ".aFd.", "ab.cd", "F...F", "cd.ab", ".cFb."],
    r: ["...", "...", "Fab", "Fb.", "F..", "F..", "F.."],
    t: ["...", ".F.", "FFF", ".F.", ".F.", ".F.", ".cd"],
    e: [".....", ".....", ".aFd.", "ab.cd", "FFFFF", "cd...", ".cFF."],
  } as Record<string, string[]>,
  /** The mark's diamond, over an i's stem, and the row left clear beneath it. */
  dot: [".aFd.", ".cFb.", "....."],
};

// In cells (`triangle`): a cell is about twice as tall as it is wide, so a stroke is two cells wide and a row tall,
// every way alike, and a diagonal (◢█◤) as steep as a cell. A triangle meets a whole block along a whole edge, so
// nothing steps; a bar of half blocks would meet a triangle half a row short. Rows 0 and 1 are for what rises above
// the letters, row 8 the baseline.
const IN_CELLS = {
  letters: {
    i: ["....aFb", "cFdaFb.", ".cFFF..", "...FF..", "...FF..", "...FF..", "...FF..", "...FF..", "...FF.."],
    s: [".....", ".....", ".aFFF", "aFb..", "cFd..", ".cFd.", "..cFd", "..aFb", "FFFb."],
    o: ["......", "......", ".aFFd.", "aFbcFd", "FF..FF", "FF..FF", "FF..FF", "cFdaFb", ".cFFb."],
    r: [".....", ".....", "FFaFb", "FFFb.", "FF...", "FF...", "FF...", "FF...", "FF..."],
    t: ["......", "..FF..", "FFFFFF", "..FF..", "..FF..", "..FF..", "..FF..", "..FF..", "..cFd."],
    e: ["......", "......", ".aFFd.", "aFbcFd", "FFFFFF", "FF....", "FF....", "cFd...", ".cFFFF"],
  } as Record<string, string[]>,
  dot: ["...ad..", "...cb..", "......."],
};
const WORD = "isorite";

/** The wordmark's rows, as runs in one colour each, every row as wide (so that centred they stay aligned). */
export function rows(style: Style = "quadrant"): Run[][] {
  if (style === "quadrant") return drawn();
  const { letters: LETTERS, dot } = [...glyphs[style].full].length === 1 ? IN_CELLS : IN_SQUARES;
  const draw = (squares: string) => [...squares].map((q) => (q === "." ? blank(style) : glyphs[style][SQUARE[q]!])).join("");
  const gap = blank(style);
  const letters = LETTERS.i!.map((_, r): Run[] => [{ text: [...WORD].map((ch) => draw(LETTERS[ch]![r]!)).join(gap), role: "ink" }]);
  const dots = dot.map((line): Run[] => {
    let i = 0;
    return [...WORD].flatMap((ch, k): Run[] => {
      const lead = k ? [{ text: gap, role: "ink" as Role }] : [];
      if (ch !== "i") return [...lead, { text: blank(style).repeat(LETTERS[ch]![0]!.length), role: "ink" }];
      return [...lead, { text: draw(line), role: i++ ? "right" : "iso" }];
    });
  });
  return [...dots, ...letters].filter((row) => row.some((run) => run.text.trim()) || row === dots[2]);
}

// ------------------------------------------------------------ in quarter blocks, with its shadow

/** The browser's wordmark, `Logo.svelte`'s first path: the letters, from the baseline (0) up. */
export const PATH =
  "M2 0L2 -2L0 -4M2 -2L2 -4L4 -6M5.6 0L6.6 0L7.6 -1L5.6 -3L6.6 -4L7.6 -4M11.2 0L13.2 -2L11.2 -4L9.2 -2ZM14.8 0L14.8 -2L15.8 -3L16.8 -4M14.8 -2L14.8 -4M20.4 0L20.4 -2L18.4 -4M20.4 -2L20.4 -4L22.4 -6M26 0L25 -1L25 -4L24 -4M25 -4L26 -4M25 -4L25 -5M30.6 0L29.6 0L27.6 -2L29.6 -4L31.6 -2L27.6 -2";
/** Where its i's stand: the diamonds go over them. */
const STEMS = [2, 20.4];

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

// A cell is two quarter blocks across and two down; a unit of the path is four across and two down, so its 45°
// strokes stay 45°. The pen is two quarters wide: a stem is a cell. Three rows above the letters hold the diamonds.
const QUARTERS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";
const DIAMOND = [" ▄█▄ ", "█████", " ▀█▀ "];
const ABOVE = 6, HEIGHT = 6;

/** The wordmark's quarter blocks, by colour. */
function pixels(): Record<"ink" | "iso" | "right", Set<string>> {
  const ink = new Set<string>(), iso = new Set<string>(), right = new Set<string>();
  for (const [[x0, y0], [x1, y1]] of segments(PATH)) {
    for (let k = 0; k <= 400; k++) {
      const t = k / 400, x = Math.round((x0 + (x1 - x0) * t) * 4 + 0.4), y = Math.round((y0 + (y1 - y0) * t) * 2) + HEIGHT * 2 + 1 + ABOVE;
      ink.add(`${x},${y}`).add(`${x + 1},${y}`);
    }
  }
  STEMS.forEach((at, k) => {
    const from = Math.floor(Math.round(at * 4 + 0.4) / 2) - 2;
    DIAMOND.forEach((line, r) => [...line].forEach((ch, c) => {
      const bits = QUARTERS.indexOf(ch);
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], q) => { if (bits >> q & 1) (k ? right : iso).add(`${2 * (from + c) + dx!},${2 * r + dy!}`); });
    }));
  });
  return { ink, iso, right };
}

/** The wordmark in quarter blocks, its shadow a cell down and to the right. A cell has two colours: where a letter
 * and its shadow share one, the shadow is its background if it fills the rest of the cell, and is left out if not. */
function drawn(): Run[][] {
  const { ink, iso, right } = pixels();
  const all = new Set([...ink, ...iso, ...right]);
  const shadow = new Set([...all].map((p) => { const [x, y] = p.split(",").map(Number); return `${x! + 2},${y! + 2}`; }).filter((p) => !all.has(p)));
  const layers: [Role, Set<string>][] = [["iso", iso], ["right", right], ["ink", ink], ["shadow", shadow]];
  const xs = [...all, ...shadow].map((p) => Number(p.split(",")[0])), ys = [...all, ...shadow].map((p) => Number(p.split(",")[1]));
  const cols = Math.ceil((Math.max(...xs) + 1) / 2), rows = Math.ceil((Math.max(...ys) + 1) / 2);
  const mask = (set: Set<string>, c: number, r: number) =>
    [[0, 0], [1, 0], [0, 1], [1, 1]].reduce((m, [dx, dy], q) => m | (set.has(`${2 * c + dx!},${2 * r + dy!}`) ? 1 << q : 0), 0);
  const out: Run[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: Run[] = [];
    for (let c = 0; c < cols; c++) {
      const masks = layers.map(([role, set]) => [role, mask(set, c, r)] as const).filter(([, m]) => m);
      const [top, under] = masks;
      const cell: Run = !top ? { text: " ", role: "ink" }
        : { text: QUARTERS[top[1]]!, role: top[0], ...(under && (top[1] | under[1]) === 15 ? { bg: under[0] } : {}) };
      const last = line.at(-1);
      if (last && last.role === cell.role && last.bg === cell.bg) last.text += cell.text;
      else line.push(cell);
    }
    out.push(line);
  }
  return out;
}

/** The wordmark as plain lines. */
export function lines(style: Style = "quadrant"): string[] {
  return rows(style).map((runs) => runs.map((r) => r.text).join("").trimEnd());
}

// ------------------------------------------------------------ small: in OpenCode's letters
// A letter is three rows high, with a row above it for what rises, in half blocks, and four cells wide but for the i.
// As in OpenCode's, `_` is a cell of the letter's shade, `^` an upper half block on it.

const SMALL: Record<string, string[]> = {
  i: ["▀", "█", "█", "▀"],
  s: ["    ", "█▀▀▀", "^^^█", "▀▀▀▀"],
  o: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  r: ["    ", "█▀▀▀", "█   ", "▀   "],
  t: [" ▄  ", "▀█▀▀", " █__", " ▀▀▀"],
  e: ["    ", "█▀▀█", "█^^^", "▀▀▀▀"],
};

/** A word's four rows, its letters a cell apart. */
export function word(text: string): string[] {
  return [0, 1, 2, 3].map((row) => [...text].map((ch) => SMALL[ch]![row]).join(" "));
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
