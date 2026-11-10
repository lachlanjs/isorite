// Choosing the pi agent for a base's pane (M35 prototype, settings in M36 step 8): `ISORITE_PI=<provider>/<model>`, as
// `anthropic/claude-sonnet-4-6` or `openai/gpt-5`, else the model chosen in the settings (kept with the keys, in isorite's
// data folder). A key is the one saved in the settings, else the provider's own variable (ANTHROPIC_API_KEY, ...). With
// neither choice, the pane has no agent and shows its setup. `ISORITE_PI_ASK=<tool>,<tool>` makes the pane ask before those tools run. The project's files and shell are the settings' (default: read the files, nothing else); `ISORITE_PI_FILES=off|read|write` and
// `ISORITE_PI_SHELL=1` set them from the environment and win (the shell is one nothing can confine).

import { createModels } from "@earendil-works/pi-ai";
import type { Api } from "@isorite/engine";
import { PiHost, type PiHostOptions } from "./host.ts";
import { fileTools, pathGuard, type Files } from "./files.ts";
import { FileStore, storeDir } from "./store.ts";
import { Credentials, DEFAULT_REACH, PROVIDERS, type Choice, type Reach } from "./credentials.ts";
import { GATEWAY, gatewayFetch, gatewayFor, gatewayModels, readGateway, type Gateway } from "./gateway.ts";
import { unreachable } from "../network.ts";
import { configPath } from "../config.ts";
import { SCRIPTED, scriptedModel, scriptedOn } from "./scripted.ts";
import { basename } from "node:path";

