// The global base and the skills base (docs/format.md): always listed above a person's own bases, the global base's
// notes linked from any base as global:<id>.md, both lent to the agent while they have notes, and the skills base
// reading the person's skills as notes with the built-in ones beside them, read only.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { rememberBase } from "../src/config.ts";
import { TOKEN_HEADER } from "../src/http.ts";
import { check } from "../src/main.ts";
import { openServer } from "../src/serve.ts";

const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
let root: string, config: string, data: string, project: string;
let server: Awaited<ReturnType<typeof openServer>>;

const ask = (path: string, init: RequestInit = {}) => server.fetch(new Request(`http://localhost:4767${path}`, { ...init, headers: { Host: "localhost:4767", ...(init.headers as Record<string, string>) } }));
const json = async <T>(path: string, init?: RequestInit) => (await (await ask(path, init)).json()) as T;
async function post(path: string, body: unknown, at = "", method = "POST") {
  const { token } = await json<{ token: string }>(`${at}/api/session`);
  return ask(`${at}${path}`, { method, headers: { Origin: "http://localhost:4767", "Content-Type": "application/json", [TOKEN_HEADER]: token }, body: JSON.stringify(body) });
}
const look = async (tool: string, args: Record<string, unknown>, asked = "") => ((await (await post("/api/agent/look", { agent: "opencode", session: "s1", tool, args, asked })).json()) as { text: string }).text;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-special-"));
  config = join(root, "config", "isorite", "config.toml");
  data = join(root, "data");
  project = join(root, "papers");
  mkdirSync(join(project, "basics"), { recursive: true });
  writeFileSync(join(project, "basics", "entropy.md"), note("Entropy", "See [naming](global:conventions/naming.md \"see also\") and [gone](global:nothing/here.md)."));
  server = await openServer(project, { config, model: null, data });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

let server2: typeof server, data2: string;
const ask2 = (path: string, init: RequestInit = {}) => server2.fetch(new Request(`http://localhost:4767${path}`, { ...init, headers: { Host: "localhost:4767", ...(init.headers as Record<string, string>) } }));
const json2 = async <T>(path: string, init?: RequestInit) => (await (await ask2(path, init)).json()) as T;
async function post2(path: string, body: unknown, at = "", method = "POST") {
  const { token } = await json2<{ token: string }>(`${at}/api/session`);
  return ask2(`${at}${path}`, { method, headers: { Origin: "http://localhost:4767", "Content-Type": "application/json", [TOKEN_HEADER]: token }, body: JSON.stringify(body) });
}
const look2 = async (tool: string, args: Record<string, unknown>) => ((await (await post2("/api/agent/look", { agent: "opencode", session: "s1", tool, args })).json()) as { text: string }).text;

// A second server, for a person who has a skill: the skills base reads its folder when it opens.
beforeAll(async () => {
  data2 = join(root, "data2");
  const skill = join(data2, "skills", "release-notes");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: release-notes\ndescription: Write release notes from the merged pull requests.\n---\n\nList what changed, newest first.\n");
  writeFileSync(join(skill, "collect.sh"), "#!/bin/sh\ngh pr list --state merged\n");
  server2 = await openServer(project, { config: join(root, "config2", "isorite", "config.toml"), model: null, data: data2 });
});

test("the two special bases are listed first, whatever else is known, and an ordinary base never takes their names", async () => {
  // A folder called "global" is given another name, as the special one stands.
  const same = join(root, "elsewhere", "global");
  mkdirSync(same, { recursive: true });
  expect(rememberBase(same, { path: config })).toBe("global-2");
  const listed = await json<{ bases: { name: string; title: string; special?: string }[] }>("/api/bases");
  expect(listed.bases.slice(0, 2).map((b) => [b.name, b.title, b.special])).toEqual([["global", "Global", "global"], ["skills", "Skills", "skills"]]);
  expect(listed.bases.slice(2).every((b) => !b.special)).toBe(true);
  expect((await json<{ special: string }>("/b/global/api/session")).special).toBe("global");
});

