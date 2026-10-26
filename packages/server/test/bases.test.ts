// Several bases in one server (M20): listed in bases.toml as they are opened, each at /b/<name>/, the lent ones
// open from the start and lent to every base's agent; and isorite memory and isorite bases.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { AGENTS_FILE } from "@isorite/core";
import { basesPath, knownBases, lendBase, rememberBase } from "../src/config.ts";
import { TOKEN_HEADER } from "../src/http.ts";
import { MEMORY_AGENTS, bases as basesCommand, memory } from "../src/memory.ts";
import { openServer } from "../src/serve.ts";

const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
let root: string, config: string, project: string, mem: string, other: string;
let server: Awaited<ReturnType<typeof openServer>>, held: string[];

const ask = (path: string, init: RequestInit = {}) => server.fetch(new Request(`http://localhost:4767${path}`, { ...init, headers: { Host: "localhost:4767", ...(init.headers as Record<string, string>) } }));
const json = async <T>(path: string, init?: RequestInit) => (await (await ask(path, init)).json()) as T;
async function post(path: string, body: unknown, at = "") {
  const { token } = await json<{ token: string }>(`${at}/api/session`);
  return ask(`${at}${path}`, { method: "POST", headers: { Origin: "http://localhost:4767", "Content-Type": "application/json", [TOKEN_HEADER]: token }, body: JSON.stringify(body) });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-bases-"));
  config = join(root, "config", "isorite", "config.toml");
  project = join(root, "Information Theory");
  mkdirSync(join(project, "basics"), { recursive: true });
  writeFileSync(join(project, "basics", "entropy.md"), note("Entropy", "The average surprise."));
  mem = join(root, "isorite-memory");
  const said: string[] = [];
  expect(memory(mem, { config, out: (l) => said.push(l) })).toBe(0);
  expect(said.join("\n")).toContain("lent to every session");
  writeFileSync(join(mem, "tools.md"), note("OpenCode's config", "In ~/.config/opencode."));
  other = join(root, "other");
  mkdirSync(other);
  writeFileSync(join(other, "a.md"), note("A", "a"));
  rememberBase(other, { path: config });
  held = [];
  server = await openServer(project, { config, model: null, idle: () => held.push("idle") });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("isorite memory makes the base, a repository, its practice and its row, lent; run again it changes nothing", () => {
  expect(readFileSync(join(mem, AGENTS_FILE), "utf8")).toBe(MEMORY_AGENTS);
  expect(existsSync(join(mem, ".git"))).toBe(true);
  expect(existsSync(join(mem, ".isorite"))).toBe(true);
  const said: string[] = [];
  memory(mem, { config, out: (l) => said.push(l) });
  expect(said).toEqual([`the memory is memory, at ${mem}: lent to every session`]);
  // A folder holding other things is not made a memory.
  expect(() => memory(other, { config, out: () => undefined })).toThrow(/has files in it already/);
});

test("bases are listed as they are opened, under the folder's name, with no two alike; config.toml is not touched", () => {
  expect(knownBases(config).map((b) => [b.name, b.lend])).toEqual([["memory", true], ["other", false], ["information-theory", false]]);
  const twin = join(root, "twin", "other");
  mkdirSync(twin, { recursive: true });
  expect(rememberBase(twin, { path: config })).toBe("other-2");
  expect(rememberBase(other, { path: config })).toBe("other");
  expect(readFileSync(basesPath(config), "utf8")).toContain(`[other-2]`);
  expect(existsSync(config) ? readFileSync(config, "utf8") : "").not.toContain("bases");
  expect(lendBase("nobody", true, config)).toBe(false);
  const said: string[] = [];
  basesCommand([], { config, out: (l) => said.push(l) });
  expect(said[0]).toMatch(/^memory +lent +.*isorite-memory$/);
});

test("each base's API at /b/<name>/api/, the first at /api/ too; an unknown name is a 404", async () => {
  expect((await json<{ name: string }>("/api/session")).name).toBe("information-theory");
  expect((await json<{ name: string }>("/b/information-theory/api/session")).name).toBe("information-theory");
  expect((await json<{ notes: { id: string }[] }>("/b/memory/api/notes")).notes.map((n) => n.id)).toEqual(["tools"]);
  expect((await ask("/b/nobody/api/notes")).status).toBe(404);
  // Its page is the app's, told which base.
  expect((await ask("/b/memory")).headers.get("location")).toBe("/?base=memory");
  // A base known but not lent is opened when asked for.
  expect((await json<{ notes: { id: string }[] }>("/b/other/api/notes")).notes.map((n) => n.id)).toEqual(["a"]);
});

test("the switcher's list: each base, lent or not, open or not, and which this page is", async () => {
  const listed = await json<{ here: string; local: boolean; bases: { name: string; lend: boolean; open: boolean }[] }>("/b/memory/api/bases");
  expect(listed.here).toBe("memory");
  expect(listed.local).toBe(true);
  expect(listed.bases.find((b) => b.name === "memory")).toMatchObject({ lend: true, open: true });
});

test("an agent in the project is lent the memory: its tools take a base, and what it writes is there", async () => {
  const base = await json<{ lent: string[] }>("/api/agent/base");
  expect(base.lent).toEqual(["memory"]);
  const brief = await (await post("/api/agent/look", { agent: "opencode", session: "s1", tool: "brief_base", args: {} })).json() as { text: string };
  expect(brief.text).toContain("- memory: What you keep across projects: the person, their tools, and what you have learned working with them.");
  const wrote = await post("/api/agent/look", { agent: "opencode", session: "s1", tool: "write_note", args: { base: "memory", note: "you/pronouns", content: note("Pronouns", "They/them.") }, asked: "remember" });
  expect(wrote.status).toBe(200);
  expect(readFileSync(join(mem, "you", "pronouns.md"), "utf8")).toContain("They/them.");
  const refused = await post("/api/agent/look", { agent: "opencode", session: "s1", tool: "read_note", args: { id: "other:a" } });
  expect(refused.status).toBe(404);
  expect(((await refused.json()) as { error: string }).error).toMatch(/no base other lent here: the bases are memory/);
});

test("lending from the page, and opening a base by its folder, only from this machine", async () => {
  expect((await post("/api/bases/lend", { name: "other", lend: true })).status).toBe(200);
  expect(knownBases(config).find((b) => b.name === "other")?.lend).toBe(true);
  expect((await json<{ lent: string[] }>("/api/agent/base")).lent).toEqual(["memory", "other"]);
  await post("/api/bases/lend", { name: "other", lend: false });
  const third = join(root, "third");
  mkdirSync(third);
  expect(await (await post("/api/bases/open", { path: third })).json()).toEqual({ name: "third", first: false });
  expect(await (await post("/api/bases/open", { path: project })).json()).toEqual({ name: "information-theory", first: true });
  expect((await post("/api/bases/open", { path: "relative/path" })).status).toBe(404);
  // From a tailnet's name: refused.
  const { token } = await json<{ token: string }>("/api/session");
  const far = await server.fetch(new Request("http://box.tail1.ts.net/api/bases/lend", { method: "POST", headers: { Host: "box.tail1.ts.net", Origin: "http://box.tail1.ts.net", "Content-Type": "application/json", [TOKEN_HEADER]: token }, body: JSON.stringify({ name: "other", lend: true }) }));
  expect(far.status).toBe(403);
});

test("held while a stream is open; let go by the last, the server is told it is idle", async () => {
  const first = await ask("/api/server/hold"), second = await ask("/b/memory/api/server/hold");
  await first.body!.cancel();
  await new Promise((r) => setTimeout(r, 1200));
  expect(held).toEqual([]);
  await second.body!.cancel();
  await expect.poll(() => held, { timeout: 3000 }).toEqual(["idle"]);
});
