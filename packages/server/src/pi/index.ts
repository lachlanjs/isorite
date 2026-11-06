// Choosing the pi agent for a base's pane (M35 prototype, settings in M36 step 8): `ISORITE_PI=<provider>/<model>`, as
// `anthropic/claude-sonnet-4-6` or `openai/gpt-5`, else the model chosen in the settings (kept with the keys, in isorite's
// data folder). A key is the one saved in the settings, else the provider's own variable (ANTHROPIC_API_KEY, ...). With
// neither choice, the pane is the ACP agent's, as ever. `ISORITE_PI_ASK=<tool>,<tool>` makes the pane ask before those tools run. `ISORITE_PI_FILES=read|write`
// gives it pi's tools for the project's files, and `ISORITE_PI_SHELL=1` its shell (which nothing can confine).

import { createModels } from "@earendil-works/pi-ai";
import type { Api } from "@isorite/engine";
import { PiHost, type PiHostOptions } from "./host.ts";
import { fileTools, pathGuard, type Files } from "./files.ts";
import { FileStore, storeDir } from "./store.ts";
import { Credentials, PROVIDERS, type Choice } from "./credentials.ts";

const camel = (s: string): string => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** The model `provider/model` and the way to reach it. Throws (naming what is wrong) where pi has no such provider or model. */
export async function modelFor(provider: string, model: string): Promise<{ chosen: NonNullable<ReturnType<ReturnType<typeof createModels>["getModel"]>>; streamFn: PiHostOptions["streamFn"] }> {
  if (!provider || !model || !/^[a-z0-9-]+$/.test(provider)) throw new Error(`a model is <provider>/<model>, as anthropic/claude-sonnet-4-6; it was "${provider}/${model}"`);
  let make: unknown;
  try {
    make = ((await import(`@earendil-works/pi-ai/providers/${provider}`)) as Record<string, unknown>)[`${camel(provider)}Provider`];
  } catch { /* named below */ }
  if (typeof make !== "function") throw new Error(`pi has no provider "${provider}"`);
  const models = createModels();
  models.setProvider((make as () => Parameters<typeof models.setProvider>[0])());
  const chosen = models.getModel(provider, model);
  if (!chosen) throw new Error(`pi's ${provider} has no model "${model}"`);
  return { chosen, streamFn: models.streamSimple.bind(models) };
}

/** The model named by ISORITE_PI, else the one chosen in the settings; null where there is none. */
async function wanted(env: NodeJS.ProcessEnv, creds: Credentials): Promise<{ choice: Choice; source: "environment" | "settings" } | null> {
  const named = env.ISORITE_PI?.trim();
  if (named) {
    const [provider, ...rest] = named.split("/");
    if (!provider || !rest.length) throw new Error(`ISORITE_PI is <provider>/<model>, as anthropic/claude-sonnet-4-6; it was "${named}"`);
    return { choice: { provider, model: rest.join("/") }, source: "environment" };
  }
  const saved = await creds.choice();
  return saved ? { choice: saved, source: "settings" } : null;
}

/** What the settings read and change: which model the native agent uses and where its key comes from, for the
 *  hosts running (one for each base). It never hands out a key. */
export class PiControl {
  readonly creds: Credentials;
  readonly #env: NodeJS.ProcessEnv;
  readonly #hosts = new Set<PiHost>();
  constructor(env: NodeJS.ProcessEnv = process.env, creds = new Credentials(env)) { this.#env = env; this.creds = creds; }

  attach(host: PiHost): void { this.#hosts.add(host); }

  async state() {
    const want = await wanted(this.#env, this.creds).catch(() => null);
    return {
      /** True where the pane of this base is the native agent's now. */
      active: this.#hosts.size > 0,
      choice: want?.choice ?? null,
      /** Where the choice is made: the environment wins over the settings while it is set. */
      source: want?.source ?? null,
      providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, env: p.env })),
      keys: await this.creds.sources(),
    };
  }

  async choose(provider: string, model: string): Promise<void> {
    const { chosen, streamFn } = await modelFor(provider, model.trim());
    await this.creds.choose(provider, chosen.id);
    // A host already running carries on with it; the environment, if it names one, still wins at the next start.
    if (!this.#env.ISORITE_PI?.trim()) for (const h of this.#hosts) h.use(chosen, streamFn, `pi (${chosen.id})`);
  }
}

/** The pi host for `api`, or null where pi is not chosen. Throws (naming what is wrong) where it is chosen and cannot be had. */
export async function piHostFor(api: PiHostOptions["api"] & Pick<Api, "events">, env: NodeJS.ProcessEnv = process.env, project = process.cwd(), notes = project, control = new PiControl(env)): Promise<PiHost | null> {
  const want = await wanted(env, control.creds);
  if (!want) return null;
  const { provider, model } = want.choice;
  const { chosen, streamFn } = await modelFor(provider, model);
  const files = (env.ISORITE_PI_FILES?.trim() || "off") as Files, shell = ["1", "true", "on"].includes(env.ISORITE_PI_SHELL?.trim() ?? "");
  if (!["off", "read", "write"].includes(files)) throw new Error(`ISORITE_PI_FILES is read or write; it was "${files}"`);
  const asked = new Set((env.ISORITE_PI_ASK ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const host = new PiHost({ api, store: new FileStore(storeDir(notes, env)), model: chosen, streamFn, name: `pi (${model})`, getApiKey: (p) => control.creds.key(p), ...(asked.size ? { ask: (tool: string) => asked.has(tool) } : {}), ...(files !== "off" || shell ? { more: () => fileTools(project, { files, shell }), guard: pathGuard(project) } : {}) });
  await host.resume();
  control.attach(host);
  return host;
}
