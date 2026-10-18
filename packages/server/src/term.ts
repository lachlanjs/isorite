// isorite term: OpenCode, with isorite's plugin and theme, beside a knowledge base.
//
// OpenCode opens in the folder you are in (your code); the knowledge base is reached through
// the isorite server, as the browser reaches it. If no server answers on the port, one is
// started for the base, its output kept in a log so that it does not draw over the TUI,
// and stopped when OpenCode exits.

import { spawn, type ChildProcess } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StudyError } from "@isorite/core";
import { defaultHome, findOpenCode, gatewayFrom, writeHome } from "@isorite/opencode";
import { locate } from "./serve.ts";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

export interface TermOptions {
  port?: number;
  /** Where OpenCode starts: the folder you are in. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** How long to wait for a server this started, in milliseconds. */
  wait?: number;
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

export async function term(path: string | undefined, { port = 4767, cwd = process.cwd(), env = process.env, wait = 120_000 }: TermOptions = {}): Promise<number> {
  const opencode = findOpenCode(env);
  const gateway = gatewayFrom(env);
  const url = `http://127.0.0.1:${port}`;
  const opened = path === undefined ? null : locate(path);
  const name = await serving(url);

  let server: ChildProcess | null = null;
  if (name !== null) {
    if (opened && name !== basename(opened.notes))
      throw new StudyError(`port ${port} is serving ${name}, not ${basename(opened.notes)}: stop it, or start this one on another (isorite term <base> --port <n>)`);
  } else {
    if (!opened) throw new StudyError(`nothing is serving on port ${port}: name a base (isorite term <base>)`);
    const log = join(tmpdir(), `isorite-term-${port}.log`);
    const out = openSync(log, "w");
    server = spawn(process.execPath, [MAIN, "serve", path!, "--port", String(port)], { stdio: ["ignore", out, out], env });
    const exited = new Promise<void>((done) => server!.once("exit", () => done()));
    const started = Date.now();
    while ((await serving(url)) === null) {
      if (server.exitCode !== null || Date.now() - started > wait) {
        server.kill();
        throw new StudyError(`the isorite server did not start; its output is in ${log}`);
      }
      await Promise.race([exited, new Promise((r) => setTimeout(r, 250))]);
    }
  }

  const home = writeHome(defaultHome(env), { gateway });
  const child = spawn(opencode.command, ["--standalone"], {
    cwd,
    stdio: "inherit",
    env: { ...env, OPENCODE_CONFIG_DIR: home, ISORITE_URL: url },
  });
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  const handlers = (["SIGTERM", "SIGHUP"] as const).map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const code = await new Promise<number>((done) => {
    child.once("error", (e) => { console.error(e.message); done(1); });
    child.once("exit", (exit) => done(exit ?? 1));
  });
  for (const [signal, handler] of handlers) process.off(signal, handler);
  server?.kill();
  return code;
}
