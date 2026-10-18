// The isorite mark as `Terminal-Splash` draws it, in terminal cells.
//
// The board draws it on a grid 10 squares wide and 15 tall. Every shape is a full
// square or a corner half of one, and a square is two cells wide and one row tall,
// so the mark is 20 cells by 15 rows. The two top rows are in growth (gold), the
// rest in the text colour.
//
// A corner half is drawn, by default, as one of Powerline's triangles in a square one
// cell wide (`triangle`): terminals draw those themselves, from corner to corner and
// meeting the full blocks (xterm.js and so VS Code, Windows Terminal, kitty, Ghostty,
// WezTerm), where they leave ◢ ◣ ◤ ◥ to the font, which draws them inside the cell.
// Its edges are straight, but as steep as a cell is tall (about 63°), not 45°: no
// character a terminal draws itself makes a 45° edge. The other styles keep the
// board's two-cell square: `legacy` draws a half with the wedges of Symbols for
// Legacy Computing (45°, but the wedges split a cell in thirds, so an edge bends
// where its cells meet, and xterm.js leaves them to the font); `quadrant` as a stair
// of quarter blocks; `simple` as one font triangle and a space. `ISORITE_LOGO`
// chooses.

export type Corner = "tl" | "tr" | "bl" | "br";

/** A square of the grid: whole, or a half with one corner left empty. */
export interface Shape {
  readonly x: number;
  readonly y: number;
  readonly empty?: Corner;
  readonly growth?: boolean;
}

export type Style = "legacy" | "quadrant" | "simple" | "triangle";

/** One run of cells in one colour. */
export interface Run {
  readonly text: string;
  readonly growth: boolean;
}

export const width = 10;
export const height = 15;

const half = (x: number, y: number, empty: Corner, growth = false): Shape => ({ x, y, empty, growth });
const full = (x: number, y: number, growth = false): Shape => ({ x, y, growth });

// From the board's SVG: a triangle is named by the corner of its square that it leaves empty.
export const shapes: readonly Shape[] = [
  half(4, 0, "tl", true), full(5, 0, true), half(6, 0, "tr", true),
  half(4, 1, "bl", true), full(5, 1, true), half(6, 1, "br", true),
  half(9, 3, "br"), half(8, 3, "tl"),
  half(8, 4, "br"), half(7, 4, "tl"),
  half(7, 5, "br"), half(6, 5, "tl"),
  half(6, 6, "br"), half(5, 6, "tl"),
  half(0, 7, "bl"), half(1, 8, "bl"), half(2, 9, "bl"), half(3, 10, "bl"), half(4, 11, "bl"),
  half(1, 7, "tr"), half(2, 8, "tr"), half(3, 9, "tr"), half(4, 10, "tr"),
  full(5, 7), full(5, 8), full(5, 9), full(5, 10), full(5, 11), full(5, 12), full(5, 13), full(5, 14),
];

export const glyphs: Record<Style, Record<Corner | "full", string>> = {
  // Each pair is one square: the left cell, then the right.
  legacy: {
    full: "██",
    tl: "\u{1FB4A}\u{1FB42}", // lower right block, from the lower left to the upper right
    tr: "\u{1FB4D}\u{1FB3F}", // lower left block, from the upper left to the lower right
    bl: "\u{1FB63}\u{1FB55}", // upper right block, from the upper left to the lower right
    br: "\u{1FB60}\u{1FB58}", // upper left block, from the lower left to the upper right
  },
  quadrant: { full: "██", tl: "▗▟", tr: "▙▖", bl: "▝▜", br: "▛▘" },
  simple: { full: "██", tl: " ◢", tr: "◣ ", bl: " ◥", br: "◤ " },
  // A square one cell: its halves straight from corner to corner, steeper than 45° as a cell is taller than wide.
  // Powerline's triangles, which terminals draw themselves, edge to edge (xterm.js and so VS Code, Windows
  // Terminal, kitty, Ghostty, WezTerm): ◢ ◣ ◥ ◤ are left to the font, which draws them inside the cell.
  triangle: { full: "█", tl: "\u{E0BA}", tr: "\u{E0B8}", bl: "\u{E0BE}", br: "\u{E0BC}" },
};

/** A square of the style left empty: as many spaces as it is cells wide. */
export function blank(style: Style): string {
  return " ".repeat([...glyphs[style].full].length);
}

/** The mark's rows, each a list of runs, 10 cells wide in `triangle`, 20 in the others. */
export function rows(style: Style = "quadrant"): Run[][] {
  const grid: (Shape | undefined)[][] = Array.from({ length: height }, () => Array(width).fill(undefined));
  for (const shape of shapes) grid[shape.y]![shape.x] = shape;
  return grid.map((row) => {
    const runs: Run[] = [];
    for (const shape of row) {
      const text = shape ? glyphs[style][shape.empty ?? "full"] : blank(style);
      const growth = shape?.growth ?? false;
      const last = runs.at(-1);
      if (last && (last.growth === growth || !text.trim())) runs[runs.length - 1] = { text: last.text + text, growth: last.growth };
      else runs.push({ text, growth });
    }
    return runs;
  });
}

/** The mark as plain lines, for tests and for terminals without colour. */
export function lines(style: Style = "quadrant"): string[] {
  return rows(style).map((runs) => runs.map((run) => run.text).join(""));
}
