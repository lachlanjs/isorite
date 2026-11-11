// Lenses at the server: `isorite check` over a lens file (warnings, --strict, --fix from git renames), the lens over HTTP,
// and an agent's read_lens through the tool route.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, expect, test } from "vitest";
import { createApp } from "../src/http.ts";
import { check } from "../src/main.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-lens-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const note = (title: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${title} body.\n`;
const LENS = `title = "Path"\n[[islands]]\nname = "Start"\nnotes = ["/a/one.md", "/a/two.md"]\n`;

function base(name: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "a"), { recursive: true });
  mkdirSync(join(dir, ".isorite", "lenses"), { recursive: true });
  for (const [id, title] of [["one", "One"], ["two", "Two"], ["three", "Three"]]) writeFileSync(join(dir, "a", `${id}.md`), note(title!));
  writeFileSync(join(dir, ".isorite", "lenses", "path.toml"), LENS);
  return dir;
}
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, stdio: "ignore" });

test("check: notes in no island are a warning, and --strict fails on them", () => {
  const dir = base("warn"), lines: string[] = [];
  expect(check(dir, (l) => lines.push(l))).toBe(0);
  expect(lines.join("\n")).toMatch(/path\.toml: 1 note is in no island: \/a\/three\.md/);
  expect(lines.at(-1)).toContain("1 warnings");
  expect(check(dir, () => undefined, false, false, true)).toBe(1);
});

test("check: a note a lens names that is not there is an error; --fix follows an exact git rename and then passes", () => {
  const dir = base("fix");
  git(dir, "init", "--quiet");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "start");
  git(dir, "mv", "a/two.md", "a/second.md");
  git(dir, "commit", "--quiet", "-am", "rename");
  const first: string[] = [];
  expect(check(dir, (l) => first.push(l))).toBe(1);
  expect(first.join("\n")).toContain("a/two.md is not in the base");
  const fixed: string[] = [];
  expect(check(dir, (l) => fixed.push(l), false, true)).toBe(0);
  expect(fixed[0]).toContain("/a/two.md is /a/second.md now");
  expect(readFileSync(join(dir, ".isorite", "lenses", "path.toml"), "utf8")).toContain('"/a/one.md", "/a/second.md"');
});

test("the lens over HTTP, and read_lens through the agent's route", async () => {
  const dir = base("http");
  const api = await openEngine(locate(dir), "dev", null);
  const server = nodeServe({ fetch: createApp({ api, token: "t", loopback: true, web: join(root, "none") }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    expect(await (await fetch(`${url}/api/lenses`)).json()).toEqual([{ name: "path", title: "Path", islands: 1, problems: 0 }]);
    expect(await (await fetch(`${url}/api/lens?name=path`)).json()).toMatchObject({ islands: [{ name: "Start", notes: ["a/one", "a/two"] }], elsewhere: ["a/three"] });
    expect((await fetch(`${url}/api/lens?name=nope`)).status).toBe(404);
    const tools = await (await fetch(`${url}/api/agent/tools`)).json() as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toContain("read_lens");
    const look = await fetch(`${url}/api/agent/look`, { method: "POST", headers: { Origin: url, "Content-Type": "application/json", "x-isorite-token": "t" }, body: JSON.stringify({ agent: "a", session: "s", tool: "read_lens", args: { name: "path" } }) });
    expect(((await look.json()) as { text: string }).text).toContain("## Start\n- One (/a/one.md)\n- Two (/a/two.md)\n## Elsewhere\n- Three (/a/three.md)");
  } finally { server.close(); }
});
