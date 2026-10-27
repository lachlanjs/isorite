// Finding OpenCode 2. `@opencode/cli` installs it as both `opencode2` and `opencode`;
// an `opencode` on the PATH may still be 1.x, whose plugins are not 2.0's. `isorite opencode` (M21) installs it in
// a prefix of isorite's own, so that the global one (locked at work, or holding the OpenCode 1 you use) is never
// touched.

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export const MAJOR = 2;
/** The OpenCode isorite installs: the one its plugin and @opencode/client are built and tested against. */
export const VERSION = "2.0.32";
export const PACKAGE = `@opencode/cli@${VERSION}`;

export interface Found { command: string; version: string; from: string }

/** The version a `--version` line names, as "2.0.32", or null. */
export function parseVersion(output: string): string | null {
  return output.match(/(\d+)\.(\d+)\.(\d+)/)?.[0] ?? null;
}

/** Runs `--version` on a command, or null when it does not run. */
export type Probe = (command: string) => string | null;

const probe: Probe = (command) => {
  try { return execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 }); } catch { return null; }
};

/** isorite's own prefix for OpenCode 2. Not ~/.config/isorite/opencode, which is OpenCode's configuration as
 *  `term` writes it (home.ts): an npm prefix there would put node_modules among it. */
export function ownPrefix(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "isorite", "opencode-cli");
}

/** The OpenCode 2 in isorite's own prefix, as npm links it. */
export const ownCommand = (env: NodeJS.ProcessEnv = process.env): string =>
  join(ownPrefix(env), "node_modules", ".bin", process.platform === "win32" ? "opencode2.cmd" : "opencode2");

/** The line that installs OpenCode 2 for isorite alone, to copy. */
export const installLine = (env: NodeJS.ProcessEnv = process.env): string => `isorite opencode   (npm install --prefix ${ownPrefix(env)} ${PACKAGE})`;

/** OpenCode 2 wasn't found. `old` is an OpenCode 1 that was, if one was. */
export class NoOpenCode extends Error {
  readonly old: string | null;
  constructor(tried: string[], old: string | null, env: NodeJS.ProcessEnv) {
    super(
      (old ? `isorite term needs OpenCode ${MAJOR}; ${old} is OpenCode 1 (${tried.join("; ")}).\n` : `isorite term needs OpenCode ${MAJOR} (${tried.join("; ")}).\n`) +
        `  Install it for isorite only, leaving the global one as it is: ${installLine(env)}\n` +
        `  or name one with: ISORITE_OPENCODE=/path/to/opencode isorite term`,
    );
    this.old = old;
  }
}

/** ISORITE_OPENCODE if set, else isorite's own prefix's, else `opencode2`, else `opencode`: the first that is
 *  OpenCode 2. */
export function findOpenCode(env: NodeJS.ProcessEnv = process.env, run: Probe = probe): Found {
  const tried: string[] = [];
  let old: string | null = null;
  const candidates: [string, string][] = env.ISORITE_OPENCODE ? [[env.ISORITE_OPENCODE, "ISORITE_OPENCODE"]]
    : [[ownCommand(env), "isorite opencode"], ["opencode2", "the PATH"], ["opencode", "the PATH"]];
  for (const [command, from] of candidates) {
    const output = run(command);
    const version = output === null ? null : parseVersion(output);
    if (version && Number(version.split(".")[0]) === MAJOR) return { command, version, from };
    if (version && Number(version.split(".")[0]) < MAJOR) old ??= `${command} ${version}`;
    // isorite's own prefix, not there, isn't worth saying.
    if (output !== null || from !== "isorite opencode") tried.push(output === null ? `${command}: not found` : `${command}: ${version ?? "unknown version"}`);
  }
  throw new NoOpenCode(tried, old, env);
}
