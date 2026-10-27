// How the isorite command reaches the network inside a company, without flags of its own: the system's certificate
// authorities trusted as well as Node's (the company's own is usually among the system's), and the proxy in
// HTTPS_PROXY used. Node trusts only its own authorities, and its fetch ignores HTTPS_PROXY unless
// NODE_USE_ENV_PROXY=1 is set when it starts; the first is changed here, in the process, and for the second the
// command runs itself again, once, with it set. ISORITE_NODE_DEFAULTS=0 leaves Node as it is.

import { spawn } from "node:child_process";
import { constants } from "node:os";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { self } from "./self.ts";

const LOCAL = ["localhost", "127.0.0.1", "::1"];

/** The system's authorities, trusted as well as Node's own; whether they are. */
export function trustSystem(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ISORITE_NODE_DEFAULTS === "0") return false;
  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])]);
    return true;
  } catch {
    return false; // a system with no store Node can read
  }
}

const proxyOf = (env: NodeJS.ProcessEnv) => env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;

/** The environment with the proxy turned on for Node, and this machine's own names kept off it (the terminal asks
 *  the isorite server, and OpenCode its relay, on 127.0.0.1), or null when there is no proxy, or it is on already. */
export function proxied(env: NodeJS.ProcessEnv, execArgv: string[] = process.execArgv): NodeJS.ProcessEnv | null {
  if (env.ISORITE_NODE_DEFAULTS === "0" || !proxyOf(env) || env.NODE_USE_ENV_PROXY === "1" || execArgv.includes("--use-env-proxy")) return null;
  const listed = (env.NO_PROXY ?? env.no_proxy ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const none = [...listed, ...LOCAL.filter((h) => !listed.includes(h))].join(",");
  return { ...env, NODE_USE_ENV_PROXY: "1", NO_PROXY: none, no_proxy: none };
}

/** Run this command again with `env`, its input and output its own; its exit code. */
export function rerun(env: NodeJS.ProcessEnv, argv: string[] = process.argv, execArgv: string[] = process.execArgv): Promise<number> {
  const again = self(argv[1]!, argv.slice(2), execArgv);
  const child = spawn(again.command, again.args, { stdio: "inherit", env });
  // Ctrl-C reaches both through the terminal; what else is sent to this one is passed on.
  for (const signal of ["SIGTERM", "SIGHUP"] as const) process.on(signal, () => child.kill(signal));
  process.on("SIGINT", () => undefined);
  return new Promise((done) => {
    child.once("error", (e) => { console.error(e.message); done(1); });
    child.once("exit", (code, signal) => done(code ?? 128 + (signal ? constants.signals[signal] : 0)));
  });
}
