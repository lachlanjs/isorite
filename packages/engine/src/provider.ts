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
}

export const OPENROUTER: ProviderConfig = {
  name: "openrouter",
  url: "https://openrouter.ai/api/v1",
  cacheMarks: true,
  tiers: { low: "anthropic/claude-haiku-4.5", mid: "anthropic/claude-sonnet-5.5", max: "anthropic/claude-opus-5.5" },
  prices: {},
};

/** The name a provider's key is kept under. */
export const KEY = "provider.key";

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

/** Call the model, streaming. */
export async function complete(http: Http, p: ProviderConfig, key: string | null, call: Call): Promise<Reply> {
  const body = JSON.stringify({
    model: call.model, messages: call.messages.map(wire(p.cacheMarks)), stream: true, stream_options: { include_usage: true },
    ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
    ...(call.tools?.length ? { tools: call.tools, tool_choice: call.toolChoice ?? "auto" } : {}),
  });
  let res: Response;
  try {
    res = await http.fetch(p.url.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST", body, signal: call.signal ?? null,
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), "X-Title": "isorite" },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ModelError(`${p.name} could not be reached: ${(err as Error).message}`, 502);
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const said = await res.text();
      try { const j = JSON.parse(said) as { error?: { message?: string } | string; message?: string }; detail = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? ""; } catch { detail = said.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300); }
    } catch { /* none */ }
    const advice = res.status === 401 ? " The key was not accepted: set it again in settings." : res.status === 402 ? " The key's credit is spent." : res.status === 404 ? ` ${p.name} may have no model called ${call.model}.` : "";
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
