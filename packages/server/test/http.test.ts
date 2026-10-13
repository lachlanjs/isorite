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
  const api = await openEngine(locate(study), "testdev1");
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
});

test("a name that is not this machine's is not answered", async () => {
  // A page on another site whose name has been pointed at this machine arrives with its own name as the Host.
  const app = createApp({ api: await openEngine(locate(study), "testdev1"), token: TOKEN, loopback: true, web: join(root, "web") });
  const as = (host: string, path: string) => app.request("http://x" + path, { headers: { host } });
  expect((await as("evil.example", "/api/session")).status).toBe(403);
  expect((await as("evil.example:4767", "/")).status).toBe(404);
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
