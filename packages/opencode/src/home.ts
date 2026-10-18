// OpenCode's config home for isorite: what `isorite term` points OPENCODE_CONFIG_DIR at,
// so that your own OpenCode config is never read or written. It is rewritten at every start.
//
//   opencode.json         the providers and the default model
//   cli.json              the TUI's settings: the theme
//   themes/isorite.json   lapis and quartz
//   plugins/isorite       a link to this package's plugin folder

import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { theme } from "./theme.ts";

/** This package's plugin folder: the server half, the TUI half and what they share. */
export const pluginDir = fileURLToPath(new URL("../plugin", import.meta.url));

/** Where the config home is kept unless told otherwise: beside isorite's own config. */
export function defaultHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "isorite", "opencode");
}

export interface Gateway {
  /** An OpenAI-compatible endpoint: a corporate gateway, OpenRouter, or a scripted one in tests. */
  url: string;
  /** The models it offers, the first of them the default. */
  models: string[];
}

export const GATEWAY_KEY = "ISORITE_GATEWAY_KEY";

/** The gateway named by ISORITE_GATEWAY_URL and ISORITE_GATEWAY_MODELS, or null. Its key stays in ISORITE_GATEWAY_KEY. */
export function gatewayFrom(env: NodeJS.ProcessEnv = process.env): Gateway | null {
  const url = env.ISORITE_GATEWAY_URL?.trim();
  if (!url) return null;
  const models = (env.ISORITE_GATEWAY_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (!models.length) throw new Error("ISORITE_GATEWAY_URL is set, so ISORITE_GATEWAY_MODELS must name its models (comma-separated)");
  try { new URL(url); } catch { throw new Error(`ISORITE_GATEWAY_URL is not a URL: ${url}`); }
  return { url, models };
}

/** opencode.json: OpenCode's free models as they come, and the gateway, the default, when there is one. */
export function openCodeConfig(gateway: Gateway | null): object {
  if (!gateway) return { $schema: "https://opencode.ai/config.json" };
  return {
    $schema: "https://opencode.ai/config.json",
    providers: {
      gateway: {
        name: "Gateway",
        package: "@ai-sdk/openai-compatible",
        // OpenCode reads the key from the environment; it is never written here.
        env: [GATEWAY_KEY],
        settings: { baseURL: gateway.url },
        models: Object.fromEntries(gateway.models.map((m) => [m, { name: m }])),
      },
    },
    model: `gateway/${gateway.models[0]}`,
  };
}

/** Writes the config home and returns its path. */
export function writeHome(dir: string, { gateway = null as Gateway | null, plugin = pluginDir } = {}): string {
  mkdirSync(join(dir, "themes"), { recursive: true });
  mkdirSync(join(dir, "plugins"), { recursive: true });
  const json = (value: object) => JSON.stringify(value, null, 2) + "\n";
  writeFileSync(join(dir, "opencode.json"), json(openCodeConfig(gateway)));
  writeFileSync(join(dir, "cli.json"), json({ $schema: "https://opencode.ai/cli.json", theme: { name: "isorite", mode: "system" } }));
  writeFileSync(join(dir, "themes", "isorite.json"), json(theme()));
  const link = join(dir, "plugins", "isorite");
  if (!linksTo(link, plugin)) {
    rmSync(link, { recursive: true, force: true });
    symlinkSync(plugin, link, "dir");
  }
  return dir;
}

function linksTo(path: string, target: string): boolean {
  try { return lstatSync(path).isSymbolicLink() && readlinkSync(path) === target; } catch { return false; }
}
