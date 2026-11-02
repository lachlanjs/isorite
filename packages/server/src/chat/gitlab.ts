// GitLab (M28): issues, and their notes as the conversation (GitLab's "discussions" are threads of notes on an issue,
// there being no separate Discussions). The notes GitLab writes itself (a label changed, an assignment) are left out.

import type { ChatKind, ChatMessage, ChatPerson, ChatThread, ChatThreadFull } from "@isorite/engine";
import { GHOST, HostError, MAX_REPLY, imageUrl, json, list, pageUrl, rec, text, whole, type ChatHost, type Fetch } from "./host.ts";

const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/;

export function gitlab(token: string, server = "https://gitlab.com", f: Fetch = fetch): ChatHost {
  const root = server.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "isorite" };
  const call = async (path: string, what: string, init: RequestInit = {}) =>
    json(await f(`${root}/api/v4${path}`, { ...init, headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}) } }).catch(() => { throw new HostError(`${what}: ${root} is not answering`); }), what);
  const project = (path: string): string => {
    if (!PATH.test(path)) throw new HostError(`${path} is not a GitLab project`, 400);
    return encodeURIComponent(path);
  };
  const person = (v: unknown): ChatPerson => {
    const u = rec(v), login = text(u.username);
    if (!login) return GHOST;
    return { login, name: text(u.name) || login, avatar: imageUrl(text(u.avatar_url), root), url: pageUrl(text(u.web_url), root) };
  };
  const issue = (v: unknown): ChatThread => {
    const i = rec(v);
    return { kind: "issue", number: whole(i.iid), title: text(i.title), open: i.state === "opened", author: person(i.author), at: text(i.created_at), updated: text(i.updated_at), replies: whole(i.user_notes_count), url: pageUrl(text(i.web_url), root) };
  };
  const note = (v: unknown): ChatMessage => { const n = rec(v); return { id: String(n.id ?? ""), author: person(n.author), at: text(n.created_at), body: text(n.body) }; };
  const iid = (n: number): number => { if (!Number.isInteger(n) || n < 1) throw new HostError("no such thread", 400); return n; };
  const issueOnly = (kind: ChatKind): void => { if (kind !== "issue") throw new HostError("GitLab has issues, not Discussions", 400); };

  return {
    async me() { return person(await call("/user", "signing in")); },

    async threads(path) {
      const issues = list(await call(`/projects/${project(path)}/issues?scope=all&state=all&order_by=updated_at&sort=desc&per_page=40`, "reading the issues"));
      return { threads: issues.map(issue), note: "" };
    },

    async thread(path, kind, number): Promise<ChatThreadFull> {
      issueOnly(kind);
      const p = project(path), n = iid(number);
      const head = rec(await call(`/projects/${p}/issues/${n}`, "reading the issue"));
      const notes = list(await call(`/projects/${p}/issues/${n}/notes?sort=asc&order_by=created_at&per_page=100`, "reading the replies"));
      const said = notes.filter((x) => rec(x).system !== true).map(note);
      return { ...issue(head), messages: [{ id: "post", author: person(head.author), at: text(head.created_at), body: text(head.description) }, ...said] };
    },

    async reply(path, kind, number, body): Promise<ChatMessage> {
      issueOnly(kind);
      if (!body.trim() || body.length > MAX_REPLY) throw new HostError("a reply is some text, not too long", 400);
      return note(await call(`/projects/${project(path)}/issues/${iid(number)}/notes`, "sending the reply", { method: "POST", body: JSON.stringify({ body }) }));
    },
  };
}
