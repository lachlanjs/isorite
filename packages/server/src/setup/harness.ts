// The agent harnesses setup knows: how to find each on this machine, and how to give it isorite's MCP. Where a
// harness reads a project-level JSON file, setup writes the isorite entry into it (keeping what else is there);
// where its config is the user's own (Codex's, Zed's), setup prints the one command or snippet instead of editing
// a file in the home folder. Nothing is written unless the person chose that harness.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { onPath } from "../detect.ts";
import { projectOf } from "../connect.ts";

export interface Harness {
  id: string;
  name: string;
  /** Programs on PATH that mean it is installed. */
  bins: string[];
  /** Folders in the home folder that mean it has been used (a GUI app may have no program on PATH). */
  homes: string[];
  /** The project file it reads, and where the isorite entry goes in it; absent where its config is the user's. */
  file?: { path: string; at: string[]; value: (rel: string) => unknown };
  /** What to run or paste, for those with no project file. */
  manual?: (baseAbs: string) => string;
  /** Said after it is connected. */
  after: string;
}

const stdio = (rel: string) => ({ command: "isorite", args: ["mcp", rel] });

export const HARNESSES: Harness[] = [
  { id: "claude-code", name: "Claude Code", bins: ["claude"], homes: [".claude"], file: { path: ".mcp.json", at: ["mcpServers", "isorite"], value: stdio }, after: "Start claude in the project; it asks once before using isorite's tools (answer always)." },
  { id: "codex", name: "Codex", bins: ["codex"], homes: [".codex"], manual: (b) => `codex mcp add isorite -- isorite mcp "${b}"`, after: "Run that once; it is kept in Codex's own config." },
  { id: "gemini-cli", name: "Gemini CLI", bins: ["gemini"], homes: [".gemini"], file: { path: ".gemini/settings.json", at: ["mcpServers", "isorite"], value: stdio }, after: "Start gemini in the project; /mcp lists isorite." },
  { id: "opencode", name: "OpenCode", bins: ["opencode"], homes: [".config/opencode"], file: { path: "opencode.json", at: ["mcp", "servers", "isorite"], value: (rel) => ({ type: "local", command: ["isorite", "mcp", rel] }) }, after: "Start opencode in the project." },
  { id: "cursor", name: "Cursor", bins: ["cursor"], homes: [".cursor"], file: { path: ".cursor/mcp.json", at: ["mcpServers", "isorite"], value: stdio }, after: "Open the project in Cursor; enable isorite under Settings, MCP." },
  { id: "vscode", name: "VS Code (Copilot)", bins: ["code"], homes: [], file: { path: ".vscode/mcp.json", at: ["servers", "isorite"], value: (rel) => ({ type: "stdio", ...stdio(rel) }) }, after: "Open the project in VS Code; start isorite from the MCP servers list." },
  { id: "omp", name: "omp", bins: ["omp"], homes: [".omp"], file: { path: ".mcp.json", at: ["mcpServers", "isorite"], value: stdio }, after: "Start omp in the project." },
];

export interface FoundHarness extends Harness { found: boolean; via: string }

/** Every harness setup knows, the ones found on this machine first. */
export function detectHarnesses(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): FoundHarness[] {
  const all = HARNESSES.map((h): FoundHarness => {
    const bin = h.bins.map((b) => onPath(b, env)).find(Boolean);
    const dir = h.homes.find((d) => existsSync(join(home, d)));
    return { ...h, found: Boolean(bin || dir), via: bin ?? (dir ? join(home, dir) : "") };
  });
  return [...all.filter((h) => h.found), ...all.filter((h) => !h.found)];
}

export const harnessById = (id: string): Harness | undefined => {
  const key = id.toLowerCase().replace(/[\s_]+/g, "-");
  const alias: Record<string, string> = { claude: "claude-code", gemini: "gemini-cli", copilot: "vscode", "vs-code": "vscode" };
  return HARNESSES.find((h) => h.id === (alias[key] ?? key));
};

export interface Connected {
  harness: string;
  /** What was done: a file written, already in place, left alone (it is not JSON), or a command to run by hand. */
  state: "written" | "present" | "unreadable" | "manual";
  file?: string;
  /** For `manual`: what to run. */
  command?: string;
  after: string;
}

/** Give `harness` isorite's MCP for the base at `notes`. Idempotent: run again, nothing changes. */
export function connect(harness: Harness, notes: string): Connected {
  const { repo, rel } = projectOf(notes);
  if (!harness.file) return { harness: harness.name, state: "manual", command: harness.manual!(notes), after: harness.after };
  const at = join(repo, harness.file.path);
  let json: Record<string, unknown> = {};
  if (existsSync(at)) {
    try { json = JSON.parse(readFileSync(at, "utf8")) as Record<string, unknown>; } catch { return { harness: harness.name, state: "unreadable", file: at, after: harness.after }; }
    if (json === null || typeof json !== "object" || Array.isArray(json)) return { harness: harness.name, state: "unreadable", file: at, after: harness.after };
  }
  let node = json;
  for (const key of harness.file.at.slice(0, -1)) node = (node[key] && typeof node[key] === "object" && !Array.isArray(node[key]) ? node[key] : (node[key] = {})) as Record<string, unknown>;
  const last = harness.file.at.at(-1)!, value = harness.file.value(rel);
  if (JSON.stringify(node[last]) === JSON.stringify(value)) return { harness: harness.name, state: "present", file: at, after: harness.after };
  node[last] = value;
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, JSON.stringify(json, null, 2) + "\n");
  return { harness: harness.name, state: "written", file: at, after: harness.after };
}
