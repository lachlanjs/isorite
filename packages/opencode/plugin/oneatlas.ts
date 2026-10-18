// One note's Atlas in terminal cells (`Terminal-Atlas`): what it requires on the left, the note in the middle, what
// builds on it on the right, each a box of two lines of title, joined by routes. The neighbourhood is the core's
// `reach`, as the browser's Atlas lights a chosen note; only the drawing is the terminal's.

export type Role = "text" | "faint" | "ls" | "req" | "bld" | "gold" | "blank";
export interface Cell { ch: string; role: Role; bold?: boolean }
export interface Box { id: string; title: string; gold?: boolean }

export const GAP = 5;
const BOX_H = 4, STEP = BOX_H + 1;

/** A title in two lines of a box's width, cut with an ellipsis past that. */
export function wrapTitle(title: string, width: number): [string, string] {
  const words = title.split(/\s+/).filter(Boolean), lines: string[] = [""];
  for (const w of words) {
    const last = lines[lines.length - 1]!;
    if (!last) lines[lines.length - 1] = w;
    else if (last.length + 1 + w.length <= width) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const cut = (s: string) => (s.length > width ? s.slice(0, width - 1) + "…" : s);
  if (lines.length > 2) return [cut(lines[0]!), cut(lines.slice(1).join(" ")).slice(0, width - 1) + "…"];
  return [cut(lines[0] ?? ""), cut(lines[1] ?? "")];
}

// Box drawing by which sides a cell joins: up, down, left, right.
const JOIN: Record<string, string> = {
  "0011": "─", "1100": "│", "0101": "┌", "0110": "┐", "1001": "└", "1010": "┘",
  "1101": "├", "1110": "┤", "0111": "┬", "1011": "┴", "1111": "┼", "0001": "─", "0010": "─", "1000": "│", "0100": "│",
};

/** The grid of cells for a note and its neighbours, `width` cells wide. */
export function drawAtlas(me: Box, requires: Box[], builds: Box[], width: number): Cell[][] {
  const col = Math.max(12, Math.min(24, Math.floor((width - 2 * GAP) / 3)));
  const rows = Math.max(BOX_H, requires.length * STEP - 1, builds.length * STEP - 1);
  const W = 3 * col + 2 * GAP;
  const grid: Cell[][] = Array.from({ length: rows }, () => Array.from({ length: W }, (): Cell => ({ ch: " ", role: "blank" })));
  const put = (x: number, y: number, ch: string, role: Role, bold = false) => { if (grid[y]?.[x]) grid[y]![x] = { ch, role, ...(bold ? { bold } : {}) }; };

  const box = (x: number, y: number, b: Box, kind: "plain" | "me" | "dashed") => {
    const [h, v, c] = kind === "me" ? ["━", "┃", "┏┓┗┛"] : kind === "dashed" ? ["╌", "╎", "┌┐└┘"] : ["─", "│", "┌┐└┘"];
    const role: Role = b.gold ? "gold" : kind === "me" ? "text" : "ls";
    for (let i = 1; i < col - 1; i++) { put(x + i, y, h, role, kind === "me"); put(x + i, y + BOX_H - 1, h, role, kind === "me"); }
    for (let j = 1; j < BOX_H - 1; j++) { put(x, y + j, v, role, kind === "me"); put(x + col - 1, y + j, v, role, kind === "me"); }
    put(x, y, c[0]!, role, kind === "me"); put(x + col - 1, y, c[1]!, role, kind === "me");
    put(x, y + BOX_H - 1, c[2]!, role, kind === "me"); put(x + col - 1, y + BOX_H - 1, c[3]!, role, kind === "me");
    wrapTitle(b.title, col - 4).forEach((line, j) => [...line].forEach((ch, i) => put(x + 2 + i, y + 1 + j, ch, kind === "me" ? "text" : b.gold ? "gold" : "text", kind === "me")));
  };

  // A side's routes, in the gap between its boxes (their edge at `boxes`) and the note (its edge at `note`): each
  // box's middle row to a trunk in the middle of the gap, and the trunk to the note's middle row.
  const routes = (rowsOf: number[], boxes: number, note: number, role: Role) => {
    if (!rowsOf.length) return;
    const trunk = Math.floor((boxes + note) / 2), at = new Map<string, number[]>();
    const join = (x: number, y: number, k: number) => { const j = at.get(`${x},${y}`) ?? [0, 0, 0, 0]; j[k] = 1; at.set(`${x},${y}`, j); };
    const across = (y: number, a: number, b: number) => { for (let x = Math.min(a, b); x <= Math.max(a, b); x++) { if (x > Math.min(a, b)) join(x, y, 2); if (x < Math.max(a, b)) join(x, y, 3); } };
    const down = (x: number, a: number, b: number) => { for (let y = Math.min(a, b); y <= Math.max(a, b); y++) { if (y > Math.min(a, b)) join(x, y, 0); if (y < Math.max(a, b)) join(x, y, 1); } };
    for (const y of rowsOf) { across(y, boxes, trunk); down(trunk, y, mid); }
    across(mid, trunk, note);
    for (const [key, j] of at) { const [x, y] = key.split(",").map(Number) as [number, number]; put(x, y, JOIN[j.join("")] ?? "┼", role); }
  };

  const top = (n: number) => Math.floor((rows - (n * STEP - 1)) / 2);
  const meY = Math.floor((rows - BOX_H) / 2), mid = meY + 1;
  const leftTop = top(requires.length), rightTop = top(builds.length);
  routes(requires.map((_, k) => leftTop + k * STEP + 1), col, col + GAP - 1, "req");
  routes(builds.map((_, k) => rightTop + k * STEP + 1), 2 * col + 2 * GAP - 1, 2 * col + GAP, "bld");
  requires.forEach((b, k) => box(0, leftTop + k * STEP, b, "plain"));
  builds.forEach((b, k) => box(2 * col + 2 * GAP, rightTop + k * STEP, b, "dashed"));
  box(col + GAP, meY, me, "me");
  return grid;
}

/** A row of cells as runs of one role, for drawing. */
export function runsOf(row: Cell[]): { text: string; role: Role; bold: boolean }[] {
  const out: { text: string; role: Role; bold: boolean }[] = [];
  for (const c of row) {
    const last = out.at(-1), bold = c.bold ?? false;
    if (last && last.role === c.role && last.bold === bold) last.text += c.ch;
    else out.push({ text: c.ch, role: c.role, bold });
  }
  return out;
}
