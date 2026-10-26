// Where the models come from: one call, `complete`, over the Http port, to
// anything that speaks the OpenAI chat completions protocol. As it comes that
// is OpenRouter; any compatible endpoint (Ollama, vLLM, LM Studio, LiteLLM, an
// organisation's gateway) is a different address. Carried over from
// rdstudio's models.ts, without its Node-only transport.

import { EngineError } from "./api.ts";
import type { Http } from "./ports.ts";

export const TIERS = ["low", "mid", "max"] as const;
export type Tier = (typeof TIERS)[number];

export interface ProviderConfig {
  /** What it is called to the person, and in `who`: "openrouter". */
  name: string;
  /** /chat/completions is added to it. */
  url: string;
  /** Anthropic's cache marks in messages, which OpenRouter passes on. */
  cacheMarks: boolean;
  tiers: Record<Tier, string>;
  /** US dollars a million tokens, in and out, for a provider that does not say what a call cost. */
  prices: Record<string, [number, number]>;
  /** The most tokens its models take at once; 200,000 unless said. */
  context?: number;
  /** Where the person signs in for the provider to make a key and hand it here (OAuth with PKCE); its codes are
   *  exchanged at `url` + /auth/keys. Without it, a key can only be pasted. */
  auth?: string;
  /** Sent with every request: what a company's gateway may want besides the key (a team, a project). */
  headers?: Record<string, string>;
  /** The header the key goes in, as it is (`api-key`), in place of `Authorization: Bearer`. */
  keyHeader?: string;
  /** Added to every request's address (`api-version`). */
  query?: Record<string, string>;
  /** false for a gateway that refuses `stream_options`: the turns then cost what the prices say, or nothing. */
  streamUsage?: boolean;
  /** The tiers are OpenRouter's, kept because none were named for this provider: a 404 says so. */
  defaultTiers?: boolean;
}

export const OPENROUTER: ProviderConfig = {
  name: "openrouter",
  url: "https://openrouter.ai/api/v1",
  cacheMarks: true,
  tiers: { low: "anthropic/claude-haiku-4.5", mid: "anthropic/claude-sonnet-5.5", max: "anthropic/claude-opus-5.5" },
  prices: {},
  auth: "https://openrouter.ai/auth",
};

/** The name a provider's key is kept under. */
export const KEY = "provider.key";
/** The monthly cap on what Iso may cost, in dollars, kept with the device's configuration. */
export const SPEND_CAP = "provider.spend_cap";

const base64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A random string of `n` bytes, URL-safe. */
export const randomToken = (n = 32): string => base64url(crypto.getRandomValues(new Uint8Array(n)));

/** A PKCE verifier and its S256 challenge: the challenge goes out with the sign-in, the verifier only with the exchange. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  return { verifier, challenge: base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))) };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  /** Text, or parts (a part marked cache: true asks providers that support it to cache up to there). */
  content: string | { text: string; cache?: boolean }[];
  /** assistant: the tools it called in this turn. */
  calls?: ToolCall[];
  /** tool: the call this is the result of. */
  callId?: string;
}
/** A tool the model may call: a function with a JSON schema. */
export interface ToolDef { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }
/** A call the model made: the arguments are JSON, as it wrote them. */
export interface ToolCall { id: string; name: string; arguments: string }

export interface Usage { model: string; tokensIn: number; tokensOut: number; tokensCached: number; usd: number }

export interface Call {
  model: string;
  messages: Message[];
  maxTokens?: number;
  tools?: ToolDef[];
  /** With tools: "none" makes it reply without calling one. */
  toolChoice?: "auto" | "none";
  /** Called with each piece of text as it streams. */
  onText?: (piece: string) => void;
  /** Called before each retry of a request the provider could not answer for a moment: which retry, of how many. */
  onRetry?: (retry: number, of: number) => void;
  signal?: AbortSignal;
}

export interface Reply {
  text: string;
  usage: Usage;
  /** The tools it called instead of finishing; empty when the reply is whole. */
  calls: ToolCall[];
  /** The reply stopped at the output limit sent with the request. */
  cut: boolean;
}

/** Whose a failure is likely to be: the provider's for a moment (`unavailable`, `limited`), the settings', or a
 *  reply that ran out of room before it said anything (`cut`). */
export type Failure = "unavailable" | "limited" | "settings" | "cut";

/** The provider refused, or could not be reached. */
export class ModelError extends EngineError {
  readonly kind: Failure;
  /** Worth asking again, after `after` ms if the provider said how long. */
  readonly retry: boolean;
  readonly after: number | undefined;
  constructor(message: string, status = 502, o: { kind?: Failure; retry?: boolean; after?: number } = {}) {
    super(message, status);
    this.kind = o.kind ?? "settings";
    this.retry = o.retry ?? false;
    this.after = o.after;
  }
}

