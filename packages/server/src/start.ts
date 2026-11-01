// `isorite` with no arguments (M26): find the base to open from where it is run, start it, open the browser.
// Inside a project (a folder holding .isorite/, or the repository's top or its notes folder): that base. Inside a
// repository with none: offer to make notes/ there. Elsewhere: the bases this machine knows, last used first, a new
// one here, and the guide. Asked only at a terminal; piped, `isorite` prints its help as it always did.

import { existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { OWN_DIR } from "@isorite/core";
import { configPath, knownBases, type KnownBase } from "./config.ts";
import { repoOf } from "./git.ts";

/** What there is to open from a folder. */
export type Found =
  | { kind: "base"; notes: string }
  | { kind: "several"; notes: string[] }
  | { kind: "repo"; repo: string }
  | { kind: "none" };

const SKIP = new Set(["node_modules", "dist", "build", "target", "vendor"]);
const isBase = (dir: string): boolean => existsSync(join(dir, OWN_DIR)) && statSync(join(dir, OWN_DIR)).isDirectory();

/** The base `from` is in or beside: a folder holding .isorite/ on the way up to the repository's top (or `from`
 *  alone, outside a repository), else the one folder just inside that top that holds one. */
export function findBase(from: string): Found {
  const start = resolve(from), repo = repoOf(start), top = repo ?? start;
  for (let at = start; ; at = dirname(at)) {
    if (isBase(at)) return { kind: "base", notes: at };
    if (at === top || dirname(at) === at) break;
  }
  let inside: string[] = [];
  try {
    inside = readdirSync(top, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name) && isBase(join(top, e.name)))
      .map((e) => join(top, e.name)).sort();
  } catch { /* unreadable: no base seen */ }
  if (inside.length === 1) return { kind: "base", notes: inside[0]! };
  if (inside.length > 1) return { kind: "several", notes: inside };
  return repo ? { kind: "repo", repo } : { kind: "none" };
}

/** The first port from `from` that nothing is listening on, so a second `isorite` starts beside the first. */
export async function freePort(from = 4767, host = "127.0.0.1"): Promise<number> {
  for (let port = from; port < from + 20; port++) {
    const free = await new Promise<boolean>((done) => {
      const probe = createServer().once("error", () => done(false)).once("listening", () => probe.close(() => done(true)));
      probe.listen(port, host);
    });
    if (free) return port;
  }
  return from;
}

/** The bases this machine knows that are still there, the last used first (those never used by name). */
export function recent(config = configPath()): KnownBase[] {
  return knownBases(config).filter((b) => existsSync(b.path)).sort((a, b) => (b.used ?? "").localeCompare(a.used ?? "") || a.name.localeCompare(b.name));
}

/** A base as the list shows it: its name with its project's, where two share a name. */
export function label(b: KnownBase, all: KnownBase[]): string {
  const same = all.filter((o) => o.name.replace(/-\d+$/, "") === b.name.replace(/-\d+$/, "")).length > 1;
  const project = basename(repoOf(b.path) ?? dirname(b.path));
  return `${basename(b.path)}${same || basename(b.path) !== project ? `  (${project})` : ""}`;
}

export interface StartIo {
  cwd: string;
  config?: string;
  out: (line: string) => void;
  /** y/N, true on yes. */
  confirm: (question: string) => Promise<boolean>;
  /** A number from a list, or null on anything else. */
  choose: (question: string, count: number) => Promise<number | null>;
  /** Start the server on a base and open the page at `start`. */
  open: (notes: string, start?: string) => Promise<number>;
  make: (folder: string) => string;
  guide: () => Promise<number>;
}

/** The choice `isorite` makes, and what it says. */
export async function start(io: StartIo): Promise<number> {
  const found = findBase(io.cwd);
  if (found.kind === "base") return io.open(found.notes);
  if (found.kind === "several") {
    io.out(`isorite: more than one base here:`);
    found.notes.forEach((n, i) => io.out(`  ${i + 1}  ${n}`));
    const pick = await io.choose("Open which?", found.notes.length);
    return pick === null ? 2 : io.open(found.notes[pick]!);
  }
  if (found.kind === "repo") {
    const notes = join(found.repo, "notes");
    io.out(`isorite: no base in ${found.repo} yet.`);
    if (!existsSync(notes) && (await io.confirm(`Make one at ${notes}?`))) return io.open(io.make(notes));
    if (existsSync(notes)) io.out(`  ${notes} is there already: open it as it is with  isorite serve ${notes}`);
  }
  const known = recent(io.config);
  if (!known.length && found.kind === "none") {
    io.out("isorite: no bases yet on this machine.");
    return (await io.confirm("Open the guide, a small base about isorite?")) ? io.guide() : 0;
  }
  const rows = [...known.map((b) => label(b, known)), `a new base here (${join(io.cwd, "notes")})`, "the guide"];
  io.out(known.length ? "isorite: the bases on this machine, last used first:" : "isorite:");
  rows.forEach((r, i) => io.out(`  ${i + 1}  ${r}`));
  const pick = await io.choose("Open which?", rows.length);
  if (pick === null) return 2;
  if (pick < known.length) return io.open(known[pick]!.path);
  if (pick === known.length) return io.open(io.make(join(io.cwd, "notes")));
  return io.guide();
}

/** The model for search by meaning, offered on the first start without one (M26): asked once, fetched on a yes,
 *  and a no remembered so it isn't asked again (`isorite model` fetches it whenever wanted). A failed fetch is said
 *  and the start goes on: search by words works without it. */
export async function offerModel(o: {
  installed: boolean; off: boolean; declined: boolean;
  confirm: (question: string) => Promise<boolean>; fetch: () => Promise<number>; decline: () => void; out: (line: string) => void;
}): Promise<void> {
  if (o.installed || o.off || o.declined) return;
  if (!(await o.confirm("Fetch the 53 MB model for search by meaning, once? Without it search is by words."))) { o.decline(); o.out("  not fetched; isorite model fetches it whenever you want it"); return; }
  if (await o.fetch()) o.out("  search by words, for now: isorite doctor says what stopped the fetch");
}
