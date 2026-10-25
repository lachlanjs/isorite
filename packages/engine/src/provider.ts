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

/** The provider refused, or could not be reached. */
export class ModelError extends EngineError {}

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
    UNTRUSTED.has(code) ? `Its certificate is signed by an authority this computer's Node does not trust, often a company's own. Start isorite with --use-system-ca, or set NODE_EXTRA_CA_CERTS to that authority's certificate (a .pem), or name it as ca in [provider].`
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

/** Call the model, streaming. */
export async function complete(http: Http, p: ProviderConfig, key: string | null, call: Call): Promise<Reply> {
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
    throw new ModelError(`${p.name} could not be reached: ${unreachable(err, p.url)}`, 502);
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const said = await res.text();
      try { const j = JSON.parse(said) as { error?: { message?: string } | string; message?: string }; detail = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? ""; } catch { detail = said.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300); }
    } catch { /* none */ }
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
    if (piece) { text += piece; call.onText?.(piece); }
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
      const { done, value } = await reader.read();
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
