// isorite term: OpenCode, with isorite's plugin and theme, beside a knowledge base.
//
// OpenCode opens in the folder you are in (your code); the knowledge base is reached through
// the isorite server, as the browser reaches it. OpenCode's own server runs on this machine with a password, the
// terminal attached to it, and the isorite server follows the same session for the Iso pane. If no server answers on the port, one is
// started for the base, its output kept in a log so that it does not draw over the TUI,
// and stopped when OpenCode exits.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StudyError } from "@isorite/core";
import { NAME } from "@isorite/example";
import { writeExample } from "@isorite/example/node";
import { defaultHome, findOpenCode, GATEWAY_KEY, gatewayFrom, startScripted, tutorialScript, writeHome, type Gateway } from "@isorite/opencode";
import { ConfigSecrets, configPath, gatewayTls, providerConfig } from "./config.ts";
import { locate, WEB_DIR } from "./serve.ts";

// The command itself, to start a server with: main.ts in a checkout, or the one file it is built into for npm.
const MAIN = import.meta.url.endsWith(".ts") ? fileURLToPath(new URL("./main.ts", import.meta.url)) : fileURLToPath(import.meta.url);

export interface TermOptions {
  port?: number;
  /** Where OpenCode starts: the folder you are in. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** How long to wait for a server this started, in milliseconds. */
  wait?: number;
  /** Told the server's address once it answers, before OpenCode starts. */
  onServer?: (url: string) => void;
}

/** Open a page in the browser, if this machine has one to open; nothing is said if it has not. */
export function openBrowser(url: string): void {
  const [command, ...args] = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try { spawn(command!, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref(); } catch { /* no browser here */ }
}

/** The name the server on this URL serves, or null when nothing answers. */
export async function serving(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(2000) });
    return response.ok ? ((await response.json()) as { name: string }).name : null;
  } catch {
    return null;
  }
}

/** The isorite server on the port, and how to let it go: one already running for this base (or for any, when
 *  no base is named), or one started for the base, its output kept in a log, stopped when let go. */
export async function ensureServer(path: string | undefined, { port = 4767, env = process.env, wait = 120_000 } = {}): Promise<{ url: string; release: () => void }> {
  const url = `http://127.0.0.1:${port}`;
  const opened = path === undefined ? null : locate(path);
  const name = await serving(url);
  if (name !== null) {
    if (opened && name !== basename(opened.notes))
      throw new StudyError(`port ${port} is serving ${name}, not ${basename(opened.notes)}: stop it, or use another port (--port <n>)`);
    return { url, release: () => undefined };
  }
  if (!opened) throw new StudyError(`nothing is serving on port ${port}: name a base`);
  const log = join(tmpdir(), `isorite-term-${port}.log`);
  const out = openSync(log, "w");
  const server = spawn(process.execPath, [MAIN, "serve", path!, "--port", String(port)], { stdio: ["ignore", out, out], env });
  const exited = new Promise<void>((done) => server.once("exit", () => done()));
  const started = Date.now();
  while ((await serving(url)) === null) {
    if (server.exitCode !== null || Date.now() - started > wait) {
      server.kill();
      throw new StudyError(`the isorite server did not start; its output is in ${log}`);
    }
    await Promise.race([exited, new Promise((r) => setTimeout(r, 250))]);
  }
  return { url, release: () => { server.kill(); } };
}

/** A port nobody is listening on, on this machine. */
async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer().once("error", fail).listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => done(port));
    });
  });
}

/** A POST to the isorite server, made as its page makes one: from its origin, with the token it hands out. */
async function tell(url: string, path: string, body: unknown): Promise<void> {
  const token = await tokenOf(url);
  const response = await fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `${response.status} from ${path}`);
}

/** OpenCode's own server, on this machine only, with a password of its own; its output kept in a log. The terminal
 *  attaches to it, and so does the isorite server, which shows its session in the Iso pane (M11). */
