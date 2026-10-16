import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { insertAt, pending, readJournal } from "@isorite/core";
import { ConfigSecrets, providerConfig } from "../src/config.ts";
import { TOKEN_HEADER, createApp } from "../src/http.ts";
import { locate, openEngine } from "../src/serve.ts";
import { initStudyBase } from "../src/studybase.ts";
import { scripted } from "../../engine/test/scripted.ts";

const NOTE = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise.\n";
const TOKEN = "the-token";
let root: string, notes: string, study: string, config: string, url: string, server: ReturnType<typeof nodeServe>;
const provider = scripted([{ text: ["Measured ", "in bits."] }]);

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-iso-"));
  notes = join(root, "information-theory");
  mkdirSync(join(notes, "basics"), { recursive: true });
  writeFileSync(join(notes, "basics", "entropy.md"), NOTE);
  study = initStudyBase(notes).path;
  config = join(root, "config.toml");
  const api = await openEngine(locate(study), "testdev1", config, provider.http, null);
  server = nodeServe({ fetch: createApp({ api, token: TOKEN, loopback: true, web: null }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

const send = (path: string, body: unknown, method = "POST", headers: Record<string, string> = {}) =>
  fetch(url + path, { method, headers: { Origin: url, "Content-Type": "application/json", [TOKEN_HEADER]: TOKEN, ...headers }, body: JSON.stringify(body) });

test("the key goes in, is kept for its owner alone, and never comes out", async () => {
  expect(await (await fetch(url + "/api/settings")).json()).toMatchObject({ provider: "openrouter", key: false });
  expect((await send("/api/settings/key", { key: "sk-or-secret" }, "PUT", { [TOKEN_HEADER]: "wrong" })).status).toBe(403);
  const set = await send("/api/settings/key", { key: "sk-or-secret" }, "PUT");
  expect(await set.text()).not.toContain("sk-or-secret");
  expect(await (await fetch(url + "/api/settings")).text()).not.toContain("sk-or-secret");
  expect(await (await fetch(url + "/api/settings")).json()).toMatchObject({ key: true });
  expect(statSync(config).mode & 0o777).toBe(0o600);
  expect(readFileSync(config, "utf8")).toContain('key = "sk-or-secret"');
  expect(await new ConfigSecrets(config).get("provider.key")).toBe("sk-or-secret");
});

test("asking over HTTP: the reply streams as events and ends as a proposal; keeping it writes the note", async () => {
  const stream = await fetch(url + "/api/events");
  const reader = stream.body!.getReader(), decoder = new TextDecoder();
  let seen = "";
  const until = async (what: string) => { while (!seen.includes(what)) seen += decoder.decode((await reader.read()).value); };
  await until("event: open");

  const body = { note: "basics/entropy", ...insertAt(NOTE, 99), asked: "say the unit", tier: "mid" };
  expect((await send("/api/iso/ask", body, "POST", { Origin: "http://evil.example" })).status).toBe(403);
  expect((await send("/api/iso/ask", { ...body, tier: "huge" })).status).toBe(400);
  const asked = await send("/api/iso/ask", body);
  expect(asked.status).toBe(200);
  expect(await asked.json()).toEqual({ request: expect.any(String) });
  await until("event: iso-done");
  expect(seen).toContain("event: iso-start");
  expect(seen).toContain('"delta":"Measured "');
  expect(provider.headers[0]!.Authorization).toBe("Bearer sk-or-secret");
  await reader.cancel();

  expect(readFileSync(join(notes, "basics", "entropy.md"), "utf8")).toBe(NOTE);
  const [p] = pending(readJournal(readFileSync(join(study, "journal", "basics", "entropy.jsonl"), "utf8")));
  expect(p).toMatchObject({ text: "Measured in bits.", asked: "say the unit" });

  expect((await send("/api/proposal/revise?id=basics/entropy", { proposal: p!.id, text: "Measured in bits, to base 2." })).status).toBe(200);
  const kept = await send("/api/proposal/keep?id=basics/entropy", { proposal: p!.id });
  expect(await kept.json()).toMatchObject({ changed: true });
  expect(readFileSync(join(notes, "basics", "entropy.md"), "utf8")).toBe(NOTE + "\nMeasured in bits, to base 2.\n");
  expect((await send("/api/proposal/discard?id=basics/entropy", { proposal: p!.id })).status).toBe(409);
});

test("the context report and clearing the conversation over HTTP", async () => {
  const report = await (await fetch(url + "/api/context?id=basics/entropy")).json() as { tokens: number; parts: { name: string; detail: string }[]; session: { requests: number } };
  expect(report.parts.map((p) => p.name)).toEqual(["instructions and tools", "study record", "your prompts and Iso's answers", "this note", "linked notes"]);
  expect(report.session.requests).toBe(1);
  expect(report.parts[2]!.detail).toBe("1 moment");
  expect((await send("/api/context/clear", {}, "POST", { [TOKEN_HEADER]: "wrong" })).status).toBe(403);
  expect((await send("/api/context/clear", {})).status).toBe(200);
  const cleared = await (await fetch(url + "/api/context")).json() as typeof report;
  expect(cleared.parts[2]!.detail).toBe("");
  expect(cleared.session.requests).toBe(1); // what was spent is still spent
  expect(readFileSync(join(study, "record", "testdev1.jsonl"), "utf8")).toContain("context-cleared");
});

test("another provider and other models are read from the configuration", () => {
  const path = join(root, "other.toml");
  writeFileSync(path, 'device = "abcd1234"\n\n[provider]\nname = "local"\nurl = "http://localhost:11434/v1"\n\n[tiers]\nmid = "llama3"\n\n[prices]\nllama3 = [0, 0]\n');
  expect(providerConfig(path)).toMatchObject({ name: "local", url: "http://localhost:11434/v1", cacheMarks: false, tiers: { mid: "llama3", low: "anthropic/claude-haiku-4.5" }, prices: { llama3: [0, 0] } });
  expect(providerConfig(path).auth).toBeUndefined();
  expect(providerConfig(join(root, "none.toml"))).toMatchObject({ name: "openrouter", auth: "https://openrouter.ai/auth" });
  // A provider that makes keys as OpenRouter does names its sign-in page.
  writeFileSync(path, '[provider]\nname = "other"\nurl = "http://127.0.0.1:9/v1"\nauth = "http://127.0.0.1:9/auth"\n');
  expect(providerConfig(path).auth).toBe("http://127.0.0.1:9/auth");
});
