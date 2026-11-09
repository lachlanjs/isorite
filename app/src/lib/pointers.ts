// Pointers: a stretch of text chosen in a note, a file of the repository or an answer of the agent's, to go in the
// prompt where the words need it ("what does ⟨1⟩ mean next to ⟨2⟩"). In the prompt each is one private character, so
// it moves, copies and goes like any other; on send it is replaced by where it comes from and the text itself, so the
// agent can read the file around it. Pure, so it is easy to test.

export type PointerKind = "note" | "code" | "turn";

export interface Pointer {
  /** Its number, and so its character in the prompt. */
  id: number;
  kind: PointerKind;
  /** A note's id, a file's path in the repository, or "" for an answer of the agent's. */
  ref: string;
  title: string;
  /** The file's lines it covers, from 1 (0 for an answer, which is not in a file). */
  from: number;
  to: number;
  text: string;
  /** The text could not be found again where it was chosen: its lines may be out of date. */
  moved?: boolean;
}

// A pointer's character is in the Unicode private use area: nothing typed or pasted from elsewhere is likely to be one.
const FIRST = 0xe000;
export const COUNT = 0x1900;
export const markOf = (id: number): string => String.fromCharCode(FIRST + id);
export const idOf = (ch: string): number | null => { const n = ch.charCodeAt(0) - FIRST; return n >= 0 && n < COUNT ? n : null; };
export const MARKS = /[-]/g;

const span = (p: Pointer): string => (p.from === p.to ? `${p.from}` : `${p.from}–${p.to}`);
/** Where it is: a note by the path the tools take, a file by its path, an answer by what it is. */
export const where = (p: Pointer): string => (p.kind === "note" ? `/${p.ref}.md` : p.kind === "code" ? p.ref : "the agent's earlier answer");
/** The short form that stands where the pointer was in the sentence. */
export const label = (p: Pointer, n: number): string => `[${n}: ${p.kind === "turn" ? where(p) : `${where(p)} L${span(p)}`}]`;
const quote = (t: string): string => t.replace(/\s+$/, "").split("\n").map((l) => `> ${l}`).join("\n");
/** One pointer as it is copied: where it is, then the text. */
export const full = (p: Pointer): string => (p.kind === "turn" ? `From ${where(p)}:\n${quote(p.text)}` : `${where(p)}, line${p.from === p.to ? "" : "s"} ${span(p)}${p.moved ? " (it may have moved)" : ""}:\n${quote(p.text)}`);

/** The pointers a prompt holds, in order, each once. */
export function used(text: string, get: (id: number) => Pointer | undefined): Pointer[] {
  const seen = new Set<number>(), out: Pointer[] = [];
  for (const ch of text.match(MARKS) ?? []) {
    const id = idOf(ch), p = id === null ? undefined : get(id);
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  return out;
}

/** The prompt as the agent is sent it: each pointer a short label where it stood, and under the prompt what each is. */
export function expand(text: string, get: (id: number) => Pointer | undefined): string {
  const list = used(text, get);
  const body = text.replace(MARKS, (ch) => {
    const id = idOf(ch), p = id === null ? undefined : get(id);
    return p ? label(p, list.indexOf(p) + 1) : "";
  }).trim();
  if (!list.length) return body;
  const blocks = list.map((p, i) => `[${i + 1}] ${full(p)}`);
  return `${body}\n\nWhere I wrote [1], [2] and so on I mean these. Each is in my knowledge base or repository: read the file for the text around it (the quotes are as I chose them, and the lines may have moved since).\n\n${blocks.join("\n\n")}`;
}

const lineOf = (file: string, at: number): number => { let n = 1; for (let i = file.indexOf("\n"); i !== -1 && i < at; i = file.indexOf("\n", i + 1)) n++; return n; };

/** The pointer against the file as it is now: its lines as they were when its text is still there, else where the text is
 *  now (the nearest, if it is in more than one place), else as it was and marked as moved. */
export function relocate(file: string, p: Pointer): Pointer {
  if (p.kind === "turn" || !p.text) return p;
  const lines = file.split("\n");
  if (lines.slice(p.from - 1, p.to).join("\n").includes(p.text)) return { ...p, moved: false };
  let best: { from: number; to: number } | null = null;
  for (let i = file.indexOf(p.text); i !== -1; i = file.indexOf(p.text, i + 1)) {
    const from = lineOf(file, i), to = from + (p.text.split("\n").length - 1);
    if (!best || Math.abs(from - p.from) < Math.abs(best.from - p.from)) best = { from, to };
  }
  return best ? { ...p, ...best, moved: false } : { ...p, moved: true };
}
