import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPENROUTER, RETRY, complete, type ProviderConfig } from "@isorite/engine";
import { gatewayTls, providerConfig } from "../src/config.ts";
import { gatewayHttp, relay } from "../src/gateway.ts";
import { createApp } from "../src/http.ts";

const TLS = fileURLToPath(new URL("./fixtures/tls/", import.meta.url));
const tlsFile = (name: string) => readFileSync(join(TLS, name));

/** A config.toml in a folder of its own, with the test certificates beside it. */
const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const config = (toml: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "isorite-gateway-"));
  made.push(dir);
  for (const f of ["ca.pem", "person.pfx", "person.pem", "person.key"]) writeFileSync(join(dir, f), tlsFile(f));
  writeFileSync(join(dir, "config.toml"), toml);
  return join(dir, "config.toml");
};

describe("a gateway's settings in config.toml", () => {
  it("are its headers, the header its key goes in, its query, and no usage asked for", () => {
    const p = providerConfig(config(`[provider]\nurl = "https://gw.example/v1"\nkey_header = "api-key"\nstream_usage = false\n[provider.headers]\nX-Team = "notes"\nX-Project = "$PROJECT_ID"\n[provider.query]\napi-version = "2024-10-21"\n[tiers]\nlow = "a"\nmid = "b"\nmax = "c"\n`), { PROJECT_ID: "p-42" });
    expect(p).toMatchObject({ url: "https://gw.example/v1", keyHeader: "api-key", streamUsage: false, headers: { "X-Team": "notes", "X-Project": "p-42" }, query: { "api-version": "2024-10-21" } });
    expect(p.defaultTiers).toBeUndefined();
  });

  it("say which variable is missing when a value names one that isn't set", () => {
    expect(() => providerConfig(config(`[provider]\nurl = "https://gw.example/v1"\n[provider.headers]\nX-Project = "$PROJECT_ID"\n`), {})).toThrow('[provider] headers.X-Project is "$PROJECT_ID", and PROJECT_ID is not set');
  });

  it("mark OpenRouter's model names kept for another provider, so that a 404 can say so", () => {
    expect(providerConfig(config(`[provider]\nurl = "https://gw.example/v1"\n`)).defaultTiers).toBe(true);
    expect(providerConfig(config(``))).toBe(OPENROUTER);
  });

  it("name a client certificate, from the configuration's folder, and its passphrase from the environment", () => {
    const tls = gatewayTls(config(`[provider]\npfx = "person.pfx"\npfx_passphrase = "$PFX_PASS"\nca = "ca.pem"\n`), { PFX_PASS: "test-passphrase" })!;
    expect(tls.pfx).toEqual(tlsFile("person.pfx"));
    expect(tls.passphrase).toBe("test-passphrase");
    expect(tls.ca).toEqual(tlsFile("ca.pem"));
    expect(gatewayTls(config(`[provider]\nurl = "https://gw.example/v1"\n`))).toBeNull();
  });

  it("refuse a certificate that isn't there, or is named twice, or without its key", () => {
    expect(() => gatewayTls(config(`[provider]\npfx = "nowhere.pfx"\n`))).toThrow(/\[provider\] pfx: there is no file at .*nowhere\.pfx/);
    expect(() => gatewayTls(config(`[provider]\npfx = "person.pfx"\ncert = "person.pem"\ncert_key = "person.key"\n`))).toThrow("names both pfx and cert");
    expect(() => gatewayTls(config(`[provider]\ncert = "person.pem"\n`))).toThrow("cert and cert_key go together");
  });
});