/** The waits before each retry, in ms (a little more at random, so that many clients don't come back at once), and
 *  the longest Retry-After waited for. Tests shorten them. */
export const RETRY = { waits: [1000, 2000, 4000], jitter: 250, longest: 10_000 };

/** The errors of a connection that was made and broken, or that took too long: the provider's for a moment. A name
 *  not found, a refusal or a certificate is the settings', and is not asked again. */
const BROKEN = new Set(["ECONNRESET", "EPIPE", "ECONNABORTED", "UND_ERR_SOCKET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
/** The answers of a gateway whose model or backend is down for the moment. */
const DOWN = new Set([502, 503, 504]);

/** The code Node keeps for why a request failed, however deep in its causes. */
export function codeOf(err: unknown): string {
  let code = "";
  for (let r = err as { code?: string; cause?: unknown } | undefined, depth = 0; r && depth < 8; r = r.cause as typeof r, depth++) if (typeof r.code === "string") code = r.code;
  return code;
}

/** For what passes a request on as it is (the terminal's relay): how long to wait before retry `retry` (0 the first)
 *  of one that failed with this answer or error, or null not to ask again. As complete() decides. */
export function retryWait(retry: number, failed: Response | unknown): number | null {
  const res = isResponse(failed) ? failed : null;
  const down = res ? DOWN.has(res.status) : BROKEN.has(codeOf(failed)), limited = res?.status === 429;
  if (!(down || limited) || retry >= (limited ? Math.min(1, RETRY.waits.length) : RETRY.waits.length)) return null;
  const after = res ? afterOf(res) : undefined;
  return after === undefined ? RETRY.waits[retry]! + Math.random() * RETRY.jitter : after <= RETRY.longest ? after : null;
}

/** A reply, not an error. Not by instanceof: a server may put its own Response in place of the global one (Hono's
 *  Node adapter does), and fetch's replies are then not instances of it. */
export const isResponse = (v: unknown): v is Response => typeof v === "object" && v !== null && typeof (v as Response).status === "number" && typeof (v as Response).headers?.get === "function";

/** Retry-After, in ms: seconds, or a date. */
function afterOf(res: Response): number | undefined {
  const v = res.headers.get("retry-after");
  if (!v) return undefined;
  const ms = /^\d+$/.test(v.trim()) ? Number(v) * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}

const stopped = () => Object.assign(new Error("stopped"), { name: "AbortError" });
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((done, fail) => {
  if (signal?.aborted) { fail(stopped()); return; }
  const t = setTimeout(() => { signal?.removeEventListener("abort", stop); done(); }, ms);
  const stop = () => { clearTimeout(t); fail(stopped()); };
  signal?.addEventListener("abort", stop, { once: true });
});

/** The certificates Node refuses when it does not know the authority that signed them. */
const UNTRUSTED = new Set(["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"]);

/** Why a request did not reach `url`, and what to change: the reason Node keeps in the error's cause (a fetch says
 *  only "fetch failed"), with one line of advice for the common ones. */
export function unreachable(err: unknown, url: string): string {
  let reason = err as { code?: string; message?: string; cause?: unknown } | undefined, code = "", said = "";
  while (reason) {
    if (reason.code) code = reason.code;
    if (reason.message) said = reason.message;
    reason = reason.cause as typeof reason;
  }
  said = said.split("\n")[0]!.replace(/^[0-9A-F]{8,}:error:[0-9A-F]+:SSL routines:[^:]*:/, "").replace(/:\.\.\/deps\/.*$/, "");
  let host = url;
  try { host = new URL(url).host; } catch { /* as given */ }
  const advice =
    UNTRUSTED.has(code) ? `Its certificate is signed by an authority not trusted here, often a company's own. Add it to the system's authorities (isorite trusts those), or set NODE_EXTRA_CA_CERTS to its certificate (a .pem), or name that as ca in [provider].`
    : code === "CERT_HAS_EXPIRED" ? "Its certificate has expired: that is the gateway's to fix."
    : code === "ERR_TLS_CERT_ALTNAME_INVALID" ? `Its certificate is not for ${host}: check the url in [provider].`
    : /CERTIFICATE_REQUIRED|HANDSHAKE_FAILURE|BAD_CERTIFICATE|UNKNOWN_CA/.test(code) ? "It asks for a client certificate (mTLS) and was given none it accepts: name yours as pfx (with pfx_passphrase), or cert and cert_key, in [provider]."
    : code === "UND_ERR_SOCKET" && url.startsWith("https:") ? "It closed the connection as it was being set up. A gateway that asks for a client certificate (mTLS) does this: name yours as pfx, or cert and cert_key, in [provider]."
    : code === "ENOTFOUND" || code === "EAI_AGAIN" ? `The name ${host} could not be found: check the url in [provider], and whether it is only found on the company's network or VPN.`
    : code === "ECONNREFUSED" ? `Nothing answers at ${host}: check the url and its port in [provider].`
    : code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ENETUNREACH" || code === "EHOSTUNREACH" ? `${host} did not answer. If the company's network reaches it through a proxy, set HTTPS_PROXY.`
    : "";
  return [said || (err as Error)?.message || "no reason given", code && !said.includes(code) ? ` (${code})` : "", advice ? `. ${advice}` : ""].join("");
}

export const plain = (m: Message): string => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text).join("\n\n"));

