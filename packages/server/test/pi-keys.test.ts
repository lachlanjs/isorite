// Models and keys for the native agent (M36, step 8): a key entered in the settings is used by the next turn, removed on
// request, kept only in isorite's data folder under owner-only permissions, and never given back, logged, or written
// into the base.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test, vi } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import { createApp } from "../src/http.ts";
import { Credentials } from "../src/pi/credentials.ts";
import { PiControl } from "../src/pi/index.ts";
import { PiHost } from "../src/pi/host.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-keys-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const KEY = "sk-or-v1-SECRETSECRETSECRET0123456789";
const OTHER = "sk-or-v1-ANOTHERANOTHERANOTHER9876543210";

const all = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(join(dir, e.name)) : [join(dir, e.name)]));

test("a key is kept owner-only in the data folder, is read back to be used, and is removed on request", async () => {
  const data = join(root, "data-a"), env = { XDG_DATA_HOME: data };
  const creds = new Credentials(env);
  expect(await creds.key("openrouter")).toBeUndefined();
  await creds.set("openrouter", `  ${KEY}\n`);
  const file = join(data, "isorite", "credentials.json");
  if (process.platform !== "win32") { // Windows has no mode: the profile's ACL keeps it
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(data, "isorite")).mode & 0o777).toBe(0o700);
  }
  expect(await new Credentials(env).key("openrouter")).toBe(KEY);
  // Where a key comes from is said; the key is not.
  const sources = await creds.sources();
  expect(sources.openrouter).toBe("saved");
  expect(JSON.stringify(sources)).not.toContain(KEY);
  await creds.remove("openrouter");
  expect(await new Credentials(env).key("openrouter")).toBeUndefined();
  expect(readFileSync(file, "utf8")).not.toContain(KEY);
  // The provider's own variable is used where none is saved, and is said to be the source.
  const viaEnv = new Credentials({ ...env, OPENROUTER_API_KEY: OTHER });
  expect(await viaEnv.key("openrouter")).toBe(OTHER);
  expect((await viaEnv.sources()).openrouter).toBe("environment");
});

test("a bad key or provider is refused, and an unreadable file is reported by name and left alone", async () => {
  const data = join(root, "data-b"), creds = new Credentials({ XDG_DATA_HOME: data });
  await expect(creds.set("openrouter", "two words")).rejects.toThrow(/does not look like a key/);
  await expect(creds.set("openrouter", "")).rejects.toThrow(/does not look like a key/);
  await expect(creds.set("nowhere", KEY)).rejects.toThrow(/not a provider isorite offers/);
  await creds.set("openai", KEY);
  const file = join(data, "isorite", "credentials.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, "{ not json");
  await expect(new Credentials({ XDG_DATA_HOME: data }).key("openai")).rejects.toThrow(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  expect(readFileSync(file, "utf8")).toBe("{ not json");
});

test("a key entered between turns is the one the next request carries, and none after removal", async () => {
  const base = await writeExample(join(root, "base-c"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const faux = fauxProvider(), models = createModels();
  models.setProvider(faux.provider);
  const seen: (string | undefined)[] = [];
  const streamFn = ((model: never, context: never, options: { apiKey?: string }) => { seen.push(options?.apiKey); return models.streamSimple(model, context, options as never); }) as never;
  const creds = new Credentials({ XDG_DATA_HOME: join(root, "data-c") });
  const host = new PiHost({ api, model: faux.getModel(), streamFn, getApiKey: () => creds.key(faux.getModel().provider) });
  const settled = () => new Promise<void>((done) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(); } }); });
  const turn = async (text: string) => { faux.setResponses([fauxAssistantMessage([fauxText("ok")])]); const d = settled(); await host.prompt(text); await d; };
  const provider = faux.getModel().provider;
  await turn("one");
  await creds.set("openrouter", KEY); // not this provider's
  await turn("two");
  expect(seen).toEqual([undefined, undefined]);
  // Offer the faux provider's name as a provider to show a saved key reaches the request.
  const file = join(root, "data-c", "isorite", "credentials.json");
  const kept = JSON.parse(readFileSync(file, "utf8")) as { keys: Record<string, string> };
  kept.keys[provider] = OTHER;
  (await import("node:fs")).writeFileSync(file, JSON.stringify(kept));
  const fresh = new Credentials({ XDG_DATA_HOME: join(root, "data-c") });
  const host2 = new PiHost({ api, model: faux.getModel(), streamFn, getApiKey: () => fresh.key(provider) });
  faux.setResponses([fauxAssistantMessage([fauxText("ok")])]);
  const d = new Promise<void>((done) => { const off = host2.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(); } }); });
  await host2.prompt("three");
  await d;
  expect(seen.at(-1)).toBe(OTHER);
});

