import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { readJournal } from "@isorite/core";
import { deviceId } from "../src/config.ts";
import { TOKEN_HEADER, createApp } from "../src/http.ts";
import { NodeFiles } from "../src/nodefiles.ts";
import { locate, openEngine } from "../src/serve.ts";
import { initStudyBase } from "../src/studybase.ts";

const NOTE = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise.\n";
const TOKEN = "the-token";
let root: string, notes: string, study: string, url: string, server: ReturnType<typeof nodeServe>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-http-"));
  notes = join(root, "information-theory");
  mkdirSync(join(notes, "basics"), { recursive: true });
  writeFileSync(join(notes, "basics", "entropy.md"), NOTE);
  study = initStudyBase(notes).path;
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web", "index.html"), "<!doctype html><title>isorite</title>");
  const api = await openEngine(locate(study), "testdev1", join(root, "config.toml"), undefined, null);
  server = nodeServe({ fetch: createApp({ api, token: TOKEN, loopback: true, web: join(root, "web") }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

const write = (path: string, body: unknown, { method = "PUT", headers = {} as Record<string, string> } = {}) =>
  fetch(url + path, { method, headers: { Origin: url, "Content-Type": "application/json", [TOKEN_HEADER]: TOKEN, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("a study base is found from either folder", () => {
  expect(locate(study)).toEqual({ notes, study });
  expect(locate(notes)).toEqual({ notes, study });
  expect(locate(join(root, "web"))).toEqual({ notes: join(root, "web"), study: null });
});

test("the session, the listing and the search", async () => {
  expect(await (await fetch(url + "/api/session")).json()).toEqual({ name: "information-theory", study: true, device: "testdev1", token: TOKEN });
  expect(await (await fetch(url + "/api/notes")).json()).toMatchObject({ notes: [{ id: "basics/entropy", title: "Entropy" }], dirs: ["basics"] });
  expect(await (await fetch(url + "/api/map")).json()).toMatchObject({ notes: { "basics/entropy": { title: "Entropy", step: 0 } }, model: { root: { kind: "dir" } } });
  expect(await (await fetch(url + "/api/search?q=surprise")).json()).toMatchObject([{ id: "basics/entropy" }]);
});

test("a note is read, saved to disk and journalled in the study base", async () => {
  const read = await (await fetch(url + "/api/note?id=basics/entropy")).json() as { text: string; version: string };
  expect(read.text).toBe(NOTE);
  const text = NOTE + "\nMeasured in bits.\n";
  const saved = await write("/api/note?id=basics/entropy", { base: read.version, text });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ changed: true });
  expect(readFileSync(join(notes, "basics", "entropy.md"), "utf8")).toBe(text);
  const onDisk = readJournal(readFileSync(join(study, "journal", "basics", "entropy.jsonl"), "utf8"));
  expect(onDisk.map((e) => [e.who, e.device])).toEqual([["external", "testdev1"], ["you", "testdev1"]]);
  expect(await (await fetch(url + "/api/journal?id=basics/entropy")).json()).toEqual(onDisk);

  const stale = await write("/api/note?id=basics/entropy", { base: read.version, text: "mine" });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ current: { text } });
});

test("a note is made, once", async () => {
  const made = await write("/api/note?id=channels/capacity", { text: "---\ntype: Concept\n---\n" }, { method: "POST" });
  expect(made.status).toBe(200);
  expect(statSync(join(notes, "channels", "capacity.md")).isFile()).toBe(true);
  expect((await write("/api/note?id=channels/capacity", { text: "x" }, { method: "POST" })).status).toBe(409);
});

test("exercises: a request for one is made on disk, the study page is read, and wind back is a write", async () => {
  const made = await write("/api/exercise/draft", { folder: "basics", tests: ["basics/entropy"] }, { method: "POST" });
  expect(made.status).toBe(200);
  const draft = await made.json() as { id: string; text: string };
  expect(draft.id).toMatch(/^@draft\//);
  expect(readFileSync(join(study, "drafts", draft.id.slice("@draft/".length) + ".md"), "utf8")).toContain("type: Exercise");
  expect((await write("/api/exercise/draft", { folder: "basics", tests: [] }, { method: "POST" })).status).toBe(400);
  mkdirSync(join(study, "study", "basics"), { recursive: true });
  writeFileSync(join(study, "study", "basics", "coin.md"), "---\ntype: Exercise\ntitle: A coin\ntests: [basics/entropy]\n---\n\nQ.\n\n## Working\n\n");
  expect(await (await fetch(url + "/api/study")).json()).toMatchObject({ exercises: [{ id: "@study/basics/coin", title: "A coin", result: null }], folders: expect.arrayContaining(["", "basics"]) });
  expect((await write("/api/exercise/wind-back?id=@study/basics/coin", {}, { method: "POST" })).status).toBe(200);
  expect(readFileSync(join(study, "record", "testdev1.jsonl"), "utf8")).toContain('"event":"wind-back","note":"basics/entropy"');
});

test("each write that should be refused is", async () => {
  const good = { base: "x", text: "x" };
  const refused = async (res: Promise<Response>) => [(await res).status, ((await (await res).json()) as { error: string }).error];
  expect(await refused(write("/api/note?id=basics/entropy", good, { headers: { Origin: "http://evil.example" } }))).toEqual([403, "cross-origin request refused"]);
  expect(await refused(fetch(url + "/api/note?id=basics/entropy", { method: "PUT", body: "{}", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: TOKEN } }))).toEqual([403, "cross-origin request refused"]);
  expect(await refused(write("/api/note?id=basics/entropy", good, { headers: { [TOKEN_HEADER]: "wrong" } }))).toEqual([403, "bad token"]);
  expect(await refused(write("/api/note?id=basics/entropy", good, { headers: { "Content-Type": "text/plain" } }))).toEqual([415, "JSON only"]);
  expect((await write("/api/note?id=basics/entropy", "{not json")).status).toBe(400);
  expect((await write("/api/note?id=basics/entropy", { base: "x" })).status).toBe(400);
  expect((await write("/api/note?id=basics/entropy", { ...good, extra: 1 })).status).toBe(400);
  expect((await write("/api/note?id=basics/entropy", { base: "x", text: "y".repeat(2_100_000) })).status).toBe(413);
  for (const id of ["../outside", "/etc/passwd", ".git/config", ""]) {
    expect((await write(`/api/note?id=${encodeURIComponent(id)}`, { text: "x" }, { method: "POST" })).status, id).toBe(400);
    expect((await fetch(`${url}/api/note?id=${encodeURIComponent(id)}`)).status, id).toBe(400);
  }
  expect((await fetch(url + "/api/note?id=no/such")).status).toBe(404);
  expect((await fetch(url + "/api/nothing")).status).toBe(404);
  // Signing in at the provider is a write like any other: another site cannot begin one, nor finish one.
  expect(await refused(write("/api/settings/connect", { callback: "http://evil.example/" }, { method: "POST", headers: { Origin: "http://evil.example" } }))).toEqual([403, "cross-origin request refused"]);
  expect(await refused(write("/api/settings/connected", { code: "c", state: "s" }, { method: "POST", headers: { [TOKEN_HEADER]: "wrong" } }))).toEqual([403, "bad token"]);
  expect((await write("/api/settings/connected", { code: "c", state: "s" }, { method: "POST" })).status).toBe(409);
});

test("signing in at the provider begins with its page, PKCE and all", async () => {
  const res = await write("/api/settings/connect", { callback: url + "/" }, { method: "POST" });
  const sent = new URL(((await res.json()) as { url: string }).url);
  expect(sent.origin + sent.pathname).toBe("https://openrouter.ai/auth");
  expect(Object.fromEntries(sent.searchParams)).toMatchObject({ callback_url: url + "/", code_challenge_method: "S256", key_label: "isorite" });
  expect(await (await fetch(url + "/api/settings")).json()).toMatchObject({ connect: true, key: false });
});

test("a name that is not this machine's is not answered", async () => {
  // A page on another site whose name has been pointed at this machine arrives with its own name as the Host.
  const app = createApp({ api: await openEngine(locate(study), "testdev1", join(root, "config.toml"), undefined, null), token: TOKEN, loopback: true, web: join(root, "web") });
  const as = (host: string, path: string) => app.request("http://x" + path, { headers: { host } });
  expect((await as("evil.example", "/api/session")).status).toBe(403);
  const page = await as("evil.example:4767", "/");
  expect(page.status).toBe(403);
  expect(await page.text()).toContain("--allow-host");
  // A tailnet's name is answered (tailscale serve), and so is a name allowed when it was started.
  expect((await as("laptop.tail1234.ts.net", "/")).status).toBe(200);
  const named = createApp({ api: await openEngine(locate(study), "testdev1", join(root, "config.toml"), undefined, null), token: TOKEN, loopback: true, web: null, allowHosts: ["Notes.Example"] });
  expect((await named.request("http://x/api/session", { headers: { host: "notes.example" } })).status).toBe(200);
  expect((await as("localhost:4767", "/api/session")).status).toBe(200);
  expect((await as("127.0.0.1:4767", "/api/session")).status).toBe(200);
  expect((await as("[::1]:4767", "/")).status).toBe(200);
});

test("the event stream carries a save as it happens", async () => {
  const stream = await fetch(url + "/api/events");
  expect(stream.headers.get("content-type")).toContain("text/event-stream");
  const reader = stream.body!.getReader(), decoder = new TextDecoder();
  let seen = "";
  const until = async (what: string) => { while (!seen.includes(what)) seen += decoder.decode((await reader.read()).value); };
  await until("event: open");
  const now = await (await fetch(url + "/api/note?id=basics/entropy")).json() as { text: string; version: string };
  await write("/api/note?id=basics/entropy", { base: now.version, text: now.text + "\nStreamed.\n" });
  await until("event: note-changed");
  expect(seen).toContain("event: journal");
  expect(seen).toContain('"who":"you"');
  await reader.cancel();
});

test("the app's files are served, and nothing outside its folder", async () => {
  expect(await (await fetch(url + "/")).text()).toContain("<title>isorite</title>");
  expect((await fetch(url + "/%2e%2e/information-theory/basics/entropy.md")).status).toBe(404);
  expect((await fetch(url + "/missing.js")).status).toBe(404);
});

test("the file port keeps to its folder and replaces a file whole", async () => {
  const files = new NodeFiles(join(root, "web"));
  await files.write("a/b.txt", "one");
  await files.write("a/b.txt", "two");
  await files.append("a/log.jsonl", "1\n");
  await files.append("a/log.jsonl", "2\n");
  expect(await files.read("a/b.txt")).toBe("two");
  expect(await files.read("a/log.jsonl")).toBe("1\n2\n");
  expect(await files.list("a")).toEqual([{ name: "b.txt", dir: false }, { name: "log.jsonl", dir: false }]);
  expect(await files.read("a/none")).toBeNull();
  expect(await files.list("none")).toEqual([]);
  await expect(files.read("../information-theory/basics/entropy.md")).rejects.toThrow("leaves the folder");
});

test("the device id is made once and kept, readable by its owner only", () => {
  const path = join(root, "config", "isorite", "config.toml");
  const id = deviceId(path);
  expect(id).toMatch(/^[a-z0-9]{8}$/);
  expect(deviceId(path)).toBe(id);
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("a terminal agent is offered the tools and looks up as the page writes: from the origin, with the token", async () => {
  const tools = await (await fetch(url + "/api/agent/tools")).json() as { function: { name: string } }[];
  expect(tools.map((t) => t.function.name)).toEqual(["brief_base", "search_notes", "outline_note", "read_note", "propose_note_edit", "propose_note_write"]);
  const look = { agent: "opencode", session: "ses_1", tool: "search_notes", args: { query: "surprise" } };
  const found = await write("/api/agent/look", look, { method: "POST" });
  expect(found.status).toBe(200);
  expect(((await found.json()) as { text: string }).text).toContain("Entropy (/basics/entropy.md)");
  expect((await write("/api/agent/look", look, { method: "POST", headers: { [TOKEN_HEADER]: "wrong" } })).status).toBe(403);
  expect((await fetch(url + "/api/agent/look", { method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: TOKEN }, body: JSON.stringify(look) })).status).toBe(403);
  expect((await write("/api/agent/look", { ...look, agent: "Not A Name" }, { method: "POST" })).status).toBe(400);
  expect((await write("/api/agent/status", { agent: "opencode", session: "ses_1", busy: false }, { method: "POST" })).status).toBe(200);
});
