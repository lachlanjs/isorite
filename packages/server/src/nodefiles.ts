// The engine's Files port over a folder on disk.

import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { FileInfo, Files } from "@isorite/engine";

const gone = (e: unknown): boolean => ["ENOENT", "ENOTDIR"].includes((e as NodeJS.ErrnoException).code ?? "");

export class NodeFiles implements Files {
  readonly root: string;
  private n = 0;

  constructor(root: string) { this.root = resolve(root); }

  /** The path on disk, refused if it would leave the folder. The engine checks ids too; this is the last gate. */
  private at(path: string): string {
    const full = resolve(this.root, path);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error(`path leaves the folder: ${path}`);
    return full;
  }

  async read(path: string): Promise<string | null> {
    try { return await readFile(this.at(path), "utf8"); } catch (e) { if (gone(e)) return null; throw e; }
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    try { return new Uint8Array(await readFile(this.at(path))); } catch (e) { if (gone(e)) return null; throw e; }
  }

  async write(path: string, text: string): Promise<void> { await this.replace(path, text); }
  async writeBytes(path: string, bytes: Uint8Array): Promise<void> { await this.replace(path, bytes); }

  /** Written beside the file and renamed over it, so a reader never sees half a note. */
  private async replace(path: string, data: string | Uint8Array): Promise<void> {
    const full = this.at(path), beside = `${full}.${process.pid}.${this.n++}.tmp`;
    await mkdir(dirname(full), { recursive: true });
    try {
      await writeFile(beside, data, typeof data === "string" ? "utf8" : undefined);
      await rename(beside, full);
    } catch (e) {
      await rm(beside, { force: true });
      throw e;
    }
  }

  async append(path: string, text: string): Promise<void> {
    const full = this.at(path);
    await mkdir(dirname(full), { recursive: true });
    await appendFile(full, text, "utf8");
  }

  async list(dir: string): Promise<FileInfo[]> {
    try {
      const at = this.at(dir), entries = await readdir(at, { withFileTypes: true });
      const out = await Promise.all(entries.filter((e) => e.isDirectory() || e.isFile()).map(async (e): Promise<FileInfo> => {
        if (e.isDirectory()) return { name: e.name, dir: true };
        // A note's size is never asked; a picture's is (M22), to know whether it has changed.
        if (e.name.endsWith(".md")) return { name: e.name, dir: false };
        const s = await stat(resolve(at, e.name)).catch(() => null);
        return s ? { name: e.name, dir: false, size: s.size, mtime: s.mtimeMs } : { name: e.name, dir: false };
      }));
      return out.sort((a, b) => (a.name < b.name ? -1 : 1));
    } catch (e) { if (gone(e)) return []; throw e; }
  }

  async remove(path: string): Promise<void> {
    await rm(this.at(path), { force: true });
  }
}