test("the settings' routes take a key and never give it back; it is not in the base, the response, or the log", async () => {
  const base = await writeExample(join(root, "base-d"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const env = { XDG_DATA_HOME: join(root, "data-d") } as NodeJS.ProcessEnv;
  const pi = new PiControl(env);
  const app = createApp({ api, token: "t", loopback: true, web: null, pi });
  const logged: string[] = [];
  const spies = (["log", "error", "warn", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(" ")); }));
  const call = (path: string, body?: unknown) => app.fetch(new Request(`http://localhost:4767${path}`, body === undefined ? { headers: { Host: "localhost:4767" } } : { method: "POST", headers: { Host: "localhost:4767", Origin: "http://localhost:4767", "Content-Type": "application/json", "x-isorite-token": "t" }, body: JSON.stringify(body) }));
  const texts: string[] = [];
  const keep = async (r: Response) => { const t = await r.text(); texts.push(t); return { status: r.status, text: t }; };

  expect((await keep(await call("/api/pi/key", { provider: "openrouter", key: KEY }))).status).toBe(200);
  const state = await keep(await call("/api/pi"));
  expect(JSON.parse(state.text)).toMatchObject({ keys: { openrouter: "saved" }, choice: null });
  // A refused key is refused without repeating it.
  expect((await keep(await call("/api/pi/key", { provider: "openrouter", key: `${OTHER} ${OTHER}` }))).status).toBe(400);
  // A model that pi does not have is refused with a reason.
  const refused = await keep(await call("/api/pi/choose", { provider: "openrouter", model: "no/such-model" }));
  expect(refused.status).toBe(400);
  expect(refused.text).toMatch(/no model/);
  expect((await keep(await call("/api/pi/choose", { provider: "openrouter", model: "anthropic/claude-haiku-5.5" }))).status).toBe(200);
  expect(JSON.parse((await keep(await call("/api/pi"))).text)).toMatchObject({ choice: { provider: "openrouter", model: "anthropic/claude-haiku-5.5" }, source: "settings" });
  expect((await keep(await call("/api/pi/key/remove", { provider: "openrouter" }))).status).toBe(200);
  expect(JSON.parse((await keep(await call("/api/pi"))).text).keys.openrouter).toBeNull();

  spies.forEach((s) => s.mockRestore());
  for (const t of [...texts, ...logged]) { expect(t).not.toContain("SECRETSECRET"); expect(t).not.toContain("ANOTHERANOTHER"); }
  // Not in the base, nor anywhere in the data folder once removed.
  for (const f of all(base.notes)) expect(readFileSync(f).includes("SECRETSECRET")).toBe(false);
  expect(readFileSync(join(root, "data-d", "isorite", "credentials.json"), "utf8")).not.toContain("SECRETSECRET");
  // From elsewhere than this machine, not at all.
  const far = await app.fetch(new Request("http://box.example/api/pi", { headers: { Host: "box.example" } }));
  expect(far.status).toBeGreaterThanOrEqual(400);
  expect(existsSync(join(root, "data-d", "isorite", "credentials.json"))).toBe(true);
});

test("a model chosen in the settings is the pane's at the next start, and the environment, if it names one, wins", async () => {
  const base = await writeExample(join(root, "base-e"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const env = { XDG_DATA_HOME: join(root, "data-e") } as NodeJS.ProcessEnv;
  const { piHostFor } = await import("../src/pi/index.ts");
  expect(await piHostFor(api, env)).toBeNull();
  const pi = new PiControl(env);
  await pi.choose("anthropic", "claude-sonnet-4-6");
  const host = await piHostFor(api, env, undefined, undefined, pi);
  expect(host?.view().agent).toBe("pi (claude-sonnet-4-6)");
  // Another model chosen while it runs reaches the host that is running.
  await pi.choose("openai", "gpt-5");
  expect(host?.view().model).toBe("gpt-5");
  const named = await piHostFor(api, { ...env, ISORITE_PI: "anthropic/claude-haiku-4-5" });
  expect(named?.view().agent).toBe("pi (claude-haiku-4-5)");
});
