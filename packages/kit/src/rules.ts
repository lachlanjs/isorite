// The rules an artifact on the kit keeps (plan-m23 §3.7), checked from the file alone: by write_artifact before it
// writes, and by isorite check. Each is said so that a weak model can act on it.

import { manifestOf } from "./assemble.ts";

export interface Broken { rule: number; level: "error" | "warning"; message: string }
export interface RuleContext {
  /** The files beside the artifact it could read (paths relative to it). Unknown: not checked. */
  files?: string[];
  /** Each data file's columns, where known (from read_data's shape). */
  columns?: Record<string, string[]>;
  /** The uses write_artifact was given, which must match the manifest. */
  uses?: string[];
}
export const LIMIT = 200_000;

const COLUMN_ATTRS = ["x", "y", "z", "by", "column", "columns", "at"];
const TAG = /<(iso-[\w-]+)\b([^>]*)>/gi;
const attrsOf = (s: string) => Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1]!.toLowerCase(), m[2]!]));

/** The files an artifact reads, from its markup and script: data="…", an iso-model's src, iso.data/text/bytes("…"). */
export function readsOf(html: string): string[] {
  const own = html.replace(/<!--[\s\S]*?-->/g, ""), reads = new Set<string>();
  for (const r of own.matchAll(/iso\.(?:data|text|bytes)\(\s*["'`]([^"'`$]+)["'`]/g)) reads.add(r[1]!);
  for (const t of own.matchAll(TAG)) { const a = attrsOf(t[2]!); (a.data ?? "").split(/[\s,]+/).filter(Boolean).forEach((f) => reads.add(f)); if (t[1]!.toLowerCase() === "iso-model" && a.src) reads.add(a.src); }
  return [...reads];
}

export function checkArtifact(html: string, ctx: RuleContext = {}): Broken[] {
  const out: Broken[] = [], m = manifestOf(html);
  const err = (rule: number, message: string) => out.push({ rule, level: "error", message });
  const warn = (rule: number, message: string) => out.push({ rule, level: "warning", message });
  // What it says of itself, without the parts the host replaces.
  const own = html.replace(/<!--[\s\S]*?-->/g, "");

  // 1. The manifest.
  if (m.kit === null) err(1, 'no <meta name="isorite:kit" content="1">: without it isorite gives it no kit');
  if (!m.title) err(1, "no <title>");
  if (!m.description) err(1, 'no <meta name="description" content="…">: one sentence on what it shows');

  // 2. Every file it reads is in isorite:uses, and every one there exists.
  const reads = new Set<string>();
  for (const r of own.matchAll(/iso\.(?:data|text|bytes)\(\s*["'`]([^"'`$]+)["'`]/g)) reads.add(r[1]!);
  const files = (a: Record<string, string>) => (a.data ?? "").split(/[\s,]+/).filter(Boolean);
  for (const t of own.matchAll(TAG)) { const a = attrsOf(t[2]!); files(a).forEach((f) => reads.add(f)); if (t[1]!.toLowerCase() === "iso-model" && a.src) reads.add(a.src); }
  for (const r of reads) if (!m.uses.includes(r)) err(2, `it reads ${r}, which isn't in <meta name="isorite:uses">`);
  if (ctx.files) for (const u of m.uses) if (!ctx.files.includes(u)) err(2, `${u} is in isorite:uses but there's no such file beside it${ctx.files.length ? ` (there are: ${ctx.files.join(", ")})` : ""}`);
  if (ctx.uses && [...ctx.uses].sort().join() !== [...m.uses].sort().join()) err(2, `isorite:uses (${m.uses.join(" ") || "none"}) and the uses given (${ctx.uses.join(" ") || "none"}) differ`);

  // 3. The columns an element names are in its data.
  if (ctx.columns) for (const t of own.matchAll(TAG)) {
    // Several files are one table, with a `file` column naming each row's.
    const a = attrsOf(t[2]!), fs = files(a), known = fs.map((f) => ctx.columns![f]);
    if (!fs.length || known.some((k) => !k)) continue;
    const have = [...new Set(known.flat() as string[]), ...(fs.length > 1 ? ["file"] : [])];
    for (const k of COLUMN_ATTRS) for (const c of (a[k] ?? "").split(/[\s,]+/).filter(Boolean)) {
      const name = c.replace(/^abs\((.+)\)$/, "$1");
      if (k === "at" && t[1]!.toLowerCase() !== "iso-chart3d" && !have.includes(name)) continue; // a state name
      if (!have.includes(name)) err(3, `<${t[1]} data="${a.data}" ${k}="${a[k]}">: ${a.data} has no column "${name}" (it has ${have.join(", ")})`);
    }
  }

  // 4. No look of its own: the theme gives every colour, font and corner.
  const code = own.replace(/<meta\b[^>]*>/gi, "").replace(/\btone\s*=\s*"[^"]*"/g, "");
  const colour = code.match(/#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/i)
    ?? code.match(/\b(?:fill|stroke|fillStyle|strokeStyle|color|background(?:-color)?|shadowColor|border(?:-color)?)\s*[:=]\s*["'`]?(?:white|black|red|blue|green|gray|grey|orange|yellow|purple|pink|navy|teal|silver)\b/i);
  if (colour) err(4, `a colour of its own (${colour[0].trim().slice(0, 40)}): use the theme's, var(--lattice) in CSS or iso.tokens().lattice in script`);
  const font = code.match(/font-family\s*:\s*[^;"}]*|\bfont\s*[:=]\s*["'`]?[^;"'`}]*(?<![.\w-])(?:sans-serif|serif|monospace|Arial|Helvetica|system-ui|Georgia|Times|Courier|Inter|Roboto)\b/i);
  if (font && !/var\(--font|\$\{/.test(font[0])) err(4, `a font of its own (${font[0].slice(0, 50)}): use var(--font-ui), var(--font-text) or iso.tokens().ui`);
  if (/border-radius\s*:/i.test(code)) err(4, "border-radius: the theme decides corners");

  // 5. No network.
  const urls = code.replace(/http:\/\/www\.w3\.org\/[\w/.-]+/g, "").match(/\bhttps?:\/\/[^\s"'`)<]+/);
  if (urls) err(5, `a web address (${urls[0].slice(0, 60)}): an artifact reaches nothing outside the file`);
  if (/<script\b[^>]*\bsrc\s*=/i.test(code.replace(/<script\b[^>]*\bsrc\s*=\s*["'](?:\.\/)?kit\/[^"']*["'][^>]*>/gi, ""))) err(5, "a <script src>: everything is in the file, and the kit is given");
  if (/<link\b[^>]*\bhref\s*=\s*["'](?!(?:\.\/)?kit\/)/i.test(code)) err(5, "a <link href>: everything is in the file, and the kit is given");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(|\bimport\s*\(/.test(code)) err(5, "fetch, XMLHttpRequest or import(): read files with iso.data(path)");

  // 6. Size.
  if (html.length > LIMIT) err(6, `${Math.round(html.length / 1024)} kB, over 200 kB: keep data in a data file, not in the page`);

  // 7. No directive text (docs/taste.md): a control's label says what it is, not what to do.
  const words = own.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ");
  const directive = words.match(/\b(?:drag(?:ging)? to|click (?:here|to|on)|tap to|scroll to|hover (?:to|over)|use the slider|press (?:the|play)|try (?:dragging|moving|clicking))\b[^.]*/i);
  if (directive) warn(7, `text that explains how to use it ("${directive[0].trim().slice(0, 60)}"): say what a thing is, not what to do with it`);
  return out;
}
