// Two changes to one note, made from the same text at the same time (you writing, an agent's edit), put together when
// they are to different paragraphs. The unit is a paragraph (the blank lines between are units too), so the pieces join
// back to the text exactly. Each side's changes are found against the text both began from; where none of yours touches a
// paragraph of theirs, both are kept. Where they do (the same paragraph changed on both sides, or two things put in at
// the same place), there is no merge, and the choice is yours as before.

/** The text as paragraphs and the blank lines between them (and the newline that ends it), each a piece of its own:
 *  joined, they are the text again. Apart, a paragraph taken out or put in leaves the ones beside it as they were. */
export function paragraphs(text: string): string[] {
  return text.split(/(\n{2,}|\n+$)/).filter(Boolean);
}

/** base[from, to) replaced by insert. */
type Hunk = { from: number; to: number; insert: string[] };

/** What changed from a to b, as hunks over a, by their longest common sequence of paragraphs. Null when too large to
 *  work out here. */
function hunks(a: string[], b: string[]): Hunk[] | null {
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return null;
  // Lengths of the longest common sequences of the tails.
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: Hunk[] = [];
  let i = 0, j = 0, open: Hunk | null = null;
  const close = (): void => { if (open) { out.push(open); open = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { close(); i++; j++; continue; }
    open ??= { from: i, to: i, insert: [] };
    if (j < m && (i === n || L[i]![j + 1]! >= L[i + 1]![j]!)) open.insert.push(b[j++]!);
    else open.to = ++i;
  }
  close();
  return out;
}

const same = (x: Hunk, y: Hunk): boolean => x.from === y.from && x.to === y.to && x.insert.length === y.insert.length && x.insert.every((p, k) => p === y.insert[k]);
const inserts = (h: Hunk): boolean => h.from === h.to;
/** Whether two changes, one from each side, are to the same place. */
function clash(x: Hunk, y: Hunk): boolean {
  if (same(x, y)) return false;
  if (!inserts(x) && !inserts(y)) return x.from < y.to && y.from < x.to;
  if (inserts(x) && inserts(y)) return x.from === y.from;
  const [p, r] = inserts(x) ? [x.from, y] : [y.from, x];
  return r.from < p && p < r.to;
}

/** Yours and theirs, both from `base`, put together: null when they change the same paragraph. */
export function merge3(base: string, mine: string, theirs: string): string | null {
  if (mine === theirs || theirs === base) return mine;
  if (mine === base) return theirs;
  const B = paragraphs(base), hm = hunks(B, paragraphs(mine)), ht = hunks(B, paragraphs(theirs));
  if (!hm || !ht) return null;
  for (const x of hm) for (const y of ht) if (clash(x, y)) return null;
  // Both, in the order of the text; a change made on both sides, once. Something put in where the other side's change
  // begins comes before it.
  const all = [...hm, ...ht.filter((y) => !hm.some((x) => same(x, y)))].sort((x, y) => x.from - y.from || Number(inserts(y)) - Number(inserts(x)));
  const out: string[] = [];
  let at = 0;
  for (const h of all) { out.push(...B.slice(at, h.from), ...h.insert); at = h.to; }
  out.push(...B.slice(at));
  return out.join("");
}
