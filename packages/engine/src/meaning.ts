// Search by meaning: notes found by what they say, in other words than
// theirs. Each note is cut at its headings into pieces; each piece is turned
// into a vector by a small model that runs on the device (behind the Embedder
// port: nothing is sent anywhere); a question is turned into a vector the
// same way, and the nearest pieces are the answer. Carried over from
// rdstudio's embed.ts.
//
// The vectors are a cache, kept outside both repositories, each under a
// fingerprint of the text it was made from. So an edited section is the only
// one made again, a note moved or renamed costs nothing, and an edit made
// outside the app is caught the next time anything is looked for.

import { sha256, type Bundle } from "@isorite/core";
import type { Files } from "./ports.ts";

/** The model that turns text into vectors, wherever it runs. */
export interface Embedder {
  /** Its name: a cache made with another model is made again. */
  model: string;
  dim: number;
  embed(text: string): Promise<Float32Array>;
}

const MAX_PIECE = 1800; // characters: a longer section is cut at its paragraphs, so that all of it is read
const QUERY = "Represent this sentence for searching relevant passages: "; // how bge is asked a question
/** This many pieces without a vector are made at once, before a search; more are left to the background. */
export const INLINE = 12;

/** A piece of a note: a section, or part of a long one, with the text a vector is made from. */
export interface Piece {
  note: string;
  heading: string;
  /** The piece's own text, as written. */
  body: string;
  /** What is embedded: the note's title and description, the heading, the text. */
  text: string;
  /** A fingerprint of `text`: what its vector is kept under. */
  key: string;
}

const fingerprint = (text: string) => sha256(text).slice(0, 20);

/** Every note cut into pieces: at its first- and second-level headings (not inside a code fence), and a long section at its paragraphs. */
export function pieces(b: Bundle): Piece[] {
  const out: Piece[] = [];
  for (const c of b.concepts.values()) {
    const lead = `${c.title}. ${c.description ?? ""}`.trim();
    const mine: Piece[] = [];
    const add = (heading: string, body: string) => {
      const text = `${lead}\n${heading}\n${body}`.trim();
      mine.push({ note: c.id, heading, body, text, key: fingerprint(text) });
    };
    const flush = (heading: string, lines: string[]) => {
      const body = lines.join("\n").trim();
      if (body.length < 40) return; // a heading with nothing under it
      if (body.length <= MAX_PIECE) { add(heading, body); return; }
      let run = "";
      for (const para of body.split(/\n\s*\n/)) {
        if (run && run.length + para.length + 2 > MAX_PIECE) { add(heading, run); run = ""; }
        run = run ? `${run}\n\n${para}` : para;
      }
      if (run.trim()) add(heading, run);
    };
    let heading = "", lines: string[] = [], fence = false;
    for (const line of c.body.split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const m = fence ? null : /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line);
      if (m) { flush(heading, lines); heading = m[2]!; lines = []; } else lines.push(line);
    }
    flush(heading, lines);
    if (!mine.length) add("", c.body.trim()); // a note too short to cut still has its title and description
    out.push(...mine);
  }
  return out;
}

/** A vector at unit length, as bytes: a 127th of a step loses nothing that changes an order. */
function pack(v: Float32Array): Int8Array {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return Int8Array.from(v, (x) => Math.round((x / s) * 127));
}

