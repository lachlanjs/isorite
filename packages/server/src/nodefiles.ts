// The engine's Files port over a folder on disk.

import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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

  /** Written beside the file and renamed over it, so a reader never sees half a note. */
  async write(path: string, text: string): Promise<void> {
    const full = this.at(path), beside = `${full}.${process.pid}.${this.n++}.tmp`;
    await mkdir(dirname(full), { recursive: true });
    try {
      await writeFile(beside, text, "utf8");
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
      const entries = await readdir(this.at(dir), { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() || e.isFile()).map((e) => ({ name: e.name, dir: e.isDirectory() })).sort((a, b) => (a.name < b.name ? -1 : 1));
    } catch (e) { if (gone(e)) return []; throw e; }
  }

  async remove(path: string): Promise<void> {
    await rm(this.at(path), { force: true });
  }
}
