// Git, as isorite uses it: never to start. A `git` first on the PATH may be a company's wrapper that waits on the
// network, so the repository a folder is in is found by looking for `.git`, and the one command isorite runs
// (`git init`, for the memory) has a timeout and a plain environment.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The top of the repository `folder` is in, or null: the nearest folder holding `.git`, a directory or, in a
 *  worktree or submodule, a file. No `git` is run. */
export function repoOf(folder: string): string | null {
  for (let at = resolve(folder); ; at = dirname(at)) {
    if (existsSync(join(at, ".git"))) return at;
    if (dirname(at) === at) return null;
  }
}

/** The environment for a `git` isorite runs: none of the shell's GIT_* (a GIT_DIR would point it elsewhere), no
 *  system configuration (where a company's hooks and helpers are usually set), and no prompt for a password. */
export function plainGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const plain = Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith("GIT_")));
  return { ...plain, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
}

/** `git init` in a folder, given `timeout` ms; whether it was made a repository. */
export function gitInit(folder: string, { env = process.env, timeout = 10_000 }: { env?: NodeJS.ProcessEnv; timeout?: number } = {}): boolean {
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: folder, stdio: "ignore", env: plainGitEnv(env), timeout, killSignal: "SIGKILL" });
    return existsSync(join(folder, ".git"));
  } catch {
    return false;
  }
}

/** The exact renames (100% alike) git has recorded for the files under `folder`, newest first, as paths relative to it:
 *  what `isorite check --fix` follows a lens's entries by. Empty where the folder is in no repository or `git` fails. */
export function gitRenames(folder: string, { env = process.env, timeout = 20_000 }: { env?: NodeJS.ProcessEnv; timeout?: number } = {}): Map<string, string> {
  const out = new Map<string, string>();
  if (!repoOf(folder)) return out;
  try {
    const text = execFileSync("git", ["log", "--no-color", "--diff-filter=R", "--name-status", "-M100%", "--relative", "--pretty=format:", "--", "."], { cwd: folder, env: plainGitEnv(env), timeout, killSignal: "SIGKILL", encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const line of text.split("\n")) {
      const [status, from, to] = line.split("\t");
      if (status?.startsWith("R") && from && to && !out.has(from)) out.set(from, to);
    }
  } catch { /* no history to follow */ }
  return out;
}
