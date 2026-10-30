// The isorite server beside a command that needs one (isorite acp, isorite mcp, isorite guide): found on its
// port, or started for the base, its output kept in a log, and held while the command uses it.

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StudyError } from "@isorite/core";
import { self } from "./self.ts";
import { locate } from "./serve.ts";

// The command itself, to start a server with: main.ts in a checkout, or the one file it is built into for npm.
export const MAIN = import.meta.url.endsWith(".ts") ? fileURLToPath(new URL("./main.ts", import.meta.url)) : fileURLToPath(import.meta.url);

/** Open a page in the browser, if this machine has one to open; nothing is said if it has not. */
export function openBrowser(url: string): void {
  const [command, ...args] = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try { spawn(command!, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref(); } catch { /* no browser here */ }
}

/** How long a step may take before it's said what is being waited for (M21), and where it's said: stderr, as
 *  `mcp` speaks on stdout. */
const SLOW = 2000;
const waiting = (line: string) => { process.stderr.write(line + "\n"); };

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
export async function ensureServer(path: string | undefined, { port = 4767, env = process.env, wait = 120_000, say = waiting }: { port?: number; env?: NodeJS.ProcessEnv; wait?: number; say?: (line: string) => void } = {}): Promise<{ url: string; release: () => void }> {
  const root = `http://127.0.0.1:${port}`;
  const opened = path === undefined ? null : locate(path);
  let name = await serving(root), started: ReturnType<typeof spawn> | null = null;
  if (name === null) {
    if (!opened) throw new StudyError(`nothing is serving on port ${port}: name a base`);
    const log = join(tmpdir(), `isorite-server-${port}.log`);
    const out = openSync(log, "w");
    // Apart from this process, so that a second terminal using it keeps it when this one is done.
    const again = self(MAIN, ["serve", path!, "--port", String(port), "--held"], []);
    started = spawn(again.command, again.args, { stdio: ["ignore", out, out], env, detached: true });
    const exited = new Promise<void>((done) => started!.once("exit", () => done()));
    const begun = Date.now();
    let told = false;
    while ((name = await serving(root)) === null) {
      if (!told && Date.now() - begun > SLOW) { say(`isorite: waiting for the isorite server; its output is in ${log}`); told = true; }
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

/** The token the isorite server hands its page, as a page asks for it. */
export async function tokenOf(url: string): Promise<string> {
  return ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
}
