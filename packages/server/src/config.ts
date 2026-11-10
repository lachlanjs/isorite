// What isorite keeps for this device, outside both repositories: ~/.config/isorite/config.toml, the device's id;
// and bases.toml beside it, the bases it knows. (Until M25 config.toml also named the agent's provider, its key and its
// models, under [provider] and [tiers]: left as written, and no longer read.)

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parse, stringify } from "smol-toml";

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "isorite", "config.toml");

const DEVICE = /^[a-z0-9]{4,16}$/;

export type Table = Record<string, unknown>;
export const table = (v: unknown): Table => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Table) : {});

export function readConfig(path = configPath()): Table {
  if (!existsSync(path)) return {};
  try { return parse(readFileSync(path, "utf8")); } catch (e) {
    const said = (e as Error).message;
    // A Windows path in double quotes is read with its backslashes as escapes.
    throw new Error(`${path}: ${said}${/escape sequence/i.test(said) ? "\nA path with backslashes goes in single quotes, as 'C:\\certs\\me.pfx', or is written with forward slashes." : ""}`);
  }
}

/** Written for its owner alone. */
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

/** A knowledge base this device knows, by name (M20): `[<name>]` in bases.toml, beside config.toml, with its `path`,
 *  and `lend` when it is lent to every agent's session as well as the base the session is for (the agent's
 *  memory is). A file of its own, so that config.toml, written by hand, is left as it is. */
export interface KnownBase { name: string; path: string; lend: boolean; used?: string; title?: string }

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
    return BASE_NAME.test(name) && typeof row.path === "string" && row.path ? [{ name, path: expand(row.path), lend: row.lend === true, ...(typeof row.used === "string" ? { used: row.used } : {}), ...(typeof row.title === "string" && row.title ? { title: row.title } : {}) }] : [];
  });
}

/** A name for a base from its folder: small letters, digits and dashes. */
export function baseName(folder: string): string {
  const name = basename(folder).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return name || "base";
}

/** The base at `folder` by its name in the configuration, listed first if it is not: under its folder's name, or
 *  that name with -2, -3… where another folder has it. `as` names it, and `lend` lends it. */
/** A base opened now: when it was last used is kept (`used`), for `isorite` to list the bases last used first. */
export function touchBase(folder: string, { path = configPath(), now = new Date() }: { path?: string; now?: Date } = {}): void {
  const at = resolve(folder), bases = readConfig(basesPath(path)), name = knownBases(path).find((b) => b.path === at)?.name;
  if (!name) return;
  bases[name] = { ...table(bases[name]), used: now.toISOString() };
  writeConfig(bases, basesPath(path));
}

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

/** Give a known base a title to be shown by (M37), or take it back with an empty one: its name stays, as it is the base's
 *  address and what the agent's sessions know it by. False when there is no base of that name. */
export function titleBase(name: string, title: string, path = configPath()): boolean {
  const bases = readConfig(basesPath(path));
  if (!BASE_NAME.test(name) || !bases[name]) return false;
  const { title: _was, ...rest } = table(bases[name]) as Record<string, unknown>;
  bases[name] = { ...rest, ...(title.trim() ? { title: title.trim() } : {}) } as typeof bases[string];
  writeConfig(bases, basesPath(path));
  return true;
}

/** Lend a known base to every session, or stop lending it. False when there is no base of that name. */
export function lendBase(name: string, lend: boolean, path = configPath()): boolean {
  const bases = readConfig(basesPath(path));
  if (!BASE_NAME.test(name) || !bases[name]) return false;
  bases[name] = { ...table(bases[name]), lend };
  writeConfig(bases, basesPath(path));
  return true;
}
