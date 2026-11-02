// Frontmatter: the YAML block between `---` lines at the top of a note (OKF §3),
// read as YAML 1.2 (core schema): `yes` and `on` are text, `010` is ten, and
// dates stay as written.

import { parseDocument, stringify } from "yaml";
import { rstrip, strip } from "./text.ts";

export class FrontmatterError extends Error {}

export type Meta = Record<string, unknown>;

const BOM = "\ufeff";

/** The frontmatter's YAML text (with its last line break, as in the file) and
 *  the body; the YAML is null when the note has none. */
export function frontmatterText(source: string): [string | null, string] {
  const text = source.startsWith(BOM) ? source.slice(1) : source;
  if (!text.startsWith("---")) return [null, text];
  const lines = text.split("\n");
  if (strip(lines[0]!) !== "---") return [null, text];
  for (let i = 1; i < lines.length; i++) {
    if (rstrip(lines[i]!) === "---") return [lines.slice(1, i).join("\n") + "\n", lines.slice(i + 1).join("\n")];
  }
  throw new FrontmatterError("frontmatter block is not closed with '---'");
}

/** Parse frontmatter YAML as the core reads it. */
export function parseYaml(raw: string): ReturnType<typeof parseDocument> {
  // CR and CRLF are line breaks in YAML; the parser only sees a trailing CR as
  // part of the last value, so normalise them first.
  return parseDocument(raw.replace(/\r\n?/g, "\n"), { version: "1.2", schema: "core", uniqueKeys: false });
}

/** `[frontmatter, body]`; frontmatter is null when the note has none. */
export function splitFrontmatter(source: string): [Meta | null, string] {
  const [raw, body] = frontmatterText(source);
  if (raw === null) return [null, body];
  let meta: unknown = {};
  if (strip(raw)) {
    const doc = parseYaml(raw);
    // Tags the core schema does not know (such as !foo) are errors, as in the Python core.
    const problem = doc.errors[0] ?? doc.warnings.find((w) => w.code === "TAG_RESOLVE_FAILED");
    if (problem) throw new FrontmatterError(`unparseable YAML frontmatter: ${problem.message}`);
    meta = doc.toJS({ maxAliasCount: 1000 });
  }
  if (meta === null || meta === undefined) meta = {};
  if (typeof meta !== "object" || Array.isArray(meta)) throw new FrontmatterError("frontmatter is not a mapping");
  return [meta as Meta, body.replace(/^\n+/, "")];
}

/** A frontmatter line `key: value` at the top level whose value the YAML parser refused, such as an unquoted
 *  colon (`title: Foo: bar`) or a value starting with a backtick, `%` or `@`: agents write these often. The value
 *  is put in double quotes, for those lines alone, and the text kept as it was otherwise. Null when the
 *  frontmatter reads already, or the quotes would not make it read (an unclosed list, say): the note is left as written. */
export function repairFrontmatter(source: string): { text: string; fixed: string[] } | null {
  try { if (frontmatterText(source)[0] === null) return null; } catch { return null; }
  const bom = source.startsWith(BOM) ? BOM : "", lines = source.slice(bom.length).split("\n");
  let close = 1;
  while (rstrip(lines[close]!) !== "---") close++;
  const raw = lines.slice(1, close).join("\n") + "\n";
  const bad = new Set<number>();
  for (const e of parseYaml(raw).errors) { const at = e.linePos?.[0]?.line; if (at) bad.add(at); }
  const fixed: string[] = [];
  for (const n of bad) {
    // Only a plain scalar after a top-level key; a quoted, flow or block value is the author's own.
    const m = /^([A-Za-z_][\w .-]*):[ \t]+(\S.*?)[ \t]*(\r?)$/.exec(lines[n] ?? "");
    if (!m || /^["'\[{|>&*!#]/.test(m[2]!)) continue;
    lines[n] = `${m[1]}: ${JSON.stringify(m[2])}${m[3]}`;
    fixed.push(m[1]!);
  }
  if (!fixed.length) return null;
  if (parseYaml(lines.slice(1, close).join("\n") + "\n").errors.length) return null;
  return { text: bom + lines.join("\n"), fixed };
}

/** Serialise frontmatter, keeping key order. */
export function dumpFrontmatter(meta: Meta): string {
  return stringify(meta, { version: "1.2", lineWidth: 100 });
}
