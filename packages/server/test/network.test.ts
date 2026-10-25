import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proxied } from "../src/network.ts";
import { link } from "../src/serve.ts";
import { where } from "../src/term.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

describe("the proxy", () => {
  it("is turned on for Node when one is set, with this machine's own names kept off it", () => {
    expect(proxied({ HTTPS_PROXY: "http://proxy:8080" }, [])).toMatchObject({ NODE_USE_ENV_PROXY: "1", NO_PROXY: "localhost,127.0.0.1,::1" });
    expect(proxied({ HTTPS_PROXY: "http://proxy:8080", NO_PROXY: ".corp,localhost" }, [])!.NO_PROXY).toBe(".corp,localhost,127.0.0.1,::1");
  });

  it("is left alone when there is none, when it is on already, and when told to", () => {
    expect(proxied({}, [])).toBeNull();
    expect(proxied({ HTTPS_PROXY: "http://proxy:8080", NODE_USE_ENV_PROXY: "1" }, [])).toBeNull();
    expect(proxied({ HTTPS_PROXY: "http://proxy:8080" }, ["--use-env-proxy"])).toBeNull();
    expect(proxied({ HTTPS_PROXY: "http://proxy:8080", ISORITE_NODE_DEFAULTS: "0" }, [])).toBeNull();
  });
});

describe("the isorite command, inside a company", () => {
  // A proxy that notes where it was asked to connect, and refuses.
  let proxy: Server, root: string;
  const asked: string[] = [];
  beforeAll(async () => {
    proxy = createServer().on("connect", (req, socket) => { asked.push(req.url ?? ""); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
    await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
    root = mkdtempSync(join(tmpdir(), "isorite-network-"));
    mkdirSync(join(root, "isorite"));
    writeFileSync(join(root, "isorite", "config.toml"), `[provider]\nname = "work"\nurl = "https://gateway.corp.example/v1"\nkey = "k"\n[tiers]\nlow = "a"\nmid = "a"\nmax = "a"\n`);
  });
  afterAll(() => { proxy.close(); rmSync(root, { recursive: true, force: true }); });

  const doctor = (env: NodeJS.ProcessEnv) => new Promise<string>((done) => {
    execFile(process.execPath, [MAIN, "doctor", "--port", "1"], { env: { PATH: process.env.PATH, HOME: process.env.HOME, XDG_CONFIG_HOME: root, ISORITE_OPENCODE: "/nonexistent/opencode", ...env }, timeout: 60_000 }, (_e, stdout, stderr) => done(stdout + stderr));
  });

  it("goes through HTTPS_PROXY without being told, and trusts the system's authorities", async () => {
    const said = await doctor({ HTTPS_PROXY: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}` });
    expect(asked).toContain("gateway.corp.example:443");
    expect(said).toMatch(/✓ proxy: http:\/\/127\.0\.0\.1:\d+, used/);
    expect(said).toMatch(/✓ authorities: the system's \(\d+\), as well as Node's own/);
    expect(said).toContain("✗ reached:");
  }, 70_000);

  it("leaves Node as it is with ISORITE_NODE_DEFAULTS=0, and says so", async () => {
    asked.length = 0;
    const said = await doctor({ HTTPS_PROXY: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, ISORITE_NODE_DEFAULTS: "0" });
    expect(asked).toEqual([]);
    expect(said).toContain("Node ignores it unless started with NODE_USE_ENV_PROXY=1");
    expect(said).toContain("! authorities: Node's own only (ISORITE_NODE_DEFAULTS=0)");
  }, 70_000);
});

describe("what isorite term says before OpenCode starts", () => {
  const config = { gateway: { url: "http://127.0.0.1:4767/api/gateway", models: ["big", "small"] }, env: {}, from: "config" as const };

  it("is the link to isorite in the browser, and which models the terminal uses and from where", () => {
    expect(where(4767, config, {}, false)).toEqual(["isorite: http://localhost:4767/", "  the terminal's models: big, small, as config.toml names them, through the isorite server"]);
    expect(where(4767, { gateway: null, env: {}, from: "opencode" }, {}, false)[1]).toBe("  the terminal's models: OpenCode's own, as no key or certificate is named in config.toml");
  });

  it("is a link a terminal lets you click, and over SSH, how to forward the port", () => {
    expect(link("http://localhost:4767/", true)).toBe("\x1b]8;;http://localhost:4767/\x1b\\http://localhost:4767/\x1b]8;;\x1b\\");
    expect(where(4800, config, { SSH_CONNECTION: "10.0.0.2 5000 10.0.0.3 22" }, false)[2]).toMatch(/^ {2}over SSH, the link opens on this machine; from your own, first run: ssh -L 4800:localhost:4800 \S+$/);
  });
});
