// isorite's own agent, set up from the terminal: which provider has a key in the environment already, which model to
// offer first, and (for a company gateway) the [provider] table in config.toml. A key is never printed; it is kept
// where the Agent pane's settings keep it (pi/credentials.ts), or left in the environment variable it was found in.

import { PROVIDERS } from "../pi/credentials.ts";
import { configPath, readConfig, table, writeConfig } from "../config.ts";

export interface ProviderState { id: string; name: string; env: string; set: boolean }

/** The providers, those with a key in the environment first (in the order the settings list them). */
export function providerStates(env: NodeJS.ProcessEnv = process.env): ProviderState[] {
  const all = PROVIDERS.filter((p) => p.id !== "gateway").map((p) => ({ id: p.id, name: p.name, env: p.env, set: Boolean(env[p.env]) }));
  return [...all.filter((p) => p.set), ...all.filter((p) => !p.set)];
}

const PREFER: Record<string, RegExp[]> = {
  anthropic: [/^claude-sonnet-[\d-]+$/, /^claude-sonnet/],
  openrouter: [/^anthropic\/claude-sonnet-[\d.]+$/, /^openai\/gpt-[\d.]+$/],
  openai: [/^gpt-\d(\.\d)?$/],
  google: [/^gemini-pro-latest$/, /^gemini-[\d.]+-pro$/],
};
const newest = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

/** The model to offer first out of a provider's list: its newest mid-sized general model, else the first listed.
 *  Dated aliases (…-20250929) are passed over for the plain name. */
export function preferredModel(provider: string, ids: string[]): string | null {
  for (const re of PREFER[provider] ?? []) {
    const hit = ids.filter((id) => re.test(id) && !/-\d{8}$/.test(id)).sort(newest)[0];
    if (hit) return hit;
  }
  return ids.filter((id) => !id.includes(":"))[0] ?? ids[0] ?? null;
}

export interface GatewayInput { url: string; name?: string; keyEnv?: string; models?: string[] }

/** Write `[provider]` in config.toml: the address, and the key as "$NAME" so it stays in the environment. What else is
 *  in the file is kept. Throws on an address that is not http(s). */
export function writeGateway(g: GatewayInput, path = configPath()): void {
  let url: URL;
  try { url = new URL(g.url); } catch { throw new Error(`${g.url} is not an address; write it as https://gateway.example.com/v1`); }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`${g.url} is not an http(s) address`);
  if (g.keyEnv !== undefined && !/^[A-Za-z_]\w*$/.test(g.keyEnv)) throw new Error(`${g.keyEnv} is not the name of an environment variable`);
  const config = readConfig(path), was = table(config.provider);
  config.provider = { ...was, url: g.url.replace(/\/+$/, ""), ...(g.name ? { name: g.name } : {}), ...(g.keyEnv ? { key: `$${g.keyEnv}` } : {}), ...(g.models?.length ? { models: g.models } : {}) };
  writeConfig(config, path);
}
