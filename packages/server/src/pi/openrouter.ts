// OpenRouter models pi's catalogue does not have yet. Pi ships a list of models as of its own release, and OpenRouter
// adds one every few days, so a model a person can see on openrouter.ai could not be chosen. Its own public list
// (GET /api/v1/models: no key) says what a model is, so one it names is built from that, on a pi model of the same
// kind (the same vendor's, else any that speaks the same way) so the way of calling it is the one pi already knows.

const LIST = "https://openrouter.ai/api/v1/models";

interface Listed {
  id: string; name?: string; context_length?: number;
  architecture?: { input_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number | null };
  supported_parameters?: string[];
  pricing?: Record<string, string | undefined>;
}
/** The part of pi's model this reads and replaces; the rest is kept as the template has it. */
interface Known { id: string; api: string; input: readonly string[]; cost: Record<string, unknown>; [k: string]: unknown }

let kept: { at: number; list: Listed[] } | null = null;
/** Asked again next time (for a test, which stands in for the list). */
export const forgetOpenRouterList = (): void => { kept = null; };

/** OpenRouter's list of models, asked once in a while (it is large). Throws where it cannot be had, saying why. */
export async function openRouterList(signal: AbortSignal = AbortSignal.timeout(8000)): Promise<Listed[]> {
  if (kept && Date.now() - kept.at < 10 * 60_000) return kept.list;
  let res: Response;
  try { res = await fetch(LIST, { signal }); } catch (e) { throw new Error(`${LIST} could not be reached (${(e as Error).message})`); }
  if (!res.ok) throw new Error(`${LIST} answered ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  const list = (Array.isArray(body.data) ? body.data : []).filter((m): m is Listed => typeof m === "object" && m !== null && typeof (m as Listed).id === "string");
  kept = { at: Date.now(), list };
  return list;
}

/** Dollars a token, as the list gives them, to dollars a million tokens, as pi counts them. */
const perMillion = (v: string | undefined): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? +(n * 1e6).toFixed(6) : 0; };

/** The model `id` as OpenRouter lists it, on a template from `known` (pi's own models for OpenRouter); null where
 *  OpenRouter does not list it either. */
export async function openRouterModel<T extends Known>(known: readonly T[], id: string): Promise<T | null> {
  const found = (await openRouterList()).find((m) => m.id === id);
  if (!found) return null;
  const vendor = id.split("/")[0];
  // Anthropic's are called the way Anthropic's API is; everything else, in the OpenAI way.
  const api = vendor === "anthropic" ? "anthropic-messages" : "openai-completions";
  const template = [...known].reverse().find((m) => m.api === api && m.id.startsWith(`${vendor}/`)) ?? [...known].reverse().find((m) => m.api === api);
  if (!template) return null;
  const input = (found.architecture?.input_modalities ?? ["text"]).filter((m) => m === "text" || m === "image");
  const context = found.context_length && found.context_length > 0 ? found.context_length : (template.contextWindow as number | undefined) ?? 128_000;
  const { thinkingLevelMap: _levels, ...rest } = template as Record<string, unknown>;
  const reasoning = (found.supported_parameters ?? []).includes("reasoning");
  return {
    ...rest, id, name: found.name ?? id, input: input.length ? input : ["text"], contextWindow: context,
    // A model's largest answer can be most of its context; asking for that much is refused where credit is short.
    maxTokens: Math.min(found.top_provider?.max_completion_tokens ?? 32_768, 64_000, context),
    reasoning,
    // Pi's levels for a model that thinks are the template's own, which is another model's: the plain ones are kept.
    ...(reasoning && _levels ? { thinkingLevelMap: _levels } : {}),
    cost: { input: perMillion(found.pricing?.prompt), output: perMillion(found.pricing?.completion), cacheRead: perMillion(found.pricing?.input_cache_read), cacheWrite: perMillion(found.pricing?.input_cache_write) },
  } as unknown as T;
}
