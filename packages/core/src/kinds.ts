// Open questions and problems (M12): notes of the base with a type of their own, OKF's `type` (format §5).
//
//   type: Question   about: [ids]   resolved: <date>, or absent while open
//   type: Problem    uses: [ids]    solved: <date>, or absent while not
//
// A note embeds one on a line of its own, `[[!name]]`, by its file name without .md, or by its path where two
// share the name. The embed counts as an `about` (or a `uses`) of the note it is in.

import { citeRefs, linkTexts } from "./markdown.ts";
import { pictureType } from "./picture.ts";
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
  | { kind: "global"; href: string; text: string; id: string }
  | { kind: "code"; href: string; text: string; path: string; line?: number; end?: number; symbol?: string; picture?: true };

/** A code link's file and, after `#`, its lines (`L40-L52`) or the symbol it names (`leapfrog`, `Body.step`: a
 *  function, method or class, found by its name wherever it has moved to, M29). Null when it is not one, or names a
 *  path outside the repository. */
export function codeTarget(href: string): { path: string; line?: number; end?: number; symbol?: string } | null {
  const m = /^code:([^#?]+)(?:#(?:L(\d+)(?:-L?(\d+))?|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)))?$/.exec(href.trim());
  if (!m) return null;
  const path = decodeURIComponent(m[1]!).replace(/^\.?\/+/, "");
  if (!path || path.split("/").some((p) => p === ".." || !p)) return null;
  return { path, ...(m[2] ? { line: Number(m[2]) } : {}), ...(m[3] ? { end: Number(m[3]) } : {}), ...(m[4] ? { symbol: m[4] } : {}) };
}

/** The note of the global base a link names, `global:conventions/naming.md` (an id is never written with a colon, so a
 *  link in this form cannot be taken for a note of the base; docs/format.md): its id, or null when the link is not one,
 *  or names a path with `..`, an empty part or a hidden one. */
export function globalTarget(href: string): string | null {
  const m = /^global:\/?([^#?]+)\.md(?:[#?].*)?$/i.exec(href.trim());
  if (!m) return null;
  const id = decodeURI(m[1]!);
  return id.split("/").some((p) => !p || p.startsWith(".") || p.includes("\\")) ? null : id;
}

/** A link to a note of the global base, as it is written. */
export const globalHref = (id: string): string => `global:${id}.md`;

/** A note's links out of the base, in order, each once. */
export function outwardLinks(body: string): Outward[] {
  const out: Outward[] = [], seen = new Set<string>();
  for (const { href, text: words } of linkTexts(body)) {
    if (seen.has(href)) continue;
    if (/^https?:\/\//i.test(href)) out.push({ kind: "web", href, text: words || href.replace(/^https?:\/\/(www\.)?/i, "") });
    else if (globalTarget(href) !== null) { const id = globalTarget(href)!; out.push({ kind: "global", href, text: words || id.split("/").at(-1)!, id }); }
    else { const c = codeTarget(href); if (!c) continue; out.push({ kind: "code", href, text: words || c.path.split("/").at(-1)!, ...c }); }
    seen.add(href);
  }
  // What from the repository is shown with `![…](code:…)`: a picture (M22), or code, in place (M29). A code link
  // like any other, checked as they are.
  for (const { href, embed, alt } of citeRefs(body)) {
    if (!embed || seen.has(href)) continue;
    const c = codeTarget(href);
    if (!c) continue;
    if (pictureType(c.path)) out.push({ kind: "code", href, text: alt || c.path.split("/").at(-1)!, path: c.path, picture: true });
    else out.push({ kind: "code", href, text: alt || c.symbol || c.path.split("/").at(-1)!, ...c });
    seen.add(href);
  }
  return out;
}
