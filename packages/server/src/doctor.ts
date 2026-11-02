// isorite doctor: whether isorite can work here, checked a step at a time, each step saying what failed and
// what to change. --report gives the same as one block, to paste to an AI helping set isorite up or into an
// issue: versions, the platform, the configuration with its secrets replaced by their lengths, the environment
// isorite reads, and the checks.

import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { getCACertificates } from "node:tls";
import { join, resolve } from "node:path";
import { OWN_DIR, SETTINGS_FILE, parseSettings } from "@isorite/core";
import { configPath, readConfig } from "./config.ts";
import { repoOf } from "./git.ts";
import { cacheDir } from "./embedder.ts";
import { mirrorOf, modelDir, modelInfo, modelPlaces, RELEASE, RELEASE_SHA256, type ModelInfo } from "./model.ts";
import { unreachable } from "./network.ts";
import { locate } from "./serve.ts";
import { serving } from "./running.ts";
import { findBrowser } from "./render.ts";
import { proposal, writeProposal } from "./connect.ts";
import { ownRepoInfo } from "./own-repo.ts";

export type Outcome = "ok" | "fail" | "warn" | "skip";
export interface Check { step: string; outcome: Outcome; said: string }

export interface DoctorOptions {
  env?: NodeJS.ProcessEnv;
  out?: (line: string) => void;
  /** Print the report block instead of the lines. */
  report?: boolean;
  /** Nothing fetched: whether the model for search by meaning can be reached is not asked. */
  offline?: boolean;
  /** isorite's server's port, where isorite acp and isorite mcp look for it. */
  port?: number;
  /** Asks a yes or no on the terminal (M25: whether to write the project's MCP config); none, nothing is asked. */
  ask?: (question: string) => Promise<boolean>;
  version?: string;
  /** How Node was started: its flags, as process.execArgv. */
  execArgv?: string[];
}

const MARK: Record<Outcome, string> = { ok: "✓", fail: "✗", warn: "!", skip: "–" };

/** The environment variables isorite and Node read for it; the secret ones are shown only by length. */
const READ = ["XDG_CONFIG_HOME", "ISORITE_ACP_REGISTRY", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "NODE_USE_ENV_PROXY", "NODE_EXTRA_CA_CERTS", "NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "ISORITE_NODE_DEFAULTS", "SSH_CONNECTION", "ISORITE_EMBED", "ISORITE_EMBED_DIR", "ISORITE_MODEL_BASE_URL", "XDG_DATA_HOME", "XDG_CACHE_HOME"];
export const SECRET = /key|token|secret|pass|auth|cookie/i;

const hidden = (v: string) => `<${v.length} characters>`;
/** A proxy's address without the password it may carry (http://user:pass@proxy:8080). */
const noPassword = (v: string) => v.replace(/\/\/([^:/@]+):[^@/]*@/, "//$1:<hidden>@");

/** The configuration as written, its secrets replaced by their lengths. "$NAME" values are kept: they name, not hold. */
function redacted(value: unknown, field = ""): unknown {
  if (typeof value === "string") return SECRET.test(field) && !/^\$[A-Za-z_]\w*$/.test(value) && !/_header$/.test(field) ? hidden(value) : value;
  if (Array.isArray(value)) return value.map((v) => redacted(v, field));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redacted(v, k)]));
  return value;
}

