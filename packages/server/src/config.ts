// What isorite keeps for this device, outside both repositories:
// ~/.config/isorite/config.toml. For now only the device's id; provider keys
// join it in milestone 2.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "isorite", "config.toml");

const DEVICE = /^[a-z0-9]{4,16}$/;

/** This device's id, made the first time it is asked for. It is written into every journal entry. */
export function deviceId(path = configPath()): string {
  let config: Record<string, unknown> = {};
  if (existsSync(path)) {
    try { config = parse(readFileSync(path, "utf8")); } catch (e) { throw new Error(`${path}: ${(e as Error).message}`); }
  }
  if (typeof config.device === "string" && DEVICE.test(config.device)) return config.device;
  const device = randomBytes(5).toString("hex").slice(0, 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify({ ...config, device }) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600); // keys will live here
  return device;
}
