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
import { existsSync, openSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS_FILE, StudyError } from "@isorite/core";
import { defaultHome, findOpenCode, GATEWAY_KEY, gatewayFrom, writeHome, type Gateway } from "@isorite/opencode";
import { ConfigSecrets, configPath, gatewayTls, providerConfig } from "./config.ts";
import { link, locate } from "./serve.ts";

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

/** The isorite server on the port, and how to let it go: one already running (for this base, or holding it as
 *  well from now on, M20; or for any, when no base is named), or one started for the base, its output kept in a
 *  log. `url` is the base's own address there. A server this started stops once the last of those using it lets it
 *  go; one you started yourself goes on. */
export async function ensureServer(path: string | undefined, { port = 4767, env = process.env, wait = 120_000 } = {}): Promise<{ url: string; release: () => void }> {
  const root = `http://127.0.0.1:${port}`;
  const opened = path === undefined ? null : locate(path);
  let name = await serving(root), started: ReturnType<typeof spawn> | null = null;
  if (name === null) {
    if (!opened) throw new StudyError(`nothing is serving on port ${port}: name a base`);
    const log = join(tmpdir(), `isorite-term-${port}.log`);
    const out = openSync(log, "w");
    // Apart from this process, so that a second terminal using it keeps it when this one is done.
    started = spawn(process.execPath, [MAIN, "serve", path!, "--port", String(port), "--held"], { stdio: ["ignore", out, out], env, detached: true });
    const exited = new Promise<void>((done) => started!.once("exit", () => done()));
    const begun = Date.now();
    while ((name = await serving(root)) === null) {
      if (started.exitCode !== null || Date.now() - begun > wait) {
        started.kill();
        throw new StudyError(`the isorite server did not start; its output is in ${log}`);
      }
      await Promise.race([exited, new Promise((r) => setTimeout(r, 250))]);
    }
    started.unref();
  }
  let url = root;
  if (opened) {
    // The base, by its name among those the server holds: opened there if it is not yet.
    const at = await fetch(`${root}/api/bases/open`, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": await tokenOf(root), Origin: root }, body: JSON.stringify({ path: opened.notes }) }).catch(() => null);
    if (at?.ok) {
      const base = (await at.json()) as { name: string; first: boolean };
      if (!base.first) url = `${root}/b/${base.name}`;
    } else if (name !== basename(opened.notes)) {
      // An isorite from before M20, serving one base only.
      throw new StudyError(`port ${port} is serving ${name}, not ${basename(opened.notes)}: stop it, or use another port (--port <n>)`);
    }
  }
  // Held while this is using it.
  const holding = new AbortController();
  // Read to its end: a stream left unread is let go by fetch once nothing holds it, and the server with it.
  const held = fetch(`${root}/api/server/hold`, { signal: holding.signal }).then((r) => {
    if (r.ok && r.body) void (async () => { try { for await (const _ of r.body!) { /* held */ } } catch { /* let go */ } })();
    return r.ok;
  }, () => false);
  return {
    url,
    release: () => {
      holding.abort();
      // A server this started that cannot be held (an older isorite) is stopped as before.
      void held.then((ok) => { if (!ok && started) started.kill(); });
    },
  };
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
  const response = await fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: new URL(url).origin }, body: JSON.stringify(body) });
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

/** What `isorite term` says before OpenCode takes the screen, and again when it gives it back: where isorite is in
 *  the browser, which models the terminal uses and where they come from, and, over SSH, how to reach the browser. */
export function where(port: number, models: Awaited<ReturnType<typeof modelsFor>>, env: NodeJS.ProcessEnv, tty?: boolean, page = "/"): string[] {
  const names = models.gateway?.models.join(", ");
  const lines = [
    `isorite: ${link(`http://localhost:${port}${page}`, tty)}`,
    models.from === "environment" ? `  the terminal's models: ${names}, at ${models.gateway!.url} (ISORITE_GATEWAY_URL)`
      : models.from === "config" ? `  the terminal's models: ${names}, as config.toml names them, through the isorite server`
      : "  the terminal's models: OpenCode's own, as no key or certificate is named in config.toml",
  ];
  if (env.SSH_CONNECTION) lines.push(`  over SSH, the link opens on this machine; from your own, first run: ssh -L ${port}:localhost:${port} ${hostname()}`);
  return lines;
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
  const said = where(port, models, given, undefined, new URL(server.url).pathname.replace(/\/?$/, "/"));
  for (const line of said) console.log(line);
  // The base's own instructions go to the terminal's agent as to Iso, when the base is named here.
  const agents = path === undefined ? null : join(locate(path).notes, AGENTS_FILE);
  const home = writeHome(defaultHome(env), { gateway, instructions: agents && existsSync(agents) ? [agents] : [] });
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
  for (const line of said) console.log(line);
  backend.stop();
  server.release();
  return code;
}
