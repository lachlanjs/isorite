// The one loop Iso runs on, wherever it is asked from. The model is asked;
// each tool it calls is run and answered; it is asked again, until it replies
// or its rounds are used, when it must reply. Carried over from rdstudio's
// agent.ts.

import type { Step } from "./lookup.ts";
import { complete, type Message, type ProviderConfig, type Tier, type ToolDef, type Usage } from "./provider.ts";
import type { Http } from "./ports.ts";

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
  cut: boolean;
}

export async function rounds(o: Run): Promise<Ran> {
  const messages = [...o.messages], most = o.most ?? ROUNDS[o.tier], model = o.provider.tiers[o.tier];
  const usage: Usage = { model, tokensIn: 0, tokensOut: 0, tokensCached: 0, usd: 0 };
  for (let round = 0, calls = 1; ; round++, calls++) {
    let first = true;
    const r = await complete(o.http, o.provider, o.key, {
      model, messages, maxTokens: o.maxTokens, tools: most ? o.lookup.defs() : [], toolChoice: round < most ? "auto" : "none", signal: o.signal,
      onText: (piece) => { o.onText(piece, first && round > 0); first = false; },
      ...(o.onRetry ? { onRetry: o.onRetry } : {}),
    });
    usage.tokensIn += r.usage.tokensIn; usage.tokensOut += r.usage.tokensOut; usage.tokensCached += r.usage.tokensCached; usage.usd += r.usage.usd;
    if (!r.calls.length || round >= most) return { text: r.text, usage, calls, cut: r.cut };
    messages.push({ role: "assistant", content: r.text, calls: r.calls });
    for (const c of r.calls) {
      const { text, step } = await o.lookup.call(c.name, c.arguments);
      messages.push({ role: "tool", callId: c.id, content: text });
      if (step) o.onStep(step);
    }
  }
}
