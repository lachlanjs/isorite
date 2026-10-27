// Pictures in notes (M22): where a picture a note shows is, and where the browser gets it. A path is relative to
// the note, or from the top of the notes with "/"; `code:` is the base's repository, as for a code link.

import { citeKind, codeTarget, sha256 } from "@isorite/core";
import type { Api } from "@isorite/engine";
import type { FileUrls } from "./api.ts";

export interface Picture { path: string; from: "notes" | "code" }

/** The picture `href` names, written in the note `noteId`; null when it names no picture (a note, the web, an artifact). */
export function pictureOf(href: string, noteId: string): Picture | null {
  let raw = href.trim().replace(/^<|>$/g, "").split("#", 1)[0]!.split("?", 1)[0]!;
  try { raw = decodeURIComponent(raw); } catch { /* as written */ }
  if (raw.startsWith("code:")) {
    const c = codeTarget(raw);
    return c && citeKind(c.path) === "image" ? { path: c.path, from: "code" } : null;
  }
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || citeKind(raw) !== "image") return null;
  const dir = noteId.includes("/") ? noteId.slice(0, noteId.lastIndexOf("/")) : "";
  const out: string[] = [];
  for (const part of (raw.startsWith("/") ? raw : `${dir}/${raw}`).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.length ? { path: out.join("/"), from: "notes" } : null;
}

const made = new Map<string, Promise<string | null>>();

/** Where the browser gets a picture: from the server, which an `<img>` asks itself; or, with the engine in the page
 *  (the guide), as the bytes it gives. */
export function pictureSrc(api: Api, p: Picture): string | Promise<string | null> {
  if ("fileUrl" in api) return (api as Api & FileUrls).fileUrl(p.path, p.from);
  const key = `${p.from}:${p.path}`;
  let src = made.get(key);
  if (!src) made.set(key, (src = api.file(p.path, p.from).then((f) => (f ? URL.createObjectURL(new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.type })) : null), () => null)));
  return src;
}

/** A name as a picture's file name (M22): lower case, `-` for spaces and anything outside a-z, 0-9, `.`, `_`, `-`. */
export const safeName = (name: string): string =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.(png|jpe?g|gif|webp|svg|avif)$/, "")
    .replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");

/** The name a pasted picture is offered, which has none of its own: when it was pasted. */
export function pastedName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `pasted-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

/** The SHA-256 of a file's bytes, as the engine gives it for each picture: how the same picture is found. */
export async function digest(bytes: Uint8Array): Promise<string> {
  // Only a secure page (localhost, https) has crypto.subtle; one reached by another name (--allow-host) has not.
  if (!globalThis.crypto?.subtle) return sha256(bytes);
  const hash = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
