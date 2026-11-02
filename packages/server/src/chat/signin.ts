// Signing in (M28): the OAuth device flow, which a program on a person's own machine can do without a server of its
// own: the host gives a short code, the person gives it to the host in their browser and says yes, and the program,
// asking meanwhile, is given a token. Only the application's public id is used, no secret.
// Where a host's own tool (gh, glab) is signed in already, its token can be borrowed: broader than isorite needs, so
// the page says so.

import { execFile } from "node:child_process";
import type { ChatHostId } from "@isorite/engine";
import { HostError, json, rec, text, whole, type Fetch } from "./host.ts";

export interface Flow { host: ChatHostId; server: string; clientId: string; device: string; interval: number; expires: number; last: number }
export interface Started { flow: Flow; code: string; url: string; fullUrl: string; expires: number }
export interface Token { token: string; refresh?: string; expires?: number }
export type Polled = { state: "waiting" | "denied" | "expired" } | { state: "done"; token: Token };

const GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const form = (o: Record<string, string>): RequestInit => ({ method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });

/** Where each host's endpoints are. GitHub's are fixed; GitLab's are on the server (gitlab.com, or the person's own). */
function endpoints(host: ChatHostId, server: string): { device: string; token: string; scope: Record<string, string> } {
  const root = server.replace(/\/+$/, "");
  return host === "github"
    ? { device: "https://github.com/login/device/code", token: "https://github.com/login/oauth/access_token", scope: {} }
    : { device: `${root}/oauth/authorize_device`, token: `${root}/oauth/token`, scope: { scope: "api" } };
}

export async function startDevice(host: ChatHostId, server: string, clientId: string, f: Fetch = fetch, now = Date.now()): Promise<Started> {
  const at = endpoints(host, server);
  const res = rec(await json(await f(at.device, form({ client_id: clientId, ...at.scope })).catch(() => { throw new HostError(`${server} is not answering`); }), "signing in"));
  const code = text(res.user_code), device = text(res.device_code), url = text(res.verification_uri);
  if (!code || !device || !url) throw new HostError("the host gave no code to sign in with; is the application's id right, and is its device flow on?");
  const expires = now + 1000 * (whole(res.expires_in) || 900);
  return { flow: { host, server, clientId, device, interval: Math.max(5, whole(res.interval) || 5), expires, last: 0 }, code, url, fullUrl: text(res.verification_uri_complete) || url, expires };
}

/** Ask whether the code has been approved. Asked sooner than the host's interval it is not asked of the host. */
export async function pollDevice(flow: Flow, f: Fetch = fetch, now = Date.now()): Promise<Polled> {
  if (now >= flow.expires) return { state: "expired" };
  if (flow.last && now - flow.last < flow.interval * 1000) return { state: "waiting" };
  flow.last = now;
  const at = endpoints(flow.host, flow.server);
  const res = await f(at.token, form({ client_id: flow.clientId, device_code: flow.device, grant_type: GRANT })).catch(() => { throw new HostError(`${flow.server} is not answering`); });
  let body: Record<string, unknown>;
  try { body = rec(await res.json()); } catch { throw new HostError(`signing in: the host answered ${res.status}`); }
  const token = text(body.access_token);
  if (token) {
    const life = whole(body.expires_in), refresh = text(body.refresh_token);
    return { state: "done", token: { token, ...(refresh ? { refresh } : {}), ...(life ? { expires: now + life * 1000 } : {}) } };
  }
  switch (text(body.error)) {
    case "authorization_pending": return { state: "waiting" };
    case "slow_down": flow.interval += 5; return { state: "waiting" };
    case "access_denied": return { state: "denied" };
    case "expired_token": return { state: "expired" };
    default: throw new HostError(`signing in: ${text(body.error_description) || text(body.error) || `the host answered ${res.status}`}`);
  }
}

/** A GitLab token renewed with its refresh token (GitHub's apps are made without expiring tokens). */
export async function refreshToken(host: ChatHostId, server: string, clientId: string, refresh: string, f: Fetch = fetch, now = Date.now()): Promise<Token> {
  const res = rec(await json(await f(endpoints(host, server).token, form({ client_id: clientId, refresh_token: refresh, grant_type: "refresh_token" })).catch(() => { throw new HostError(`${server} is not answering`); }), "renewing the sign-in"));
  const token = text(res.access_token), life = whole(res.expires_in), next = text(res.refresh_token);
  if (!token) throw new HostError("the sign-in could not be renewed; sign in again", 401);
  return { token, ...(next ? { refresh: next } : {}), ...(life ? { expires: now + life * 1000 } : {}) };
}

/** What a host's own tool is signed in with, if it is: `gh auth token`, `glab config get token`. Run without a shell. */
export type Cli = (host: ChatHostId, server: string) => Promise<string | null>;
export const hostCli: Cli = (host, server) => new Promise((done) => {
  const [cmd, args] = host === "github" ? ["gh", ["auth", "token"]] as const : ["glab", ["config", "get", "token", "--host", new URL(server).host]] as const;
  execFile(cmd, [...args], { timeout: 5000, encoding: "utf8" }, (err, out) => done(err ? null : out.trim().split("\n")[0]?.trim() || null));
});
