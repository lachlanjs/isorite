// Where isorite's own files are kept (M27). `.isorite/` holds journals, kept sessions and settings; in a project
// shared with people who don't use isorite, you may want them out of the project's repository. isorite never runs
// git for that: it says where they are, asks once whether to keep them apart (the answer is this machine's, in
// bases.toml), and gives the commands to copy and run yourself. Reading is the one git it does: whether the project
// tracks `.isorite/`, with a timeout and a plain environment.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { basesPath, readConfig, rememberBase, table, writeConfig } from "./config.ts";
import { plainGitEnv, repoOf } from "./git.ts";

/** What was chosen: keep them with the project (as before), or apart. */
export type HistoryChoice = "project" | "separate";
export interface OwnRepoInfo {
  /** own: a repository of its own; tracked: the project's repository tracks it; shared: in the project's folder,
   *  not tracked yet; none: the notes are in no repository; unavailable: git did not answer. */
  state: "own" | "tracked" | "shared" | "none" | "unavailable";
  path: string;
  project: string | null;
  remotes: string[];
  /** What this machine chose, if it has. */
  choice: HistoryChoice | null;
  /** Whether to ask: there is a project, they are not apart, and nothing was chosen. */
  ask: boolean;
  /** What to run, for the person to copy: to keep them apart, or to keep them elsewhere (add a remote). */
  commands: string[];
  problem: string;
}

const q = (s: string): string => (/^[\w@%+=:,./-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, "\\$1")}"`);
const slashes = (p: string): string => p.split("\\").join("/");
function git(cwd: string, args: string[], env: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, { cwd, env: plainGitEnv(env), timeout: 10_000, killSignal: "SIGKILL", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** What this machine chose for a base, from bases.toml. */
export function historyChoice(base: string, config: string): HistoryChoice | null {
  const v = table(readConfig(basesPath(config))[base]).history;
  return v === "project" || v === "separate" ? v : null;
}
export function setHistoryChoice(base: string, choice: HistoryChoice, config: string): void {
  const bases = readConfig(basesPath(config));
  if (!bases[base]) throw new Error(`${base} is not among the bases`);
  bases[base] = { ...table(bases[base]), history: choice };
  writeConfig(bases, basesPath(config));
}

/** Where isorite's own folder is kept, and the commands for the person to run. Runs `git ls-files`, `remote` and
 *  `rev-parse`, which only read. */
export function ownRepoInfo(own: string, choice: HistoryChoice | null = null, env: NodeJS.ProcessEnv = process.env): OwnRepoInfo {
  const notes = dirname(own), project = repoOf(notes);
  const base: OwnRepoInfo = { state: "none", path: own, project, remotes: [], choice, ask: false, commands: [], problem: "" };
  try {
    if (existsSync(join(own, ".git"))) {
      const remotes = git(own, ["remote"], env).split("\n").filter(Boolean);
      return { ...base, state: "own", remotes, commands: remotes.length ? [`git -C ${q(own)} push`] : [`git -C ${q(own)} remote add origin <the address of your private repository>`, `git -C ${q(own)} push -u origin HEAD`] };
    }
    if (!project) return base;
    const rel = slashes(relative(project, own));
    const tracked = git(project, ["ls-files", "--", rel], env).trim() !== "";
    const path = git(project, ["rev-parse", "--git-path", "info/exclude"], env).trim();
    const exclude = isAbsolute(path) ? path : resolve(project, path);
    const apart = [
      `git -C ${q(own)} init`,
      `echo ${q(rel + "/")} >> ${q(exclude)}`,
      `git -C ${q(own)} add -A`,
      `git -C ${q(own)} commit -m "isorite: start"`,
    ];
    return { ...base, state: tracked ? "tracked" : "shared", ask: choice === null,
      commands: tracked ? [`git -C ${q(project)} rm -r --cached ${q(rel)}`, ...apart, `git -C ${q(project)} commit -m "stop tracking isorite's own files"`] : apart };
  } catch (e) {
    return { ...base, state: "unavailable", problem: (e as Error).message.split("\n")[0] ?? "git did not answer" };
  }
}

/** For a base just made in a git project: ask whether its own files stay with the project or apart, keep the answer
 *  for this machine, and say the commands for apart. Asks nothing outside a project. isorite runs none of it. */
export async function askWhereFilesLive(notes: string, ask: (question: string) => Promise<string>, out: (line: string) => void, config: string, env: NodeJS.ProcessEnv = process.env): Promise<HistoryChoice | null> {
  if (!repoOf(notes)) return null;
  const said = (await ask(`${notes} is in a git project. isorite's own files (.isorite/: journals, kept sessions, settings) can be committed with the project, or kept apart from it, so the people sharing it don't have them.\nKeep them [p]roject / [a]part? (p) `)).trim().toLowerCase();
  const choice: HistoryChoice = said.startsWith("a") ? "separate" : "project";
  setHistoryChoice(rememberBase(notes, { path: config }), choice, config);
  if (choice === "separate") {
    const info = ownRepoInfo(join(notes, ".isorite"), "separate", env);
    out(`\nTo keep them apart, run these (isorite runs no git itself):\n${info.commands.map((c) => `  ${c}`).join("\n")}\n`);
  }
  return choice;
}
