import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createApp } from "../src/http.ts";
import { locate, openEngine } from "../src/serve.ts";

let root: string, url: string, server: ReturnType<typeof nodeServe>, api: Awaited<ReturnType<typeof openEngine>>;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-etag-"));
  const notes = join(root, "base");
  mkdirSync(notes);
  writeFileSync(join(notes, "a.md"), "---\ntype: Concept\ntitle: A\n---\n\n" + "words and more words. ".repeat(100));
  mkdirSync(join(root, "web", "fonts"), { recursive: true });
  writeFileSync(join(root, "web", "index.html"), "<!doctype html><title>isorite</title>" + "<p>x</p>".repeat(300));
  writeFileSync(join(root, "web", "fonts", "f.woff2"), "font");
  api = await openEngine(locate(notes), "testdev1", null);
  server = nodeServe({ fetch: createApp({ api, token: "t", loopback: true, web: join(root, "web") }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

test("the list and the map carry an ETag and answer 304 until the base changes", async () => {
  for (const path of ["/api/notes", "/api/map"]) {
    const first = await fetch(url + path);
    const tag = first.headers.get("etag");
    expect(tag).toBeTruthy();
    expect((await first.json() as object)).toBeTruthy();
    expect((await fetch(url + path, { headers: { "If-None-Match": tag! } })).status).toBe(304);
  }
  const tag = (await fetch(url + "/api/notes")).headers.get("etag")!;
  const note = await api.readNote("a");
  await api.saveNote("a", { base: note.version, text: note.text + "more\n" });
  const after = await fetch(url + "/api/notes", { headers: { "If-None-Match": tag } });
  expect(after.status).toBe(200);
  expect(after.headers.get("etag")).not.toBe(tag);
});

test("static files are compressed, tagged, and fonts are kept for good", async () => {
  const raw = await (await fetch(url + "/", { headers: { "Accept-Encoding": "identity" } })).text();
  const res = await fetch(url + "/", { headers: { "Accept-Encoding": "br" } });
  expect(res.headers.get("content-type")).toMatch(/text\/html/);
  const tag = res.headers.get("etag")!;
  expect(res.headers.get("cache-control")).toBe("no-cache");
  expect(res.headers.get("content-encoding")).toBe("br");
  expect(await res.text()).toBe(raw); // fetch has undone the encoding
  expect((await fetch(url + "/", { headers: { "If-None-Match": tag } })).status).toBe(304);
  expect((await fetch(url + "/fonts/f.woff2")).headers.get("cache-control")).toMatch(/immutable/);
});
