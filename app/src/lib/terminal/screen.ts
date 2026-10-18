// A terminal's screen, as `tmux capture-pane -e` keeps it, drawn on a canvas a cell at a time: the replay of the
// terminal's tour (`isorite tutorial term`) on the tutorial's site. Block, shade, box-drawing and Powerline
// characters are drawn as shapes, as terminals draw them, so that they meet from cell to cell whatever the font.

export interface Cell {
  ch: string;
  fg: string | null;
  bg: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  dim: boolean;
}

const PALETTE = ["#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5", "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff"];
function indexed(n: number): string {
  if (n < 16) return PALETTE[n]!;
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  const c = [0, 95, 135, 175, 215, 255], k = n - 16;
  return `rgb(${c[Math.floor(k / 36)]},${c[Math.floor(k / 6) % 6]},${c[k % 6]})`;
}

/** The screen's rows of cells, from its text with SGR escapes. */
export function parseScreen(text: string): Cell[][] {
  let st = { fg: null as string | null, bg: null as string | null, bold: false, italic: false, underline: false, strike: false, dim: false };
  const reset = () => ({ fg: null, bg: null, bold: false, italic: false, underline: false, strike: false, dim: false });
  return text.replace(/\n$/, "").split("\n").map((line) => {
    const row: Cell[] = [];
    for (const part of line.split(/(\x1b\[[0-9;:]*m)/)) {
      const sgr = /^\x1b\[([0-9;:]*)m$/.exec(part);
      if (sgr) {
        const a = (sgr[1] || "0").split(/[;:]/).map(Number);
        for (let k = 0; k < a.length; k++) {
          const v = a[k]!;
          if (v === 0) st = reset();
          else if (v === 1) st.bold = true;
          else if (v === 2) st.dim = true;
          else if (v === 3) st.italic = true;
          else if (v === 4) st.underline = true;
          else if (v === 9) st.strike = true;
          else if (v === 22) { st.bold = false; st.dim = false; }
          else if (v === 23) st.italic = false;
          else if (v === 24) st.underline = false;
          else if (v === 29) st.strike = false;
          else if (v === 39) st.fg = null;
          else if (v === 49) st.bg = null;
          else if (v >= 30 && v <= 37) st.fg = indexed(v - 30);
          else if (v >= 90 && v <= 97) st.fg = indexed(v - 82);
          else if (v >= 40 && v <= 47) st.bg = indexed(v - 40);
          else if (v >= 100 && v <= 107) st.bg = indexed(v - 92);
          else if (v === 38 || v === 48) {
            let colour: string | null = null;
            if (a[k + 1] === 2) { colour = `rgb(${a[k + 2]},${a[k + 3]},${a[k + 4]})`; k += 4; }
            else if (a[k + 1] === 5) { colour = indexed(a[k + 2]!); k += 2; }
            if (v === 38) st.fg = colour; else st.bg = colour;
          }
        }
        continue;
      }
      for (const ch of part) row.push({ ch, ...st });
    }
    return row;
  });
}

// Box drawing by its arms: up, right, down, left, each 0 (none), 1 (light) or 2 (heavy); dashed where it says so.
const BOX: Record<string, [number, number, number, number, boolean?]> = {
  "─": [0, 1, 0, 1], "━": [0, 2, 0, 2], "│": [1, 0, 1, 0], "┃": [2, 0, 2, 0], "╌": [0, 1, 0, 1, true], "╎": [1, 0, 1, 0, true],
  "┄": [0, 1, 0, 1, true], "┆": [1, 0, 1, 0, true], "┌": [0, 1, 1, 0], "┐": [0, 0, 1, 1], "└": [1, 1, 0, 0], "┘": [1, 0, 0, 1],
  "╭": [0, 1, 1, 0], "╮": [0, 0, 1, 1], "╰": [1, 1, 0, 0], "╯": [1, 0, 0, 1], "┏": [0, 2, 2, 0], "┓": [0, 0, 2, 2], "┗": [2, 2, 0, 0],
  "┛": [2, 0, 0, 2], "├": [1, 1, 1, 0], "┤": [1, 0, 1, 1], "┬": [0, 1, 1, 1], "┴": [1, 1, 0, 1], "┼": [1, 1, 1, 1], "╹": [2, 0, 0, 0],
  "╻": [0, 0, 2, 0], "╸": [0, 0, 0, 2], "╺": [0, 2, 0, 0], "╵": [1, 0, 0, 0], "╷": [0, 0, 1, 0], "╴": [0, 0, 0, 1], "╶": [0, 1, 0, 0],
};
// Blocks by the quarters they fill: upper left, upper right, lower left, lower right; or a rectangle in eighths.
const QUARTERS: Record<string, number> = { "▘": 1, "▝": 2, "▀": 3, "▖": 4, "▌": 5, "▞": 6, "▛": 7, "▗": 8, "▚": 9, "▐": 10, "▜": 11, "▄": 12, "▙": 13, "▟": 14, "█": 15 };
const EIGHTHS: Record<string, [number, number, number, number]> = {
  "▁": [0, 7, 8, 1], "▂": [0, 6, 8, 2], "▃": [0, 5, 8, 3], "▅": [0, 3, 8, 5], "▆": [0, 2, 8, 6], "▇": [0, 1, 8, 7], "▔": [0, 0, 8, 1],
  "▏": [0, 0, 1, 8], "▎": [0, 0, 2, 8], "▍": [0, 0, 3, 8], "▋": [0, 0, 5, 8], "▊": [0, 0, 6, 8], "▉": [0, 0, 7, 8], "▕": [7, 0, 1, 8],
};
const SHADES: Record<string, number> = { "░": 0.25, "▒": 0.5, "▓": 0.75 };
// Triangles from corner to corner, as Powerline's and the geometric ones: their corners in the cell's unit square.
const TRIANGLES: Record<string, [number, number][]> = {
  "\u{E0B8}": [[0, 0], [0, 1], [1, 1]], "◣": [[0, 0], [0, 1], [1, 1]],
  "\u{E0BA}": [[1, 0], [1, 1], [0, 1]], "◢": [[1, 0], [1, 1], [0, 1]],
  "\u{E0BC}": [[0, 0], [1, 0], [0, 1]], "◤": [[0, 0], [1, 0], [0, 1]],
  "\u{E0BE}": [[0, 0], [1, 0], [1, 1]], "◥": [[0, 0], [1, 0], [1, 1]],
};

export interface Metrics { cell: number; row: number; size: number }

/** The size of a cell for the font at `size` pixels, as a terminal lays it out. */
export function measure(ctx: CanvasRenderingContext2D, size: number): Metrics {
  ctx.font = `${size}px "Ioskeley Mono", ui-monospace, monospace`;
  return { cell: ctx.measureText("M").width, row: Math.round(size * 1.3), size };
}

/** Draws the screen, its unset colours `fg` on `bg`. The canvas is sized by the caller. */
export function drawScreen(ctx: CanvasRenderingContext2D, rows: Cell[][], m: Metrics, fg: string, bg: string): void {
  const { cell: w, row: h, size } = m;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textBaseline = "middle";
  // Every background first: a glyph wider than its cell (◆, say) is not then cut by the next cell's.
  rows.forEach((row, r) => row.forEach((c, k) => {
    if (c.bg) { ctx.fillStyle = c.bg; ctx.fillRect(k * w, r * h, w + 0.5, h + 0.5); }
  }));
  rows.forEach((row, r) => {
    const y = r * h;
    row.forEach((c, k) => {
      const x = k * w;
      if (c.ch === " ") return;
      ctx.globalAlpha = c.dim ? 0.6 : 1;
      ctx.fillStyle = ctx.strokeStyle = c.fg ?? fg;
      const quarters = QUARTERS[c.ch], eighths = EIGHTHS[c.ch], shade = SHADES[c.ch], tri = TRIANGLES[c.ch], box = BOX[c.ch];
      if (quarters !== undefined) {
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([qx, qy], q) => { if (quarters >> q & 1) ctx.fillRect(x + qx! * w / 2, y + qy! * h / 2, w / 2 + 0.5, h / 2 + 0.5); });
      } else if (eighths) {
        ctx.fillRect(x + eighths[0] * w / 8, y + eighths[1] * h / 8, eighths[2] * w / 8 + 0.5, eighths[3] * h / 8 + 0.5);
      } else if (shade !== undefined) {
        ctx.globalAlpha *= shade;
        ctx.fillRect(x, y, w + 0.5, h + 0.5);
      } else if (tri) {
        ctx.beginPath();
        tri.forEach(([tx, ty], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + tx * (w + 0.5), y + ty * (h + 0.5)));
        ctx.closePath();
        ctx.fill();
      } else if (box) {
        const [up, right, down, left, dashed] = box, cx = x + w / 2, cy = y + h / 2;
        const line = (weight: number) => Math.max(1, Math.round(size / (weight === 2 ? 7 : 14)));
        const arm = (weight: number, x0: number, y0: number, x1: number, y1: number) => {
          if (!weight) return;
          ctx.lineWidth = line(weight);
          ctx.setLineDash(dashed ? [Math.max(2, (x1 - x0 || y1 - y0) / 3)] : []);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        };
        const wide = line(Math.max(up, right, down, left)) / 2;
        arm(up, cx, y, cx, cy + (left || right ? wide : 0));
        arm(down, cx, cy - (left || right ? wide : 0), cx, y + h);
        arm(left, x, cy, cx + (up || down ? wide : 0), cy);
        arm(right, cx - (up || down ? wide : 0), cy, x + w, cy);
        ctx.setLineDash([]);
      } else {
        ctx.font = `${c.italic ? "italic " : ""}${c.bold ? "700 " : ""}${size}px "Ioskeley Mono", ui-monospace, monospace`;
        ctx.fillText(c.ch, x, y + h / 2);
        if (c.underline) ctx.fillRect(x, y + h - 2, w, 1);
        if (c.strike) ctx.fillRect(x, y + h / 2, w, 1);
      }
      ctx.globalAlpha = 1;
    });
  });
}