/** A message as it is sent. */
const wire = (marks: boolean) => (m: Message) => m.role === "tool" ? { role: "tool", tool_call_id: m.callId ?? "", content: plain(m) }
  : m.role === "assistant" && m.calls?.length ? { role: "assistant", content: plain(m) || null, tool_calls: m.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments || "{}" } })) }
  : {
    role: m.role,
    content: typeof m.content === "string" || !marks ? plain(m)
      : m.content.map((p) => ({ type: "text", text: p.text, ...(p.cache ? { cache_control: { type: "ephemeral" } } : {}) })),
  };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The address of `path` at the provider, and the headers that go with every request to it: its key, where it
 *  wants it, and its own. */
export function endpoint(p: ProviderConfig, key: string | null, path: string): { url: string; headers: Record<string, string> } {
  const url = new URL(p.url.replace(/\/+$/, "") + path);
  for (const [name, value] of Object.entries(p.query ?? {})) url.searchParams.set(name, value);
  const auth: Record<string, string> = !key ? {} : p.keyHeader ? { [p.keyHeader]: key } : { Authorization: `Bearer ${key}` };
  return { url: url.toString(), headers: { ...p.headers, ...auth, "X-Title": "isorite" } };
}

/** Call the model, streaming. A request the provider could not answer for a moment (down, a broken connection,
 *  too many requests) is asked again, up to RETRY.waits.length times, but only before any of the reply has come:
 *  after that, asking again would say it twice. */
export async function complete(http: Http, p: ProviderConfig, key: string | null, call: Call): Promise<Reply> {
  const began = Date.now();
  for (let retry = 0; ; retry++) {
    const heard = { any: false };
    try {
      return await completeOnce(http, p, key, call, heard);
    } catch (err) {
      if ((err as Error).name === "AbortError" || !(err instanceof ModelError)) throw err;
      const most = err.kind === "limited" ? Math.min(1, RETRY.waits.length) : RETRY.waits.length;
      const again = err.retry && !heard.any && retry < most && (err.after === undefined || err.after <= RETRY.longest);
      if (!again) {
        if (!err.retry || retry === 0) throw err;
        const tries = `tried ${retry + 1} times over ${Math.round((Date.now() - began) / 1000)} s`;
        throw new ModelError(err.kind === "unavailable" && err.message.includes(" is unavailable (") ? `${err.message}, ${tries}: it is likely ${p.name}, not your settings.` : `${err.message} (${tries})`, err.status, { kind: err.kind });
      }
      call.onRetry?.(retry + 1, most);
      await pause(err.after ?? RETRY.waits[retry]! + Math.random() * RETRY.jitter, call.signal);
    }
  }
}