test("the global base is made with an AGENTS.md saying what it is for, and is not lent while it has no notes", async () => {
  const agents = readFileSync(join(data, "global", "AGENTS.md"), "utf8");
  expect(agents).toMatch(/^# Knowledge that holds across bases/);
  // The built-in skills alone do not lend the skills base: the agent has them through use_skill.
  expect((await json<{ lent: string[] }>("/api/agent/base")).lent).toEqual([]);
  const brief = await look("brief_base", {});
  expect(brief).not.toContain("lent to you");
  expect(brief).not.toContain("global");
});

test("a note of the global base: lent with a line on it, looked up and written with base, journalled in the global base's own journal", async () => {
  const g = server.bases.base("global")!;
  await g.createNote("conventions/naming", note("Naming", "Name things for what they do."));
  await g.createNote("conventions/glossary", note("Glossary", "Terms we use the same way everywhere."));
  await expect.poll(async () => (await json<{ lent: string[] }>("/api/agent/base")).lent, { timeout: 3000 }).toEqual(["global"]);
  const brief = await look("brief_base", {});
  expect(brief).toContain("- global: Knowledge that holds across bases: conventions, a glossary, the people you work with.");
  expect(await look("search_notes", { query: "glossary", base: "global" })).toContain("Glossary");
  expect(await look("read_note", { id: "global:conventions/glossary" })).toContain("Terms we use");
  const wrote = await look("write_note", { base: "global", note: "people/ada", content: note("Ada", "Works on the compiler.") }, "remember Ada");
  expect(wrote).toContain("Made Ada");
  expect(existsSync(join(data, "global", "people", "ada.md"))).toBe(true);
  expect(existsSync(join(project, "people"))).toBe(false);
  const entries = await g.journal("people/ada");
  expect(entries.length).toBeGreaterThan(0);
  expect(entries[0]!.who).toBe("agent:opencode");
  expect(existsSync(join(data, "global", ".isorite", "journal"))).toBe(true);
});

test("a link to the global base is on the map as a satellite, marked broken where the note is not there", async () => {
  const map = await json<{ notes: Record<string, { links?: { kind: string; href: string; broken?: boolean }[] }> }>("/api/map");
  const links = map.notes["basics/entropy"]!.links!;
  expect(links.find((l) => l.href === "global:conventions/naming.md")).toMatchObject({ kind: "global" });
  expect(links.find((l) => l.href === "global:conventions/naming.md")!.broken).toBeUndefined();
  expect(links.find((l) => l.href === "global:nothing/here.md")).toMatchObject({ kind: "global", broken: true });
});

test("check reports a link to a global note that is not there, and only that", () => {
  const said: string[] = [];
  expect(check(project, (l) => said.push(l), false, false, false, join(data, "global"))).toBe(0);
  const text = said.join("\n");
  expect(text).toContain("broken link to the global base: nothing/here");
  expect(text).not.toContain("conventions/naming");
  expect(text).toContain("1 warnings");
});

test("the skills base: a skill is a folder, its SKILL.md a note named and described by its frontmatter, its scripts items; built-in ones are read only", async () => {
  const skill = join(data2, "skills", "release-notes");
  const notes = await json2<{ notes: { id: string; title: string; description: string; type: string }[] }>("/b/skills/api/notes");
  const mine = notes.notes.find((n) => n.id === "release-notes/SKILL")!;
  expect(mine).toMatchObject({ title: "release-notes", description: "Write release notes from the merged pull requests.", type: "Skill" });
  expect(notes.notes.some((n) => n.id.startsWith("built-in/"))).toBe(true);
  const map = await json2<{ files?: Record<string, { kind: string }> }>("/b/skills/api/map");
  expect(map.files?.["release-notes/collect.sh"]).toMatchObject({ kind: "code" });
  // Editing a built-in one is refused; the person's own is edited in place.
  const builtIn = notes.notes.find((n) => n.id.startsWith("built-in/"))!.id;
  const source = await json2<{ text: string; version: string }>(`/b/skills/api/note?id=${encodeURIComponent(builtIn)}`);
  const refused = await post2(`/b/skills/api/note?id=${encodeURIComponent(builtIn)}`, { base: source.version, text: source.text + "\nmore" }, "", "PUT");
  expect(refused.status).toBe(403);
  const mineSource = await json2<{ text: string; version: string }>("/b/skills/api/note?id=release-notes%2FSKILL");
  const saved = await post2("/b/skills/api/note?id=release-notes%2FSKILL", { base: mineSource.version, text: mineSource.text.replace("newest first", "oldest first") }, "", "PUT");
  expect(saved.status).toBe(200);
  expect(readFileSync(join(skill, "SKILL.md"), "utf8")).toContain("oldest first");
});

test("the skills base is lent to the agent once the person has a skill, and the built-in ones alone do not lend it", async () => {
  const lent = (await json2<{ lent: string[] }>("/api/agent/base")).lent;
  expect(lent).toContain("skills");
  expect(await look2("search_notes", { query: "release notes", base: "skills" })).toContain("release-notes");
});
