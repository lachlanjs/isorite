// A picture's size in pixels (M22), read from the head of its file: PNG, GIF, JPEG, WebP and SVG. Null where it
// can't be told (AVIF, or a file that isn't what its name says).

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", avif: "image/avif" };
/** A picture's media type, by its extension, or null when the path isn't a picture's (M22). */
export const pictureType = (path: string): string | null => {
  const dot = path.lastIndexOf(".");
  return dot < 0 || path.lastIndexOf("/") > dot ? null : TYPES[path.slice(dot + 1).toLowerCase()] ?? null;
};

/** The media types a note's picture and an image given the agent may be: what every model that sees images takes. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
/** What an image's bytes say it is (by their first bytes, not by a name or a type that was claimed), or null where they
 *  are none of png, jpeg, gif and webp. */
export function imageType(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const at = (i: number, s: string) => bytes.length >= i + s.length && [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (bytes.length >= 8 && bytes[0] === 0x89 && at(1, "PNG") && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "image/gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  return null;
}
/** The extension a type is kept under. */
export const imageExt = (type: string): string => (type === "image/jpeg" ? "jpg" : type.slice(6));

/** Source and configuration: files that are text and are read as code. */
export const CODE = /\.(tsx?|jsx?|mjs|cjs|py|pyi|rb|go|rs|c|h|cc|cpp|hpp|cs|java|kt|swift|php|lua|sh|bash|zsh|fish|ps1|sql|r|jl|scala|hs|ml|ex|exs|clj|dart|zig|svelte|vue|css|scss|less|toml|ya?ml|ini|cfg|xml|cmake|gradle|proto|graphql)$/i;

const OTHER: Record<string, string> = {
  html: "text/html", htm: "text/html", csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json",
  jsonl: "application/jsonl", ndjson: "application/x-ndjson", txt: "text/plain", tex: "text/plain", pdf: "application/pdf",
  glb: "model/gltf-binary", gltf: "model/gltf+json", stl: "model/stl", obj: "model/obj", zip: "application/zip",
  parquet: "application/vnd.apache.parquet", arrow: "application/vnd.apache.arrow.file", npy: "application/octet-stream",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip", odt: "application/vnd.oasis.opendocument.text",
};
/** Any file's media type in the notes (M23), by its extension: a picture's, one listed, or octet-stream. Null for a
 *  note (Markdown is read as a note, never as a file) and for a path with no extension. */
export const fileType = (path: string): string | null => {
  const dot = path.lastIndexOf(".");
  if (dot < 0 || path.lastIndexOf("/") > dot) return null;
  const ext = path.slice(dot + 1).toLowerCase();
  return ext === "md" ? null : pictureType(path) ?? OTHER[ext] ?? (CODE.test(path) ? "text/plain" : "application/octet-stream");
};

/** Width and height in pixels, or null. */
export function pictureSize(bytes: Uint8Array, type: string): { width: number; height: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = bytes.length;
  const at = (i: number, s: string) => [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  const ok = (w: number, h: number) => (w > 0 && h > 0 ? { width: w, height: h } : null);
  try {
    if (type === "image/png" && n >= 24 && at(12, "IHDR")) return ok(v.getUint32(16), v.getUint32(20));
    if (type === "image/gif" && n >= 10 && at(0, "GIF")) return ok(v.getUint16(6, true), v.getUint16(8, true));
    if (type === "image/jpeg") {
      for (let i = 2; i + 9 < n;) {
        if (bytes[i] !== 0xff) return null;
        const m = bytes[i + 1]!;
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(v.getUint16(i + 7), v.getUint16(i + 5));
        i += 2 + v.getUint16(i + 2);
      }
      return null;
    }
    if (type === "image/webp" && n >= 30 && at(0, "RIFF") && at(8, "WEBP")) {
      if (at(12, "VP8 ")) return ok(v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff);
      if (at(12, "VP8L")) { const b = v.getUint32(21, true); return ok((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1); }
      if (at(12, "VP8X")) return ok(1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)));
      return null;
    }
    if (type === "image/svg+xml") {
      const head = new TextDecoder().decode(bytes.subarray(0, 4096)), tag = /<svg\b[^>]*>/i.exec(head)?.[0] ?? "";
      const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, "i").exec(tag);
      const w = attr("width"), h = attr("height");
      if (w && h) return ok(Math.round(Number(w[1])), Math.round(Number(h[1])));
      const box = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
      return box ? ok(Math.round(Number(box[1])), Math.round(Number(box[2]))) : null;
    }
  } catch { /* cut short */ }
  return null;
}
