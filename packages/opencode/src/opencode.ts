// Finding OpenCode 2. `@opencode/cli` installs it as both `opencode2` and `opencode`;
// an `opencode` on the PATH may still be 1.x, whose plugins are not 2.0's.

import { execFileSync } from "node:child_process";

export const MAJOR = 2;

export interface Found { command: string; version: string }

/** The version a `--version` line names, as "2.0.32", or null. */
export function parseVersion(output: string): string | null {
  return output.match(/(\d+)\.(\d+)\.(\d+)/)?.[0] ?? null;
}

/** Runs `--version` on a command, or null when it does not run. */
export type Probe = (command: string) => string | null;

const probe: Probe = (command) => {
  try { return execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 }); } catch { return null; }
};

/** ISORITE_OPENCODE if set, else `opencode2`, else `opencode`: the first that is OpenCode 2. */
export function findOpenCode(env: NodeJS.ProcessEnv = process.env, run: Probe = probe): Found {
  const tried: string[] = [];
  const candidates = env.ISORITE_OPENCODE ? [env.ISORITE_OPENCODE] : ["opencode2", "opencode"];
  for (const command of candidates) {
    const output = run(command);
    const version = output === null ? null : parseVersion(output);
    if (version && Number(version.split(".")[0]) === MAJOR) return { command, version };
    tried.push(output === null ? `${command}: not found` : `${command}: ${version ?? "unknown version"}`);
  }
  throw new Error(
    `isorite term needs OpenCode ${MAJOR} (${tried.join("; ")}).\n` +
      `  Install it with: npm i -g @opencode/cli\n` +
      `  or name one with: ISORITE_OPENCODE=/path/to/opencode isorite term`,
  );
}
