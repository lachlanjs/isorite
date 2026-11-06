// What the pi agent keeps between runs of the server (M36, step 5): for each session one file holding the pane's turns
// and the messages the model needs to carry on, so a restart resumes where it was. Written whole to a temporary
// file and renamed, so a file is never half written. A file that cannot be read is reported with its path and left
// where it is; it is never deleted or replaced by a fresh session without saying so.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TerminalTurn } from "@isorite/engine";

export interface PiRecord {
  version: 1;
  session: string;
  title: string;
  /** When it began, and when it last changed (ISO). */
  at: string;
  last: string;
  cost: number;
  used: number;
  /** The keys of what was given the model, so a resumed session does not give it twice. */
  given: string[];
  /** The blocks of context taken back out, as `<key>@<turn>` (M36, step 10). */
  withdrawn?: string[];
  /** The pane's turns, and the model's messages (pi's, kept as they are). */
  turns: TerminalTurn[];
  messages: unknown[];
}

/** Said when a saved session cannot be read: names the file, so the person can look at it or move it away. */
export class StoreError extends Error {
  readonly file: string;
  constructor(file: string, why: string) { super(`The saved pi session ${file} could not be read (${why}). It was left where it is.`); this.file = file; }
}

export interface PiStore {
  save(record: PiRecord): Promise<void>;
  /** The session last changed, or null when none is kept. Throws `StoreError` when its file is unreadable. */
  latest(): Promise<PiRecord | null>;
}

const ID = /^[0-9a-f-]{8,64}$/i;

export class FileStore implements PiStore {
  readonly #dir: string;
  constructor(dir: string) { this.#dir = dir; }

  async save(r: PiRecord): Promise<void> {
    if (!ID.test(r.session)) throw new Error("not a session id");
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    const file = join(this.#dir, `${r.session}.json`), tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(r), { mode: 0o600 });
    await rename(tmp, file);
  }

  async latest(): Promise<PiRecord | null> {
    let names: string[];
    try { names = (await readdir(this.#dir)).filter((n) => n.endsWith(".json")); } catch { return null; }
    const dated = await Promise.all(names.map(async (n) => ({ n, t: (await stat(join(this.#dir, n))).mtimeMs })));
    const newest = dated.sort((a, b) => b.t - a.t)[0];
    if (!newest) return null;
    const file = join(this.#dir, newest.n);
    let record: unknown;
    try { record = JSON.parse(await readFile(file, "utf8")); } catch (e) { throw new StoreError(file, (e as Error).message); }
    const r = record as Partial<PiRecord> | null;
    if (!r || r.version !== 1 || typeof r.session !== "string" || !Array.isArray(r.turns) || !Array.isArray(r.messages)) throw new StoreError(file, "it is not a session this version of isorite wrote");
    return r as PiRecord;
  }
}

/** Where a base's pi sessions are kept: isorite's data folder, apart from the notes and the repository. */
export function storeDir(notes: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = createHash("sha1").update(notes).digest("hex").slice(0, 12);
  return join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "isorite", "pi", key);
}
