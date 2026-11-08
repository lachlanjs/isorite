// isorite's own agent through a gateway of your own that asks for a client certificate (mTLS): a .pfx with its
// passphrase, the gateway's own authority, the key in the header it reads, headers and query values of its own, all
// from config.toml's [provider] (gateway.ts). The gateway here is a local https server that refuses a connection
// without a certificate signed by the test authority (fixtures/tls).

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PiControl, modelFor } from "../src/pi/index.ts";
import { gatewayModels, readGateway } from "../src/pi/gateway.ts";

const TLS = join(import.meta.dirname, "fixtures", "tls");
const seen: { path: string; headers: Record<string, string | string[] | undefined>; who: string; body: string }[] = [];
let server: Server, port = 0;

const chunk = (delta: object, extra: object = {}) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "our-model", choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;

beforeAll(async () => {
  server = createServer({ key: readFileSync(join(TLS, "gateway.key")), cert: readFileSync(join(TLS, "gateway.pem")), ca: readFileSync(join(TLS, "ca.pem")), requestCert: true, rejectUnauthorized: true }, (req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const who = String((req.socket as TLSSocket).getPeerCertificate()?.subject?.CN ?? "");
      seen.push({ path: req.url ?? "", headers: req.headers, who, body });
      if (req.url?.startsWith("/v1/models")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data: [{ id: "our-model" }, { id: "our-other-model" }] })); return; }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(chunk({ role: "assistant", content: "Through " }));
      res.write(chunk({ content: "the gateway." }));
      res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "our-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

/** A config.toml naming the gateway, in a folder of its own, and the environment that points at it. */
function setUp(provider: string): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "isorite-gateway-"));
  mkdirSync(join(home, "isorite"), { recursive: true });
  writeFileSync(join(home, "isorite", "config.toml"), `device = "test01"\n\n[provider]\n${provider}\n`);
  return { XDG_CONFIG_HOME: home, XDG_DATA_HOME: join(home, "data"), PFX_PASS: "test-passphrase", GW_KEY: "the-gateway-key", ISORITE_NODE_DEFAULTS: "0" };
}
const full = (more = "") => [
  `url = "https://localhost:PORT/v1"`, `name = "Our gateway"`, `key = "$GW_KEY"`, `key_header = "api-key"`,
  `headers = { "X-Team" = "physics" }`, `query = { "api-version" = "2024-06-01" }`,
  `pfx = '${join(TLS, "person.pfx")}'`, `pfx_passphrase = "$PFX_PASS"`, `ca = '${join(TLS, "ca.pem")}'`, more,
].join("\n");

async function ask(env: NodeJS.ProcessEnv, key: string | undefined): Promise<{ text: string; error?: string }> {
  const { chosen, streamFn } = await modelFor("gateway", "our-model", env);
  const s = await streamFn!(chosen, { messages: [{ role: "user", content: "Say something.", timestamp: Date.now() }] } as never, key ? { apiKey: key } : {});
  const out = await s.result();
  const text = out.content.map((c: { type: string; text?: string }) => (c.type === "text" ? c.text ?? "" : "")).join("");
  return { text, ...(out.stopReason === "error" ? { error: out.errorMessage ?? "error" } : {}) };
}