export async function startOpenCode(command: string, { cwd, env, wait = 60_000 }: { cwd: string; env: NodeJS.ProcessEnv; wait?: number }): Promise<{ url: string; password: string; stop: () => void }> {
  const port = await freePort(), password = randomBytes(24).toString("base64url"), url = `http://127.0.0.1:${port}`;
  const log = join(tmpdir(), `isorite-opencode-${port}.log`);
  const out = openSync(log, "w");
  const server = spawn(command, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], { cwd, stdio: ["ignore", out, out], env: { ...env, OPENCODE_PASSWORD: password } });
  const auth = { authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") };
  const started = Date.now();
  for (;;) {
    if (server.exitCode !== null || Date.now() - started > wait) {
      server.kill();
      throw new StudyError(`OpenCode's server did not start; its output is in ${log}`);
    }
    try { if ((await fetch(url, { headers: auth, signal: AbortSignal.timeout(1000) })).status < 500) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { url, password, stop: () => { server.kill(); } };
}

/** Where the terminal's models come from: the environment, isorite's config.toml, or OpenCode's own. */
export type ModelsFrom = "environment" | "config" | "opencode";

/** The models the terminal uses: ISORITE_GATEWAY_URL and _MODELS when set; else Iso's own provider, as
 *  ~/.config/isorite/config.toml has it, reached through the isorite server at `server` (its relay adds the
 *  key, the certificate, the headers and the query, so OpenCode is given the server's token and none of those),
 *  its models the tiers'; else, with no key and no certificate, OpenCode's own models, or whatever your
 *  local.json names. */
export async function modelsFor(env: NodeJS.ProcessEnv, server: { url: string; token: string }): Promise<{ gateway: Gateway | null; env: NodeJS.ProcessEnv; from: ModelsFrom }> {
  const named = gatewayFrom(env);
  if (named) return { gateway: named, env, from: "environment" };
  const path = configPath(env);
  const key = await new ConfigSecrets(path).get("provider.key");
  if (!key && !gatewayTls(path, env)) return { gateway: null, env, from: "opencode" };
  const provider = providerConfig(path, env);
  const models = [...new Set([provider.tiers.mid, provider.tiers.max, provider.tiers.low])];
  return { gateway: { url: `${server.url}/api/gateway`, models }, env: { ...env, [GATEWAY_KEY]: server.token }, from: "config" };
}

/** The token the isorite server hands its page, which its relay takes as OpenCode's key. */
async function tokenOf(url: string): Promise<string> {
  return ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
}

export async function term(path: string | undefined, { port = 4767, cwd = process.cwd(), env: given = process.env, wait = 120_000, onServer }: TermOptions = {}): Promise<number> {
  const opencode = findOpenCode(given);
  const server = await ensureServer(path, { port, env: given, wait });
  onServer?.(server.url);
  let models: Awaited<ReturnType<typeof modelsFor>>;
  try { models = await modelsFor(given, { url: server.url, token: await tokenOf(server.url) }); } catch (e) { server.release(); throw e; }
  const { gateway, env } = models;
  const home = writeHome(defaultHome(env), { gateway });
  const shared = { ...env, OPENCODE_CONFIG_DIR: home, ISORITE_URL: server.url };
  let backend: Awaited<ReturnType<typeof startOpenCode>>;
  try { backend = await startOpenCode(opencode.command, { cwd, env: shared }); } catch (e) { server.release(); throw e; }
  // The Iso pane follows the session; if this server cannot, the terminal still works.
  await tell(server.url, "/api/terminal/attach", { url: backend.url, password: backend.password, directory: cwd }).catch((e: Error) => console.error(`isorite: the Iso pane will not show the terminal: ${e.message}`));
  const child = spawn(opencode.command, ["--server", backend.url], {
    cwd,
    stdio: "inherit",
    // The provider's key is OpenCode's server's to use; the terminal is not given it.
    env: { ...given, OPENCODE_CONFIG_DIR: home, ISORITE_URL: server.url, OPENCODE_PASSWORD: backend.password },
  });
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  const handlers = (["SIGTERM", "SIGHUP"] as const).map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const code = await new Promise<number>((done) => {
    child.once("error", (e) => { console.error(e.message); done(1); });
    child.once("exit", (exit) => done(exit ?? 1));
  });
  for (const [signal, handler] of handlers) process.off(signal, handler);
  await tell(server.url, "/api/terminal/detach", {}).catch(() => undefined);
  backend.stop();
  server.release();
  return code;
}

/** `isorite --tutorial` (or `isorite tutorial term`): the example base, a scripted model in place of a provider, and `isorite term` on them,
 *  its tour shown. Everything is kept in `folder` (by default a new one in the temporary folder): the base, the
 *  code it opens in, and OpenCode's and isorite's settings, so that nothing of yours is used or changed. Run again
 *  on the same folder, it carries on where it was left. */
export async function tutorialTerm(folder: string | undefined, { port = 4790, env = process.env, out = console.log }: TermOptions & { out?: (line: string) => void } = {}): Promise<number> {
  const root = folder ? resolve(folder) : mkdtempSync(join(tmpdir(), "isorite-tutorial-"));
  const base = existsSync(join(root, "base", NAME)) ? { notes: join(root, "base", NAME) } : await writeExample(join(root, "base"));
  const code = join(root, "code");
  mkdirSync(code, { recursive: true });
  const model = await startScripted(tutorialScript(base.notes));
  // Iso, in the isorite server, is answered by the same script.
  mkdirSync(join(root, "config", "isorite"), { recursive: true });
  writeFileSync(join(root, "config", "isorite", "config.toml"), `[provider]\nname = "tutorial"\nurl = "${model.url}"\nkey = "tutorial"\n`);
  out(`isorite tutorial: the example base and everything the tour changes are in ${root}`);
  out("  the model is scripted: nothing is sent anywhere, and no key is needed");
  try {
    return await term(base.notes, {
      port, cwd: code,
      // The browser's half of the tutorial, on the same base: it follows the agent as the terminal's tour goes.
      onServer: (url) => {
        out(existsSync(join(WEB_DIR, "index.html")) ? `  the browser's half: ${url}/` : "  the app is not built (npm run build), so the browser's half cannot be shown");
        if (env.ISORITE_NO_BROWSER !== "1" && existsSync(join(WEB_DIR, "index.html"))) openBrowser(`${url}/`);
      },
      env: {
        ...env,
        ISORITE_TUTORIAL: "1", ISORITE_GATEWAY_URL: model.url, ISORITE_GATEWAY_MODELS: "scripted", ISORITE_GATEWAY_KEY: "tutorial",
        XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
      },
    });
  } finally {
    await model.close();
  }
}
