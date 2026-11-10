// The images a person gives the agent from the pane's box. Each is kept once, by its content, apart from the session
// that holds it: a session's file names it (`<hash>.<ext>`) and does not carry its bytes, so a long conversation with
// screenshots stays small and a session shown again after a restart still has them. With no store (a test, a host with
// nowhere to keep things) they live in memory, as the sessions do.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imageExt, imageType } from "@isorite/core";
import { MAX_IMAGE_BYTES } from "@isorite/engine";

export interface Kept { bytes: Uint8Array; type: string }
export interface ImageStore {
  /** Keep an image; the id to ask for it by. Throws, with what to tell the person, where it is not an image or is too large. */
  put(bytes: Uint8Array): Promise<{ id: string; type: string }>;
  get(id: string): Promise<Kept | null>;
}

/** What an id looks like: the first 24 hex characters of the content's SHA-256, and its extension. */
export const IMAGE_ID = /^[0-9a-f]{24}\.(png|jpg|gif|webp)$/;

/** The id and type of the image `bytes` is, by its bytes alone. */
export function checked(bytes: Uint8Array): { id: string; type: string } {
  const type = imageType(bytes);
  if (!type) throw new Error("That is not a png, jpeg, gif or webp image.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`That image is over ${MAX_IMAGE_BYTES / 1e6} MB.`);
  return { id: `${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.${imageExt(type)}`, type };
}

export class MemoryImages implements ImageStore {
  readonly #kept = new Map<string, Kept>();
  async put(bytes: Uint8Array) { const c = checked(bytes); this.#kept.set(c.id, { bytes, type: c.type }); return c; }
  async get(id: string) { return this.#kept.get(id) ?? null; }
}

export class FileImages implements ImageStore {
  readonly #dir: string;
  constructor(dir: string) { this.#dir = dir; }
  async put(bytes: Uint8Array) {
    const c = checked(bytes);
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    const file = join(this.#dir, c.id), tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, file);
    return c;
  }
  async get(id: string) {
    if (!IMAGE_ID.test(id)) return null;
    try {
      const bytes = new Uint8Array(await readFile(join(this.#dir, id)));
      const type = imageType(bytes);
      return type ? { bytes, type } : null;
    } catch { return null; }
  }
}
