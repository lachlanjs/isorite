// isorite doctor's check of isorite's own agent: which model is chosen, where its key comes from, and (unless
// --offline) whether the provider accepts it, with one tiny request. A key that is set but refused is the failure that
// looks like nothing is wrong (the settings say "key saved"), so it is said in the provider's own words, and where
// someone is at the terminal, mended there: with the key an old config.toml holds, or with one pasted.

import { Credentials, PROVIDERS } from "./pi/credentials.ts";
import { keyRefusal } from "./network.ts";
import { table, type Table } from "./config.ts";

export type Said = (step: string, outcome: "ok" | "fail" | "warn" | "skip", said: string) => void;

/** What the check needs of the agent's keys and model, so a test can stand in for the real ones. */
export interface AgentPort {
  choice(): Promise<{ provider: string; model: string } | null>;
  sources(): Promise<Record<string, "saved" | "environment" | null>>;
  /** True where a key is saved and the provider's own variable holds another: the saved one wins. */
  differs(provider: string): Promise<boolean>;
  keep(provider: string, key: string): Promise<void>;
  check(provider: string, model: string): Promise<{ ms: number; said: string }>;
}

export interface AgentCheck {
  env: NodeJS.ProcessEnv;
  config: Table;
  say: Said;
  /** A line said on the way, that is not a result (shown, not counted, and not in a report). */
  note: (line: string) => void;
  offline?: boolean;
  /** Only at a terminal, and not for a report: a yes or no, and a key typed unseen. */
  ask?: (question: string) => Promise<boolean>;
  secret?: (question: string) => Promise<string>;
  agent?: AgentPort;
}

/** The key an old config.toml holds under [provider] (until M25 it was the agent's, and is no longer read), where
 *  [provider] is not a gateway's (that has a url). A "$NAME" is read from the environment. */
export function legacyKey(config: Table, env: NodeJS.ProcessEnv): string | undefined {
  const p = table(config.provider);
  if (typeof p.url === "string" && p.url.trim()) return undefined;
  if (typeof p.key !== "string" || !p.key.trim()) return undefined;
  const named = /^\$([A-Za-z_]\w*)$/.exec(p.key.trim())?.[1];
  return (named ? env[named] : p.key.trim()) || undefined;
}

function realPort(env: NodeJS.ProcessEnv): AgentPort {
  const creds = new Credentials(env);
  return {
    choice: async () => {
      const named = env.ISORITE_PI?.trim();
      if (named) { const [provider, ...rest] = named.split("/"); return provider && rest.length ? { provider, model: rest.join("/") } : null; }
      return creds.choice();
    },
    sources: () => creds.sources(),
    differs: async (provider) => {
      const own = PROVIDERS.find((p) => p.id === provider)?.env;
      return Boolean(own && env[own] && (await creds.sources())[provider] === "saved" && (await creds.key(provider)) !== env[own]);
    },
    keep: (provider, key) => creds.set(provider, key),
    // pi is the slow part to load, so only here, and only for a request.
    check: async (provider, model) => new (await import("./pi/index.ts")).PiControl(env, creds).check(provider, model),
  };
}

export async function checkAgent(o: AgentCheck): Promise<void> {
  const { env, say } = o, port = o.agent ?? realPort(env);
  const legacy = legacyKey(o.config, env);
  let want: { provider: string; model: string } | null, sources: Record<string, "saved" | "environment" | null>;
  try { want = await port.choice(); sources = await port.sources(); } catch (e) { say("agent", "fail", (e as Error).message); return; }
  const oldKey = "The key in config.toml's [provider] is not read: it is how the agent's key was kept until M25.";

  if (!want) {
    say("agent", "skip", `isorite's own agent has no model chosen: isorite setup, or Model and key… in the Agent pane. An agent of your own (Claude Code, Codex) needs none${legacy ? `. ${oldKey}` : ""}`);
    return;
  }
  const { provider, model } = want;
  const spec = PROVIDERS.find((p) => p.id === provider), name = spec?.name ?? provider, label = `${name}, ${model}`;
  const source = sources[provider] ?? null;
  const from = source === "saved" ? "the key saved in isorite's data folder" : source === "environment" ? `the key in ${spec?.env}` : "no key";
  if (source && (await port.differs(provider).catch(() => false))) {
    say("agent key", "warn", `${spec?.env} is set and holds another key than the one saved, and the saved one is used: remove it in the settings to use ${spec?.env}`);
  }
  if (o.offline) { say("agent", source || provider === "gateway" ? "ok" : "warn", `${label}, with ${from} (not tried: --offline)`); return; }

  /** One tiny request: how long it took, or what the provider said. */
  const attempt = async (): Promise<{ ms: number } | { said: string }> => {
    if (!(await port.sources())[provider] && provider !== "gateway") return { said: "" };
    try { return { ms: (await port.check(provider, model)).ms }; } catch (e) { return { said: (e as Error).message }; }
  };
  let result = await attempt();
  if ("ms" in result) { say("agent", "ok", `${label}: ${from} answered in ${(result.ms / 1000).toFixed(1)}s`); return; }

  const refusal = result.said ? keyRefusal(result.said) : null;
  if (result.said && !refusal) { say("agent", "fail", `${label}: ${result.said}`); return; }

  // No key, or a key the provider refused: the thing to change is the key.
  const problem = refusal ? `${name} refuses ${from}: ${refusal}` : `no key for ${name}`;
  const change = source === "environment" ? `Set a current ${spec?.env}.` : `Replace it in the Agent pane's settings (Model and key…), or run isorite setup${spec ? `, or set ${spec.env}` : ""}.`;
  const also = legacy ? ` ${oldKey}` : "";

  if (o.ask && source !== "environment" && provider !== "gateway") {
    o.note(`✗ agent: ${label}: ${problem}.${also}`);
    // A key written the old way into config.toml is very likely the one meant to be used: offer it first.
    if (legacy && (await o.ask(`Keep the key in config.toml's [provider] as your ${name} key, and try it?`))) {
      await port.keep(provider, legacy);
      result = await attempt();
    } else if (o.secret) {
      const typed = (await o.secret(`Paste a new ${name} key (Enter to leave it): `)).trim();
      if (typed) { await port.keep(provider, typed); result = await attempt(); }
    }
    if ("ms" in result) { say("agent", "ok", `${label}: the new key is kept, and answered in ${(result.ms / 1000).toFixed(1)}s`); return; }
    const again = result.said ? keyRefusal(result.said) ?? result.said : "";
    say("agent", "fail", `${label}: ${again ? `${name} still refuses it: ${again}` : problem}. ${change}`);
    return;
  }
  say("agent", "fail", `${label}: ${problem}. ${change}${also}`);
}
