// What this machine keeps of its sign-ins (M28): chat.toml beside config.toml, written for its owner alone. A token is
// never kept in the base (.isorite/ may be committed) and is never in an answer to the page.
//
//   [github]            client_id = "…"          (the application's public id, if not built in or in the environment)
//   [gitlab]            client_id = "…"
//   [signed."gitlab.com"]   token, refresh, expires, via = "device" | "cli"

import { dirname, join } from "node:path";
import type { ChatHostId } from "@isorite/engine";
import { configPath, readConfig, table, writeConfig } from "../config.ts";

export const chatPath = (config = configPath()): string => join(dirname(config), "chat.toml");

export interface Signed { token?: string; refresh?: string; expires?: number; via: "device" | "cli" }

/** The ids of isorite's own applications, built in once they are registered; until then the environment or chat.toml
 *  gives them. */
const BUILT_IN: Record<ChatHostId, string> = { github: "", gitlab: "" };

export function clientId(host: ChatHostId, path: string, env: NodeJS.ProcessEnv = process.env): string {
  const named = env[`ISORITE_${host.toUpperCase()}_CLIENT_ID`], filed = table(readConfig(path)[host]).client_id;
  return (named || (typeof filed === "string" ? filed : "") || BUILT_IN[host]).trim();
}

export function readSigned(path: string, server: string): Signed | null {
  const row = table(table(readConfig(path).signed)[server]);
  if (row.via !== "device" && row.via !== "cli") return null;
  return { via: row.via, ...(typeof row.token === "string" ? { token: row.token } : {}), ...(typeof row.refresh === "string" ? { refresh: row.refresh } : {}), ...(typeof row.expires === "number" ? { expires: row.expires } : {}) };
}

export function writeSigned(path: string, server: string, signed: Signed | null): void {
  const config = readConfig(path), all = { ...table(config.signed) };
  if (signed) all[server] = signed; else delete all[server];
  writeConfig({ ...config, signed: all }, path);
}
