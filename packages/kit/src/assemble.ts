// The host's side of an artifact (plan-m23 §3.3, §3.4): its manifest, and the one document a sandboxed frame is given
// through srcdoc, or a standalone export saves. Pure string work, so the app, the server's headless check and the
// guide's site all build the same document.

/** What an artifact says of itself in its <meta> tags. */
export interface Manifest {
  title: string;
  description: string;
  author: string;
  date: string;
  /** The kit it was written for ("1"), or null: an HTML file of its own, shown as it is. */
  kit: string | null;
  /** The data files it reads, relative to it. */
  uses: string[];
}

/** The kit's built files, by name (packages/kit/build.ts). */
export type KitFiles = Record<"kit.js" | "chart.js" | "model.js" | "isorite.css" | "plain.css" | "kit.css", string>;
export type Part = "chart" | "model";

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function meta(html: string, name: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0], n = tag.match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1];
    if (n?.toLowerCase() === name) return unescape(tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i)?.slice(1).find((x) => x !== undefined) ?? "");
  }
  return null;
}
export function manifestOf(html: string): Manifest {
  return {
    title: unescape(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ""),
    description: meta(html, "description") ?? "",
    author: meta(html, "author") ?? "",
    date: meta(html, "date") ?? "",
    kit: meta(html, "isorite:kit"),
    uses: (meta(html, "isorite:uses") ?? "").split(/[\s,]+/).filter(Boolean),
  };
}

/** The kit's parts an artifact uses beyond the core: Plot with a chart, three.js with 3D. */
export function partsUsed(html: string): Part[] {
  const parts: Part[] = [];
  if (/<iso-chart[\s>]|\bPlot\.\w/.test(html)) parts.push("chart");
  if (/<iso-model[\s>]|<iso-chart3d[\s>]|\bTHREE\.\w/.test(html)) parts.push("model");
  return parts;
}

/** No network from an artifact, ever (Q112): anything it tries to fetch fails, and the error reaches Iso. */
export const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'">`;

const safe = (t: string) => t.replace(/<\/(script|style)/gi, "<\\/$1");
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export interface Assembly {
  look?: string; // "isorite" (default) or "plain"
  ground?: string; // "lapis" or "quartz"
  /** For a standalone export: the data inside the document, by the path the artifact reads it at. */
  data?: Record<string, string | Uint8Array>;
}

/** The artifact as one document: the CSP, the kit's themes, components and the parts it uses, inlined at the top of
 *  its head (any kit <link> or <script src> it wrote is taken out), with its data too for a standalone export. */
export function assemble(html: string, kit: KitFiles, opts: Assembly = {}): string {
  const look = opts.look ?? "isorite", ground = opts.ground ?? "lapis";
  const body = html
    .replace(/<link\b[^>]*\bhref\s*=\s*["'](?:\.\/)?kit\/[^"']*["'][^>]*>\s*/gi, "")
    .replace(/<script\b[^>]*\bsrc\s*=\s*["'](?:\.\/)?kit\/[^"']*["'][^>]*>\s*<\/script>\s*/gi, "");
  const data = Object.entries(opts.data ?? {}).map(([p, v]) => typeof v === "string"
    ? `<script type="text/plain" data-path="${attr(p)}">${safe(v)}</script>`
    : `<script type="application/octet-stream" data-encoding="base64" data-path="${attr(p)}">${base64(v)}</script>`);
  const parts = partsUsed(body).map((p) => `<script>\n${safe(kit[`${p}.js`])}\n</script>`);
  const head = [
    CSP,
    `<style data-look="isorite">\n${safe(kit["isorite.css"])}\n</style>`,
    `<style data-look="plain">\n${safe(kit["plain.css"])}\n</style>`,
    `<style>\n${safe(kit["kit.css"])}\n</style>`,
    ...data,
    `<script>\n${safe(kit["kit.js"])}\n</script>`,
    ...parts,
  ].join("\n");
  const doc = /<head\b[^>]*>/i.test(body) ? body.replace(/<head\b[^>]*>/i, (h) => `${h}\n${head}\n`) : `<!doctype html><html><head><meta charset="utf-8">\n${head}\n</head><body>${body}</body></html>`;
  return doc.replace(/<html\b([^>]*)>/i, (_, a: string) => `<html${a.replace(/\s+data-(?:look|ground)\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, "")} data-look="${look}" data-ground="${ground}">`);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
