// Choosing the pi agent for a base's pane (M35 prototype): `ISORITE_PI=<provider>/<model>`, as `anthropic/claude-sonnet-4-6`
// or `openai/gpt-5`. The key is the provider's own (ANTHROPIC_API_KEY, OPENAI_API_KEY). Unset, the pane is the ACP
// agent's, as ever. `ISORITE_PI_ASK=<tool>,<tool>` makes the pane ask before those tools run.

import { createModels } from "@earendil-works/pi-ai";
import type { Api } from "@isorite/engine";
import { PiHost, type PiHostOptions } from "./host.ts";

const camel = (s: string): string => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** The pi host for `api`, or null where pi is not chosen. Throws (naming what is wrong) where it is chosen and cannot be had. */
export async function piHostFor(api: PiHostOptions["api"] & Pick<Api, "events">, env: NodeJS.ProcessEnv = process.env): Promise<PiHost | null> {
  const choice = env.ISORITE_PI?.trim();
  if (!choice) return null;
  const [provider, ...rest] = choice.split("/");
  const model = rest.join("/");
  if (!provider || !model || !/^[a-z0-9-]+$/.test(provider)) throw new Error(`ISORITE_PI is <provider>/<model>, as anthropic/claude-sonnet-4-6; it was "${choice}"`);
  let make: unknown;
  try {
    make = ((await import(`@earendil-works/pi-ai/providers/${provider}`)) as Record<string, unknown>)[`${camel(provider)}Provider`];
  } catch { /* named below */ }
  if (typeof make !== "function") throw new Error(`pi has no provider "${provider}"`);
  const models = createModels();
  models.setProvider((make as () => Parameters<typeof models.setProvider>[0])());
  const chosen = models.getModel(provider, model);
  if (!chosen) throw new Error(`pi's ${provider} has no model "${model}"`);
  const asked = new Set((env.ISORITE_PI_ASK ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  return new PiHost({ api, model: chosen, streamFn: models.streamSimple.bind(models), name: `pi (${model})`, ...(asked.size ? { ask: (tool: string) => asked.has(tool) } : {}) });
}
