// A note's file as text, taken apart and put back without disturbing what was
// not edited: the frontmatter block, the body, and one frontmatter field at a
// time. Carried over from rdstudio's store. The editor shows the body and a
// few fields; everything else in the file keeps its lines, its order and its
// comments.

import { Document, Scalar, isMap, isScalar, isSeq, type Node, type Pair } from "yaml";
import { FrontmatterError, frontmatterText, parseYaml } from "./frontmatter.ts";

const BOM = "﻿";

/** The file as `[prefix, frontmatter, body]`: `prefix + body` is exactly the text. The prefix is the frontmatter
 *  block with its fences and the blank lines under it; `frontmatter` is the YAML between the fences, or null. */
export function splitSource(text: string): [prefix: string, frontmatter: string | null, body: string] {
  const [raw] = frontmatterText(text);
  if (raw === null) return ["", null, text];
  const open = text.indexOf("\n") + 1; // after the first ---
  let at = open;
  for (const line of text.slice(open).split("\n")) {
    at += line.length + 1;
    if (line.replace(/\s+$/u, "") === "---") break;
  }
  at = Math.min(at, text.length);
  while (text[at] === "\n" || (text[at] === "\r" && text[at + 1] === "\n")) at += text[at] === "\r" ? 2 : 1;
  return [text.slice(0, at), raw, text.slice(at)];
}

// Flat lists inline ([a, b]); text with line breaks as a literal block.
const YAML_STYLE = { lineWidth: 100, flowCollectionPadding: false, indentSeq: false } as const;

function node(doc: Document, value: unknown): Node {
  const n = doc.createNode(value) as Node;
  const style = (x: unknown): void => {
    if (isSeq(x)) {
      if (x.items.length && x.items.every((i) => isScalar(i) && !String(i.value).includes("\n"))) x.flow = true;
      else x.items.forEach(style);
    } else if (isMap(x)) {
      x.items.forEach((p) => style(p.value));
    } else if (isScalar(x) && typeof x.value === "string" && x.value.includes("\n")) {
      x.type = Scalar.BLOCK_LITERAL;
    }
  };
  style(n);
  return n;
}

/** One top-level field as it is written, ending in a line break. */
function fieldText(key: string, value: unknown): string {
  const doc = new Document({}, { version: "1.2" });
  const n = node(doc, value);
  // A flat mapping on one line, as {by: ..., at: ...} is written elsewhere.
  if (isMap(n) && n.items.every((p) => isScalar(p.value) && !String(p.value.value).includes("\n"))) n.flow = true;
  doc.set(key, n);
  return doc.toString(YAML_STYLE);
}

const lineStart = (text: string, at: number): number => text.lastIndexOf("\n", at - 1) + 1;
const lineEnd = (text: string, at: number): number => {
  const nl = text.indexOf("\n", at);
  return nl < 0 ? text.length : nl + 1;
};

/** Change top-level frontmatter fields in `raw` (null removes one), touching only their lines; new fields go at
 *  the end, or `type` at the start. */
export function editFrontmatter(raw: string, changes: Record<string, unknown>): string {
  let text = raw && !raw.endsWith("\n") ? raw + "\n" : raw;
  for (const [key, value] of Object.entries(changes)) {
    const doc = parseYaml(text);
    if (doc.errors.length) throw new FrontmatterError(`unparseable YAML frontmatter: ${doc.errors[0]!.message}`);
    if (text.trim() && !isMap(doc.contents)) throw new FrontmatterError("frontmatter is not a mapping");
    const items = isMap(doc.contents) ? (doc.contents.items as Pair[]) : [];
    const pair = items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === key);
    const replacement = value === null || value === undefined ? "" : fieldText(key, value);
    if (pair) {
      const keyRange = (pair.key as { range?: [number, number, number] }).range!;
      const valueRange = (pair.value as { range?: [number, number, number] } | null)?.range;
      const start = lineStart(text, keyRange[0]);
      const end = lineEnd(text, Math.max(keyRange[1], (valueRange?.[1] ?? keyRange[1]) - 1));
      text = text.slice(0, start) + replacement + text.slice(end);
    } else if (replacement) {
      text = key === "type" ? replacement + text : text + replacement;
    }
  }
  return text;
}

/** The file `before` with frontmatter fields changed and, when `body` is not null, its body replaced. What was
 *  not changed is kept to the character, the file's line endings and byte-order mark included. */
export function spliceText(before: string, changes: Record<string, unknown>, body: string | null): string {
  const bom = before.startsWith(BOM) ? BOM : "";
  const [prefix, raw, oldBody] = splitSource(bom ? before.slice(1) : before);
  let head = prefix;
  if (Object.keys(changes).length) {
    const front = editFrontmatter((raw ?? "").replace(/\r\n/g, "\n"), changes);
    // Keep the blank lines that separated the frontmatter from the body.
    const gap = raw === null ? "\n" : prefix.slice(prefix.lastIndexOf("---") + 3).replace(/^[^\n]*\n/, "");
    head = `---\n${front}---\n${gap}`;
    if (before.includes("\r\n")) head = head.replace(/\r?\n/g, "\r\n");
  }
  let newBody = oldBody;
  if (body !== null) newBody = before.includes("\r\n") ? body.replace(/\r?\n/g, "\r\n") : body;
  return bom + head + newBody;
}
