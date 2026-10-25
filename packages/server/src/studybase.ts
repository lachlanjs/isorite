// A study base on disk (format 1), read only to move it into its notes' .isorite/ (migrate.ts) and to refuse it
// where a base is opened. What its files meant is in @isorite/core (study.ts).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { CONFIG_FILE, StudyError, parseStudyConfig, type StudyConfig } from "@isorite/core";

function git(cwd: string, ...args: string[]): string | null {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}

/** Where format 1 put a study base when not told: beside the knowledge base's repository, named after it. */
export function defaultStudyPath(notes: string): string {
  const repo = git(notes, "rev-parse", "--show-toplevel") ?? notes;
  return join(dirname(repo), basename(repo) + "-study");
}

/** A study base's configuration, and its knowledge base's folder as an absolute path. */
export function openStudyBase(path: string): { config: StudyConfig; notes: string } {
  const file = join(resolve(path), CONFIG_FILE);
  if (!existsSync(file)) throw new StudyError(`no ${CONFIG_FILE} in ${resolve(path)}: not a study base`);
  const config = parseStudyConfig(readFileSync(file, "utf8"));
  return { config, notes: resolve(path, config.base.path) };
}