async function completeOnce(http: Http, p: ProviderConfig, key: string | null, call: Call, heard: { any: boolean }): Promise<Reply> {
  const body = JSON.stringify({
    model: call.model, messages: call.messages.map(wire(p.cacheMarks)), stream: true, ...(p.streamUsage === false ? {} : { stream_options: { include_usage: true } }),
    ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
    ...(call.tools?.length ? { tools: call.tools, tool_choice: call.toolChoice ?? "auto" } : {}),
  });
  let res: Response;
  try {
    const to = endpoint(p, key, "/chat/completions");
    res = await http.fetch(to.url, { method: "POST", body, signal: call.signal ?? null, headers: { "Content-Type": "application/json", ...to.headers } });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const broken = BROKEN.has(codeOf(err));
    throw new ModelError(`${p.name} could not be reached: ${unreachable(err, p.url)}`, 502, { kind: broken ? "unavailable" : "settings", retry: broken });
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const said = await res.text();
      try { const j = JSON.parse(said) as { error?: { message?: string } | string; message?: string }; detail = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? ""; } catch { detail = said.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300); }
    } catch { /* none */ }
    if (DOWN.has(res.status)) throw new ModelError(`${p.name} is unavailable (${res.status}${detail ? `: ${detail}` : ""})`, 502, { kind: "unavailable", retry: true, after: afterOf(res) });
    if (res.status === 429) throw new ModelError(`${p.name} said 429, too many requests${detail ? `: ${detail}` : ""}. Wait a moment and send it again.`, 502, { kind: "limited", retry: true, after: afterOf(res) });
    const advice = res.status === 401 ? " The key was not accepted: set it again in settings." : res.status === 402 ? " The key's credit is spent." : res.status === 404 ? ` ${p.name} may have no model called ${call.model}${p.defaultTiers ? ", which is OpenRouter's name for it: name this provider's models under [tiers] in config.toml" : ""}.` : "";
    throw new ModelError(`${p.name} said ${res.status}${detail ? `: ${detail}` : ""}.${advice}`, res.status === 401 || res.status === 403 ? 409 : 502);
  }

  let text = "", usage: Record<string, unknown> | null = null, finish = "";
  const calls: ToolCall[] = []; // a call arrives in pieces, by its index
  type Called = { index?: number; id?: string; function?: { name?: string; arguments?: string } };
  const take = (list: Called[] | undefined) => {
    for (const t of list ?? []) {
      const c = (calls[t.index ?? 0] ??= { id: "", name: "", arguments: "" });
      if (t.id) c.id = t.id;
      if (t.function?.name) c.name += t.function.name;
      if (t.function?.arguments) c.arguments += t.function.arguments;
    }
  };
  type Chunk = { choices?: { finish_reason?: string | null; delta?: { content?: string; tool_calls?: Called[] }; message?: { content?: string | null; tool_calls?: Called[] } }[]; usage?: Record<string, unknown>; error?: { message?: string } };
  const read = (chunk: Chunk) => {
    if (chunk.error) throw new ModelError(`${p.name}: ${chunk.error.message ?? "an error"}`, 502);
    const choice = chunk.choices?.[0];
    const piece = choice?.delta?.content ?? choice?.message?.content;
    if (piece) { text += piece; heard.any = true; call.onText?.(piece); }
    if (choice?.delta?.tool_calls?.length || choice?.message?.tool_calls?.length) heard.any = true;
    take(choice?.delta?.tool_calls ?? choice?.message?.tool_calls?.map((t, index) => ({ ...t, index })));
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  };
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    // One reply, whole: what a gateway that does not stream sends anyway.
    let whole: Chunk;
    try { whole = JSON.parse(await res.text()) as Chunk; } catch { throw new ModelError(`${p.name} sent a reply that could not be read`, 502); }
    read(whole);
  } else {
    // Server-sent events: data lines of JSON chunks, the last carrying the usage.
    let buffer = "";
    const decoder = new TextDecoder(), reader = res.body.getReader();
    for (;;) {
      let got: Awaited<ReturnType<typeof reader.read>>;
      try { got = await reader.read(); } catch (err) {
        if ((err as Error).name === "AbortError" || call.signal?.aborted) throw err;
        const broken = BROKEN.has(codeOf(err)) || (err as Error).message === "terminated";
        throw new ModelError(`${p.name} broke off its reply: ${unreachable(err, p.url)}`, 502, { kind: "unavailable", retry: broken });
      }
      const { done, value } = got;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: Chunk;
        try { chunk = JSON.parse(data) as Chunk; } catch { continue; }
        read(chunk);
      }
    }
  }
  const u = (usage ?? {}) as Record<string, unknown>;
  const details = (typeof u.prompt_tokens_details === "object" && u.prompt_tokens_details !== null ? u.prompt_tokens_details : {}) as Record<string, unknown>;
  const tokensIn = num(u.prompt_tokens), tokensOut = num(u.completion_tokens);
  const price = p.prices[call.model];
  return {
    text, cut: /^(length|max_tokens)$/.test(finish),
    calls: calls.filter((c) => c && c.name).map((c, k) => ({ ...c, id: c.id || `call_${k}` })),
    // What the provider says it cost (OpenRouter does); else worked out from the prices set for it; else nothing is known.
    usage: { model: call.model, tokensIn, tokensOut, tokensCached: num(details.cached_tokens), usd: typeof u.cost === "number" ? num(u.cost) : price ? (tokensIn * price[0] + tokensOut * price[1]) / 1e6 : 0 },
  };
}
