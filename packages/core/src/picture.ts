// A picture's size in pixels (M22), read from the head of its file: PNG, GIF, JPEG, WebP and SVG. Null where it
// can't be told (AVIF, or a file that isn't what its name says).

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", avif: "image/avif" };
/** A picture's media type, by its extension, or null when the path isn't a picture's (M22). */
export const pictureType = (path: string): string | null => {
  const dot = path.lastIndexOf(".");
  return dot < 0 || path.lastIndexOf("/") > dot ? null : TYPES[path.slice(dot + 1).toLowerCase()] ?? null;
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
