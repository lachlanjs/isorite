// isorite's own agent through a gateway of your own (a company's, or any OpenAI-compatible endpoint): its address, how
// it takes the key, headers and query values of its own, and the client certificate it asks for (mTLS), from
// `[provider]` in ~/.config/isorite/config.toml, as M13 had it (so a configuration written then works as written):
//
//   [provider]
//   url = "https://gateway.example.com/v1"   # OpenAI-compatible: <url>/chat/completions
//   name = "Our gateway"                       # what the pane calls it
//   key = "$GATEWAY_KEY"                       # or the key kept in the settings, or ISORITE_GATEWAY_KEY
//   key_header = "api-key"                     # when it is not Authorization: Bearer
//   headers = { "X-Team" = "physics" }         # added to every request
//   query = { "api-version" = "2024-06-01" }  # added to every address
//   pfx = '~/certs/me.pfx'                     # the client certificate and its key (a path in single quotes,
//                                              # so a Windows one keeps its backslashes)...
//   pfx_passphrase = "$PFX_PASSPHRASE"
//   # cert = "me.pem"  cert_key = "me.key"     # ...or both as PEM files
//   ca = 'company-ca.pem'                      # the authority the gateway's own certificate is signed by
//   models = ["gpt-4.1", "claude-sonnet"]      # offered in the settings (the gateway's /models is asked too)
//
// Any value may be "$NAME", read from the environment, so a second secret need not be written there. The certificate
// goes only to the gateway's own address, by node:https (Node's fetch cannot be given one), with the proxy in
// HTTPS_PROXY. A passphrase that does not open the .pfx is said when the gateway is chosen, not at the first question.

import { existsSync, readFileSync } from "node:fs";
import { Agent, request } from "node:https";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { createSecureContext, getCACertificates } from "node:tls";
import { createModels, createProvider, type Model, type ProviderStreams } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { configPath, readConfig, table } from "../config.ts";

export const GATEWAY = "gateway";

export interface Gateway {
  url: string;
  name: string;
  /** The key written in `[provider] key` (or what its "$NAME" holds); the settings' or ISORITE_GATEWAY_KEY otherwise. */
  key?: string;
  keyHeader?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  streamUsage: boolean;
  models: string[];
  tls: { pfx?: Buffer; passphrase?: string; cert?: Buffer; key?: Buffer; ca?: Buffer; files: string[] } | null;
}

/** A value as written, or the environment variable `"$NAME"` names. */
function valueOf(field: string, v: unknown, env: NodeJS.ProcessEnv): string {
  if (typeof v !== "string" && typeof v !== "number") throw new Error(`[provider] ${field} must be text`);
  const s = String(v), named = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(s)?.[1];
  if (!named) return s;
  const got = env[named];
  if (got === undefined || got === "") throw new Error(`[provider] ${field} is "$${named}", and ${named} is not set`);
  return got;
}
const textTable = (field: string, v: unknown, env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(Object.entries(table(v)).map(([k, x]) => [k, valueOf(`${field}.${k}`, x, env)]));

/** The gateway `[provider]` names, or null where it names none (no `url`). Throws, naming the setting, where one is
 *  wrong: a file that is not there, a "$NAME" not set, a certificate without its key. */
export function readGateway(path = configPath(), env: NodeJS.ProcessEnv = process.env): Gateway | null {
  const p = table(readConfig(path).provider);
  if (typeof p.url !== "string" || !p.url.trim()) return null;
  const url = valueOf("url", p.url, env).replace(/\/+$/, "");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`[provider] url is not an address: ${url}`); }
  const files: string[] = [];
  const file = (field: string): Buffer | undefined => {
    if (p[field] === undefined) return undefined;
    const named = valueOf(field, p[field], env), at = named.startsWith("~/") ? join(homedir(), named.slice(2)) : resolve(dirname(path), named);
    if (!existsSync(at)) throw new Error(`[provider] ${field}: there is no file at ${at}`);
    files.push(at);
    return readFileSync(at);
  };
  const pfx = file("pfx"), cert = file("cert"), key = file("cert_key"), ca = file("ca");
  if (pfx && (cert || key)) throw new Error("[provider] names both pfx and cert: a .pfx holds the certificate and its key, so name one or the other");
  if (Boolean(cert) !== Boolean(key)) throw new Error("[provider] cert and cert_key go together: the certificate, and its private key");
  const tls: NonNullable<Gateway["tls"]> = { files };
  if (pfx) tls.pfx = pfx;
  if (cert && key) { tls.cert = cert; tls.key = key; }
  if (ca) tls.ca = ca;
  if (p.pfx_passphrase !== undefined) tls.passphrase = valueOf("pfx_passphrase", p.pfx_passphrase, env);
  if (files.length && parsed.protocol !== "https:") throw new Error(`[provider] names a certificate, but ${url} is not https: certificates are only used over https`);
  const models = Array.isArray(p.models) ? p.models.filter((m): m is string => typeof m === "string" && m.trim() !== "") : [];
  // A configuration from before M25 named its models by tier: they are offered too.
  for (const m of Object.values(table(readConfig(path).tiers))) if (typeof m === "string" && m && !models.includes(m)) models.push(m);
  return {
    url, name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : parsed.host,
    ...(p.key !== undefined ? { key: valueOf("key", p.key, env) } : {}),
    ...(typeof p.key_header === "string" && p.key_header.trim() ? { keyHeader: p.key_header.trim() } : {}),
    headers: textTable("headers", p.headers, env), query: textTable("query", p.query, env),
    streamUsage: p.stream_usage !== false, models,
    tls: files.length ? tls : null,
  };
}

