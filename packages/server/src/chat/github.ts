// GitHub (M28): issues over REST and Discussions over GraphQL, as one conversation each. Pull requests are left out
// of the issues (GitHub lists them there).

import type { ChatKind, ChatMessage, ChatPerson, ChatThread, ChatThreadFull } from "@isorite/engine";
import { GHOST, HostError, MAX_REPLY, imageUrl, json, list, pageUrl, rec, text, whole, type ChatHost, type Fetch } from "./host.ts";

const API = "https://api.github.com";
const PATH = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function person(v: unknown): ChatPerson {
  const u = rec(v), login = text(u.login);
  if (!login) return GHOST;
  return { login, name: text(u.name) || login, avatar: imageUrl(text(u.avatar_url) || text(u.avatarUrl)), url: pageUrl(text(u.html_url) || text(u.url)) };
}

export function github(token: string, f: Fetch = fetch): ChatHost {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "isorite" };
  const rest = async (path: string, what: string, init: RequestInit = {}) =>
    json(await f(API + path, { ...init, headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}) } }).catch(() => { throw new HostError(`${what}: GitHub is not answering`); }), what);
  const graph = async (query: string, variables: Record<string, unknown>, what: string): Promise<Record<string, unknown>> => {
    const res = rec(await rest("/graphql", what, { method: "POST", body: JSON.stringify({ query, variables }) }));
    const errors = list(res.errors);
    if (errors.length) throw new HostError(`${what}: ${text(rec(errors[0]).message) || "GitHub refused"}`, 502);
    return rec(res.data);
  };
  const checked = (path: string): [string, string] => {
    if (!PATH.test(path)) throw new HostError(`${path} is not a GitHub repository`, 400);
    const [owner, name] = path.split("/") as [string, string];
    return [owner, name];
  };

  const issue = (v: unknown): ChatThread => {
    const i = rec(v);
    return { kind: "issue", number: whole(i.number), title: text(i.title), open: i.state === "open", author: person(i.user), at: text(i.created_at), updated: text(i.updated_at), replies: whole(i.comments), url: pageUrl(text(i.html_url)) };
  };
  const discussion = (v: unknown): ChatThread => {
    const d = rec(v);
    return { kind: "discussion", number: whole(d.number), title: text(d.title), open: d.closed !== true, author: person(d.author), at: text(d.createdAt), updated: text(d.updatedAt), replies: whole(rec(d.comments).totalCount), url: pageUrl(text(d.url)) };
  };
  const PERSON = "login avatarUrl url";

  return {
    async me() { return person(await rest("/user", "signing in")); },

    async threads(path) {
      const [owner, name] = checked(path);
      const issues = list(await rest(`/repos/${path}/issues?state=all&sort=updated&direction=desc&per_page=40`, "reading the issues"))
        .filter((i) => !("pull_request" in rec(i))).map(issue);
      let discussions: ChatThread[] = [], note = "";
      try {
        const data = await graph(`query($o:String!,$n:String!){repository(owner:$o,name:$n){hasDiscussionsEnabled discussions(first:40,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title closed createdAt updatedAt url author{${PERSON}} comments{totalCount}}}}}`, { o: owner, n: name }, "reading the discussions");
        const repo = rec(data.repository);
        if (repo.hasDiscussionsEnabled === false) note = "Discussions are not turned on for this repository.";
        else discussions = list(rec(repo.discussions).nodes).map(discussion);
      } catch (e) {
        // Issues are still shown when the app cannot read Discussions.
        if (!(e instanceof HostError)) throw e;
        note = e.message;
      }
      return { threads: [...issues, ...discussions].sort((a, b) => b.updated.localeCompare(a.updated)), note };
    },

    async thread(path, kind, number): Promise<ChatThreadFull> {
      const [owner, name] = checked(path);
      if (!Number.isInteger(number) || number < 1) throw new HostError("no such thread", 400);
      if (kind === "issue") {
        const head = rec(await rest(`/repos/${path}/issues/${number}`, "reading the issue"));
        const comments = list(await rest(`/repos/${path}/issues/${number}/comments?per_page=100`, "reading the replies"));
        const msg = (c: unknown): ChatMessage => { const m = rec(c); return { id: String(m.id ?? ""), author: person(m.user), at: text(m.created_at), body: text(m.body) }; };
        return { ...issue(head), messages: [{ id: "post", author: person(head.user), at: text(head.created_at), body: text(head.body) }, ...comments.map(msg)] };
      }
      const data = await graph(`query($o:String!,$n:String!,$d:Int!){repository(owner:$o,name:$n){discussion(number:$d){number title closed createdAt updatedAt url body author{${PERSON}} comments(first:50){totalCount nodes{id body createdAt author{${PERSON}} replies(first:30){nodes{id body createdAt author{${PERSON}}}}}}}}}`, { o: owner, n: name, d: number }, "reading the discussion");
      const d = rec(rec(data.repository).discussion);
      if (!d.number) throw new HostError("no such discussion", 404);
      const msg = (c: unknown): ChatMessage => { const m = rec(c); return { id: text(m.id), author: person(m.author), at: text(m.createdAt), body: text(m.body) }; };
      const replies = list(rec(d.comments).nodes).flatMap((c) => [msg(c), ...list(rec(rec(c).replies).nodes).map(msg)]);
      return { ...discussion(d), messages: [{ id: "post", author: person(d.author), at: text(d.createdAt), body: text(d.body) }, ...replies] };
    },

    async reply(path, kind, number, body): Promise<ChatMessage> {
      const [owner, name] = checked(path);
      if (!body.trim() || body.length > MAX_REPLY) throw new HostError("a reply is some text, not too long", 400);
      if (kind === "issue") {
        const m = rec(await rest(`/repos/${path}/issues/${number}/comments`, "sending the reply", { method: "POST", body: JSON.stringify({ body }) }));
        return { id: String(m.id ?? ""), author: person(m.user), at: text(m.created_at), body: text(m.body) };
      }
      const found = await graph(`query($o:String!,$n:String!,$d:Int!){repository(owner:$o,name:$n){discussion(number:$d){id}}}`, { o: owner, n: name, d: number }, "finding the discussion");
      const id = text(rec(rec(found.repository).discussion).id);
      if (!id) throw new HostError("no such discussion", 404);
      const data = await graph(`mutation($i:ID!,$b:String!){addDiscussionComment(input:{discussionId:$i,body:$b}){comment{id body createdAt author{${PERSON}}}}}`, { i: id, b: body }, "sending the reply");
      const m = rec(rec(data.addDiscussionComment).comment);
      return { id: text(m.id), author: person(m.author), at: text(m.createdAt), body: text(m.body) };
    },
  };
}
