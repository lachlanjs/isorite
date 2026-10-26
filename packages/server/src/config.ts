// What isorite keeps for this device, outside both repositories:
// ~/.config/isorite/config.toml: the device's id, the provider's key, and
// which provider and models, where they are not OpenRouter's defaults.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parse, stringify } from "smol-toml";
import { KEY, OPENROUTER, TIERS, type ProviderConfig, type Secrets } from "@isorite/engine";

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "isorite", "config.toml");

const DEVICE = /^[a-z0-9]{4,16}$/;

export type Table = Record<string, unknown>;
export const table = (v: unknown): Table => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Table) : {});

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
    // `spend_cap = 5` written by hand is a number, not a string.
    return typeof value === "number" ? String(value) : typeof value === "string" && value ? value : null;
  }

  async set(name: string, value: string | null): Promise<void> {
    const [section, field] = name.split(".") as [string, string];
    const config = readConfig(this.path), held = { ...table(config[section]) };
    if (value === null) delete held[field]; else held[field] = value;
    writeConfig({ ...config, [section]: held }, this.path);
  }
}

/** A value as written, or the environment variable `"$NAME"` names: a second secret need not be written here. */
function valueOf(field: string, v: unknown, env: NodeJS.ProcessEnv): string {
  if (typeof v !== "string" && typeof v !== "number") throw new Error(`[provider] ${field} must be text`);
  const s = String(v), named = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(s)?.[1];
  if (!named) return s;
  const got = env[named];
  if (got === undefined || got === "") throw new Error(`[provider] ${field} is "$${named}", and ${named} is not set`);
  return got;
}

const textTable = (field: string, v: unknown, env: NodeJS.ProcessEnv): Record<string, string> | undefined =>
  v === undefined ? undefined : Object.fromEntries(Object.entries(table(v)).map(([k, x]) => [k, valueOf(`${field}.${k}`, x, env)]));

/** The provider, as the configuration has it: OpenRouter unless `[provider] url` names another (and `auth` its
 *  sign-in page, if it makes keys as OpenRouter does), and `[tiers]` for the models. A gateway's own needs are
 *  `headers`, `key_header`, `query` and `stream_usage = false`; `max_tokens` for models that think at length; its
 *  client certificate is `gatewayTls`'s. */
export function providerConfig(path = configPath(), env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  return providerFrom(readConfig(path), env);
}

/** The provider a configuration names, as `providerConfig` reads it from the file: for a setup not yet kept (M18). */
export function providerFrom(config: Table, env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const p = table(config.provider), tiers = table(config.tiers), prices = table(config.prices);
  const custom = typeof p.url === "string" && p.url !== "";
  const base: ProviderConfig = custom ? { name: typeof p.name === "string" && p.name ? p.name : "custom", url: p.url as string, cacheMarks: p.cache_marks === true, tiers: { ...OPENROUTER.tiers }, prices: {}, ...(typeof p.auth === "string" && p.auth ? { auth: p.auth } : {}) } : OPENROUTER;
  const headers = textTable("headers", p.headers, env), query = textTable("query", p.query, env);
  const own: Partial<ProviderConfig> = {
    ...(headers ? { headers } : {}), ...(query ? { query } : {}),
    ...(typeof p.key_header === "string" && p.key_header ? { keyHeader: p.key_header } : {}),
    ...(p.stream_usage === false ? { streamUsage: false } : {}),
    ...(typeof p.max_tokens === "number" && p.max_tokens > 0 ? { maxTokens: Math.floor(p.max_tokens) } : {}),
  };
  if (!custom && !Object.keys(tiers).length && !Object.keys(own).length) return OPENROUTER;
  const out: ProviderConfig = { ...base, ...own, tiers: { ...base.tiers }, prices: { ...base.prices } };
  for (const tier of TIERS) if (typeof tiers[tier] === "string" && tiers[tier]) out.tiers[tier] = tiers[tier] as string;
  if (custom && TIERS.every((t) => out.tiers[t] === OPENROUTER.tiers[t])) out.defaultTiers = true;
  for (const [model, price] of Object.entries(prices)) if (Array.isArray(price) && price.length === 2 && price.every((n) => typeof n === "number")) out.prices[model] = price as [number, number];
  return out;
}

/** The client certificate a gateway asks for (mTLS), and the authority its own certificate is signed by:
 *  `pfx` (with `pfx_passphrase`), or `cert` and `cert_key`, and `ca`, under `[provider]`. Paths may start with ~,
 *  and are otherwise from the configuration's folder. null when none is named. */
export interface GatewayTls { pfx?: Buffer; passphrase?: string; cert?: Buffer; key?: Buffer; ca?: Buffer; files: string[] }