describe("isorite's own agent through a gateway that asks for a client certificate", () => {
  test("a .pfx and its passphrase, the gateway's authority, the key in its header, its headers and query: the answer comes back", async () => {
    const env = setUp(full().replace("PORT", String(port)));
    seen.length = 0;
    const got = await ask(env, "the-gateway-key");
    expect(got.error).toBeUndefined();
    expect(got.text).toBe("Through the gateway.");
    const req = seen.find((r) => r.path.startsWith("/v1/chat/completions"))!;
    expect(req.who).toBeTruthy(); // the person's certificate was shown, and taken
    expect(req.path).toContain("api-version=2024-06-01");
    expect(req.headers["api-key"]).toBe("the-gateway-key");
    expect(req.headers.authorization).toBeUndefined();
    expect(req.headers["x-team"]).toBe("physics");
    expect(JSON.parse(req.body).model).toBe("our-model");
  });

  test("the models it offers are its own list, asked with the certificate", async () => {
    const env = setUp(full(`models = ["named-in-config"]`).replace("PORT", String(port)));
    expect(await gatewayModels(readGateway(join(env.XDG_CONFIG_HOME!, "isorite", "config.toml"), env)!, "the-gateway-key", env)).toEqual(["named-in-config", "our-model", "our-other-model"]);
  });

  test("a passphrase that does not open the .pfx is said when the gateway is chosen, naming the file", async () => {
    const env = { ...setUp(full().replace("PORT", String(port))), PFX_PASS: "not-it" };
    await expect(modelFor("gateway", "our-model", env)).rejects.toThrow(/pfx_passphrase does not open .*person\.pfx/);
  });

  test("without the certificate the gateway refuses, and the agent says so rather than hanging", async () => {
    const env = setUp([`url = "https://localhost:${port}/v1"`, `ca = '${join(TLS, "ca.pem")}'`].join("\n"));
    const got = await ask(env, "k");
    expect(got.error).toBeTruthy();
  });

  // https.Agent takes the proxy from the environment (proxyEnv) from Node 24, which isorite needs.
  test.skipIf(Number(process.versions.node.split(".")[0]) < 24)("through the company's proxy (HTTPS_PROXY): tunnelled by CONNECT, the certificate still shown to the gateway alone", async () => {
    const { createServer: plain } = await import("node:http");
    const { connect } = await import("node:net");
    const tunnels: string[] = [], sockets: { destroy(): void }[] = [];
    const proxy = plain();
    proxy.on("connect", (req, client, head) => {
      tunnels.push(req.url ?? "");
      const [host, p] = (req.url ?? "").split(":");
      const up = connect(Number(p), host === "localhost" ? "127.0.0.1" : host!, () => {
        sockets.push(client, up); client.write("HTTP/1.1 200 Connection Established\r\n\r\n"); up.write(head); up.pipe(client); client.pipe(up); });
      up.on("error", () => client.destroy());
    });
    await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
    try {
      const env = { ...setUp(full().replace("PORT", String(port))), HTTPS_PROXY: `http://127.0.0.1:${(proxy.address() as { port: number }).port}`, NO_PROXY: "" };
      seen.length = 0;
      const got = await ask(env, "the-gateway-key");
      expect(got.error).toBeUndefined();
      expect(got.text).toBe("Through the gateway.");
      expect(tunnels).toContain(`localhost:${port}`);
      expect(seen.find((r) => r.path.startsWith("/v1/chat/completions"))?.who).toBeTruthy();
    } finally { for (const s of sockets) s.destroy(); await new Promise<void>((ok) => proxy.close(() => ok())); }
  });

  test("the settings' check: one short request, answered through the gateway; without the certificate, the reason and what to change", async () => {
    const ok = await new PiControl(setUp(full().replace("PORT", String(port)))).check("gateway", "our-model");
    expect(ok.said).toBe("Through the gateway.");
    const without = new PiControl(setUp([`url = "https://localhost:${port}/v1"`, `ca = '${join(TLS, "ca.pem")}'`, `key = "k"`].join("\n")));
    await expect(without.check("gateway", "our-model")).rejects.toThrow(/client certificate \(mTLS\)/);
  });

  test("a gateway named wrongly says which setting", () => {
    const nowhere = join(tmpdir(), "no", "such.pfx");
    expect(() => readGateway(join(setUp(`url = "https://localhost/v1"\npfx = '${nowhere}'`).XDG_CONFIG_HOME!, "isorite", "config.toml"), {})).toThrow(`[provider] pfx: there is no file at ${nowhere}`);
    expect(() => readGateway(join(setUp(`url = "http://localhost/v1"\ncert = '${join(TLS, "person.pem")}'\ncert_key = '${join(TLS, "person.key")}'`).XDG_CONFIG_HOME!, "isorite", "config.toml"), {})).toThrow(/not https/);
    expect(() => readGateway(join(setUp(`url = "https://localhost/v1"\nkey = "$NOT_SET_HERE"`).XDG_CONFIG_HOME!, "isorite", "config.toml"), {})).toThrow(/NOT_SET_HERE is not set/);
  });
});
