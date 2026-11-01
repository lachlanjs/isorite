// The agents this machine already has (M26): which of the known ones are on PATH, and whether the keys they read are
// set in the environment isorite was started from. Only names are looked at; no key is read, kept or sent.

import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** An agent isorite knows how to run over ACP. `keys`: the variables it reads for a key (one is enough); `signedIn`:
 *  it may be signed in another way, so a key missing is not a fault. */
interface Known { id: string; name: string; bin: string; command: string; needs?: string; keys: string[]; signedIn?: boolean }

const KNOWN: Known[] = [
  { id: "claude", name: "Claude Code", bin: "claude", command: "npx -y @agentclientprotocol/claude-agent-acp", needs: "npx", keys: ["ANTHROPIC_API_KEY"], signedIn: true },
  { id: "codex", name: "Codex", bin: "codex", command: "npx -y @agentclientprotocol/codex-acp", needs: "npx", keys: ["CODEX_API_KEY", "OPENAI_API_KEY"] },
  { id: "opencode", name: "OpenCode", bin: "opencode", command: "opencode acp", keys: [] },
  { id: "omp", name: "omp", bin: "omp", command: "omp acp", keys: [] },
  { id: "hermes", name: "Hermes", bin: "hermes", command: "hermes acp", keys: [] },
];

export interface Detected {
  id: string;
  name: string;
  /** What attaching it runs. */
  command: string;
  /** Where it was found. */
  path: string;
  /** The variables it reads for a key, and whether any is set here. Empty `keys`: it keeps its own. */
  keys: string[];
  keySet: boolean;
  /** Set when it can run here: false where the program that runs it (npx) is missing. */
  ready: boolean;
  /** One line for the person: what was found, and what is missing. */
  note: string;
}

/** The first file called `name` on PATH (with the extensions Windows tries), or null. */
export function onPath(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const exts = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const file = join(dir, name + ext);
      try { if (existsSync(file) && statSync(file).isFile()) return file; } catch { /* not readable: not there */ }
    }
  }
  return null;
}

export function detectAgents(env: NodeJS.ProcessEnv = process.env): Detected[] {
  return KNOWN.flatMap((k) => {
    const path = onPath(k.bin, env);
    if (!path) return [];
    const keySet = k.keys.some((v) => Boolean(env[v]));
    const ready = !k.needs || onPath(k.needs, env) !== null;
    const parts = [`${k.name} is installed`];
    if (!ready) parts.push(`but it needs ${k.needs}, which isn't on PATH`);
    else if (k.keys.length && keySet) parts.push(`and ${k.keys.find((v) => env[v])} is set here`);
    else if (k.keys.length) parts.push(k.signedIn ? `; ${k.keys[0]} isn't set here, which is fine if you've signed in with it` : `, but ${k.keys.join(" or ")} isn't set in the terminal isorite was started from`);
    return [{ id: k.id, name: k.name, command: k.command, path, keys: k.keys, keySet, ready, note: parts.join(" ").replace(" ;", ";").replace(" ,", ",") + "." }];
  });
}

/** Why an agent that stopped may have: the key it reads isn't set where isorite was started, for the command run. */
export function missingKey(command: string, env: NodeJS.ProcessEnv = process.env): string {
  const k = KNOWN.find((x) => x.command === command);
  if (!k || !k.keys.length || k.keys.some((v) => env[v])) return "";
  return `${k.keys.join(" or ")} is not set in the terminal isorite was started from. Set it there (export ${k.keys[0]}=…) and start isorite again${k.signedIn ? ", or sign in with `claude` first" : ""}.`;
}
