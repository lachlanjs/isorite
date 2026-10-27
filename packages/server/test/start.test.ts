// Starting can't stall unseen (M21): the repository found without running git, git init given a timeout, and what
// is being waited for said.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { expect, test } from "vitest";
import { gitInit, plainGitEnv, repoOf } from "../src/git.ts";
import { starting } from "../src/main.ts";
import { memory } from "../src/memory.ts";
import { defaultStudyPath } from "../src/studybase.ts";
import { startOpenCode } from "../src/term.ts";

const temp = () => mkdtempSync(join(tmpdir(), "isorite-git-"));

/** A PATH whose `git` is a wrapper that leaves a mark when it's run and then hangs, as one waiting on the network. */
function hangingGit(): { env: NodeJS.ProcessEnv; ran: () => boolean } {
  const bin = temp(), mark = join(bin, "ran");
  writeFileSync(join(bin, "git"), `#!/bin/sh\ntouch "${mark}"\nsleep 60\n`);
  chmodSync(join(bin, "git"), 0o755);
  return { env: { ...process.env, PATH: bin + delimiter + process.env.PATH }, ran: () => existsSync(mark) };
}

test.skipIf(process.platform === "win32")("the repository is found by its .git, a folder or a worktree's file, without running git", () => {
  const { env, ran } = hangingGit();
  const before = process.env.PATH;
  process.env.PATH = env.PATH;
  try {
    const root = temp(), repo = join(root, "notes"), deep = join(repo, "basics", "more");
    mkdirSync(deep, { recursive: true });
    mkdirSync(join(repo, ".git"));
    expect(repoOf(deep)).toBe(repo);
    expect(defaultStudyPath(deep)).toBe(join(root, "notes-study"));

    const tree = join(root, "tree");
    mkdirSync(tree);
    writeFileSync(join(tree, ".git"), "gitdir: ../notes/.git/worktrees/tree\n");
    expect(repoOf(tree)).toBe(tree);

    const loose = join(temp(), "loose");
    mkdirSync(loose);
    // No repository above it, short of one that encloses the temporary folder itself.
    expect(repoOf(loose) === null || !repoOf(loose)!.startsWith(loose)).toBe(true);
    expect(ran()).toBe(false);
  } finally {
    process.env.PATH = before;
  }
});

test("git is run with none of the shell's GIT_*, no system configuration and no prompt", () => {
  const env = plainGitEnv({ PATH: "/bin", GIT_DIR: "/elsewhere", GIT_CONFIG_GLOBAL: "/x" });
  expect(env).toEqual({ PATH: "/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" });
});

test.skipIf(process.platform === "win32")("git init that hangs is given up on, and the memory is made anyway", () => {
  const { env, ran } = hangingGit();
  const folder = temp();
  const begun = Date.now();
  expect(gitInit(folder, { env, timeout: 500 })).toBe(false);
  expect(ran()).toBe(true);
  expect(Date.now() - begun).toBeLessThan(5000);

  const root = temp(), said: string[] = [];
  const at = join(root, "isorite-memory");
  // memory's own timeout is 10 s; the wrapper here sleeps 60.
  expect(memory(at, { config: join(root, "config.toml"), env, out: (l) => said.push(l) })).toBe(0);
  expect(said[0]).toMatch(/not a git repository .* git init it yourself/);
  expect(existsSync(join(at, "AGENTS.md"))).toBe(true);
}, 20_000);

test("the commands that start something say so at once, and once only when run again with the proxy on", () => {
  const said: string[] = [];
  const write = (s: string) => { said.push(s); return true; };
  for (const command of ["serve", "term", "mcp", "guide"]) expect(starting([command, "notes"], {}, write)).toBe(true);
  expect(starting(["check", "notes"], {}, write)).toBe(false);
  expect(starting(["term"], { ISORITE_STARTING: "1" }, write)).toBe(false);
  expect(said).toEqual(Array(4).fill("isorite: starting…\n"));
});

test.skipIf(process.platform === "win32")("an OpenCode whose server doesn't answer is said to be waited for, and its log named when given up", async () => {
  const bin = temp();
  writeFileSync(join(bin, "opencode"), "#!/bin/sh\nsleep 60\n");
  chmodSync(join(bin, "opencode"), 0o755);
  const said: string[] = [];
  await expect(startOpenCode(join(bin, "opencode"), { cwd: bin, env: process.env, wait: 3000, say: (l) => said.push(l) })).rejects.toThrow(/did not start; its output is in/);
  expect(said).toEqual(["isorite: waiting for OpenCode's server"]);
}, 10_000);
