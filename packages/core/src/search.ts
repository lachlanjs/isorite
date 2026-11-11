// Deterministic BM25 search over a bundle. Results carry only what is needed
// to decide what to open next (id, title, description, score, a snippet);
// bodies are fetched separately by section.

import type { Bundle, Concept, Trust } from "./bundle.ts";
import { headings } from "./markdown.ts";
import { cmp, strip } from "./text.ts";

const TOKEN = /[a-z0-9]+(?:['’][a-z]+)?/g;
const STOP = new Set(
  ("a an and are as at be by for from has have in is it its of on or that the this to was were " +
    "will with not but if then than so do does did can could should would into about").split(" "),
);
const FIELD_WEIGHTS = { title: 4, tags: 3, description: 2, headings: 2, type: 1, body: 1 } as const;
const K1 = 1.4, B = 0.75;

function stem(token: string): string {
  for (const suffix of ["ness", "ing"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) return token.slice(0, -suffix.length);
  }
  if (token.length > 4 && token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.length > 3 && token.endsWith("s") && !["ss", "us", "is"].some((e) => token.endsWith(e))) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  const found = text.toLowerCase().replaceAll("’", "'").match(TOKEN) ?? [];
  return found.filter((t) => !STOP.has(t)).map(stem);
}

export interface Hit {
  concept: Concept;
  score: number;
  snippet: string;
}

export interface SearchOptions {
  limit?: number;
  type?: string;
  tags?: Iterable<string>;
  trust?: Trust;
  status?: string;
  under?: string;
  /** Only these notes (a lens's, or one of its islands'). */
  only?: ReadonlySet<string>;
}

/** Rounded as Python's round(x, 3) prints it (they differ only on exact ties). */
export const round3 = (x: number): number => Number(x.toFixed(3));

/** What indexing one note gave, kept by the caller between indexes: a note whose indexed fields are the same
 *  is not tokenised again. */
export interface Indexed { fields: string[]; tf: Map<string, number>; length: number }
export class IndexCache extends Map<string, Indexed> {
  /** How many of the cached notes each token is in, kept in step with them. */
  df = new Map<string, number>();
}

export class SearchIndex {
  private readonly bundle: Bundle;
  private readonly docs = new Map<string, Map<string, number>>();
  private readonly lengths = new Map<string, number>();
  private readonly df: Map<string, number>;
  private readonly avgLen: number;

  constructor(bundle: Bundle, cache?: IndexCache) {
    this.bundle = bundle;
    // With a cache, the counts are the cache's, adjusted for the notes that changed; else they are counted here.
    const df = (this.df = cache ? new Map(cache.df) : new Map<string, number>());
    const count = (tf: Map<string, number>, by: number) => { for (const token of tf.keys()) df.set(token, (df.get(token) ?? 0) + by); };
    for (const [cid, c] of bundle.concepts) {
      const have = [c.title, c.tags.join(" "), c.description, c.type, c.body];
      let done = cache?.get(cid);
      if (!done || done.fields.some((f, k) => f !== have[k])) {
        const tf = new Map<string, number>();
        const fields: Record<keyof typeof FIELD_WEIGHTS, string> = {
          title: have[0]!,
          tags: have[1]!,
          description: have[2]!,
          headings: headings(c.body).map((h) => h.text).join(" "),
          type: have[3]!,
          body: have[4]!,
        };
        for (const [name, text] of Object.entries(fields) as [keyof typeof FIELD_WEIGHTS, string][]) {
          for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + FIELD_WEIGHTS[name]);
        }
        if (done) count(done.tf, -1);
        done = { fields: have, tf, length: [...tf.values()].reduce((s, v) => s + v, 0) };
        count(tf, 1);
        cache?.set(cid, done);
      }
      const tf = done.tf;
      this.docs.set(cid, tf);
      this.lengths.set(cid, done.length);
    }
    if (cache) {
      for (const [cid, done] of [...cache]) if (!bundle.concepts.has(cid)) { count(done.tf, -1); cache.delete(cid); }
      for (const [token, n] of df) if (n <= 0) df.delete(token);
      cache.df = df;
    }
    const total = [...this.lengths.values()].reduce((s, v) => s + v, 0);
    this.avgLen = this.lengths.size ? total / this.lengths.size : 0;
  }

  private idf(token: string): number {
    const n = this.docs.size, df = this.df.get(token) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, { limit = 8, type, tags, trust, status, under, only }: SearchOptions = {}): Hit[] {
    const terms = tokenize(query);
    const wanted = new Set([...(tags ?? [])].map((t) => t.toLowerCase()));
    const hits: { concept: Concept; score: number }[] = [];
    for (const [cid, tf] of this.docs) {
      const c = this.bundle.concepts.get(cid)!;
      if (type && c.type.toLowerCase() !== type.toLowerCase()) continue;
      if (wanted.size) {
        const have = new Set(c.tags.map((t) => t.toLowerCase()));
        if (![...wanted].every((t) => have.has(t))) continue;
      }
      if (trust && c.trust !== trust) continue;
      if (status && c.status !== status) continue;
      if (only && !only.has(cid)) continue;
      if (under && !(cid + "/").startsWith(under.replace(/^\/+|\/+$/g, "") + "/")) continue;
      let score = 0;
      const norm = this.avgLen ? K1 * (1 - B + (B * this.lengths.get(cid)!) / this.avgLen) : K1;
      for (const term of terms) {
        const f = tf.get(term) ?? 0;
        if (f) score += (this.idf(term) * f * (K1 + 1)) / (f + norm);
      }
      if (terms.length && score <= 0) continue;
      hits.push({ concept: c, score });
    }
    hits.sort((a, b) => b.score - a.score || cmp(a.concept.id, b.concept.id));
    // A snippet is cut only for the hits that are returned.
    return hits.slice(0, limit).map((h) => ({ ...h, snippet: snippet(h.concept, terms) }));
  }
}

/** The first body line mentioning a query term, trimmed around the match. */
export function snippet(concept: Concept, terms: string[], width = 160): string {
  const termSet = new Set(terms);
  let inFence = false;
  for (const raw of concept.body.split("\n")) {
    const line = strip(raw);
    if (line.startsWith("```") || line.startsWith("~~~")) { inFence = !inFence; continue; }
    if (inFence || !line) continue;
    if (!tokenize(line).some((t) => termSet.has(t))) continue;
    // Python slices by code point; spread the line so astral characters count once.
    const chars = [...line];
    const lower = [...line.toLowerCase()];
    const find = (t: string, from = 0): number => {
      const tt = [...t];
      outer: for (let i = from; i + tt.length <= lower.length; i++) {
        for (let j = 0; j < tt.length; j++) if (lower[i + j] !== tt[j]) continue outer;
        return i;
      }
      return -1;
    };
    const positions = [...termSet].map((t) => find(t)).filter((p) => p >= 0);
    const pos = positions.length ? Math.min(...positions) : 0;
    let start = Math.max(0, pos - Math.floor(width / 3));
    if (start) {
      const space = chars.indexOf(" ", start);
      start = space >= 0 && space < pos ? space + 1 : start;
    }
    const text = chars.slice(start, start + width).join("");
    return (start ? "…" : "") + text + (start + width < chars.length ? "…" : "");
  }
  return [...concept.description].slice(0, width).join("");
}
