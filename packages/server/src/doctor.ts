// isorite doctor: whether isorite can work here, checked a step at a time, each step saying what failed and
// what to change. --report gives the same as one block, to paste to an AI helping set isorite up or into an
// issue: versions, the platform, the configuration with its secrets replaced by their lengths, the environment
// isorite reads, and the checks.

import { existsSync, readFileSync, statSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { join, resolve } from "node:path";
import { OWN_DIR, SETTINGS_FILE, parseSettings } from "@isorite/core";
import { KEY, ModelError, complete, endpoint, unreachable, type Http, type ProviderConfig, type ToolDef } from "@isorite/engine";
import { findOpenCode, gatewayFrom, type Probe } from "@isorite/opencode";
import { ConfigSecrets, configPath, gatewayTls, providerConfig, readConfig } from "./config.ts";
import { gatewayHttp } from "./gateway.ts";
import { locate } from "./serve.ts";
import { serving } from "./term.ts";

export type Outcome = "ok" | "fail" | "warn" | "skip";
export interface Check { step: string; outcome: Outcome; said: string }

export interface DoctorOptions {
  env?: NodeJS.ProcessEnv;
  out?: (line: string) => void;
  /** Print the report block instead of the lines. */
  report?: boolean;
  /** No requests to the provider: the configuration, the network settings and the terminal only. */
  offline?: boolean;
  /** isorite's server's port, where the terminal will look for it. */
  port?: number;
  /** How the provider is reached, in place of the configuration's (tests). */
  http?: Http;
  /** How OpenCode's version is asked (tests). */
  probe?: Probe;
  version?: string;
  /** How Node was started: its flags, as process.execArgv. */
  execArgv?: string[];
}

const MARK: Record<Outcome, string> = { ok: "✓", fail: "✗", warn: "!", skip: "–" };

/** The environment variables isorite and Node read for it; the secret ones are shown only by length. */
const READ = ["ISORITE_GATEWAY_URL", "ISORITE_GATEWAY_MODELS", "ISORITE_GATEWAY_KEY", "ISORITE_OPENCODE", "XDG_CONFIG_HOME", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "NODE_USE_ENV_PROXY", "NODE_EXTRA_CA_CERTS", "NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "SSH_CONNECTION"];
const SECRET = /key|token|secret|pass|auth|cookie/i;

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

const TOOL: ToolDef = { type: "function", function: { name: "ping", description: "Answers pong. Call it when asked to ping.", parameters: { type: "object", properties: {}, additionalProperties: false } } };

/** Run the checks; 0 when none failed. */
export async function doctor(folder: string | undefined, o: DoctorOptions = {}): Promise<number> {
  const env = o.env ?? process.env, out = o.out ?? console.log, checks: Check[] = [];
  const say = (step: string, outcome: Outcome, said: string) => { checks.push({ step, outcome, said }); if (!o.report) out(`${MARK[outcome]} ${step}: ${said}`); };
  const path = configPath(env), execArgv = o.execArgv ?? process.execArgv;

  // The configuration.
  let provider: ProviderConfig | null = null, http: Http | null = o.http ?? null, key: string | null = null;
  if (!existsSync(path)) say("config", "warn", `there is no ${path}: Iso uses OpenRouter, and needs a key (settings, behind the logo, or key under [provider] there)`);
  try {
    readConfig(path);
    provider = providerConfig(path, env);
    key = await new ConfigSecrets(path).get(KEY);
    const tls = gatewayTls(path, env);
    http ??= gatewayHttp(provider, tls, env);
    if (existsSync(path)) say("config", "ok", `${path}: ${provider.name} at ${provider.url}`);
    say("key", key ? "ok" : tls ? "warn" : "fail", key ? `${hidden(key)}, sent ${provider.keyHeader ? `in ${provider.keyHeader}` : "as Authorization: Bearer"}` : tls ? "none; the client certificate alone is sent" : "none: set one in settings (behind the logo), or as key under [provider]");
    if (tls) say("certificate", "ok", `${tls.files.join(", ")}${tls.pfx || tls.cert ? "" : " (an authority only, no client certificate)"}`);
    const tiers = `low ${provider.tiers.low}, mid ${provider.tiers.mid}, max ${provider.tiers.max}`;
    say("models", provider.defaultTiers ? "warn" : "ok", provider.defaultTiers ? `${tiers}: OpenRouter's names, kept because [tiers] names none for ${provider.name}; a gateway usually calls its models otherwise` : tiers);
  } catch (e) {
    say("config", "fail", (e as Error).message);
  }

  // How Node reaches the network.
  const flags = [...execArgv, ...(env.NODE_OPTIONS ?? "").split(/\s+/)];
  const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  say("node", "ok", `${process.version} on ${platform()} ${arch()}`);
  say("proxy", proxy && env.NODE_USE_ENV_PROXY !== "1" && !flags.includes("--use-env-proxy") ? "warn" : "ok", !proxy ? "none set" : env.NODE_USE_ENV_PROXY === "1" || flags.includes("--use-env-proxy") ? `${noPassword(proxy)}, used` : `${noPassword(proxy)} is set, but Node ignores it unless started with NODE_USE_ENV_PROXY=1 or --use-env-proxy`);
  say("authorities", "ok", [flags.includes("--use-system-ca") ? "the system's, as well as Node's own (--use-system-ca)" : "Node's own (start with --use-system-ca to trust the system's too)", env.NODE_EXTRA_CA_CERTS ? `and ${env.NODE_EXTRA_CA_CERTS}` : ""].filter(Boolean).join(" "));
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") say("authorities", "warn", "NODE_TLS_REJECT_UNAUTHORIZED=0 turns off checking certificates altogether: name the company's authority instead");

  // The provider, asked.
  if (o.offline) say("provider", "skip", "not asked (--offline)");
  else if (provider && http) {
    const p = provider, h = http;
    const models = [...new Set([p.tiers.low, p.tiers.mid, p.tiers.max])];
    if (!o.report) out(`  asking ${p.name}: its models, then ${models.length + 1} replies of a few words (a few hundred tokens in all)`);
    let reached = true;
    try {
      const to = endpoint(p, key, "/models");
      const res = await h.fetch(to.url, { headers: to.headers, signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        const listed = (((await res.json().catch(() => ({}))) as { data?: { id?: string }[] }).data ?? []).map((m) => m.id ?? "");
        const missing = models.filter((m) => !listed.includes(m));
        say("reached", "ok", `${to.url.replace(/\?.*$/, "")} answered with ${listed.length} models`);
        if (listed.length && missing.length) say("models", "fail", `${missing.join(", ")} not among them; it has ${listed.slice(0, 12).join(", ")}${listed.length > 12 ? ", …" : ""}. Name its models under [tiers]`);
      } else say("reached", res.status === 401 || res.status === 403 ? "fail" : "ok", res.status === 401 || res.status === 403 ? `it said ${res.status} to the list of models: the key${p.keyHeader ? "" : ", or the header it goes in (key_header)"}, or a header it wants (headers), is not accepted` : `it answered (${res.status} for the list of models, which some gateways don't have)`);
    } catch (e) {
      reached = false;
      say("reached", "fail", unreachable(e, p.url));
    }
    if (reached) {
      for (const model of models) {
        try {
          const reply = await complete(h, p, key, { model, maxTokens: 16, messages: [{ role: "user", content: "Reply with the one word: ready" }], signal: AbortSignal.timeout(60_000) });
          const usage = reply.usage.tokensIn + reply.usage.tokensOut > 0;
          say(`reply from ${model}`, usage || p.streamUsage === false ? "ok" : "warn", `"${reply.text.trim().slice(0, 40)}"${usage ? `, ${reply.usage.tokensIn} tokens in and ${reply.usage.tokensOut} out` : p.streamUsage === false ? "" : ": no usage reported, so the gauge can't count it"}`);
        } catch (e) {
          const said = (e as Error).message;
          say(`reply from ${model}`, "fail", /stream_options/i.test(said) ? `${said} Set stream_usage = false under [provider].` : said);
        }
      }
      try {
        const reply = await complete(h, p, key, { model: p.tiers.mid, maxTokens: 64, tools: [TOOL], messages: [{ role: "user", content: "Ping, using the ping tool." }], signal: AbortSignal.timeout(60_000) });
        say("tools", reply.calls.length ? "ok" : "fail", reply.calls.length ? `${p.tiers.mid} called ${reply.calls[0]!.name}` : `${p.tiers.mid} answered without calling the tool: Iso and the terminal need a model, and a gateway, that pass tools on`);
      } catch (e) {
        say("tools", "fail", e instanceof ModelError ? e.message : String(e));
      }
    }
  }

  // The terminal.
  try {
    const found = findOpenCode(env, o.probe);
    say("opencode", "ok", `${found.command} ${found.version}`);
  } catch (e) {
    say("opencode", "warn", (e as Error).message.replace(/\n\s*/g, " "));
  }
  const port = o.port ?? 4767, url = `http://127.0.0.1:${port}`, served = await serving(url);
  say("port", "ok", served === null ? `${port} is free: isorite term starts a server there` : `${port} is isorite's, serving ${served}`);
  let terminal = "OpenCode's own models: no key and no certificate are named for Iso's provider", known = true;
  try {
    const named = gatewayFrom(env);
    if (named) terminal = `${named.models.join(", ")} at ${named.url}, named by ISORITE_GATEWAY_URL`;
    else if (provider && (key || gatewayTls(path, env))) terminal = `${provider.name}'s models, through isorite's server at ${url}/api/gateway, which adds the key, certificate, headers and query`;
    else if (!provider) { terminal = "not known until config.toml is fixed"; known = false; }
  } catch (e) { terminal = (e as Error).message; known = false; }
  say("terminal", known ? "ok" : "warn", terminal);
  if (env.SSH_CONNECTION) say("browser", "ok", `over SSH: on your own machine, ssh -L ${port}:localhost:${port} <this host>, then http://localhost:${port}/`);

  // The notes.
  if (folder) {
    try {
      const { notes } = locate(folder);
      const own = join(notes, OWN_DIR), settings = join(own, SETTINGS_FILE);
      say("notes", "ok", existsSync(own) ? `${notes}, with its ${OWN_DIR}/` : `${notes}: its ${OWN_DIR}/ is made the first time it is opened`);
      const repository = existsSync(settings) ? parseSettings(readFileSync(settings, "utf8")).repository : undefined;
      if (repository) {
        const at = resolve(notes, repository);
        say("repository", existsSync(at) && statSync(at).isDirectory() ? "ok" : "fail", existsSync(at) ? at : `${OWN_DIR}/${SETTINGS_FILE} names ${repository}, and there is no folder at ${at}`);
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
