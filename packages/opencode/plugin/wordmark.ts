// "isorite" in the letters of OpenCode's home logo, to stand in its place: "iso" muted and "rite" bold, as it draws
// "open" and "code". A letter is three rows high, with a row above it for what rises, in half blocks, and four cells
// wide but for the i. As in OpenCode's, `_` is a cell of the letter's shade, `^` an upper half block on it.

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