/** A gateway that asks for a client certificate signed by the test authority, and answers as OpenAI's API does. */
let gateway: Server, url: string;
const seen: { url: string; headers: IncomingMessage["headers"]; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  gateway = createServer({ key: tlsFile("gateway.key"), cert: tlsFile("gateway.pem"), ca: tlsFile("ca.pem"), requestCert: true, rejectUnauthorized: true }, (req, res) => {
    let body = "";
    req.on("data", (c) => (body += c)).on("end", () => {
      seen.push({ url: req.url ?? "", headers: req.headers, body: body ? (JSON.parse(body) as Record<string, unknown>) : {} });
      if (!req.url?.startsWith("/v1/chat/completions")) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`);
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((done) => gateway.listen(0, "127.0.0.1", done));
  url = `https://localhost:${(gateway.address() as AddressInfo).port}/v1`;
});
afterAll(() => { gateway.close(); });

const provider = (more: Partial<ProviderConfig> = {}): ProviderConfig => ({ ...OPENROUTER, name: "work", url, cacheMarks: false, ...more });
const hello = { model: "m", messages: [{ role: "user" as const, content: "hi" }] };
const person = { pfx: tlsFile("person.pfx"), passphrase: "test-passphrase", ca: tlsFile("ca.pem"), files: ["person.pfx", "ca.pem"] };

describe("a gateway that asks for a client certificate (mTLS)", () => {
  it("is reached with the certificate, and given the key, headers and query it wants", async () => {
    seen.length = 0;
    const p = provider({ keyHeader: "api-key", headers: { "X-Team": "notes" }, query: { "api-version": "2024-10-21" }, streamUsage: false });
    const reply = await complete(gatewayHttp(p, person), p, "sk-work", hello);
    expect(reply.text).toBe("Hello");
    expect(seen[0]!.url).toBe("/v1/chat/completions?api-version=2024-10-21");
    expect(seen[0]!.headers["api-key"]).toBe("sk-work");
    expect(seen[0]!.headers.authorization).toBeUndefined();
    expect(seen[0]!.headers["x-team"]).toBe("notes");
    expect(seen[0]!.body.stream_options).toBeUndefined();
  });

  it("says it wants a client certificate when it is given none", async () => {
    const p = provider();
    const err = await complete(gatewayHttp(p, { ca: tlsFile("ca.pem"), files: ["ca.pem"] }), p, "k", hello).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^work could not be reached: .*It asks for a client certificate \(mTLS\)/);
  });

  it("says when its own certificate is signed by an authority not named", async () => {
    const p = provider();
    const err = await complete(gatewayHttp(p, null), p, "k", hello).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
    expect((err as Error).message).toContain("ca in [provider]");
  });

  it("is refused at once, naming the setting, when the passphrase doesn't open the .pfx", () => {
    expect(() => gatewayHttp(provider(), { ...person, passphrase: "wrong" })).toThrow("[provider] pfx_passphrase does not open person.pfx");
    expect(() => gatewayHttp(provider({ url: "http://localhost:1/v1" }), person)).toThrow("is not https");
  });
});

describe("the relay at /api/gateway, for OpenCode", () => {
  let app: ReturnType<typeof createApp>;
  beforeAll(() => {
    const p = provider({ keyHeader: "api-key", headers: { "X-Team": "notes" } });
    app = createApp({ api: {} as never, token: "the-token", loopback: true, web: null, gateway: relay(p, gatewayHttp(p, person), async () => "sk-work") });
  });
  const ask = (path: string, token = "the-token") => app.request(`http://localhost:4767/api/gateway${path}`, { method: "POST", headers: { Host: "localhost:4767", Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "m", messages: [], stream: true }) });

  it("passes OpenCode's request on with the certificate, key and headers, and streams the reply back", async () => {
    seen.length = 0;
    const res = await ask("/chat/completions");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toContain('"content":"lo"');
    expect(seen[0]!.headers["api-key"]).toBe("sk-work");
    expect(seen[0]!.headers["x-team"]).toBe("notes");
    expect(seen[0]!.headers.authorization).toBeUndefined();
  });

  it("answers only the server's token, and only the provider's own paths", async () => {
    expect((await ask("/chat/completions", "sk-guess")).status).toBe(403);
    expect((await ask("/files")).status).toBe(404);
  });

  it("is not there unless the server was given one", async () => {
    const bare = createApp({ api: {} as never, token: "t", loopback: true, web: null });
    expect((await bare.request("http://localhost/api/gateway/models", { headers: { Host: "localhost", Authorization: "Bearer t" } })).status).toBe(404);
  });
});

describe("the relay, when the provider is down for a moment", () => {
  it("asks again before passing anything on, and passes on the last answer when it stays down", async () => {
    const saved = { ...RETRY };
    Object.assign(RETRY, { waits: [5, 5, 5], jitter: 0 });
    try {
      const p: ProviderConfig = { ...OPENROUTER, name: "work", url: "https://gw.example/v1" };
      const answers = [503, 502, 200];
      const http = { fetch: (async () => { const s = answers.shift() ?? 503; return new Response(s === 200 ? '{"data":[]}' : '{"error":{"message":"upstream"}}', { status: s, headers: { "content-type": "application/json" } }); }) as typeof fetch };
      const pass = relay(p, http, async () => "k");
      const ok = await pass("/models", new Request("http://127.0.0.1/api/gateway/models"));
      expect(ok.status).toBe(200);
      expect(answers).toEqual([]);
      answers.push(503, 503, 503, 503, 200);
      expect((await pass("/models", new Request("http://127.0.0.1/api/gateway/models"))).status).toBe(503);
      expect(answers).toEqual([200]);
    } finally { Object.assign(RETRY, saved); }
  });

  it("passes on a reply that is not an instance of the global Response, as fetch's replies are not under the server", async () => {
    // Hono's Node adapter puts its own Response in place of the global one; what fetch returns is not an instance of it.
    const reply = new Response('{"data":[]}', { status: 200, headers: { "content-type": "application/json" } });
    const foreign = { status: reply.status, ok: true, headers: reply.headers, body: reply.body };
    const pass = relay({ ...OPENROUTER, name: "work", url: "https://gw.example/v1" }, { fetch: (async () => foreign) as unknown as typeof fetch }, async () => "k");
    const res = await pass("/models", new Request("http://127.0.0.1/api/gateway/models"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":[]}');
  });
});
