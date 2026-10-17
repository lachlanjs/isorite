// The notes a note for Iso is linked to, as the Atlas changes them: a link picked on the map is a line of its
// own at the foot of what was written, so it can be taken away again without touching the prose. And where a
// draft's block sits on the map, which is remembered in this browser only.

import { spliceText, splitFrontmatter, testsOf } from "@isorite/core";

const LINK = /\]\(\/([^)\s#]+)\.md(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g;
const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const address = (id: string): string => id.split("/").map(encodeURIComponent).join("/");

/** The notes a text links to, in the order it first names them: the order they are sent to Iso in. */
export function linkedIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LINK)) { const id = decodeURIComponent(m[1]!); if (!out.includes(id)) out.push(id); }
  return out;
}

/** The text with a link to a note added, on a line of its own at the foot. */
export function withLink(text: string, id: string, title: string): string {
  const body = text.replace(/\s+$/, ""), own = new RegExp(`^\\[[^\\]\\n]*\\]\\(/[^)\\n]*\\.md\\)$`);
  // Picked links stand together: one after another, a blank line after what was written.
  const gap = !body || body.endsWith("---") ? "\n\n" : own.test(body.split("\n").at(-1)!) ? "\n" : "\n\n";
  return `${body}${gap}[${title.replace(/[[\]]/g, "")}](/${address(id)}.md)\n`;
}

/** The text without its link to a note, where every such link is a line of its own. Null where one is in the
 *  prose: that is theirs to take out. */
export function withoutLink(text: string, id: string): string | null {
  const one = `\\[[^\\]\\n]*\\]\\(/${escaped(address(id))}\\.md\\)`;
  const lines = text.split("\n"), kept = lines.filter((l) => !new RegExp(`^${one}$`).test(l.trim()));
  if (kept.length === lines.length || linkedIn(kept.join("\n")).includes(id)) return null;
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
}

/** For a request for an exercise, the notes it tests, in order; null for any other draft. Picking on the map adds
 *  to these instead of linking. */
export function testsIn(text: string): string[] | null {
  try { const [meta] = splitFrontmatter(text); return meta?.type === "Exercise" ? testsOf(meta) : null; } catch { return null; }
}

/** The request with a note added to its tests, or taken out if it was there. */
export function withTest(text: string, id: string): string {
  const tests = testsIn(text) ?? [];
  return spliceText(text, { tests: tests.includes(id) ? tests.filter((t) => t !== id) : [...tests, id] }, null);
}

/** A draft's title, from the head of its file. */
export function titleIn(text: string): string {
  const m = /^title:[ \t]*(.*)$/m.exec(text.split(/^---\s*$/m)[1] ?? "");
  return (m?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
}

/** Tokens, short: 940, 1.2k, 14k. */
export const short = (n: number): string => (n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`);

const KEY = "isorite.atlas.drafts";
type Places = Record<string, { gx: number; gy: number }>;
const places = (): Places => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Places; } catch { return {}; } };
/** Where a draft's block was put: the cell held on. */
export const placeOf = (draft: string): { gx: number; gy: number } | null => places()[draft] ?? null;
export function place(draft: string, at: { gx: number; gy: number } | null): void {
  try {
    const all = places();
    if (at) all[draft] = at; else delete all[draft];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* a browser that keeps nothing: the block goes beside the map */ }
}
