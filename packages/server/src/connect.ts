// The project's MCP config (M25): what a harness reads from the repository to find the base, offered, then written
// on a yes; nothing is written unasked. Each names `isorite mcp` with the base's folder relative to the repository,
// so the same lines hold on every machine that has isorite, whatever port or name the base has there.
//
// .mcp.json is Claude Code's (and read by others, omp among them); opencode.json is OpenCode's. What else a file
// holds is kept as it is.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { repoOf } from "./git.ts";

export interface Proposed {
  /** The file, relative to the repository. */
  file: string;
  harness: string;
  /** isorite is in it already, as it would be written. */
  current: boolean;
  /** The file as it is now (null if there is none), and as it would be. */
  before: string | null;
  after: string;
}

const HARNESSES: { file: string; harness: string; entry: (rel: string) => [path: string[], value: unknown] }[] = [
  { file: ".mcp.json", harness: "Claude Code", entry: (rel) => [["mcpServers", "isorite"], { command: "isorite", args: ["mcp", rel] }] },
  // OpenCode 2's form (as `opencode mcp add` writes it), under mcp.servers; OpenCode 1's was under mcp.
  { file: "opencode.json", harness: "OpenCode", entry: (rel) => [["mcp", "servers", "isorite"], { type: "local", command: ["isorite", "mcp", rel] }] },
];

/** Where the base's harness config goes: its repository, or the base's own folder when it is in none. */
export function projectOf(notes: string): { repo: string; rel: string } {
  const repo = repoOf(notes) ?? notes;
  return { repo, rel: relative(repo, notes).split(sep).join("/") || "." };
}

export function proposal(notes: string): { repo: string; files: Proposed[] } {
  const { repo, rel } = projectOf(notes);
  const files = HARNESSES.map(({ file, harness, entry }) => {
    const at = join(repo, file);
    const before = existsSync(at) ? readFileSync(at, "utf8") : null;
    let json: Record<string, unknown> = {};
    try { json = before ? (JSON.parse(before) as Record<string, unknown>) : {}; } catch { json = {}; }
    const [path, value] = entry(rel);
    let node = json;
    for (const key of path.slice(0, -1)) node = (node[key] && typeof node[key] === "object" ? node[key] : (node[key] = {})) as Record<string, unknown>;
    const last = path.at(-1)!;
    const current = JSON.stringify(node[last]) === JSON.stringify(value);
    node[last] = value;
    return { file, harness, current, before, after: JSON.stringify(json, null, 2) + "\n" };
  });
  return { repo, files };
}

/** Write the files not yet current (or only those named); the files written. A file that isn't JSON is left. */
export function writeProposal(notes: string, only?: string[]): string[] {
  const { repo, files } = proposal(notes);
  const written: string[] = [];
  for (const f of files) {
    if (f.current || (only && !only.includes(f.file))) continue;
    if (f.before !== null) { try { JSON.parse(f.before); } catch { continue; } }
    writeFileSync(join(repo, f.file), f.after);
    written.push(f.file);
  }
  return written;
}
