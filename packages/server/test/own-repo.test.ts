import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { rememberBase } from "../src/config.ts";
import { askWhereFilesLive, historyChoice, ownRepoInfo, setHistoryChoice } from "../src/own-repo.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-own-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const env = { ...process.env, HOME: join(root, "home"), GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", env });
function project(name: string): { repo: string; own: string } {
  const repo = join(root, name), notes = join(repo, "docs"), own = join(notes, ".isorite");
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, ".gitattributes"), "*.jsonl merge=union\n");
  writeFileSync(join(notes, "a.md"), "---\ntype: Concept\ntitle: A\n---\n\nA.\n");
  git(repo, "init", "--quiet");
  return { repo, own };
}
/** Run the commands as the person would, in a shell. */
const run = (cwd: string, commands: string[]) => { for (const c of commands) execFileSync("sh", ["-c", c.replace(/^git /, "git -c user.name=t -c user.email=t@t ")], { cwd, env, stdio: "ignore" }); };

test("isorite runs no git to change anything: a base in a project is asked about, and nothing is made", () => {
  const p = project("fresh");
  const info = ownRepoInfo(p.own, null, env);
  expect(info).toMatchObject({ state: "shared", ask: true, remotes: [] });
  expect(existsSync(join(p.own, ".git"))).toBe(false);
  expect(existsSync(join(p.repo, ".git", "info", "exclude")) ? readFileSync(join(p.repo, ".git", "info", "exclude"), "utf8") : "").not.toContain("isorite");
  // Once chosen, it is not asked again.
  expect(ownRepoInfo(p.own, "project", env)).toMatchObject({ state: "shared", ask: false, choice: "project" });
});

test("the commands given, run by the person, keep .isorite apart: the project doesn't see it, and it has a remote to add", () => {
  const p = project("apart");
  run(p.repo, ownRepoInfo(p.own, "separate", env).commands);
  git(p.repo, "add", "-A");
  expect(git(p.repo, "ls-files").split("\n").filter(Boolean)).toEqual(["docs/a.md"]);
  expect(git(p.own, "log", "--format=%s").trim()).toBe("isorite: start");
  const after = ownRepoInfo(p.own, "separate", env);
  expect(after).toMatchObject({ state: "own", ask: false });
  expect(after.commands.join("\n")).toContain("remote add origin");
});

test("a project that tracks .isorite is said so, with the commands to move it out", () => {
  const p = project("tracked");
  git(p.repo, "add", "-A");
  git(p.repo, "commit", "--quiet", "-m", "start");
  const info = ownRepoInfo(p.own, null, env);
  expect(info).toMatchObject({ state: "tracked", ask: true });
  expect(info.commands[0]).toContain("rm -r --cached docs/.isorite");
  run(p.repo, info.commands);
  expect(git(p.repo, "ls-files").split("\n").filter(Boolean)).toEqual(["docs/a.md"]);
  expect(ownRepoInfo(p.own, null, env).state).toBe("own");
});

test("notes in no repository have nothing to ask; the answer is kept in bases.toml for the base", () => {
  const loose = join(root, "loose", "notes", ".isorite");
  mkdirSync(loose, { recursive: true });
  expect(ownRepoInfo(loose, null, env)).toMatchObject({ state: "none", ask: false, commands: [] });
  const config = join(root, "cfg", "config.toml");
  const name = rememberBase(join(root, "loose", "notes"), { path: config });
  expect(historyChoice(name, config)).toBeNull();
  setHistoryChoice(name, "separate", config);
  expect(historyChoice(name, config)).toBe("separate");
  expect(() => setHistoryChoice("nope", "project", config)).toThrow();
});

test("an agent known by name has its ACP command, for isorite acp <name>; every known agent is listed, found ones first", async () => {
  const { knownCommand, listAgents } = await import("../src/detect.ts");
  expect(knownCommand("omp")).toBe("omp acp");
  expect(knownCommand("claude")).toBe("npx -y @agentclientprotocol/claude-agent-acp");
  expect(knownCommand("nope")).toBeNull();
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "hermes"), "#!/bin/sh\n");
  execFileSync("chmod", ["755", join(bin, "hermes")]);
  const all = listAgents({ PATH: bin });
  expect(all.map((a) => `${a.id}:${a.found}`)).toEqual(["hermes:true", "claude:false", "codex:false", "opencode:false", "omp:false"]);
  expect(all[1]!.note).toContain("isn't on this machine's PATH");
});

test("the question for a new base: nothing outside a project; apart says the commands and keeps the answer; the default is with the project", async () => {
  const config = join(root, "ask", "config.toml");
  const said: string[] = [];
  // No project: not asked.
  const loose = join(root, "ask-loose", "notes");
  mkdirSync(join(loose, ".isorite"), { recursive: true });
  expect(await askWhereFilesLive(loose, async () => { throw new Error("asked"); }, (l) => said.push(l), config, env)).toBeNull();
  // In a project: apart.
  const p = project("ask-apart");
  const notes = join(p.repo, "docs");
  expect(await askWhereFilesLive(notes, async () => "a", (l) => said.push(l), config, env)).toBe("separate");
  expect(said.join("\n")).toContain("isorite runs no git itself");
  expect(said.join("\n")).toContain("init");
  expect(existsSync(join(p.own, ".git"))).toBe(false);
  // Anything else, or nothing: with the project.
  const q = project("ask-with");
  expect(await askWhereFilesLive(join(q.repo, "docs"), async () => "", () => undefined, config, env)).toBe("project");
});
