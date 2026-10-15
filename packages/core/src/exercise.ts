// An exercise: a note of the study base, of `type: Exercise`, that names the
// notes it tests. The text before its `## Working` heading is the question;
// everything after is the person's working. Which part of the working is the
// answer is not in the file: it goes into the `attempt` event when the
// exercise is sent for marking, so the file stays plain Markdown.
//
//   ---
//   type: Exercise
//   kind: written
//   title: The entropy of a fair coin
//   tests: [Fundamentals/entropy]
//   next: Fundamentals/entropy-of-a-die        (optional: the exercise that follows it)
//   generated: { by: "iso:…", at: … }
//   ---
//
//   Show that the entropy of a fair coin is one bit.
//
//   ## Working
//
//   …
//
// Marking marks passages of the working right or wrong, each named by its text
// (a Passage, as a rewrite names what it rewrites), and judges how the attempt
// moves each note it tests (understanding.ts).

import { dumpFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { findPassage, passageOf, type Passage } from "./journal.ts";
import { testsOf } from "./study.ts";
import { text as plain } from "./text.ts";
import { lowest, type Move, type Result, type Understanding } from "./understanding.ts";
import type { LearnerEvent } from "./record.ts";

export const WORKING = "## Working";
const WORKING_RE = /^##[ \t]+Working[ \t]*$/m;

export class ExerciseError extends Error {}

export interface Exercise {
  kind: string;
  title: string;
  tests: string[];
  /** The exercise that follows this one in teaching order, by its id in the study base, or null. */
  next: string | null;
  /** The text between the frontmatter and the working's heading, trimmed. */
  question: string;
  /** Where the working starts in the file: the line after its heading. With no heading, the file's end. */
  from: number;
  /** The working as written: from `from` to the end of the file. */
  working: string;
  /** Whether the file has the heading yet. */
  headed: boolean;
}

/** Read an exercise's file. A file that is not an exercise still reads: its whole body is the question. */
export function exercise(source: string): Exercise {
  let meta: Record<string, unknown> = {}, body = source;
  try { const [m, b] = splitFrontmatter(source); meta = m ?? {}; body = b; } catch { /* unreadable frontmatter: all body */ }
  const start = source.length - body.length;
  const m = WORKING_RE.exec(body);
  const headEnd = m ? start + m.index + m[0].length : source.length;
  const from = m ? Math.min(source.length, headEnd + (source[headEnd] === "\n" ? 1 : 0)) : source.length;
  const next = plain(meta.next ?? "").replace(/^\//, "").replace(/\.md$/, "");
  return {
    kind: plain(meta.kind ?? "") || "written",
    title: plain(meta.title ?? ""),
    tests: testsOf(meta),
    next: next || null,
    question: (m ? body.slice(0, m.index) : body).trim(),
    from,
    working: source.slice(from),
    headed: !!m,
  };
}

/** The file of a new exercise. */
export function exerciseText(e: { title: string; tests: string[]; question: string; by: string; at: string; kind?: string; next?: string | null }): string {
  const meta: Record<string, unknown> = { type: "Exercise", kind: e.kind ?? "written", title: e.title, tests: e.tests };
  if (e.next) meta.next = e.next;
  meta.generated = { by: e.by, at: e.at };
  return `---\n${dumpFrontmatter(meta)}---\n\n${e.question.trim()}\n\n${WORKING}\n\n`;
}

/** The same file with `next` set (or taken out, with null). */
export function withNext(source: string, next: string | null): string {
  const [meta, body] = splitFrontmatter(source);
  const m: Record<string, unknown> = { ...(meta ?? {}) };
  if (next) m.next = next; else delete m.next;
  return `---\n${dumpFrontmatter(m)}---\n${body.startsWith("\n") ? "" : "\n"}${body}`;
}

// ------------------------------------------------------------ marking

export type Mark = "right" | "wrong";
export interface MarkedPassage { passage: Passage; mark: Mark }

export interface Marking {
  result: Result;
  marks: MarkedPassage[];
  /** Passages Iso quoted that are not in the working, and so were not marked. */
  dropped: number;
  moves: Record<string, Move>;
}

const RESULTS: readonly Result[] = ["right", "partly", "wrong"];
const MOVES = [-1, -0.5, 0, 0.5, 1];
export const MAX_WHY = 300;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where a quote is in `source` between `from` and `to`, ignoring differences in runs of white space. Each later call
 *  with the same quote finds the next place, through `after`. */
function findQuote(source: string, quote: string, from: number, to: number, after: number): { from: number; to: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const re = new RegExp(words.map(escape).join("\\s+"), "g");
  re.lastIndex = Math.max(from, after);
  const m = re.exec(source);
  if (!m || m.index + m[0].length > to) return null;
  return { from: m.index, to: m.index + m[0].length };
}

/** Read Iso's reply to a marking, against the exercise's file as it was sent. The reply is one JSON object (it may
 *  stand in a code fence, or have words around it):
 *
 *    {"result": "partly",
 *     "marks": [{"quote": "exact words from the working", "mark": "right"}, …],
 *     "moves": {"<note id>": {"by": 0.5, "why": "one line"}, …}}
 *
 *  Every note tested must have a move, and no other. A quote not found in the working is dropped and counted. */
export function markingReply(reply: string, source: string, tests: readonly string[]): Marking {
  const open = reply.indexOf("{"), close = reply.lastIndexOf("}");
  if (open < 0 || close < open) throw new ExerciseError("the reply has no marking in it");
  let raw: unknown;
  try { raw = JSON.parse(reply.slice(open, close + 1)); } catch { throw new ExerciseError("the marking is not valid JSON"); }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ExerciseError("the marking is not an object");
  const r = raw as Record<string, unknown>;
  if (!RESULTS.includes(r.result as Result)) throw new ExerciseError(`the result is one of ${RESULTS.join(", ")}`);

  const ex = exercise(source);
  const marks: MarkedPassage[] = [], last = new Map<string, number>();
  let dropped = 0;
  for (const m of Array.isArray(r.marks) ? r.marks : []) {
    const q = typeof m === "object" && m ? (m as Record<string, unknown>) : {};
    if (typeof q.quote !== "string" || (q.mark !== "right" && q.mark !== "wrong")) throw new ExerciseError("each mark is a quote and right or wrong");
    const key = q.quote.trim().replace(/\s+/g, " ");
    const at = findQuote(source, q.quote, ex.from, source.length, last.get(key) ?? 0) ?? findQuote(source, q.quote, ex.from, source.length, 0);
    if (!at) { dropped++; continue; }
    last.set(key, at.to);
    marks.push({ passage: passageOf(source, at.from, at.to), mark: q.mark });
  }

  const moves: Record<string, Move> = {};
  const given = typeof r.moves === "object" && r.moves && !Array.isArray(r.moves) ? (r.moves as Record<string, unknown>) : {};
  for (const note of Object.keys(given)) if (!tests.includes(note)) throw new ExerciseError(`a move for a note the exercise does not test: ${note}`);
  for (const note of tests) {
    const g = given[note];
    const v = typeof g === "object" && g ? (g as Record<string, unknown>) : null;
    if (!v || typeof v.by !== "number" || !MOVES.includes(v.by)) throw new ExerciseError(`a move for ${note} of −1, −½, 0, +½ or +1`);
    moves[note] = { by: v.by, why: plain(v.why ?? "").trim().slice(0, MAX_WHY) };
  }
  return { result: r.result as Result, marks, dropped, moves };
}

/** Where each mark falls in the file as it is now. A passage edited away is left out. */
export function placeMarks(source: string, marks: readonly MarkedPassage[]): { from: number; to: number; mark: Mark }[] {
  const out: { from: number; to: number; mark: Mark }[] = [];
  for (const m of marks) { const at = findPassage(source, m.passage); if (at) out.push({ ...at, mark: m.mark }); }
  return out.sort((a, b) => a.from - b.from);
}

// ------------------------------------------------------------ the study list

export interface Listed {
  id: string;
  tests: string[];
  /** The last attempt's result, or null if never tried. */
  result: Result | null;
  /** When it was last attempted, as a time, or null. */
  last: number | null;
  /** The lowest reading among the notes it tests. */
  squares: number;
  due: boolean;
}

/** Every exercise, in the order the study page lists them: due first, then never tried, then the fewest squares,
 *  then the longest since tried. `exercises` are the study base's exercise ids with what they test; `events` the
 *  record in time order; `readings` what `understanding` made of it. */
export function studyList(exercises: readonly { id: string; tests: readonly string[] }[], events: readonly LearnerEvent[], readings: Map<string, Understanding>): Listed[] {
  const lastOf = new Map<string, { result: Result; at: number }>();
  for (const e of events) {
    if (e.event !== "attempt" || typeof e.exercise !== "string") continue;
    const at = Date.parse(String(e.at));
    if (!Number.isNaN(at)) lastOf.set(e.exercise, { result: e.result as Result, at });
  }
  const out: Listed[] = exercises.map(({ id, tests }) => {
    const l = lastOf.get(id), low = lowest(readings, tests);
    return { id, tests: [...tests], result: l?.result ?? null, last: l?.at ?? null, squares: low.squares, due: low.due };
  });
  const rank = (x: Listed): number => (x.due ? 0 : x.last === null ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.squares - b.squares || (a.last ?? 0) - (b.last ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
