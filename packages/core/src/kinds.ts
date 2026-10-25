// Open questions and problems (M12): notes of the base with a type of their own, OKF's `type` (format §5).
//
//   type: Question   about: [ids]   resolved: <date>, or absent while open
//   type: Problem    uses: [ids]    solved: <date>, or absent while not
//
// A note embeds one on a line of its own, `[[!name]]`, by its file name without .md, or by its path where two
// share the name. The embed counts as an `about` (or a `uses`) of the note it is in.

import { text } from "./text.ts";

export type Kind = "note" | "question" | "problem";

export function kindOf(type: string): Kind {
  const t = type.trim().toLowerCase();
  return t === "question" ? "question" : t === "problem" ? "problem" : "note";
}

/** The field naming what a kind is about, and the one saying it is done. */
export const ABOUT: Record<Exclude<Kind, "note">, "about" | "uses"> = { question: "about", problem: "uses" };
export const DONE: Record<Exclude<Kind, "note">, "resolved" | "solved"> = { question: "resolved", problem: "solved" };

/** Note ids from frontmatter: a list, or one; `/a/b.md` and `a/b` alike. */
export function idsOf(raw: unknown): string[] {
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  return list.map((t) => text(t).trim().replace(/^\/+/, "").replace(/\.md$/, "")).filter(Boolean);
}

/** When it was resolved or solved, as written (a date), or null while it is open. */
export function doneOf(meta: Record<string, unknown>, kind: Kind): string | null {
  if (kind === "note") return null;
  const v = meta[DONE[kind]];
  if (v === null || v === undefined || v === false || v === "") return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : text(v);
}

/** An embed: `[[!name]]` alone on a line, outside code. */
const EMBED = /^[ \t]*\[\[!([^\]\n]+)\]\][ \t]*$/;

/** The embeds in a note's body, in order, as written (a name, or a path). */
export function embedRefs(body: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = EMBED.exec(line);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}

/** The embed that names a note, in its shortest form: its file name, or its path where the name is shared. */
export function embedFor(id: string, ids: Iterable<string>): string {
  const name = id.split("/").at(-1)!;
  let shared = 0;
  for (const other of ids) if (other.split("/").at(-1) === name) shared++;
  return `[[!${shared > 1 ? id : name}]]`;
}
