// How isorite reaches the provider. Node's fetch, unless the gateway asks for a client certificate (mTLS) or
// signs its own with an authority named in config.toml: fetch cannot be given those without the undici package,
// so requests to the gateway then go by node:https, with an agent that holds them and takes the proxy from
// HTTPS_PROXY. Only the gateway's own address is sent the certificate.

import { Agent, request } from "node:https";
import { Readable } from "node:stream";
import { createSecureContext, getCACertificates } from "node:tls";
import { endpoint, isResponse, retryWait, unreachable, type Http, type ProviderConfig } from "@isorite/engine";
import type { GatewayTls } from "./config.ts";

const nativeFetch: Http = { fetch: (input, init) => fetch(input, init) };

/** fetch, over node:https with `agent`: the reply's body streams as it arrives. */
function fetchBy(agent: Agent): typeof fetch {
  return (input, init = {}) => new Promise<Response>((ok, fail) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const req = request(url, { method: init.method ?? "GET", headers, agent, ...(init.signal ? { signal: init.signal } : {}) }, (res) => {
      const got = new Headers();
      for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) got.set(name, Array.isArray(value) ? value.join(", ") : value);
      const empty = res.statusCode === 204 || res.statusCode === 304 || init.method === "HEAD";
      if (empty) res.resume();
      ok(new Response(empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status: res.statusCode ?? 502, statusText: res.statusMessage ?? "", headers: got }));
    });
    req.on("error", fail);
    req.end(typeof init.body === "string" ? init.body : undefined);
  });
}

/** The Http isorite reaches `provider` by. Throws, saying which setting, when the certificate cannot be used. */
export function gatewayHttp(provider: ProviderConfig, tls: GatewayTls | null, env: NodeJS.ProcessEnv = process.env): Http {
  if (!tls) return nativeFetch;
  let origin: string;
  try { origin = new URL(provider.url).origin; } catch { throw new Error(`[provider] url is not an address: ${provider.url}`); }
  if (!origin.startsWith("https:")) throw new Error(`[provider] names a certificate, but ${provider.url} is not https: certificates are only used over https`);
  const options = { pfx: tls.pfx, passphrase: tls.passphrase, cert: tls.cert, key: tls.key, ca: tls.ca };
  try { createSecureContext(options); } catch (e) {
    const said = (e as Error).message;
    throw new Error(/mac verify failure|bad decrypt/i.test(said) ? `[provider] pfx_passphrase does not open ${tls.files[0]}` : `[provider] the certificate could not be used (${tls.files.join(", ")}): ${said}`);
  }
  // ca adds to the authorities already trusted (the system's too, network.ts), as NODE_EXTRA_CA_CERTS does.
  const agent = new Agent({ ...options, ...(tls.ca ? { ca: [...getCACertificates("default"), tls.ca.toString()] } : {}), keepAlive: true, proxyEnv: env });
  const byAgent = fetchBy(agent);
  return { fetch: (input, init) => (new URL(input instanceof Request ? input.url : String(input)).origin === origin ? byAgent(input, init) : fetch(input, init)) };
}

/** What OpenCode may ask of the provider through isorite. */
const RELAYED = new Set(["/chat/completions", "/models"]);

/** The provider at /api/gateway, as `live` has it: each request is sent on with what `endpoint` adds (the key, where the provider
 *  wants it, its headers and query) by `http`, and the reply streamed back. A provider that can't be reached is
 *  answered as an OpenAI-compatible one answers an error, so OpenCode shows why. */
export function relay(live: () => { provider: ProviderConfig; http: Http }, key: () => Promise<string | null>): (path: string, req: Request) => Promise<Response> {
  const json = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status, headers: { "Content-Type": "application/json" } });
  return async (path, req) => {
    if (!RELAYED.has(path)) return json(404, `isorite relays only ${[...RELAYED].join(" and ")}`);
    // The provider as it is now: one kept from the settings since the terminal began is used at once (M18).
    const { provider, http } = live();
    const to = endpoint(provider, await key(), path), type = req.headers.get("content-type");
    const body = req.method === "POST" ? await req.text() : undefined;
    // A provider down for a moment is asked again, as Iso's turns ask it, before anything is passed on.
    let res: Response;
    for (let retry = 0; ; retry++) {
      let failed: unknown;
      try {
        failed = await http.fetch(to.url, { method: req.method, headers: { ...(type ? { "Content-Type": type } : {}), ...to.headers }, signal: req.signal, ...(body === undefined ? {} : { body }) });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        failed = e;
      }
      const wait = retryWait(retry, failed);
      if (wait === null) {
        if (isResponse(failed)) { res = failed; break; }
        return json(502, `${provider.name} could not be reached: ${unreachable(failed, provider.url)}${retry ? ` (tried ${retry + 1} times)` : ""}`);
      }
      if (isResponse(failed)) await failed.body?.cancel();
      await new Promise((done) => setTimeout(done, wait));
      if (req.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
    }
    return new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  };
}
