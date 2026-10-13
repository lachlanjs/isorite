// A note's blocks: what a handle in the margin holds, and what Iso's text is
// placed against. A block is a run of lines with a blank line above and below;
// a fenced code block or a displayed equation is one block even with blank
// lines inside it. Frontmatter is not a block.
//
// A place in a note is kept as the text of the blocks beside it, never as a
// line number or an offset: a note that has changed since either still has
// the block, or the place is not found. It is never found wrongly.

export interface Block {
  /** The first line, and the line after the last, counted from 0 in the whole file. */
  from: number;
  to: number;
  text: string;
}

/** A block named by its text; `nth` tells apart blocks with the same text, counted from 0. */
export interface Anchor {
  text: string;
  nth: number;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

export function blocks(source: string): Block[] {
  const lines = source.split("\n"), out: Block[] = [];
  let i = 0;
  if (lines[0]?.trimEnd() === "---") {
    const close = lines.findIndex((l, k) => k > 0 && l.trimEnd() === "---");
    if (close > 0) i = close + 1;
  }
  while (i < lines.length) {
    if (!lines[i]!.trim()) { i++; continue; }
    const from = i;
    let fence: string | null = null, maths = false;
    for (; i < lines.length; i++) {
      const line = lines[i]!, t = line.trim();
      if (fence) { if (t.startsWith(fence) && !t.slice(fence.length).trim().replaceAll(fence[0]!, "")) fence = null; continue; }
      if (maths) { if (t.endsWith("$$")) maths = false; continue; }
      if (!t) break;
      const f = FENCE.exec(line);
      if (f) fence = f[1]!;
      else if (t.startsWith("$$") && !(t.length > 2 && t.endsWith("$$"))) maths = true;
    }
    out.push({ from, to: i, text: lines.slice(from, i).join("\n") });
  }
  return out;
}

/** The anchor of the block at `index`. */
export function anchorOf(all: readonly Block[], index: number): Anchor {
  const text = all[index]!.text;
  let nth = 0;
  for (let k = 0; k < index; k++) if (all[k]!.text === text) nth++;
  return { text, nth };
}

/** The index of the block an anchor names, or -1. A block that is now the only one with its text is found whatever its `nth`. */
export function findAnchor(all: readonly Block[], anchor: Anchor): number {
  const same: number[] = [];
  all.forEach((b, k) => { if (b.text === anchor.text) same.push(k); });
  if (same.length === 1) return same[0]!;
  return same[anchor.nth] ?? -1;
}
