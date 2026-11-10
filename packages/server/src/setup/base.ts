// Where the base could be: what is here already (an isorite base, an Obsidian vault, a git project) and what to make.
// Only looks; writes nothing until a choice is made.

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { newBase } from "../serve.ts";
import { findBase } from "../start.ts";
import { repoOf } from "../git.ts";

export interface BaseChoice {
  path: string;
  kind: "base" | "vault" | "markdown" | "new";
  label: string;
  hint: string;
}

const SKIP = new Set(["node_modules", ".git", "dist", "build", "target", "vendor"]);

/** How many Markdown files are in `dir`, looking two levels down at most, and stopping at `limit`. */
export function markdownIn(dir: string, limit = 50, depth = 2): number {
  let n = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (n >= limit) break;
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) n++;
      else if (e.isDirectory() && depth > 0) n += markdownIn(join(dir, e.name), limit - n, depth - 1);
    }
  } catch { /* unreadable: counted as none */ }
  return n;
}

/** The Obsidian vault `from` is in, or null. */
export function vaultOf(from: string, home = homedir()): string | null {
  for (let at = resolve(from); ; at = dirname(at)) {
    if (at === home || dirname(at) === at) return null;
    if (existsSync(join(at, ".obsidian"))) return at;
  }
}

const count = (n: number) => (n >= 50 ? "50+" : String(n));
/** A path as a person reads it from where they are: ./notes under the working folder, else in full. */
export function shown(path: string, cwd: string): string {
  const r = relative(cwd, path);
  return r === "" ? "." : r.startsWith("..") || resolve(r) === r ? path : `.${sep}${r}`;
}

/** The places to keep the base, the likeliest first. */
export function baseCandidates(cwd: string, home = homedir()): BaseChoice[] {
  const here = resolve(cwd), out: BaseChoice[] = [], seen = new Set<string>();
  const add = (c: BaseChoice) => { if (!seen.has(c.path)) { seen.add(c.path); out.push(c); } };
  const found = findBase(here);
  if (found.kind === "base") add({ path: found.notes, kind: "base", label: shown(found.notes, here), hint: "a base already here" });
  if (found.kind === "several") for (const n of found.notes) add({ path: n, kind: "base", label: shown(n, here), hint: "a base already here" });
  const vault = vaultOf(here, home);
  if (vault) add({ path: vault, kind: "vault", label: shown(vault, here), hint: `your Obsidian vault (${count(markdownIn(vault))} notes), opened as it is; isorite adds only a .isorite folder` });
  const repo = repoOf(here);
  const top = repo ?? (here === home ? join(home, "isorite") : here);
  const notes = join(top, "notes");
  if (existsSync(notes) && statSync(notes).isDirectory() && markdownIn(notes) > 0) add({ path: notes, kind: "markdown", label: shown(notes, here), hint: `Markdown you have already (${count(markdownIn(notes))} notes), opened as it is` });
  else add({ path: notes, kind: "new", label: shown(notes, here), hint: repo ? "a new notes folder in this project" : "a new folder for your notes" });
  if (!repo && !vault && here !== home && markdownIn(here, 3, 0) >= 3) add({ path: here, kind: "markdown", label: ".", hint: "the Markdown in this folder, opened as it is" });
  return out;
}

/** Make the base at `path` if it is not a folder with things in it; the path. A folder of notes already is left as it is
 *  (isorite makes its .isorite/ the first time it opens). Throws with a sentence a person can act on. */
export function prepareBase(path: string): { path: string; made: boolean } {
  const at = resolve(path);
  if (existsSync(at) && !statSync(at).isDirectory()) throw new Error(`${at} is a file, not a folder`);
  if (!existsSync(at) || readdirSync(at).every((f) => f === ".isorite")) {
    const had = existsSync(join(at, ".isorite"));
    try { return { path: newBase(at), made: !had }; } catch (e) {
      throw new Error(`could not make ${at}: ${(e as NodeJS.ErrnoException).code === "EACCES" || (e as NodeJS.ErrnoException).code === "EPERM" ? "no permission to write there; choose a folder in your home folder" : (e as Error).message}`);
    }
  }
  mkdirSync(at, { recursive: true });
  return { path: at, made: false };
}

export const nameOf = (path: string): string => basename(path);