const toBase64 = (v: Int8Array): string => btoa(String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
const fromBase64 = (s: string): Int8Array => Int8Array.from(atob(s), (ch) => (ch.charCodeAt(0) << 24) >> 24);

export interface Hit { note: string; heading: string; score: number; body: string }
export interface Found {
  hits: Hit[];
  /** Pieces with no vector yet: they are not found by meaning until they are made. */
  pending: number;
  /** False while there is nothing to search: the first pass over the base has not got anywhere yet. */
  ready: boolean;
}

export class Meaning {
  private readonly embedder: Embedder;
  private readonly cache: Files;
  private readonly file: string;
  private vectors: Map<string, Int8Array> | null = null;
  private making: Promise<{ made: number; pieces: number }> | null = null;
  private again: Bundle | null = null;

  /** `cache` is a folder outside both repositories; `file` names this base's vectors in it. */
  constructor(embedder: Embedder, cache: Files, file: string) { this.embedder = embedder; this.cache = cache; this.file = file; }

  private async load(): Promise<Map<string, Int8Array>> {
    if (this.vectors) return this.vectors;
    const vectors = new Map<string, Int8Array>();
    try {
      const raw = JSON.parse((await this.cache.read(this.file)) ?? "{}") as { model?: string; dim?: number; vectors?: Record<string, string> };
      // Another model's vectors are made again.
      if (raw.model === this.embedder.model && raw.dim === this.embedder.dim && raw.vectors) {
        for (const [key, b64] of Object.entries(raw.vectors)) { const v = fromBase64(b64); if (v.length === this.embedder.dim) vectors.set(key, v); }
      }
    } catch { /* an unreadable cache is made again */ }
    return (this.vectors = vectors);
  }

  private async save(vectors: Map<string, Int8Array>): Promise<void> {
    const out: Record<string, string> = {};
    for (const [key, v] of vectors) out[key] = toBase64(v);
    await this.cache.write(this.file, JSON.stringify({ model: this.embedder.model, dim: this.embedder.dim, vectors: out }));
  }

  /** How much of the base has a vector. */
  async state(b: Bundle): Promise<{ pieces: number; missing: number }> {
    const ps = pieces(b), vectors = await this.load();
    return { pieces: ps.length, missing: ps.filter((p) => !vectors.has(p.key)).length };
  }

  /** Make a vector for every piece that has none, and forget the ones no piece has any more. One pass at a time:
   *  asked again while one runs, it runs once more after, on the newer base. */
  refresh(b: Bundle, onProgress?: (done: number, of: number) => void): Promise<{ made: number; pieces: number }> {
    if (this.making) { this.again = b; return this.making; }
    this.making = (async () => {
      const ps = pieces(b), vectors = await this.load();
      const wanted = new Set(ps.map((p) => p.key));
      const todo = ps.filter((p) => !vectors.has(p.key)).filter((p, k, all) => all.findIndex((q) => q.key === p.key) === k);
      const stale = [...vectors.keys()].filter((k) => !wanted.has(k));
      if (!todo.length && !stale.length) return { made: 0, pieces: ps.length };
      for (const k of stale) vectors.delete(k);
      let made = 0;
      for (const p of todo) {
        vectors.set(p.key, pack(await this.embedder.embed(p.text)));
        made++;
        if (made % 40 === 0) { await this.save(vectors); onProgress?.(made, todo.length); } // a search meanwhile finds what is done so far, and a stop loses little
      }
      await this.save(vectors);
      return { made, pieces: ps.length };
    })().finally(() => {
      this.making = null;
      const next = this.again;
      this.again = null;
      if (next) void this.refresh(next).catch(() => undefined);
    });
    return this.making;
  }

  /** The notes nearest in meaning to a text: each note once, by its nearest piece. */
  async similar(b: Bundle, text: string, opts: { limit?: number; under?: string } = {}): Promise<Found> {
    const ps = pieces(b);
    let vectors = await this.load();
    let missing = ps.filter((p) => !vectors.has(p.key));
    // A few (a note just edited, here or elsewhere) are made now, so the search sees them; many are left to the background.
    if (missing.length && missing.length <= INLINE && !this.making) {
      await this.refresh(b);
      vectors = await this.load();
      missing = ps.filter((p) => !vectors.has(p.key));
    } else if (missing.length) void this.refresh(b).catch(() => undefined);
    if (ps.length && missing.length === ps.length) return { hits: [], pending: missing.length, ready: false };
    const q = pack(await this.embedder.embed(QUERY + text)), dim = this.embedder.dim;
    const under = opts.under?.replace(/^\/+|\/+$/g, "");
    const best = new Map<string, Hit>();
    for (const p of ps) {
      if (under && !p.note.startsWith(under + "/")) continue;
      const v = vectors.get(p.key);
      if (!v) continue;
      let s = 0;
      for (let i = 0; i < dim; i++) s += q[i]! * v[i]!;
      const score = s / (127 * 127);
      if (score > (best.get(p.note)?.score ?? -Infinity)) best.set(p.note, { note: p.note, heading: p.heading, score, body: p.body });
    }
    const hits = [...best.values()].sort((x, y) => y.score - x.score || (x.note < y.note ? -1 : 1)).slice(0, Math.max(1, Math.min(opts.limit ?? 8, 15)));
    return { hits, pending: missing.length, ready: true };
  }
}