export function gatewayTls(path = configPath(), env: NodeJS.ProcessEnv = process.env): GatewayTls | null {
  return gatewayTlsFrom(readConfig(path), dirname(path), env);
}

/** The certificate a configuration names, its paths from `dir` (the configuration's folder). */
export function gatewayTlsFrom(config: Table, dir: string, env: NodeJS.ProcessEnv = process.env): GatewayTls | null {
  const p = table(config.provider), files: string[] = [];
  const file = (field: string): Buffer | undefined => {
    if (p[field] === undefined || p[field] === "") return undefined;
    const named = valueOf(field, p[field], env), at = named.startsWith("~/") ? join(homedir(), named.slice(2)) : resolve(dir, named);
    if (!existsSync(at)) throw new Error(`[provider] ${field}: there is no file at ${at}`);
    files.push(at);
    return readFileSync(at);
  };
  const tls: GatewayTls = { files };
  const pfx = file("pfx"), cert = file("cert"), key = file("cert_key"), ca = file("ca");
  if (pfx && (cert || key)) throw new Error("[provider] names both pfx and cert: a .pfx holds the certificate and its key, so name one or the other");
  if (Boolean(cert) !== Boolean(key)) throw new Error("[provider] cert and cert_key go together: the certificate, and its private key");
  if (pfx) tls.pfx = pfx;
  if (cert && key) { tls.cert = cert; tls.key = key; }
  if (ca) tls.ca = ca;
  if (p.pfx_passphrase !== undefined) tls.passphrase = valueOf("pfx_passphrase", p.pfx_passphrase, env);
  return files.length ? tls : null;
}

/** Whether Iso has a model here: a key kept, or a provider of your own (a gateway may need no key). */
export async function hasModel(config = configPath()): Promise<boolean> {
  return (await new ConfigSecrets(config).get(KEY)) !== null || providerConfig(config).url !== OPENROUTER.url;
}

/** A knowledge base this device knows, by name (M20): `[<name>]` in bases.toml, beside config.toml, with its `path`,
 *  and `lend` when it is lent to every session's agent and Iso as well as the base the session is for (the agent's
 *  memory is). A file of its own, so that config.toml, written by hand and holding the key, is left as it is. */
export interface KnownBase { name: string; path: string; lend: boolean }

const BASE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const expand = (p: string): string => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : resolve(p));
/** A path as written in the file: under the home folder, with ~. */
const written = (p: string): string => { const home = homedir(); return p === home ? "~" : p.startsWith(home + "/") ? "~" + p.slice(home.length) : p; };

/** Where the bases are listed, beside the configuration. */
export const basesPath = (config = configPath()): string => join(dirname(config), "bases.toml");

/** The bases listed, in the order written. A row without a path, or with a name isorite
 *  would not give one, is passed over. */
export function knownBases(config = configPath()): KnownBase[] {
  return Object.entries(readConfig(basesPath(config))).flatMap(([name, v]) => {
    const row = table(v);
    return BASE_NAME.test(name) && typeof row.path === "string" && row.path ? [{ name, path: expand(row.path), lend: row.lend === true }] : [];
  });
}

/** A name for a base from its folder: small letters, digits and dashes. */
export function baseName(folder: string): string {
  const name = basename(folder).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return name || "base";
}

/** The base at `folder` by its name in the configuration, listed first if it is not: under its folder's name, or
 *  that name with -2, -3… where another folder has it. `as` names it, and `lend` lends it. */
export function rememberBase(folder: string, { path = configPath(), as, lend }: { path?: string; as?: string; lend?: boolean } = {}): string {
  const at = resolve(folder), known = knownBases(path), had = known.find((b) => b.path === at);
  if (had && lend === undefined) return had.name;
  const bases = readConfig(basesPath(path));
  let name = had?.name;
  if (!name) {
    const stem = as && BASE_NAME.test(as) ? as : baseName(at), taken = new Set(Object.keys(bases));
    name = stem;
    for (let n = 2; taken.has(name); n++) name = `${stem.slice(0, 36)}-${n}`;
  }
  bases[name] = { ...table(bases[name]), path: written(at), ...(lend === undefined ? {} : { lend }) };
  writeConfig(bases, basesPath(path));
  return name;
}

/** Lend a known base to every session, or stop lending it. False when there is no base of that name. */
export function lendBase(name: string, lend: boolean, path = configPath()): boolean {
  const bases = readConfig(basesPath(path));
  if (!BASE_NAME.test(name) || !bases[name]) return false;
  bases[name] = { ...table(bases[name]), lend };
  writeConfig(bases, basesPath(path));
  return true;
}
