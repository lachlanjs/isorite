// A note as the terminal draws it (`Terminal-Note`): its blocks, each marked in the gutter by who wrote most of it
// (your square, an open square for a change made outside isorite, Iso's diamond, an agent's grey one), and the
// changes waiting to be kept, each after the block it belongs to.

import { authors, blocks, findPassage, locate, pending, type Entry } from "@isorite/core";

export type Mark = "you" | "outside" | "iso" | "agent" | "";
export type Kind = "heading" | "math" | "code" | "figure" | "text";

export interface ViewBlock { type: "block"; kind: Kind; text: string; mark: Mark }
/** A change waiting to be kept: new text (`old` absent), or a passage rewritten. `key` names it to keep or remove. */
export interface ViewChange { type: "change"; key: string; proposal: string; region?: number; who: string; asked: string; old?: string; text: string; placed: boolean }
export type Item = ViewBlock | ViewChange;

export function markOf(who: string): Mark {
  return who === "you" ? "you" : who === "external" ? "outside" : who.startsWith("iso:") ? "iso" : who.startsWith("agent:") ? "agent" : "";
}

function kindOf(text: string): Kind {
  return /^#{1,6}\s/.test(text) ? "heading" : text.startsWith("$$") ? "math" : /^(```|~~~)/.test(text) ? "code" : /^!\[[^\]]*\]\([^)]*\)\s*$/.test(text) ? "figure" : "text";
}

/** The note's blocks and its waiting changes, in reading order. */
export function noteView(text: string, entries: readonly Entry[]): Item[] {
  const all = blocks(text), owners = authors(entries);
  // A block's mark: who wrote the most of its lines, the later writer on a tie.
  const marked = all.map((b): ViewBlock => {
    const counts = new Map<string, number>();
    for (let line = b.from; line < b.to; line++) { const who = owners?.[line]; if (who) counts.set(who, (counts.get(who) ?? 0) + 1); }
    let best = "", most = 0;
    for (const [who, n] of counts) if (n >= most) { best = who; most = n; }
    return { type: "block", kind: kindOf(b.text), text: b.text, mark: best ? markOf(best) : "" };
  });
  // Each change after the block it belongs to; one whose place is gone, at the end.
  const after = new Map<number, ViewChange[]>(), end: ViewChange[] = [];
  const put = (line: number | null, c: ViewChange) => {
    if (line === null) { end.push(c); return; }
    let k = -1;
    for (let i = 0; i < all.length; i++) if (all[i]!.from <= line) k = i;
    after.set(k, [...(after.get(k) ?? []), c]);
  };
  const lineOf = (char: number) => text.slice(0, char).split("\n").length - 1;
  for (const p of pending([...entries])) {
    const base = { type: "change" as const, proposal: p.id, who: p.who, asked: p.asked };
    if (p.form === "insert") {
      const at = locate(text, p);
      // An insert goes at a line between blocks: it belongs after the block that ends there.
      const line = at?.form === "insert" ? at.line - 1 : null;
      put(line, { ...base, key: `p:${p.id}`, text: p.text, placed: line !== null });
      continue;
    }
    for (const k of p.open ?? p.regions.map((_, i) => i)) {
      const region = p.regions[k]!, at = findPassage(text, region.old);
      put(at ? lineOf(at.from) : null, { ...base, key: `${p.id}:${k}`, region: k, old: region.old.text, text: region.new, placed: at !== null });
    }
  }
  const out: Item[] = [...(after.get(-1) ?? [])];
  marked.forEach((b, k) => { out.push(b, ...(after.get(k) ?? [])); });
  return [...out, ...end];
}
