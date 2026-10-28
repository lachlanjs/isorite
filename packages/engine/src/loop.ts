// The one loop Iso runs on, wherever it is asked from. The model is asked;
// each tool it calls is run and answered; it is asked again, until it replies
// or its rounds are used, when it must reply. Carried over from rdstudio's
// agent.ts.

import type { Step } from "./lookup.ts";
import { ModelError, complete, type Message, type ProviderConfig, type Reply, type Tier, type ToolDef, type Usage } from "./provider.ts";
import type { Http } from "./ports.ts";

/** How many times as much room a reply that ran out of it before it wrote anything is given, asked again. */
export const WIDER = 3;
/** Cut off with nothing written, nor any tool called: its whole budget went on thinking. */
const empty = (r: Reply) => r.cut && !r.text.trim() && !r.calls.length;

/** How many times it may use its tools before it must reply, by tier. */
export const ROUNDS: Record<Tier, number> = { low: 3, mid: 6, max: 8 };

/** What the model may call: Iso's look-ups (Lookup), or those and a mode's own tools (a turn). A call that looked
 *  something up says so with its step, which is published for the Atlas. */
export interface Tools {
  defs(): ToolDef[];
  call(name: string, raw: string): Promise<{ text: string; step?: Step }>;
}

export interface Run {
  http: Http;
  provider: ProviderConfig;
  key: string | null;
  tier: Tier;
  messages: Message[];
  lookup: Tools;
  maxTokens: number;
  signal: AbortSignal;
  /** Each piece of the reply as it is written. What was written before a lookup is not the reply: `again` says to start over. */
  onText: (piece: string, again: boolean) => void;
  onStep: (step: Step) => void;
  /** Before the provider is asked again, having failed for a moment: which retry, of how many. */
  onRetry?: (retry: number, of: number) => void;
  /** How many rounds of looking up it may have, in place of the tier's. 0: one call, with no tools offered. */
  most?: number;
}

export interface Ran {
  text: string;
  /** Over all its rounds. */
  usage: Usage;
  /** How many times the model was called. */
  calls: number;
  /** What the provider counted as sent in the first call: the turn's context, before any look-up. */
  firstIn: number;
  cut: boolean;
}

export async function rounds(o: Run): Promise<Ran> {
  const messages = [...o.messages], most = o.most ?? ROUNDS[o.tier], model = o.provider.tiers[o.tier];
  const usage: Usage = { model, tokensIn: 0, tokensOut: 0, tokensCached: 0, usd: 0 };
  let firstIn = 0;
  for (let round = 0, calls = 1; ; round++, calls++) {
    let first = true;
    const ask = (maxTokens: number, effort?: "low") => complete(o.http, o.provider, o.key, {
      model, messages, maxTokens, tools: most ? o.lookup.defs() : [], toolChoice: round < most ? "auto" : "none", signal: o.signal, ...(effort ? { effort } : {}),
      onText: (piece) => { o.onText(piece, first && round > 0); first = false; },
      ...(o.onRetry ? { onRetry: o.onRetry } : {}),
    });
    const add = (r: Reply) => { usage.tokensIn += r.usage.tokensIn; usage.tokensOut += r.usage.tokensOut; usage.tokensCached += r.usage.tokensCached; usage.usd += r.usage.usd; };
    let r = await ask(o.maxTokens);
    add(r);
    if (round === 0) firstIn = r.usage.tokensIn;
    // A model that thinks before it writes can spend the whole budget thinking: asked once more with more room, and
    // (on OpenRouter) asked to think less. DeepSeek V4.1 Flash thought past 48,000 tokens on an artifact left to
    // itself, and wrote it at once with effort low (plan-m23 §9).
    if (empty(r)) {
      r = await ask(o.maxTokens * WIDER, "low");
      add(r);
      if (empty(r)) throw new ModelError(`${model} used its whole output budget (${Math.max(o.maxTokens * WIDER, o.provider.maxTokens ?? 0)} tokens) thinking, and wrote nothing. Try a lower tier, or raise max_tokens under [provider] in config.toml.`, 502, { kind: "cut" });
    }
    if (!r.calls.length || round >= most) return { text: r.text, usage, calls, cut: r.cut, firstIn };
    messages.push({ role: "assistant", content: r.text, calls: r.calls });
    for (const c of r.calls) {
      const { text, step } = await o.lookup.call(c.name, c.arguments);
      messages.push({ role: "tool", callId: c.id, content: text });
      if (step) o.onStep(step);
    }
  }
}
