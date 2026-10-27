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
