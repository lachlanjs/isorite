// isorite's name where OpenCode's home draws its own, as the browser draws it (`Logo.svelte`): seven letters of
// strokes at 45°, the i's each a stem that branches, with a gold diamond for Iso over the first i and a malachite one,
// for what you got right, over the second. Drawn as the mark is (`logo.ts`): every shape a full square or a corner
// half, in the same style; the i is the mark made small, and its diamond is the mark's.
//
// Where the home is too small for that, the name in the letters of OpenCode's own logo, as it draws "open" and
// "code": "iso" muted and "rite" bold.

import { blank, glyphs, type Corner, type Style } from "./logo.ts";

export type Role = "ink" | "iso" | "right";
export interface Run { text: string; role: Role }

// A letter, a row a string, a square a character: `F` full, and a corner half by the corner it leaves empty, `a` the
// top left (◢), `b` the bottom right (◤), `c` the bottom left (◥), `d` the top right (◣). Rows 0 and 1 are for what
// rises above the letters, row 6 the baseline.
const SQUARE: Record<string, Corner | "full"> = { F: "full", a: "tl", b: "br", c: "bl", d: "tr" };
const LETTERS: Record<string, string[]> = {
  i: ["...ab", "..ab.", "cdF..", ".cF..", "..F..", "..F..", "..F.."],
  s: ["...", "...", "aFF", "cd.", ".cd", ".ab", "FF."],
  o: [".....", ".....", ".aFd.", "ab.cd", "F...F", "cd.ab", ".cFb."],
  r: ["...", "...", "Fab", "Fb.", "F..", "F..", "F.."],
  t: ["...", ".F.", "FFF", ".F.", ".F.", ".F.", ".cd"],
  e: [".....", ".....", ".aFd.", "ab.cd", "FFFFF", "cd...", ".cFF."],
};
/** The mark's diamond, over an i's stem, and the row left clear beneath it. */
const DOT = [".aFd.", ".cFb.", "....."];
const WORD = "isorite";
const GAP = 1;

/** The wordmark's rows, as runs in one colour each, every row as wide (so that centred they stay aligned). */
export function rows(style: Style = "triangle"): Run[][] {
  const draw = (squares: string) => [...squares].map((q) => (q === "." ? blank(style) : glyphs[style][SQUARE[q]!])).join("");
  const gap = blank(style).repeat(GAP);
  const letters = [0, 1, 2, 3, 4, 5, 6].map((r): Run[] => [{ text: [...WORD].map((ch) => draw(LETTERS[ch]![r]!)).join(gap), role: "ink" }]);
  const dots = DOT.map((line): Run[] => {
    let i = 0;
    return [...WORD].flatMap((ch, k): Run[] => {
      const lead = k ? [{ text: gap, role: "ink" as Role }] : [];
      if (ch !== "i") return [...lead, { text: blank(style).repeat(LETTERS[ch]![0]!.length), role: "ink" }];
      return [...lead, { text: draw(line), role: i++ ? "right" : "iso" }];
    });
  });
  return [...dots, ...letters].filter((row) => row.some((run) => run.text.trim()) || row === dots[2]);
}

/** The wordmark as plain lines. */
export function lines(style: Style = "triangle"): string[] {
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