/** Run the checks; 0 when none failed. */
export async function doctor(folder: string | undefined, o: DoctorOptions = {}): Promise<number> {
  const env = o.env ?? process.env, out = o.out ?? console.log, checks: Check[] = [];
  const say = (step: string, outcome: Outcome, said: string) => { checks.push({ step, outcome, said }); if (!o.report) out(`${MARK[outcome]} ${step}: ${said}`); };
  const path = configPath(env), execArgv = o.execArgv ?? process.execArgv;

  // The configuration: the device's id, and (until M25) Iso's provider, now left as written and not read.
  if (!existsSync(path)) say("config", "ok", `there is no ${path} yet: it is made when a base is first opened`);
  else try {
    const config = readConfig(path);
    say("config", "ok", config.provider || config.tiers ? `${path}: its [provider] and [tiers] were Iso's, and are no longer read; your agent's model is its own` : path);
  } catch (e) {
    say("config", "fail", (e as Error).message);
  }

  // How Node reaches the network.
  const flags = [...execArgv, ...(env.NODE_OPTIONS ?? "").split(/\s+/)];
  const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  say("node", "ok", `${process.version} on ${platform()} ${arch()}`);
  say("proxy", proxy && env.NODE_USE_ENV_PROXY !== "1" && !flags.includes("--use-env-proxy") ? "warn" : "ok", !proxy ? "none set" : env.NODE_USE_ENV_PROXY === "1" || flags.includes("--use-env-proxy") ? `${noPassword(proxy)}, used` : `${noPassword(proxy)} is set, but Node ignores it unless started with NODE_USE_ENV_PROXY=1, as the isorite command does unless ISORITE_NODE_DEFAULTS=0`);
  const system = getCACertificates("system"), trusted = new Set(getCACertificates("default"));
  const withSystem = flags.includes("--use-system-ca") || (system.length > 0 && system.every((c) => trusted.has(c)));
  say("authorities", withSystem ? "ok" : "warn", [withSystem ? `the system's (${system.length}), as well as Node's own` : env.ISORITE_NODE_DEFAULTS === "0" ? "Node's own only (ISORITE_NODE_DEFAULTS=0)" : "Node's own only: the system's could not be read", env.NODE_EXTRA_CA_CERTS ? `and ${env.NODE_EXTRA_CA_CERTS}` : ""].filter(Boolean).join(", "));
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") say("authorities", "warn", "NODE_TLS_REJECT_UNAUTHORIZED=0 turns off checking certificates for everything, and isorite doesn't need it: unset it, and if a certificate is then refused, name the company's authority (NODE_EXTRA_CA_CERTS)");

  const port = o.port ?? 4767, url = `http://127.0.0.1:${port}`, served = await serving(url);
  say("port", "ok", served === null ? `${port} is free: isorite acp and isorite mcp start a server there` : `${port} is isorite's, serving ${served}`);
  if (env.SSH_CONNECTION) say("browser", "ok", `over SSH: on your own machine, ssh -L ${port}:localhost:${port} <this host>, then http://localhost:${port}/`);

  // A browser to run artifacts unseen (M23, Q117): what an agent writes is checked by running it; without one, only
  // its rules are, which is a warning.
  const chrome = findBrowser(env);
  say("artifacts", chrome ? "ok" : "warn", chrome ? `run unseen when an agent writes one, in ${chrome}` : "no Chromium found to run them unseen, so only their rules are checked when an agent writes one; ISORITE_BROWSER names one (Chrome, Chromium, Edge)");

  // Search by meaning: a warning, not a failure, without it, as search by words works alone.
  let model: ModelInfo | null = null;
  if (env.ISORITE_EMBED === "off") say("search by meaning", "skip", "switched off (ISORITE_EMBED=off)");
  else {
    const dir = modelDir(env);
    try { model = dir ? modelInfo(dir) : null; } catch (e) { say("search by meaning", "fail", `${dir}: ${(e as Error).message}`); }
    if (model) say("search by meaning", "ok", `${model.name} at ${model.dir}`);
    else if (!dir) {
      // Where it would come from, and whether that answers from here (M21): by hand otherwise, with its checksum.
      let reach = "";
      if (!o.offline) {
        const from = mirrorOf(env) ?? RELEASE;
        try {
          const res = await fetch(from, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
          reach = res.ok ? ` ${from} answers from here.` : ` ${from} said ${res.status}.`;
        } catch (e) { reach = ` ${from} can't be reached from here: ${unreachable(e, from)}.`; }
      }
      say("search by meaning", "warn", `no model in ${modelPlaces(env).map((p) => p.dir).join(" or ")}: isorite model fetches it (53 MB).${reach} By hand: ${mirrorOf(env) ?? RELEASE} (SHA-256 ${RELEASE_SHA256}), then isorite model --from <that file>. Search by words works without it`);
    }
  }

  // The notes.
  if (folder) {
    try {
      const { notes } = locate(folder);
      const own = join(notes, OWN_DIR), settings = join(own, SETTINGS_FILE);
      say("notes", "ok", existsSync(own) ? `${notes}, with its ${OWN_DIR}/` : `${notes}: its ${OWN_DIR}/ is made the first time it is opened`);
      const kept = ownRepoInfo(own, null, env);
      if (existsSync(own)) say("history", kept.state === "own" ? "ok" : kept.state === "unavailable" ? "skip" : kept.state === "none" ? "skip" : "ok",
        kept.state === "own" ? `${OWN_DIR}/ is a repository of its own${kept.remotes.length ? `, remote ${kept.remotes.join(", ")}` : `; to keep it elsewhere: git -C ${own} remote add origin <address>`}`
        : kept.state === "tracked" ? `${OWN_DIR}/ is tracked by the project's repository, so everyone sharing it has isorite's files; to keep them apart, run:\n    ${kept.commands.join("\n    ")}`
        : kept.state === "shared" ? `${OWN_DIR}/ is in the project's folder, to be committed with it; to keep it apart, run:\n    ${kept.commands.join("\n    ")}`
        : kept.state === "unavailable" ? `${OWN_DIR}/: git did not answer (${kept.problem})` : `${OWN_DIR}/ is in no git repository`);
      const repository = existsSync(settings) ? parseSettings(readFileSync(settings, "utf8")).repository : undefined;
      const found = repoOf(notes);
      if (!repository && found) say("repository", "ok", `${found}: code links point here`);
      if (!repository && !found) say("repository", "skip", `the notes are in no git repository: code links point where an agent is first attached in one, or set repository in ${OWN_DIR}/${SETTINGS_FILE}`);
      if (repository) {
        const at = resolve(notes, repository);
        say("repository", existsSync(at) && statSync(at).isDirectory() ? "ok" : "fail", existsSync(at) ? at : `${OWN_DIR}/${SETTINGS_FILE} names ${repository}, and there is no folder at ${at}`);
      }
      // The project's MCP config (M25): what a harness reads to find the base, offered, then written on a yes.
      const { repo, files } = proposal(notes);
      const missing = files.filter((f) => !f.current);
      say("agents", missing.length ? "warn" : "ok", missing.length
        ? `${missing.map((f) => `${f.file} (${f.harness})`).join(" and ")} in ${repo} ${missing.length === 1 ? "doesn't name" : "don't name"} this base, so ${missing.length === 1 ? "that harness doesn't" : "those harnesses don't"} find it`
        : `${files.map((f) => f.file).join(" and ")} in ${repo} name this base`);
      if (missing.length && o.ask && !o.report) {
        for (const f of missing) out(`\n${join(repo, f.file)} would be${f.before === null ? " made" : ""}:\n${f.after}`);
        if (await o.ask(`Write ${missing.length === 1 ? "it" : "them"}? Commit ${missing.length === 1 ? "it" : "them"} with the project.`)) out(`written: ${writeProposal(notes).join(", ") || "nothing (not JSON as it is)"}`);
      }
      // The base's vectors, if made: by the model there is now, or made again when it is next opened.
      const vectors = join(cacheDir(env), `vectors-${createHash("sha256").update(notes).digest("hex").slice(0, 16)}.json`);
      if (model && existsSync(vectors)) {
        const head = Buffer.alloc(300), fd = openSync(vectors, "r");
        try { readSync(fd, head, 0, 300, 0); } finally { closeSync(fd); }
        const by = /"model":"([^"]*)"/.exec(head.toString("utf8"))?.[1];
        if (by) say("vectors", by === model.id ? "ok" : "warn", by === model.id ? `the base's, made by ${model.name}` : `the base's were made by ${by}: they are made again by ${model.name} when it is next opened`);
      }
    } catch (e) {
      say("notes", "fail", (e as Error).message);
    }
  }

  const failed = checks.filter((c) => c.outcome === "fail").length;
  if (o.report) {
    const vars = READ.filter((v) => env[v] !== undefined).map((v) => `${v}=${SECRET.test(v) ? hidden(env[v]!) : /proxy/i.test(v) ? noPassword(env[v]!) : env[v]}`);
    out(["```isorite doctor report",
      `isorite ${o.version ?? "?"}, node ${process.version}, ${platform()} ${release()} ${arch()}`,
      `node started with: ${execArgv.join(" ") || "(no flags)"}`,
      "", `${path}:`, existsSync(path) ? JSON.stringify(redacted(readConfig(path)), null, 2) : "(none)",
      "", "environment:", ...(vars.length ? vars : ["(none of those isorite reads)"]),
      "", ...checks.map((c) => `${MARK[c.outcome]} ${c.step}: ${c.said}`),
      "```"].join("\n"));
  } else out(failed ? `${failed} failed. isorite doctor --report gives all this as one block, its secrets hidden, to paste to someone helping.` : "nothing failed");
  return failed ? 1 : 0;
}