/** fetch over node:https with `agent`: the reply's body streams as it arrives. */
function fetchBy(agent: Agent): typeof fetch {
  return ((input: string | URL | Request, init: RequestInit = {}) => new Promise<Response>((ok, fail) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = Object.fromEntries(new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).entries());
    const req = request(url, { method: init.method ?? (input instanceof Request ? input.method : "GET"), headers, agent, ...(init.signal ? { signal: init.signal } : {}) }, (res) => {
      const got = new Headers();
      for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) got.set(name, Array.isArray(value) ? value.join(", ") : value);
      const empty = res.statusCode === 204 || res.statusCode === 304 || init.method === "HEAD";
      if (empty) res.resume();
      ok(new Response(empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status: res.statusCode ?? 502, statusText: res.statusMessage ?? "", headers: got }));
    });
    req.on("error", fail);
    const body = init.body;
    if (typeof body === "string" || body instanceof Uint8Array) req.end(body);
    else if (body == null) req.end();
    else void new Response(body as ConstructorParameters<typeof Response>[0]).arrayBuffer().then((b) => req.end(Buffer.from(b)), fail);
  })) as typeof fetch;
}

/** How a request reaches the gateway: its query values on the address, the key in its own header where it wants one,
 *  and, where it asks for a client certificate or names its own authority, by an agent holding them. Throws where the
 *  certificate cannot be used (a passphrase that does not open the .pfx), saying which file. */
export function gatewayFetch(g: Gateway, env: NodeJS.ProcessEnv = process.env): typeof fetch {
  let send: typeof fetch = (input, init) => fetch(input, init);
  if (g.tls) {
    const options = { pfx: g.tls.pfx, passphrase: g.tls.passphrase, cert: g.tls.cert, key: g.tls.key };
    try { createSecureContext({ ...options, ...(g.tls.ca ? { ca: g.tls.ca } : {}) }); } catch (e) {
      const said = (e as Error).message;
      throw new Error(/mac verify failure|bad decrypt|unsupported pkcs12|wrong password/i.test(said) ? `[provider] pfx_passphrase does not open ${g.tls.files[0]}` : `[provider] the certificate could not be used (${g.tls.files.join(", ")}): ${said}`);
    }
    // ca adds to the authorities trusted already (Node's, and the system's, which isorite trusts as well).
    const ca = g.tls.ca ? [...getCACertificates("default"), ...safe(() => getCACertificates("system")), g.tls.ca.toString()] : undefined;
    const agent = new Agent({ ...options, ...(ca ? { ca } : {}), keepAlive: true, proxyEnv: env });
    send = fetchBy(agent);
  }
  const origin = new URL(g.url).origin;
  return ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin) return fetch(input, init); // nothing of the gateway's goes anywhere else
    for (const [k, v] of Object.entries(g.query)) url.searchParams.set(k, v);
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    // A gateway that knows you by your certificate alone is sent no key at all.
    if (/^Bearer\s+none$/i.test(headers.get("authorization") ?? "")) headers.delete("authorization");
    if (g.keyHeader) {
      // The key in the header the gateway reads, and no Bearer beside it.
      const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      headers.delete("authorization");
      if (bearer && bearer !== "none") headers.set(g.keyHeader, bearer);
    }
    return send(url, { ...init, ...(input instanceof Request && !init.method ? { method: input.method, body: input.body } : {}), headers });
  }) as typeof fetch;
}
const safe = <T>(f: () => T[]): T[] => { try { return f(); } catch { return []; } };

/** A model of the gateway's, as pi reaches it: OpenAI-compatible chat completions at its address. */
export function gatewayModel(g: Gateway, id: string): Model<"openai-completions"> {
  return {
    id, name: id, api: "openai-completions", provider: GATEWAY, baseUrl: g.url, reasoning: false, input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 16_384,
    compat: { supportsUsageInStreaming: g.streamUsage },
  } as Model<"openai-completions">;
}

/** pi's model and stream function for `id` on the gateway: every request goes by `gatewayFetch`, with its headers. */
export function gatewayFor(g: Gateway, id: string, env: NodeJS.ProcessEnv = process.env): { chosen: Model<"openai-completions">; streamFn: ReturnType<typeof createModels>["streamSimple"] } {
  const send = gatewayFetch(g, env), inner = openAICompletionsApi();
  const withGateway = <O extends { fetch?: unknown; headers?: unknown } | undefined>(o: O) => ({ ...(o ?? {}), fetch: send, headers: { ...g.headers, ...((o?.headers as Record<string, string> | undefined) ?? {}) } });
  const api: ProviderStreams = {
    stream: (model, context, options) => inner.stream(model, context, withGateway(options) as never),
    streamSimple: (model, context, options) => inner.streamSimple(model, context, withGateway(options) as never),
  };
  const chosen = gatewayModel(g, id);
  const models = createModels();
  models.setProvider(createProvider({ id: GATEWAY, name: g.name, baseUrl: g.url, auth: { apiKey: { name: g.name, resolve: async () => ({ auth: {} }) } }, models: [chosen], api }) as never);
  return { chosen, streamFn: models.streamSimple.bind(models) };
}

/** The models the gateway offers: its own list (GET <url>/models), else those `[provider]` names. */
export async function gatewayModels(g: Gateway, key: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  try {
    const res = await gatewayFetch(g, env)(`${g.url}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const got = (await res.json()) as { data?: { id?: unknown }[] };
      const ids = (got.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === "string");
      if (ids.length) return [...new Set([...g.models, ...ids])];
    }
  } catch { /* the list is a help, not a need */ }
  return g.models;
}
