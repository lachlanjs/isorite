import { createServer } from "node:net";
import { expect, test } from "vitest";
import { ModelError, OPENROUTER, complete, unreachable } from "../src/index.ts";

/** A fetch error as Node's fetch throws it: "fetch failed", the reason in its cause (shapes seen on Node 25). */
const failed = (code: string | undefined, message: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(message), code ? { code } : {}) });
const URL_ = "https://gateway.example.com/v1";

test("an authority Node does not trust is named, with the settings that fix it", () => {
  const said = unreachable(failed("SELF_SIGNED_CERT_IN_CHAIN", "self-signed certificate in certificate chain"), URL_);
  expect(said).toMatch(/^self-signed certificate in certificate chain \(SELF_SIGNED_CERT_IN_CHAIN\)\. /);
  expect(said).toContain("ca in [provider]");
  expect(said).toContain("NODE_EXTRA_CA_CERTS");
});

test("a gateway that wants a client certificate is said to, by node:https's alert or by fetch's closed socket", () => {
  const alert = Object.assign(new Error("C0E2C6CAEF7F0000:error:0A00045C:SSL routines:ssl3_read_bytes:tlsv13 alert certificate required:../deps/openssl/openssl/ssl/record/rec_layer_s3.c:916:SSL alert number 116\n"), { code: "ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED" });
  expect(unreachable(alert, URL_)).toMatch(/^tlsv13 alert certificate required \(ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED\)\. It asks for a client certificate \(mTLS\)/);
  expect(unreachable(failed("UND_ERR_SOCKET", "other side closed"), URL_)).toContain("client certificate (mTLS)");
  expect(unreachable(failed("UND_ERR_SOCKET", "other side closed"), "http://localhost:11434/v1")).toBe("other side closed (UND_ERR_SOCKET)");
});

test("a name not found, and a timeout, say the host and what to check", () => {
  expect(unreachable(failed("ENOTFOUND", "getaddrinfo ENOTFOUND gateway.example.com"), URL_)).toBe("getaddrinfo ENOTFOUND gateway.example.com. The name gateway.example.com could not be found: check the url in [provider], and whether it is only found on the company's network or VPN.");
  expect(unreachable(failed("UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"), URL_)).toContain("HTTPS_PROXY");
});

test("a reason without a code is still given, rather than 'fetch failed'", () => {
  expect(unreachable(failed(undefined, "bad port"), URL_)).toBe("bad port");
  expect(unreachable(new Error("fetch failed"), URL_)).toBe("fetch failed");
});

test("complete() says why it could not reach the provider: a refused connection, for real", async () => {
  const port = await new Promise<number>((done) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => done(p)); }); });
  const p = { ...OPENROUTER, name: "the gateway", url: `http://127.0.0.1:${port}/v1` };
  const err = await complete({ fetch: (u, i) => fetch(u, i) }, p, "k", { model: "m", messages: [{ role: "user", content: "hi" }] }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ModelError);
  expect((err as Error).message).toBe(`the gateway could not be reached: connect ECONNREFUSED 127.0.0.1:${port}. Nothing answers at 127.0.0.1:${port}: check the url and its port in [provider].`);
});
