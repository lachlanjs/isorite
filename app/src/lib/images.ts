// Images dropped or pasted onto a note or the Atlas: each is saved in the base beside the note (its folder), through the
// server, by the name it came with, and a Markdown image link to it is made. The server reads the kind from the bytes and
// makes the name safe and not taken; what is checked here is only so that the person is told at once, in a few words.

import { IMAGE_TYPES } from "@isorite/core";
import { MAX_IMAGE_BYTES } from "@isorite/engine";
import type { Api, PictureInfo } from "@isorite/engine";
import { address } from "./editor/links.ts";
import { pastedName } from "./pictures.ts";

/** The folder a note is in; a draft, which is outside the base, and a note at the top, have none. */
export const dirOf = (id: string): string => (id.startsWith("@") || !id.includes("/") ? "" : id.slice(0, id.lastIndexOf("/")));

/** Why a file cannot be saved as an image, in a few words, or null. */
export function refused(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return `${file.name || "That"} is not a png, jpeg, gif or webp image.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name || "That image"} is over ${MAX_IMAGE_BYTES / 1e6} MB.`;
  return null;
}

/** Save `file` in the base's folder `dir`; the path it was kept at. A pasted image has no name of its own: when it was pasted is its name. */
export async function keep(api: Api, dir: string, file: File, pasted = false): Promise<PictureInfo> {
  return api.addImage(dir, pasted || !file.name ? pastedName() : file.name, new Uint8Array(await file.arrayBuffer()));
}

/** The Markdown that shows the image kept at `path`, written in the note `noteId`: a path beside it, or from the top for a draft. */
export function linkTo(noteId: string, path: string): string {
  const alt = (path.split("/").at(-1) ?? path).replace(/\.[a-z]+$/, "").replace(/[-_]+/g, " ").replace(/[[\]]/g, "");
  const beside = !noteId.startsWith("@") && path.startsWith(dirOf(noteId) ? `${dirOf(noteId)}/` : "") && !path.slice(dirOf(noteId) ? dirOf(noteId).length + 1 : 0).includes("/");
  return `![${alt}](${beside ? address(path.slice(dirOf(noteId) ? dirOf(noteId).length + 1 : 0)) : `/${address(path)}`})`;
}
