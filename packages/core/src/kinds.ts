// Open questions and problems (M12): notes of the base with a type of their own, OKF's `type` (format §5).
//
//   type: Question   about: [ids]   resolved: <date>, or absent while open
//   type: Problem    uses: [ids]    solved: <date>, or absent while not
//
// A note embeds one on a line of its own, `[[!name]]`, by its file name without .md, or by its path where two
// share the name. The embed counts as an `about` (or a `uses`) of the note it is in.

import { linkTexts } from "./markdown.ts";
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

/** A link out of the base (M12, F1): to the web, or to code in the base's repository, `code:src/sim.py#L40`
 *  (`#L40-L52` for lines), resolved against `repository` in `.isorite/settings.toml`. */
export type Outward =
  | { kind: "web"; href: string; text: string }
  | { kind: "code"; href: string; text: string; path: string; line?: number; end?: number };

/** A code link's file and lines, or null when it is not one, or names a path outside the repository. */
export function codeTarget(href: string): { path: string; line?: number; end?: number } | null {
  const m = /^code:([^#?]+)(?:#L(\d+)(?:-L?(\d+))?)?$/.exec(href.trim());
  if (!m) return null;
  const path = decodeURIComponent(m[1]!).replace(/^\.?\/+/, "");
  if (!path || path.split("/").some((p) => p === ".." || !p)) return null;
  return { path, ...(m[2] ? { line: Number(m[2]) } : {}), ...(m[3] ? { end: Number(m[3]) } : {}) };
}

/** A note's links out of the base, in order, each once. */
export function outwardLinks(body: string): Outward[] {
  const out: Outward[] = [], seen = new Set<string>();
  for (const { href, text: words } of linkTexts(body)) {
    if (seen.has(href)) continue;
    if (/^https?:\/\//i.test(href)) out.push({ kind: "web", href, text: words || href.replace(/^https?:\/\/(www\.)?/i, "") });
    else { const c = codeTarget(href); if (!c) continue; out.push({ kind: "code", href, text: words || c.path.split("/").at(-1)!, ...c }); }
    seen.add(href);
  }
  return out;
}
