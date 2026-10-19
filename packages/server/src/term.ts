// isorite term: OpenCode, with isorite's plugin and theme, beside a knowledge base.
//
// OpenCode opens in the folder you are in (your code); the knowledge base is reached through
// the isorite server, as the browser reaches it. If no server answers on the port, one is
// started for the base, its output kept in a log so that it does not draw over the TUI,
// and stopped when OpenCode exits.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StudyError } from "@isorite/core";
import { NAME } from "@isorite/example";
import { writeExample } from "@isorite/example/node";
import { defaultHome, findOpenCode, gatewayFrom, startScripted, tutorialScript, writeHome } from "@isorite/opencode";
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

export async function term(path: string | undefined, { port = 4767, cwd = process.cwd(), env = process.env, wait = 120_000, onServer }: TermOptions = {}): Promise<number> {
  const opencode = findOpenCode(env);
  const gateway = gatewayFrom(env);
  const server = await ensureServer(path, { port, env, wait });
  onServer?.(server.url);
  const home = writeHome(defaultHome(env), { gateway });
  const child = spawn(opencode.command, ["--standalone"], {
    cwd,
    stdio: "inherit",
    env: { ...env, OPENCODE_CONFIG_DIR: home, ISORITE_URL: server.url },
  });
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  const handlers = (["SIGTERM", "SIGHUP"] as const).map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const code = await new Promise<number>((done) => {
    child.once("error", (e) => { console.error(e.message); done(1); });
    child.once("exit", (exit) => done(exit ?? 1));
  });
  for (const [signal, handler] of handlers) process.off(signal, handler);
  server.release();
  return code;
}

/** `isorite --tutorial` (or `isorite tutorial term`): the example base, a scripted model in place of a provider, and `isorite term` on them,
 *  its tour shown. Everything is kept in `folder` (by default a new one in the temporary folder): the base, the
 *  code it opens in, and OpenCode's and isorite's settings, so that nothing of yours is used or changed. Run again
 *  on the same folder, it carries on where it was left. */
export async function tutorialTerm(folder: string | undefined, { port = 4790, env = process.env, out = console.log }: TermOptions & { out?: (line: string) => void } = {}): Promise<number> {
  const root = folder ? resolve(folder) : mkdtempSync(join(tmpdir(), "isorite-tutorial-"));
  const base = existsSync(join(root, "base", NAME)) ? { notes: join(root, "base", NAME), study: join(root, "base", `${NAME}-study`) } : await writeExample(join(root, "base"));
  const code = join(root, "code");
  mkdirSync(code, { recursive: true });
  const model = await startScripted(tutorialScript(base.notes));
  // Iso, in the isorite server, is answered by the same script.
  mkdirSync(join(root, "config", "isorite"), { recursive: true });
  writeFileSync(join(root, "config", "isorite", "config.toml"), `[provider]\nname = "tutorial"\nurl = "${model.url}"\nkey = "tutorial"\n`);
  out(`isorite tutorial: the example base and everything the tour changes are in ${root}`);
  out("  the model is scripted: nothing is sent anywhere, and no key is needed");
  try {
    return await term(base.study, {
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
