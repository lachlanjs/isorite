// A place threads live (M28): what the chat needs of GitHub and of GitLab, whichever it is talking to. A host is made
// with a token and a `fetch`, so the tests give it a server of their own.

import type { ChatKind, ChatMessage, ChatPerson, ChatThread, ChatThreadFull } from "@isorite/engine";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ChatHost {
  me(): Promise<ChatPerson>;
  /** The threads, last added to first; `note` says why there are none, where there is a reason (Discussions off). */
  threads(path: string): Promise<{ threads: ChatThread[]; note: string }>;
  thread(path: string, kind: ChatKind, number: number): Promise<ChatThreadFull>;
  reply(path: string, kind: ChatKind, number: number, text: string): Promise<ChatMessage>;
}

/** A host refused, or could not be reached; `status` is what to answer with. */
export class HostError extends Error {
  readonly status: number;
  constructor(message: string, status: number = 502) { super(message); this.status = status; }
}

export const MAX_REPLY = 20_000;

/** The answer as JSON, or a HostError saying what the host said. */
export async function json(res: Response, what: string): Promise<unknown> {
  if (res.ok) return res.status === 204 ? {} : res.json();
  let said = "";
  try { const j = (await res.json()) as { message?: unknown; error_description?: unknown; error?: unknown }; said = String(j.message ?? j.error_description ?? j.error ?? ""); } catch { /* no body */ }
  if (res.status === 401) throw new HostError(`${what}: the sign-in was refused; sign in again`, 401);
  if (res.status === 403 || res.status === 404) throw new HostError(`${what}: ${said || "not allowed, or not there"}. Is the app installed on this repository?`, res.status);
  throw new HostError(`${what}: ${said || `the host answered ${res.status}`}`, 502);
}

export const text = (v: unknown): string => (typeof v === "string" ? v : "");
export const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Someone who has gone from the host (a deleted account) is still drawn. */
export const GHOST: ChatPerson = { login: "ghost", name: "Someone who has left", avatar: "", url: "" };

/** Only an image a browser should fetch: https. */
export const imageUrl = (u: string, server?: string): string => {
  try { const url = new URL(u, server); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
};
export const pageUrl = (u: string, server?: string): string => {
  try { const url = new URL(u, server); return url.protocol === "https:" || url.protocol === "http:" ? url.href : ""; } catch { return ""; }
};
