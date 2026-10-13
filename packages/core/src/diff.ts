// Differences between two versions of a note, by line: what the journal
// keeps, so that any earlier version can be rebuilt.

export interface Hunk {
  /** The line in the earlier version, from 0, where lines are removed and added. */
  at: number;
  del: string[];
  ins: string[];
}

export class DiffError extends Error {}

const TABLE_LIMIT = 4_000_000; // cells of the comparison table; past this the changed middle is one hunk

export function diffLines(a: readonly string[], b: readonly string[]): Hunk[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start;
  if (!n && !m) return [];
  if (!n || !m || n * m > TABLE_LIMIT) return [{ at: start, del: a.slice(start, endA), ins: b.slice(start, endB) }];
  // Longest common subsequence of the two middles, from the end backwards so it is read forwards.
  const w = m + 1, table = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    table[i * w + j] = a[start + i] === b[start + j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!);
  }
  const out: Hunk[] = [];
  let open: Hunk | null = null, i = 0, j = 0;
  const hunk = (): Hunk => (open ??= (out.push({ at: start + i, del: [], ins: [] }), out[out.length - 1]!));
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) { open = null; i++; j++; }
    else if (j < m && (i === n || table[i * w + j + 1]! >= table[(i + 1) * w + j]!)) { hunk().ins.push(b[start + j]!); j++; }
    else { hunk().del.push(a[start + i]!); i++; }
  }
  return out;
}

/** The later version, from the earlier and the hunks. Throws if the hunks were not made from `a`. */
export function applyHunks(a: readonly string[], hunks: readonly Hunk[]): string[] {
  const out: string[] = [];
  let at = 0;
  for (const h of hunks) {
    if (h.at < at || h.at + h.del.length > a.length) throw new DiffError("a hunk is out of place");
    for (let k = 0; k < h.del.length; k++) if (a[h.at + k] !== h.del[k]) throw new DiffError("a hunk does not match the text");
    out.push(...a.slice(at, h.at), ...h.ins);
    at = h.at + h.del.length;
  }
  out.push(...a.slice(at));
  return out;
}
