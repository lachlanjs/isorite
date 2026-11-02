// The ports: everything the engine needs from where it runs. The server gives
// it Node's files; a webview will give it Tauri's. Paths are relative to the
// port's root, with "/" between parts, and never leave it.

export interface FileInfo {
  name: string;
  dir: boolean;
  /** A file's size in bytes and when it last changed (ms), where the port can tell: whether a picture changed (M22). */
  size?: number;
  mtime?: number;
}

/** One folder of files: a knowledge base, or a study base. */
export interface Files {
  /** The file's text, or null when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Replace the file, making its folders. Atomic: a reader sees the old text or the new, never half. */
  write(path: string, text: string): Promise<void>;
  /** The file's bytes, or null when there is no such file: a picture (M22). */
  readBytes(path: string): Promise<Uint8Array | null>;
  /** Replace the file with bytes, making its folders. Atomic, as `write` is. */
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Add to the end of the file, making it and its folders. */
  append(path: string, text: string): Promise<void>;
  /** What is in a folder ("" is the root), or nothing when there is no such folder. */
  list(dir: string): Promise<FileInfo[]>;
  remove(path: string): Promise<void>;
  /** Make an empty folder and the ones above it (M31). Optional: a place that can't hold one empty says so by not having it. */
  mkdir?(dir: string): Promise<void>;
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Files held in memory: for tests, and for trying the engine with no disk. */
export class MemoryFiles implements Files {
  readonly files = new Map<string, string>();
  /** Files held as bytes (pictures), apart from text. */
  readonly bytes = new Map<string, Uint8Array>();
  /** Folders made empty (M31). */
  readonly folders = new Set<string>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
  }

  async read(path: string): Promise<string | null> { return this.files.get(path) ?? null; }
  async write(path: string, text: string): Promise<void> { this.files.set(path, text); }
  async append(path: string, text: string): Promise<void> { this.files.set(path, (this.files.get(path) ?? "") + text); }
  async readBytes(path: string): Promise<Uint8Array | null> {
    const b = this.bytes.get(path), t = this.files.get(path);
    return b ?? (t === undefined ? null : new TextEncoder().encode(t));
  }
  async writeBytes(path: string, bytes: Uint8Array): Promise<void> { this.files.delete(path); this.bytes.set(path, bytes); }
  async remove(path: string): Promise<void> { this.files.delete(path); this.bytes.delete(path); }
  async mkdir(dir: string): Promise<void> { this.folders.add(dir); }

  async list(dir: string): Promise<FileInfo[]> {
    const prefix = dir ? dir + "/" : "";
    const found = new Map<string, FileInfo>();
    for (const path of [...this.files.keys(), ...this.bytes.keys(), ...[...this.folders].map((f) => f + "/")]) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length), cut = rest.indexOf("/");
      if (cut >= 0) { found.set(rest.slice(0, cut), { name: rest.slice(0, cut), dir: true }); continue; }
      const b = this.bytes.get(path);
      found.set(rest, b ? { name: rest, dir: false, size: b.length } : { name: rest, dir: false });
    }
    return [...found.values()];
  }
}
