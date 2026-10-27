import { createServer } from "node:net";
import { expect, test } from "vitest";
import { ModelError, OPENROUTER, RETRY, complete, endpoint, keySent, keySentAs, refusal, unreachable } from "../src/index.ts";
import { rounds } from "../src/loop.ts";

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

// A gateway that answers each request with the next of `answers`: a status, a thrown error, or a reply streamed.
const sse = (text: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
function gateway(answers: (number | Error | string | Response)[]) {
  const asked: number[] = [];
  return {
    asked,
    http: {
      fetch: (async () => {
        asked.push(Date.now());
        const a = answers.shift() ?? "late";
        if (a instanceof Error) throw a;
        if (a instanceof Response) return a;
        return typeof a === "number" ? new Response(JSON.stringify({ error: { message: "upstream" } }), { status: a, headers: { "content-type": "application/json" } }) : sse(a);
      }) as typeof fetch,
    },
  };
}
const work = { ...OPENROUTER, name: "work", url: URL_ };
const ask = { model: "m", messages: [{ role: "user" as const, content: "hi" }] };

test("a gateway down for a moment (503, a dropped connection) is asked again, and the reply comes", async () => {
  const saved = { ...RETRY };
  Object.assign(RETRY, { waits: [5, 5, 5], jitter: 0 });
  try {
    const g = gateway([503, failed("ECONNRESET", "read ECONNRESET"), 502, "fine"]), retries: string[] = [];
    const r = await complete(g.http, work, "k", { ...ask, onRetry: (n, of) => retries.push(`${n}/${of}`) });
    expect(r.text).toBe("fine");
    expect(retries).toEqual(["1/3", "2/3", "3/3"]);
  } finally { Object.assign(RETRY, saved); }
});

test("still down after three retries, it says it is likely the gateway, not the settings", async () => {
  const saved = { ...RETRY };
  Object.assign(RETRY, { waits: [5, 5, 5], jitter: 0 });
  try {
    const err = await complete(gateway([503, 503, 503, 503]).http, work, "k", ask).catch((e: unknown) => e) as ModelError;
    expect(err.kind).toBe("unavailable");
    expect(err.message).toMatch(/^work is unavailable \(503: upstream\), tried 4 times over \d+ s: it is likely work, not your settings\.$/);
  } finally { Object.assign(RETRY, saved); }
});

test("settings are not asked again: a 401, a 404, a name not found", async () => {
  for (const a of [401, 404, failed("ENOTFOUND", "getaddrinfo ENOTFOUND gateway.example.com")]) {
    const g = gateway([a, "never"]);
    const err = await complete(g.http, work, "k", ask).catch((e: unknown) => e) as ModelError;
    expect(err.kind).toBe("settings");
    expect(g.asked).toHaveLength(1);
  }
});

test("a 429 is asked again once, after its Retry-After; one longer than 10 s is not waited for", async () => {
  const saved = { ...RETRY };
  Object.assign(RETRY, { waits: [5, 5, 5], jitter: 0 });
  try {
    const limited = (after: string) => new Response("{}", { status: 429, headers: { "retry-after": after, "content-type": "application/json" } });
    const g = gateway([limited("0"), "fine"]);
    expect((await complete(g.http, work, "k", ask)).text).toBe("fine");
    const twice = gateway([limited("0"), limited("0"), "fine"]);
    expect(((await complete(twice.http, work, "k", ask).catch((e: unknown) => e)) as ModelError).kind).toBe("limited");
    const long = gateway([limited("60"), "fine"]);
    expect(((await complete(long.http, work, "k", ask).catch((e: unknown) => e)) as ModelError).message).toContain("429");
    expect(long.asked).toHaveLength(1);
  } finally { Object.assign(RETRY, saved); }
});

test("once the reply has begun, a broken connection is not asked again: it would say it twice", async () => {
  const saved = { ...RETRY };
  Object.assign(RETRY, { waits: [5, 5, 5], jitter: 0 });
  try {
    const enc = new TextEncoder();
    const broken = new Response(new ReadableStream({
      start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "half" } }] })}\n\n`)); },
      pull(c) { c.error(Object.assign(new TypeError("terminated"), { cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }) })); },
    }), { headers: { "content-type": "text/event-stream" } });
    const g = gateway([broken, "again"]);
    const err = await complete(g.http, work, "k", ask).catch((e: unknown) => e) as ModelError;
    expect(err.message).toMatch(/^work broke off its reply: other side closed/);
    expect(g.asked).toHaveLength(1);
  } finally { Object.assign(RETRY, saved); }
});

test("stopping while it waits to ask again stops at once", async () => {
  const stop = new AbortController();
  const g = gateway([503, "fine"]);
  const run = complete(g.http, work, "k", { ...ask, signal: stop.signal, onRetry: () => stop.abort() });
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  expect(g.asked).toHaveLength(1);
});

test("a reply cut off before it wrote anything is asked once more with three times the room; empty again, it says why", async () => {
  const thought = () => new Response(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }], usage: { prompt_tokens: 10, completion_tokens: 2500 } })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
  const run = (answers: (() => Response)[], p = work) => {
    const budgets: number[] = [];
    const http = { fetch: (async (_u: unknown, init?: RequestInit) => { budgets.push((JSON.parse(String(init!.body)) as { max_tokens: number }).max_tokens); return answers.shift()!(); }) as typeof fetch };
    const tools = { defs: () => [], call: async () => ({ text: "" }) };
    return { budgets, ran: rounds({ http, provider: { ...p, tiers: { low: "thinker", mid: "thinker", max: "thinker" } }, key: "k", tier: "mid", messages: ask.messages, lookup: tools, maxTokens: 2500, signal: new AbortController().signal, onText: () => {}, onStep: () => {}, most: 0 }) };
  };
  const recovered = run([thought, () => sse("fine")]);
  expect((await recovered.ran).text).toBe("fine");
  expect(recovered.budgets).toEqual([2500, 7500]);
  const empty = run([thought, thought]);
  const err = await empty.ran.catch((e: unknown) => e) as ModelError;
  expect(err.kind).toBe("cut");
  expect(err.message).toBe("thinker used its whole output budget (7500 tokens) thinking, and wrote nothing. Try a lower tier, or raise max_tokens under [provider] in config.toml.");
  // max_tokens under [provider] is the least any call is given.
  const roomy = run([() => sse("fine")], { ...work, maxTokens: 16000 });
  await roomy.ran;
  expect(roomy.budgets).toEqual([16000]);
});

test("the key goes in Authorization with Bearer, or in key_header with key_prefix before it (M21)", () => {
  const p = (more: Partial<typeof OPENROUTER>) => ({ ...OPENROUTER, ...more });
  const head = (more: Partial<typeof OPENROUTER>) => endpoint(p(more), "sk-1", "/models").headers;
  expect(head({})).toMatchObject({ Authorization: "Bearer sk-1" });
  expect(head({ keyHeader: "api-key" })).toMatchObject({ "api-key": "sk-1" });
  expect(head({ keyHeader: "X-Gateway-Auth", keyPrefix: "Bearer " })).toMatchObject({ "X-Gateway-Auth": "Bearer sk-1" });
  // Authorization named alone is Bearer, as a bare key there is rarely wanted; "" sends it bare.
  expect(head({ keyHeader: "authorization" })).toMatchObject({ authorization: "Bearer sk-1" });
  expect(head({ keyHeader: "Authorization", keyPrefix: "" })).toMatchObject({ Authorization: "sk-1" });
  expect(head({ keyPrefix: "Token " })).toMatchObject({ Authorization: "Token sk-1" });
  expect(keySent(p({ keyHeader: "api-key" }))).toEqual({ header: "api-key", prefix: "" });
  expect(keySentAs(p({}), "sk-1")).toBe("Authorization: Bearer <4 characters>");
});

test("what a provider said with a refusal: its message, or its text, cut, and never the key", () => {
  expect(refusal(JSON.stringify({ error: { message: "Missing Bearer prefix" } }))).toBe("Missing Bearer prefix");
  expect(refusal(JSON.stringify({ message: "no" }))).toBe("no");
  expect(refusal("<html><body><h1>401</h1>\n  Unauthorized</body></html>")).toBe("401 Unauthorized");
  expect(refusal(JSON.stringify({ error: "bad key sk-secret-123" }), "sk-secret-123")).toBe("bad key <the key>");
  expect(refusal("x".repeat(400))).toHaveLength(300);
});

test("a proxy's 407 is named as the proxy's, apart from the provider's 401", () => {
  const tunnel = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("Request was cancelled."), { cause: Object.assign(new Error("Proxy response (407) !== 200 when HTTP Tunneling"), { code: "UND_ERR_ABORTED" }) }) });
  expect(unreachable(tunnel, URL_)).toMatch(/^Proxy response \(407\) !== 200 when HTTP Tunneling \(UND_ERR_ABORTED\)\. The proxy \(HTTPS_PROXY\), not the provider, refused with 407/);
});
