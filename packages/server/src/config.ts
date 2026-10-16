// What isorite keeps for this device, outside both repositories:
// ~/.config/isorite/config.toml: the device's id, the provider's key, and
// which provider and models, where they are not OpenRouter's defaults.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";
import { OPENROUTER, TIERS, type ProviderConfig, type Secrets } from "@isorite/engine";

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "isorite", "config.toml");

const DEVICE = /^[a-z0-9]{4,16}$/;

type Table = Record<string, unknown>;
const table = (v: unknown): Table => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Table) : {});

export function readConfig(path = configPath()): Table {
  if (!existsSync(path)) return {};
  try { return parse(readFileSync(path, "utf8")); } catch (e) { throw new Error(`${path}: ${(e as Error).message}`); }
}

/** Written for its owner alone: keys live here. */
export function writeConfig(config: Table, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify(config) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** This device's id, made the first time it is asked for. It is written into every journal entry. */
export function deviceId(path = configPath()): string {
  const config = readConfig(path);
  if (typeof config.device === "string" && DEVICE.test(config.device)) return config.device;
  const device = randomBytes(5).toString("hex").slice(0, 8);
  writeConfig({ ...config, device }, path);
  return device;
}

/** The engine's Secrets port over the configuration file: `provider.key` is `key` under `[provider]`. */
export class ConfigSecrets implements Secrets {
  private readonly path: string;
  constructor(path = configPath()) { this.path = path; }

  async get(name: string): Promise<string | null> {
    const [section, field] = name.split(".") as [string, string];
    const value = table(readConfig(this.path)[section])[field];
    return typeof value === "string" && value ? value : null;
  }

  async set(name: string, value: string | null): Promise<void> {
    const [section, field] = name.split(".") as [string, string];
    const config = readConfig(this.path), held = { ...table(config[section]) };
    if (value === null) delete held[field]; else held[field] = value;
    writeConfig({ ...config, [section]: held }, this.path);
  }
}

/** The provider, as the configuration has it: OpenRouter unless `[provider] url` names another (and `auth` its
 *  sign-in page, if it makes keys as OpenRouter does), and `[tiers]` for the models. */
export function providerConfig(path = configPath()): ProviderConfig {
  const config = readConfig(path), p = table(config.provider), tiers = table(config.tiers), prices = table(config.prices);
  const custom = typeof p.url === "string" && p.url !== "";
  const base: ProviderConfig = custom ? { name: typeof p.name === "string" && p.name ? p.name : "custom", url: p.url as string, cacheMarks: p.cache_marks === true, tiers: { ...OPENROUTER.tiers }, prices: {}, ...(typeof p.auth === "string" && p.auth ? { auth: p.auth } : {}) } : OPENROUTER;
  if (!custom && !Object.keys(tiers).length) return OPENROUTER;
  const out: ProviderConfig = { ...base, tiers: { ...base.tiers }, prices: { ...base.prices } };
  for (const tier of TIERS) if (typeof tiers[tier] === "string" && tiers[tier]) out.tiers[tier] = tiers[tier] as string;
  for (const [model, price] of Object.entries(prices)) if (Array.isArray(price) && price.length === 2 && price.every((n) => typeof n === "number")) out.prices[model] = price as [number, number];
  return out;
}
