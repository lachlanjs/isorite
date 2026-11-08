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

const UNTRUSTED = new Set(["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"]);

/** Why a request did not reach `url`, and what to change: the reason Node keeps in the error's cause (a fetch says
 *  only "fetch failed"), with one line of advice for the common ones. */
export function unreachable(err: unknown, url: string): string {
  let reason = err as { code?: string; message?: string; cause?: unknown } | undefined, code = "", said = "";
  while (reason) {
    if (reason.code) code = reason.code;
    if (reason.message) said = reason.message;
    reason = reason.cause as typeof reason;
  }
  said = said.split("\n")[0]!.replace(/^[0-9A-F]{8,}:error:[0-9A-F]+:SSL routines:[^:]*:/, "").replace(/:\.\.\/deps\/.*$/, "");
  let host = url;
  try { host = new URL(url).host; } catch { /* as given */ }
  // How a proxy's refusal is said: by undici (Node's fetch), and by https.Agent's own proxy (Node 24) for a tunnel.
  const proxy = /Proxy response \((\d{3})\)/.exec(said)?.[1] ?? (code === "ERR_PROXY_TUNNEL" || /establish tunnel/i.test(said) ? /HTTP\/\d(?:\.\d)? (\d{3})/.exec(said)?.[1] : undefined);
  const advice =
    proxy === "407" ? "The proxy (HTTPS_PROXY) refused with 407: it wants credentials of its own, as http://user:password@proxy:port in HTTPS_PROXY, or its own sign-in. isorite can't answer a proxy that signs in by Kerberos or NTLM."
    : proxy ? `The proxy (HTTPS_PROXY) answered ${proxy}: check HTTPS_PROXY, and NO_PROXY for hosts reached directly.`
    : /CERTIFICATE_REQUIRED|alert certificate required|alert number 116/i.test(code + said) ? "It asks for a client certificate (mTLS) and was shown none: name yours under [provider] in config.toml, as pfx (with pfx_passphrase) or cert and cert_key."
    : /ALERT_(BAD|UNKNOWN|UNSUPPORTED|REVOKED|EXPIRED)_CERTIFICATE|ALERT_UNKNOWN_CA|ALERT_ACCESS_DENIED|alert (bad|unknown|unsupported|revoked|expired) certificate|alert unknown ca|alert access denied/i.test(code + said) ? "It refused the client certificate shown: check that [provider] pfx (or cert) is the one the gateway expects, and has not expired."
    : code === "ECONNRESET" && /handshake|socket disconnected before secure/i.test(said) ? "The connection closed during the TLS handshake, as a gateway does that wants a client certificate and was shown none, or not the one it expects: name it under [provider] in config.toml (pfx, or cert and cert_key)."
    : UNTRUSTED.has(code) ? "Its certificate is signed by an authority not trusted here, often a company's own. Add it to the system's authorities (isorite trusts those), or set NODE_EXTRA_CA_CERTS to its certificate (a .pem)."
    : code === "CERT_HAS_EXPIRED" ? "Its certificate has expired."
    : code === "ENOTFOUND" || code === "EAI_AGAIN" ? `The name ${host} could not be found: check whether it is only found on the company's network or VPN.`
    : code === "ECONNREFUSED" ? `Nothing answers at ${host}.`
    : code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ENETUNREACH" || code === "EHOSTUNREACH" ? `${host} did not answer. If the company's network reaches it through a proxy, set HTTPS_PROXY.`
    : "";
  return [said || (err as Error)?.message || "no reason given", code && !said.includes(code) ? ` (${code})` : "", advice ? `. ${advice}` : ""].join("");
}
