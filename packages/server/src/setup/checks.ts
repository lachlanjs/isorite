// The environment checks the wizard and `isorite setup --check` run: short, each with what to change. (isorite doctor
// goes further and checks a base's notes, history and MCP config; these are what must be true to start at all.)

import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { dataDir } from "../pi/credentials.ts";
import { mirrorOf, modelDir, RELEASE } from "../model.ts";
import { unreachable } from "../network.ts";

export type Outcome = "ok" | "warn" | "fail" | "skip";
export interface Finding { step: string; outcome: Outcome; said: string; fix?: string }

export interface Probes {
  /** Whether nothing listens on the port. */
  portFree(port: number): Promise<boolean>;
  /** Null if the address answered, else why not (already put as a sentence). */
  reach(url: string): Promise<string | null>;
  nodeVersion: string;
}

export const realProbes: Probes = {
  portFree: (port) => new Promise((done) => { const s = createServer().once("error", () => done(false)).once("listening", () => s.close(() => done(true))); s.listen(port, "127.0.0.1"); }),
  async reach(url) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
      return res.ok ? null : `answered ${res.status}`;
    } catch (e) { return unreachable(e, url); }
  },
  nodeVersion: process.versions.node,
};

/** Whether files can be made in `dir`, or in the nearest folder above it that exists (where it would be made). */
export function writable(dir: string): boolean {
  let at = resolve(dir);
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  try { if (!statSync(at).isDirectory()) return false; accessSync(at, constants.W_OK); return true; } catch { return false; }
}

export interface CheckOptions { env?: NodeJS.ProcessEnv; notes?: string; port?: number; offline?: boolean; probes?: Probes }

export async function environmentChecks(o: CheckOptions = {}): Promise<Finding[]> {
  const env = o.env ?? process.env, probes = o.probes ?? realProbes, out: Finding[] = [];
  const major = Number(probes.nodeVersion.split(".")[0]);
  out.push(major >= 24
    ? { step: "node", outcome: "ok", said: `Node ${probes.nodeVersion}` }
    : { step: "node", outcome: "fail", said: `Node ${probes.nodeVersion} is too old: isorite needs 24 or later`, fix: "install the one-file isorite (no Node needed): see the README, or install Node 24 from https://nodejs.org" });

  const dirs = [o.notes, dataDir(env)].filter((d): d is string => Boolean(d));
  const blocked = dirs.filter((d) => !writable(d));
  out.push(blocked.length
    ? { step: "write access", outcome: "fail", said: `cannot write to ${blocked.join(" or ")}`, fix: blocked.includes(dataDir(env)) ? "set XDG_DATA_HOME to a folder you can write to (isorite keeps its keys and model there)" : "choose a folder inside your home folder" }
    : { step: "write access", outcome: "ok", said: "the notes folder and isorite's data folder can be written" });

  const port = o.port ?? 4767;
  out.push((await probes.portFree(port))
    ? { step: "port", outcome: "ok", said: `${port} is free` }
    : { step: "port", outcome: "ok", said: `${port} is in use (perhaps by isorite already); the next free port is used` });

  const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (proxy) {
    let host = "";
    try { host = new URL(proxy).host; } catch { /* said below */ }
    out.push(host
      ? { step: "proxy", outcome: "ok", said: `${host}, used for isorite's own downloads and its agent's requests${env.NO_PROXY || env.no_proxy ? "" : " (NO_PROXY is not set; this machine's own addresses are kept off it)"}` }
      : { step: "proxy", outcome: "warn", said: "HTTPS_PROXY is not an address", fix: "write it as http://host:port" });
  } else out.push({ step: "proxy", outcome: "ok", said: "none set" });

  const ca = env.NODE_EXTRA_CA_CERTS;
  if (ca) out.push(existsSync(ca)
    ? { step: "certificates", outcome: "ok", said: `the system's authorities, and ${ca}` }
    : { step: "certificates", outcome: "fail", said: `NODE_EXTRA_CA_CERTS names ${ca}, and there is no such file`, fix: "point it at your company's certificate (.pem), or unset it" });
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") out.push({ step: "certificates", outcome: "warn", said: "NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checking everywhere", fix: "unset it and name the company's authority in NODE_EXTRA_CA_CERTS instead" });

  if (env.ISORITE_EMBED === "off") out.push({ step: "search by meaning", outcome: "skip", said: "switched off (ISORITE_EMBED=off); search is by words" });
  else if (modelDir(env)) out.push({ step: "search by meaning", outcome: "ok", said: "the model is installed" });
  else if (o.offline) out.push({ step: "search by meaning", outcome: "skip", said: "not checked (offline); search is by words until isorite model fetches it" });
  else {
    const from = mirrorOf(env) ?? RELEASE, why = await probes.reach(from);
    out.push(why === null
      ? { step: "search by meaning", outcome: "ok", said: "the 53 MB model can be fetched from here" }
      : { step: "search by meaning", outcome: "warn", said: `the model cannot be fetched from here (${why}); search is by words, which works fine`, fix: "later: isorite model --from <the .tgz> (isorite doctor prints its address and checksum), or set ISORITE_MODEL_BASE_URL to a mirror" });
  }
  return out;
}

export function ensureDir(path: string): boolean { try { mkdirSync(path, { recursive: true }); return true; } catch { return false; } }
