// The study base on disk: making one beside a knowledge base, and finding the
// knowledge base one studies. What the files mean is in @isorite/core (study.ts).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { CONFIG_FILE, GITATTRIBUTES, STUDY_DIR, StudyError, dumpStudyConfig, parseStudyConfig, type StudyConfig } from "@isorite/core";

function git(cwd: string, ...args: string[]): string | null {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}

/** The knowledge base's root commit and where it is cloned from, where it is in git. */
export function baseIdentity(notes: string): { root: string; remote: string } {
  return { root: git(notes, "rev-list", "--max-parents=0", "HEAD")?.split("\n")[0] ?? "", remote: git(notes, "remote", "get-url", "origin") ?? "" };
}

/** Where `isorite study init` puts a study base when not told: beside the knowledge base's repository, named after it. */
export function defaultStudyPath(notes: string): string {
  const repo = git(notes, "rev-parse", "--show-toplevel") ?? notes;
  return join(dirname(repo), basename(repo) + "-study");
}

export interface Made { path: string; config: StudyConfig; repository: boolean }

/** Make a study base for the folder of notes at `notes`. Refuses a folder that already has anything in it. */
export function initStudyBase(notes: string, target = defaultStudyPath(notes)): Made {
  notes = resolve(notes); target = resolve(target);
  if (!existsSync(notes) || !statSync(notes).isDirectory()) throw new StudyError(`no folder of notes at ${notes}`);
  if ((target + sep).startsWith(notes + sep)) throw new StudyError("a study base stands beside its knowledge base, not inside it");
  if (existsSync(target) && readdirSync(target).length) throw new StudyError(`${target} already has files in it`);
  const config: StudyConfig = { format: 1, base: { path: relative(target, notes).split(sep).join("/"), ...baseIdentity(notes) } };
  for (const dir of ["journal", "record", STUDY_DIR]) mkdirSync(join(target, dir), { recursive: true });
  writeFileSync(join(target, CONFIG_FILE), dumpStudyConfig(config));
  writeFileSync(join(target, ".gitattributes"), GITATTRIBUTES);
  for (const dir of ["journal", "record", STUDY_DIR]) writeFileSync(join(target, dir, ".gitkeep"), "");
  // A repository of its own, so its history is yours and it can be synced by git. Nothing is committed or pushed here.
  const repository = git(target, "init", "-q", "-b", "main") !== null;
  return { path: target, config, repository };
}

/** A study base's configuration, and its knowledge base's folder as an absolute path. */
export function openStudyBase(path: string): { config: StudyConfig; notes: string } {
  const file = join(resolve(path), CONFIG_FILE);
  if (!existsSync(file)) throw new StudyError(`no ${CONFIG_FILE} in ${resolve(path)}: not a study base`);
  const config = parseStudyConfig(readFileSync(file, "utf8"));
  return { config, notes: resolve(path, config.base.path) };
}
