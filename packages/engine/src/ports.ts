// The ports: everything the engine needs from where it runs. The server gives
// it Node's files; a webview will give it Tauri's. Paths are relative to the
// port's root, with "/" between parts, and never leave it.

export interface FileInfo {
  name: string;
  dir: boolean;
}

/** One folder of files: a knowledge base, or a study base. */
export interface Files {
  /** The file's text, or null when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Replace the file, making its folders. Atomic: a reader sees the old text or the new, never half. */
  write(path: string, text: string): Promise<void>;
  /** Add to the end of the file, making it and its folders. */
  append(path: string, text: string): Promise<void>;
  /** What is in a folder ("" is the root), or nothing when there is no such folder. */
  list(dir: string): Promise<FileInfo[]>;
  remove(path: string): Promise<void>;
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Files held in memory: for tests, and for trying the engine with no disk. */
export class MemoryFiles implements Files {
  readonly files = new Map<string, string>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
  }

  async read(path: string): Promise<string | null> { return this.files.get(path) ?? null; }
  async write(path: string, text: string): Promise<void> { this.files.set(path, text); }
  async append(path: string, text: string): Promise<void> { this.files.set(path, (this.files.get(path) ?? "") + text); }
  async remove(path: string): Promise<void> { this.files.delete(path); }

  async list(dir: string): Promise<FileInfo[]> {
    const prefix = dir ? dir + "/" : "";
    const found = new Map<string, boolean>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length), cut = rest.indexOf("/");
      if (cut < 0) found.set(rest, false);
      else found.set(rest.slice(0, cut), true);
    }
    return [...found].map(([name, isDir]) => ({ name, dir: isDir }));
  }
}