const camel = (s: string): string => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** The model `provider/model` and the way to reach it. Throws (naming what is wrong) where pi has no such provider or model. */
export async function modelFor(provider: string, model: string, env: NodeJS.ProcessEnv = process.env): Promise<{ chosen: NonNullable<ReturnType<ReturnType<typeof createModels>["getModel"]>>; streamFn: PiHostOptions["streamFn"] }> {
  if (!provider || !model || !/^[a-z0-9-]+$/.test(provider)) throw new Error(`a model is <provider>/<model>, as anthropic/claude-sonnet-4-6; it was "${provider}/${model}"`);
  // The scripted model, for the tests, where the environment offers it (scripted.ts).
  if (provider === SCRIPTED && scriptedOn(env)) return scriptedModel() as never;
  // A gateway of your own: any model it serves, by the address, headers and certificate config.toml gives it.
  if (provider === GATEWAY) {
    const g = readGateway(configPath(env), env);
    if (!g) throw new Error(`no gateway is set: name one under [provider] in ${configPath(env)} (url, and pfx or cert if it asks for a certificate)`);
    return gatewayFor(g, model, env) as never;
  }
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
  constructor(env: NodeJS.ProcessEnv = process.env, creds = new Credentials(env)) {
    this.#env = env; this.creds = creds;
    // The gateway's key may be written in its configuration ([provider] key, or a "$NAME" there).
    creds.fallback ??= (p) => { if (p !== GATEWAY) return undefined; try { return readGateway(configPath(env), env)?.key; } catch { return undefined; } };
  }
  /** What starts the agent in a base whose pane is not the agent's yet, once a model is chosen (serve.ts, per base). */
  readonly #starters = new Set<() => Promise<void>>();
  whenChosen(start: () => Promise<void>): () => void { this.#starters.add(start); return () => this.#starters.delete(start); }

  /** What the agent may reach now, read synchronously where a prompt starts. Loaded by `load`. */
  reach: Reach = { ...DEFAULT_REACH };
  /** True where the environment (ISORITE_PI_FILES, ISORITE_PI_SHELL) sets it, and so wins. */
  reachFromEnvironment = false;

  async load(): Promise<void> {
    const files = this.#env.ISORITE_PI_FILES?.trim(), shell = this.#env.ISORITE_PI_SHELL?.trim();
    if (files !== undefined && files !== "" && !["off", "read", "write"].includes(files)) throw new Error(`ISORITE_PI_FILES is off, read or write; it was "${files}"`);
    this.reachFromEnvironment = Boolean(files) || shell !== undefined && shell !== "";
    const saved = await this.creds.reach();
    this.reach = { files: (files || saved.files) as Files, shell: shell ? ["1", "true", "on"].includes(shell) : saved.shell };
  }

  async setReach(reach: Reach): Promise<void> {
    await this.creds.setReach(reach);
    if (!this.reachFromEnvironment) this.reach = { ...reach };
  }

  attach(host: PiHost): void { this.#hosts.add(host); }
  /** A host let go (the scripted one, put away by a test): no longer the pane's agent. */
  detach(host: PiHost): void { this.#hosts.delete(host); }

  async state() {
    await this.load().catch(() => undefined);
    const want = await wanted(this.#env, this.creds).catch(() => null);
    return {
      /** True where the pane of this base is the native agent's now. */
      active: this.#hosts.size > 0,
      choice: want?.choice ?? null,
      /** Where the choice is made: the environment wins over the settings while it is set. */
      source: want?.source ?? null,
      providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, env: p.env })),
      keys: await this.creds.sources(),
      reach: this.reach,
      reachFromEnvironment: this.reachFromEnvironment,
      gateway: await this.gateway(),
    };
  }

  /** The gateway config.toml names, as the settings show it (never a key, a passphrase or a header's value), with the
   *  models it offers; or why it cannot be used; or null where there is none. */
  async gateway(): Promise<{ name: string; url: string; models: string[]; certificate: string[]; keyHeader: string | null; headers: string[] } | { problem: string } | null> {
    let g: Gateway | null;
    try { g = readGateway(configPath(this.#env), this.#env); } catch (e) { return { problem: (e as Error).message }; }
    if (!g) return null;
    const models = await gatewayModels(g, await this.creds.key(GATEWAY), this.#env).catch(() => g.models);
    return { name: g.name, url: g.url, models, certificate: g.tls?.files.map((f) => basename(f)) ?? [], keyHeader: g.keyHeader ?? null, headers: Object.keys(g.headers) };
  }

  /** The models `provider` offers, by id: its catalogue in pi, or the gateway's own list. */
  async models(provider: string): Promise<string[]> {
    if (provider === GATEWAY) {
      const g = (() => { try { return readGateway(configPath(this.#env), this.#env); } catch { return null; } })();
      return g ? await gatewayModels(g, await this.creds.key(GATEWAY), this.#env).catch(() => g.models) : [];
    }
    if (!/^[a-z0-9-]+$/.test(provider)) return [];
    try {
      const make = ((await import(`@earendil-works/pi-ai/providers/${provider}`)) as Record<string, unknown>)[`${camel(provider)}Provider`] as (() => { getModels(): readonly { id: string }[] }) | undefined;
      return make ? make().getModels().map((m) => m.id).filter((id) => !id.startsWith("~")) : [];
    } catch { return []; }
  }

  /** One short request to `provider`'s `model` with the key it would use: how long it took, or why it did not answer,
   *  with what to change. For a gateway that cannot be reached, it is asked once more directly, for the reason Node
   *  keeps (a certificate wanted, an authority not trusted, a proxy refusing), which the model's client does not say. */
  async check(provider: string, model: string): Promise<{ ms: number; said: string }> {
    const { chosen, streamFn } = await modelFor(provider, model.trim(), this.#env);
    const key = (await this.creds.key(provider)) ?? (provider === GATEWAY ? "none" : undefined);
    if (!key) throw new Error(`no key is set for ${PROVIDERS.find((p) => p.id === provider)?.name ?? provider}: keep one here, or set ${PROVIDERS.find((p) => p.id === provider)?.env}`);
    const t0 = Date.now();
    const out = await (await streamFn!(chosen, { messages: [{ role: "user", content: "Reply with the single word: ready", timestamp: t0 }] } as never, { apiKey: key, maxTokens: 16, signal: AbortSignal.timeout(30_000) } as never)).result();
    if (out.stopReason === "error" || out.stopReason === "aborted") {
      let why = out.errorMessage ?? "it did not answer";
      if (provider === GATEWAY && /connection error|fetch failed|ECONN|socket|certificate|TLS/i.test(why)) {
        const g = readGateway(configPath(this.#env), this.#env)!;
        try { await gatewayFetch(g, this.#env)(`${g.url}/models`, { signal: AbortSignal.timeout(10_000) }); } catch (e) { why = unreachable(e, g.url); }
      }
      throw new Error(why);
    }
    return { ms: Date.now() - t0, said: out.content.map((c: { type: string; text?: string }) => (c.type === "text" ? c.text ?? "" : "")).join("").trim().slice(0, 80) };
  }

  async choose(provider: string, model: string): Promise<void> {
    const { chosen, streamFn } = await modelFor(provider, model.trim(), this.#env);
    await this.creds.choose(provider, chosen.id);
    // A host already running carries on with it; the environment, if it names one, still wins at the next start.
    if (!this.#env.ISORITE_PI?.trim()) for (const h of this.#hosts) h.use(chosen, streamFn, `pi (${chosen.id})`);
    // A base whose pane is not the agent's yet takes it now, with no restart.
    if (!this.#hosts.size) for (const start of this.#starters) await start();
  }
}

/** The pi host for `api`, or null where pi is not chosen. Throws (naming what is wrong) where it is chosen and cannot be had. */
export async function piHostFor(api: PiHostOptions["api"] & Pick<Api, "events">, env: NodeJS.ProcessEnv = process.env, project = process.cwd(), notes = project, control = new PiControl(env)): Promise<PiHost | null> {
  const want = await wanted(env, control.creds);
  if (!want) return null;
  const { provider, model } = want.choice;
  const { chosen, streamFn } = await modelFor(provider, model, env);
  await control.load();
  const asked = new Set((env.ISORITE_PI_ASK ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const host = new PiHost({ api, store: new FileStore(storeDir(notes, env)), model: chosen, streamFn, name: `pi (${model})`, getApiKey: async (p) => (await control.creds.key(p)) ?? (p === GATEWAY ? "none" : undefined), ...(asked.size ? { ask: (tool: string) => asked.has(tool) } : {}), more: () => fileTools(project, control.reach), guard: pathGuard(project) });
  await host.resume();
  control.attach(host);
  return host;
}
