import { existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultHome, gatewayFrom, GATEWAY_KEY, openCodeConfig, pluginDir, writeHome } from "../src/home.ts";
import { lapis, quartz } from "../plugin/palette.ts";

const dirs: string[] = [];
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), "isorite-home-")); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("the gateway", () => {
  it("is none without ISORITE_GATEWAY_URL", () => {
    expect(gatewayFrom({})).toBeNull();
  });

  it("takes its models from ISORITE_GATEWAY_MODELS, the first the default", () => {
    const gateway = gatewayFrom({ ISORITE_GATEWAY_URL: "https://gateway.example/v1", ISORITE_GATEWAY_MODELS: "big, small ," });
    expect(gateway).toEqual({ url: "https://gateway.example/v1", models: ["big", "small"] });
    const config = openCodeConfig(gateway) as { model: string; providers: { gateway: { env: string[]; settings: { baseURL: string } } } };
    expect(config.model).toBe("gateway/big");
    expect(config.providers.gateway.settings.baseURL).toBe("https://gateway.example/v1");
    expect(config.providers.gateway.env).toEqual([GATEWAY_KEY]);
  });

  it("needs its models named, and a URL", () => {
    expect(() => gatewayFrom({ ISORITE_GATEWAY_URL: "https://gateway.example/v1" })).toThrow(/ISORITE_GATEWAY_MODELS/);
    expect(() => gatewayFrom({ ISORITE_GATEWAY_URL: "not a url", ISORITE_GATEWAY_MODELS: "m" })).toThrow(/not a URL/);
  });

  it("names the key's variable and never holds a key", () => {
    const dir = writeHome(fresh(), { gateway: { url: "https://gateway.example/v1", models: ["m"] } });
    const written = readFileSync(join(dir, "opencode.json"), "utf8");
    expect(written).toContain(GATEWAY_KEY);
    expect(written).not.toMatch(/apiKey|authorization|bearer/i);
  });
});

describe("the config home", () => {
  it("is beside isorite's own config", () => {
    expect(defaultHome({ XDG_CONFIG_HOME: "/x" })).toBe(join("/x", "isorite", "opencode"));
  });

  it("holds the config, the TUI's settings, the theme and a link to the plugin", () => {
    const dir = writeHome(fresh());
    expect(JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8"))).toEqual({ $schema: "https://opencode.ai/config.json" });
    expect(JSON.parse(readFileSync(join(dir, "cli.json"), "utf8")).theme).toEqual({ name: "isorite", mode: "system" });
    const theme = JSON.parse(readFileSync(join(dir, "themes", "isorite.json"), "utf8"));
    expect(theme.defs["lapis-g0"]).toBe(lapis.g0);
    expect(theme.defs["quartz-g0"]).toBe(quartz.g0);
    expect(theme.theme.background).toEqual({ dark: "lapis-g0", light: "quartz-g0" });
    expect(readlinkSync(join(dir, "plugins", "isorite"))).toBe(pluginDir);
  });

  it("replaces what was there at the plugin's place", () => {
    const dir = fresh();
    mkdirSync(join(dir, "plugins", "isorite"), { recursive: true });
    writeFileSync(join(dir, "plugins", "isorite", "stale.ts"), "");
    writeHome(dir);
    writeHome(dir);
    expect(readlinkSync(join(dir, "plugins", "isorite"))).toBe(pluginDir);
  });

  it("puts your local.json over what it writes: providers added, the rest yours", () => {
    const dir = fresh();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "local.json"), JSON.stringify({ permissions: [{ action: "shell", resource: "*", effect: "ask" }], providers: { work: { name: "Work" } }, model: "work/big" }));
    writeHome(dir, { gateway: { url: "https://gateway.example/v1", models: ["m"] } });
    const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as { permissions: unknown[]; providers: Record<string, unknown>; model: string };
    expect(written.permissions).toEqual([{ action: "shell", resource: "*", effect: "ask" }]);
    expect(Object.keys(written.providers).sort()).toEqual(["gateway", "work"]);
    expect(written.model).toBe("work/big");
    expect(existsSync(join(dir, "local.json"))).toBe(true);
  });
});
