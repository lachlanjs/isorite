import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPENROUTER, type SetupDraft } from "@isorite/engine";
import { readConfig } from "../src/config.ts";
import { TOKEN_HEADER, createApp } from "../src/http.ts";
import { Setup, applySetup, readSetup } from "../src/setup.ts";

/** A gateway as OpenAI's API answers, which wants its key in api-key. */
let gateway: Server, url: string;
const seen: Record<string, string | undefined>[] = [];
beforeAll(async () => {
  gateway = createServer((req, res) => {
    seen.push({ key: req.headers["api-key"] as string | undefined, team: req.headers["x-team"] as string | undefined });
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => {
      if (req.headers["api-key"] !== "sk-work") { res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "no key" } })); return; }
      if (req.url === "/v1/models") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: [{ id: "small" }, { id: "big" }] })); return; }
      const body = JSON.parse(b) as { tools?: unknown[] };
      const delta = body.tools?.length ? { tool_calls: [{ index: 0, id: "c1", function: { name: "ping", arguments: "{}" } }] } : { content: "ready" };
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: body.tools?.length ? "tool_calls" : "stop" }], usage: { prompt_tokens: 9, completion_tokens: 1 } })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((done) => gateway.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/v1`;
});
const made: string[] = [];
afterAll(() => { gateway.close(); for (const d of made) rmSync(d, { recursive: true, force: true }); });

function config(toml: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "isorite-setup-"));
  made.push(dir);
  const path = join(dir, "config.toml");
  if (toml !== null) writeFileSync(path, toml);
  return path;
}

const WORK = `device = "abcd1234"\n[provider]\nname = "work"\nurl = "https://gw.example/v1"\nkey = "sk-old"\nkey_header = "api-key"\nspend_cap = "5"\npfx = "me.pfx"\npfx_passphrase = "secret-pass"\n[provider.headers]\nAuthorization = "Basic abc"\nX-Team = "notes"\nX-Project = "$PROJECT"\n[tiers]\nlow = "small"\nmid = "big"\nmax = "big"\n`;

const draftOf = (toml: string, change: Partial<SetupDraft> = {}): SetupDraft => ({ ...readSetup(readConfig(config(toml))), ...change });

describe("the setup as a form", () => {
  it("shows what is kept, its secrets held and not shown", () => {
    const s = readSetup(readConfig(config(WORK)));
    expect(s).toMatchObject({ kind: "gateway", name: "work", url: "https://gw.example/v1", keyHeld: true, keyHeader: "api-key", pfx: "me.pfx", passphraseHeld: true, streamUsage: true, tiers: { low: "small", mid: "big", max: "big" } });
    expect(s.headers).toEqual([{ name: "Authorization", value: "", held: true }, { name: "X-Team", value: "notes" }, { name: "X-Project", value: "$PROJECT" }]);
    expect(JSON.stringify(s)).not.toMatch(/sk-old|secret-pass|Basic abc/);
    expect(readSetup({})).toMatchObject({ kind: "openrouter", url: OPENROUTER.url, keyHeld: false, tiers: OPENROUTER.tiers });
  });

  it("keeps what is held when sent back without it, and what the form does not hold", () => {
    const { config: out, forgot } = applySetup(readConfig(config(WORK)), draftOf(WORK, { headers: [{ name: "Authorization", value: "", held: true }, { name: "X-Team", value: "maths" }] }));
    expect(forgot).toBe(false);
    expect(out).toMatchObject({ device: "abcd1234", provider: { key: "sk-old", spend_cap: "5", pfx_passphrase: "secret-pass", headers: { Authorization: "Basic abc", "X-Team": "maths" } } });
    expect((out.provider as Record<string, unknown>).headers).not.toHaveProperty("X-Project");
  });

  it("forgets the key, and secret headers, when the address changes and no key is given", () => {
    const { config: out, forgot } = applySetup(readConfig(config(WORK)), draftOf(WORK, { url: "https://elsewhere.example/v1" }));
    expect(forgot).toBe(true);
    expect(out.provider).not.toHaveProperty("key");
    expect((out.provider as Record<string, unknown>).headers).toEqual({ "X-Team": "notes", "X-Project": "$PROJECT" });
    const given = applySetup(readConfig(config(WORK)), draftOf(WORK, { url: "https://elsewhere.example/v1", key: "sk-new" }));
    expect(given).toMatchObject({ forgot: false, config: { provider: { key: "sk-new" } } });
    expect(applySetup(readConfig(config(WORK)), draftOf(WORK, { key: null })).config.provider).not.toHaveProperty("key");
  });

  it("back to OpenRouter, the gateway's fields go and OpenRouter's own tier names are not written", () => {
    const { config: out, forgot } = applySetup(readConfig(config(WORK)), { ...draftOf(WORK), kind: "openrouter", tiers: { ...OPENROUTER.tiers } });
    expect(forgot).toBe(true);
    expect(out.provider).toEqual({ spend_cap: "5" });
    expect(out).not.toHaveProperty("tiers");
  });

  it("keeps the key when only the way it is named changes: OpenRouter, written as a gateway at its own address", () => {
    const { config: out, forgot } = applySetup({ provider: { key: "sk-or" } }, { ...readSetup({ provider: { key: "sk-or" } }), kind: "gateway", url: `${OPENROUTER.url}/` });
    expect(forgot).toBe(false);
    expect(out.provider).toMatchObject({ key: "sk-or", url: OPENROUTER.url });
  });

  it("refuses what cannot be kept, saying what", () => {
    const base = draftOf(WORK);
    expect(() => applySetup({}, { ...base, url: "gw.example" })).toThrow("not an address");
    expect(() => applySetup({}, { ...base, headers: [{ name: "X Team", value: "a" }] })).toThrow("a header's name has a character it cannot have");
    expect(() => applySetup({}, { ...base, key: "sk with spaces" })).toThrow("does not look like a key");
  });
});

describe("the key's prefix (M21)", () => {
  const gw = (more: Partial<SetupDraft>): SetupDraft => ({ ...readSetup({}), kind: "gateway", name: "work", url: "https://gw.example/v1", tiers: { low: "a", mid: "b", max: "c" }, ...more });
  it("is kept as key_prefix with a space after a scheme, read back without it, and left out when empty", () => {
    const { config } = applySetup({}, gw({ keyHeader: "X-Gateway-Auth", keyPrefix: "Bearer" }));
    expect(config.provider).toMatchObject({ key_header: "X-Gateway-Auth", key_prefix: "Bearer " });
    expect(readSetup(config)).toMatchObject({ keyHeader: "X-Gateway-Auth", keyPrefix: "Bearer" });
    expect(applySetup({}, gw({ keyHeader: "api-key" })).config.provider).not.toHaveProperty("key_prefix");
  });
  it("keeps a key_prefix of \"\" written by hand, so Authorization stays bare", () => {
    const by = { provider: { url: "https://gw.example/v1", key_header: "Authorization", key_prefix: "" } };
    expect(applySetup(by, gw({ keyHeader: "Authorization" })).config.provider).toMatchObject({ key_prefix: "" });
  });
});

describe("checking and keeping", () => {
  const draft = (): SetupDraft => ({ ...readSetup({}), kind: "gateway", name: "work", url, key: "sk-work", keyHeader: "api-key", headers: [{ name: "X-Team", value: "notes" }], tiers: { low: "small", mid: "big", max: "big" } });

  it("checks a draft as doctor does, without writing it", async () => {
    const path = config(null), setup = new Setup({ config: path, env: {} });
    const checks = await setup.check(draft());
    expect(checks.map((c) => `${c.outcome} ${c.step}`)).toEqual(["ok reached", "ok reply from small", "ok reply from big", "ok tools"]);
    expect(seen.at(-1)).toEqual({ key: "sk-work", team: "notes" });
    expect(existsSync(path)).toBe(false);
    expect(await setup.models(draft())).toEqual(["big", "small"]);
    expect((await setup.check({ ...draft(), key: "sk-wrong" }))[0]).toMatchObject({ step: "reached", outcome: "fail" });
    expect(await setup.check({ ...draft(), pfx: "nowhere.pfx" })).toEqual([{ step: "setup", outcome: "fail", said: expect.stringContaining("[provider] pfx: there is no file at") }]);
  });

  it("keeps it for its owner alone, the file as it was beside it once, and takes it into use", async () => {
    const path = config('device = "abcd1234"\n# my note\n');
    let kept = 0;
    const setup = new Setup({ config: path, env: {}, kept: async () => void kept++ });
    const view = await setup.keep(draft(), true);
    expect(view).toMatchObject({ local: true, config: path, setup: { kind: "gateway", url, keyHeld: true } });
    expect(kept).toBe(1);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(`${path}.bak`, "utf8")).toContain("# my note");
    expect(readConfig(path)).toMatchObject({ device: "abcd1234", provider: { url, key: "sk-work", key_header: "api-key" }, tiers: { low: "small" } });
    await setup.keep({ ...draft(), name: "work 2" }, true);
    expect(readFileSync(`${path}.bak`, "utf8")).toContain("# my note");
    await expect(setup.keep({ ...draft(), pfx: "nowhere.pfx" }, true)).rejects.toThrow("there is no file");
    expect(readConfig(path)).toMatchObject({ provider: { name: "work 2" } });
  });
});

describe("only from this machine", () => {
  const TOKEN = "the-token", PLAIN = WORK.replace('pfx = "me.pfx"\npfx_passphrase = "secret-pass"\n', "");
  const request = (host: string, path: string, body?: unknown, method = "POST") =>
    createApp({ api: { settings: async () => ({}) } as never, token: TOKEN, loopback: true, web: null, setup: new Setup({ config: config(PLAIN), env: { PROJECT: "p-42" } }) })
      .request("http://x" + path, body === undefined ? { headers: { host } } : { method, headers: { host, Origin: `http://${host}`, "Content-Type": "application/json", [TOKEN_HEADER]: TOKEN }, body: JSON.stringify(body) });

  it("is shown anywhere, and says where it may be changed from", async () => {
    expect(await (await request("localhost:4767", "/api/settings/provider")).json()).toMatchObject({ local: true, setup: { name: "work" } });
    expect(await (await request("box.tail1.ts.net", "/api/settings/provider")).json()).toMatchObject({ local: false });
  });

  it("is changed only from localhost, not from a tailnet's name", async () => {
    const draft = draftOf(PLAIN, { name: "changed" });
    const far = await request("box.tail1.ts.net", "/api/settings/provider", draft, "PUT");
    expect(far.status).toBe(403);
    expect(((await far.json()) as { error: string }).error).toContain("only from this machine");
    const near = await request("localhost:4767", "/api/settings/provider", draft, "PUT");
    expect(near.status).toBe(200);
  });
});
