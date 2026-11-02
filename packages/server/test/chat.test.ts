import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, expect, test } from "vitest";
import { Chat, reposOf } from "../src/chat/chat.ts";
import { github } from "../src/chat/github.ts";
import { gitlab } from "../src/chat/gitlab.ts";
import type { Fetch } from "../src/chat/host.ts";
import { TOKEN_HEADER, createApp } from "../src/http.ts";
import { openEngine, locate } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-chat-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const env = { ...process.env, HOME: join(root, "home"), GIT_CONFIG_GLOBAL: "/dev/null" };

/** A fake host: each call is answered by the first handler whose pattern matches "METHOD url". */
type Handler = [RegExp, (url: URL, init: RequestInit) => unknown | Response];
function fake(handlers: Handler[], calls: { url: string; init: RequestInit }[] = []): Fetch {
  return async (url, init = {}) => {
    calls.push({ url, init });
    const key = `${init.method ?? "GET"} ${url}`;
    for (const [re, run] of handlers) if (re.test(key)) { const out = run(new URL(url), init); return out instanceof Response ? out : Response.json(out); }
    return Response.json({ message: `nothing at ${key}` }, { status: 404 });
  };
}
const ana = { login: "ana", avatar_url: "https://avatars.example/ana.png", html_url: "https://github.com/ana" };
const ben = { login: "ben", avatar_url: "javascript:alert(1)", html_url: "https://github.com/ben" };

test("remotes name the repositories the chat may read: GitHub's, and any GitLab, in any of git's spellings", () => {
  expect(reposOf(["git@github.com:ana/proj.git", "https://github.com/ana/proj", "https://tok@gitlab.com/g/sub/p.git", "ssh://git@git.gitlab.example.org:2222/team/p.git", "https://bitbucket.org/a/b", "git@github.com:a/b/c.git"]).map((r) => `${r.host} ${r.server} ${r.path}`))
    .toEqual(["github github.com ana/proj", "gitlab gitlab.com g/sub/p", "gitlab git.gitlab.example.org team/p"]);
});

test("GitHub: issues without the pull requests, Discussions, and a thread's messages, avatars only as https", async () => {
  const h = github("t0k", fake([
    [/GET .*\/repos\/ana\/proj\/issues\?/, () => [
      { number: 3, title: "Bug", state: "open", user: ana, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-05T00:00:00Z", comments: 2, html_url: "https://github.com/ana/proj/issues/3" },
      { number: 4, title: "A PR", state: "open", user: ana, pull_request: {}, created_at: "", updated_at: "" }] ],
    [/POST .*\/graphql/, (_u, init) => {
      const q = JSON.parse(String(init.body)).query as string;
      if (q.includes("hasDiscussionsEnabled")) return { data: { repository: { hasDiscussionsEnabled: true, discussions: { nodes: [{ number: 9, title: "Ideas", closed: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-06T00:00:00Z", url: "https://github.com/ana/proj/discussions/9", author: { login: "ben", avatarUrl: "https://avatars.example/ben.png", url: "https://github.com/ben" }, comments: { totalCount: 1 } }] } } } };
      return { data: { repository: { discussion: { number: 9, title: "Ideas", closed: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-06T00:00:00Z", url: "", body: "Open post", author: null, comments: { totalCount: 1, nodes: [{ id: "C1", body: "First", createdAt: "2026-01-02T00:00:00Z", author: { login: "ana", avatarUrl: "https://avatars.example/ana.png", url: "" }, replies: { nodes: [{ id: "R1", body: "Nested", createdAt: "2026-01-03T00:00:00Z", author: { login: "ben", avatarUrl: "", url: "" } }] } }] } } } } };
    }],
    [/GET .*\/repos\/ana\/proj\/issues\/3$/, () => ({ number: 3, title: "Bug", state: "closed", user: ben, body: "It breaks", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-05T00:00:00Z", comments: 1 })],
    [/GET .*\/issues\/3\/comments/, () => [{ id: 11, user: ana, body: "Fixed", created_at: "2026-01-03T00:00:00Z" }]],
  ]));
  const { threads, note } = await h.threads("ana/proj");
  expect(note).toBe("");
  expect(threads.map((t) => `${t.kind}#${t.number}`)).toEqual(["discussion#9", "issue#3"]);
  expect(threads[1]).toMatchObject({ open: true, replies: 2, author: { login: "ana", avatar: "https://avatars.example/ana.png" } });
  const issue = await h.thread("ana/proj", "issue", 3);
  expect(issue.open).toBe(false);
  expect(issue.messages.map((m) => `${m.author.login}: ${m.body}`)).toEqual(["ben: It breaks", "ana: Fixed"]);
  expect(issue.messages[0]!.author.avatar).toBe("");
  const talk = await h.thread("ana/proj", "discussion", 9);
  expect(talk.messages.map((m) => `${m.author.login}: ${m.body}`)).toEqual(["ghost: Open post", "ana: First", "ben: Nested"]);
  await expect(h.threads("../../etc")).rejects.toMatchObject({ status: 400 });
});

test("GitHub: replies post to the issue or the discussion; Discussions off is told, and the issues still come", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const h = github("t0k", fake([
    [/POST .*\/issues\/3\/comments$/, () => ({ id: 12, user: ana, body: "Thanks", created_at: "2026-01-04T00:00:00Z" })],
    [/POST .*\/graphql/, (_u, init) => {
      const q = JSON.parse(String(init.body)).query as string;
      if (q.includes("addDiscussionComment")) return { data: { addDiscussionComment: { comment: { id: "C2", body: "Hi", createdAt: "2026-01-04T00:00:00Z", author: { login: "ana", avatarUrl: "", url: "" } } } } };
      if (q.includes("hasDiscussionsEnabled")) return { data: { repository: { hasDiscussionsEnabled: false } } };
      return { data: { repository: { discussion: { id: "D9" } } } };
    }],
    [/GET .*\/issues\?/, () => []],
  ], calls));
  expect(await h.reply("ana/proj", "issue", 3, "Thanks")).toMatchObject({ id: "12", body: "Thanks", author: { login: "ana" } });
  expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/issues/3/comments"))!.init.body))).toEqual({ body: "Thanks" });
  expect(await h.reply("ana/proj", "discussion", 9, "Hi")).toMatchObject({ id: "C2", body: "Hi" });
  expect(await h.threads("ana/proj")).toEqual({ threads: [], note: "Discussions are not turned on for this repository." });
  await expect(h.reply("ana/proj", "issue", 3, "  ")).rejects.toMatchObject({ status: 400 });
});

test("GitLab: issues and their notes as the conversation, without the system's own notes", async () => {
  const gl = { username: "cy", name: "Cy", avatar_url: "/uploads/cy.png", web_url: "https://gitlab.example.org/cy" };
  const calls: { url: string; init: RequestInit }[] = [];
  const h = gitlab("t0k", "https://gitlab.example.org", fake([
    [/GET .*\/projects\/g%2Fp\/issues\?/, () => [{ iid: 5, title: "Slow", state: "opened", author: gl, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-02T00:00:00Z", user_notes_count: 1, web_url: "https://gitlab.example.org/g/p/-/issues/5" }]],
    [/GET .*\/issues\/5$/, () => ({ iid: 5, title: "Slow", state: "closed", author: gl, description: "It is slow", created_at: "2026-02-01T00:00:00Z", updated_at: "" })],
    [/GET .*\/issues\/5\/notes/, () => [{ id: 1, system: true, body: "changed the label", author: gl, created_at: "" }, { id: 2, system: false, body: "Looking", author: gl, created_at: "2026-02-02T00:00:00Z" }]],
    [/POST .*\/issues\/5\/notes$/, () => ({ id: 3, body: "Done", author: gl, created_at: "2026-02-03T00:00:00Z" })],
  ], calls));
  const { threads } = await h.threads("g/p");
  expect(threads[0]).toMatchObject({ kind: "issue", number: 5, open: true, author: { login: "cy", avatar: "https://gitlab.example.org/uploads/cy.png" } });
  expect((await h.thread("g/p", "issue", 5)).messages.map((m) => m.body)).toEqual(["It is slow", "Looking"]);
  expect(await h.reply("g/p", "issue", 5, "Done")).toMatchObject({ id: "3", body: "Done" });
  expect((calls.at(-1)!.init.headers as Record<string, string>).Authorization).toBe("Bearer t0k");
  await expect(h.thread("g/p", "discussion", 5)).rejects.toMatchObject({ status: 400 });
});

function project(name: string, remote: string): string {
  const repo = join(root, name), notes = join(repo, "docs");
  mkdirSync(notes, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: repo, env });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: repo, env });
  return notes;
}

test("sign-in by the device flow: the code is shown, the token is kept for this machine alone and never told", async () => {
  const file = join(root, "cfg", "chat.toml"), notes = project("dev", "git@github.com:ana/proj.git");
  let asked = 0, now = 1_000_000;
  const calls: { url: string; init: RequestInit }[] = [];
  const f = fake([
    [/POST https:\/\/github.com\/login\/device\/code/, () => ({ device_code: "dev123", user_code: "AB-CD", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 })],
    [/POST https:\/\/github.com\/login\/oauth\/access_token/, () => (++asked < 2 ? { error: "authorization_pending" } : { access_token: "gho_secret" })],
    [/GET https:\/\/api.github.com\/user$/, () => ana],
  ], calls);
  const chat = new Chat({ file, project: notes, fetch: f, cli: async () => null, env: { ...env, ISORITE_GITHUB_CLIENT_ID: "Iv1.abc" }, now: () => now });
  expect((await chat.state()).hosts.find((h) => h.id === "github")).toMatchObject({ me: null, canSignIn: true, cli: false });
  const code = await chat.signIn("github", "github.com");
  expect(code).toMatchObject({ code: "AB-CD", url: "https://github.com/login/device" });
  expect(String(calls[0]!.init.body)).toContain("client_id=Iv1.abc");
  expect(await chat.poll("github", "github.com")).toEqual({ state: "waiting" });
  // Asked again sooner than the host's interval, it does not ask the host.
  expect(await chat.poll("github", "github.com")).toEqual({ state: "waiting" });
  expect(asked).toBe(1);
  now += 6000;
  const done = await chat.poll("github", "github.com");
  expect(done).toMatchObject({ state: "done", me: { login: "ana" } });
  expect(JSON.stringify(done)).not.toContain("gho_secret");
  expect(readFileSync(file, "utf8")).toContain("gho_secret");
  if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
  const state = await chat.state();
  expect(JSON.stringify(state)).not.toContain("gho_secret");
  expect(state.hosts.find((h) => h.id === "github")).toMatchObject({ me: { login: "ana" }, via: "device" });
  expect(state.repos).toMatchObject([{ host: "github", server: "github.com", path: "ana/proj" }]);
  chat.signOut("github", "github.com");
  expect(readFileSync(file, "utf8")).not.toContain("gho_secret");
});

test("without an application id the device flow says so; a refused or expired code ends it", async () => {
  const notes = project("noid", "git@github.com:ana/proj.git");
  const chat = new Chat({ file: join(root, "cfg2", "chat.toml"), project: notes, fetch: fake([]), cli: async () => null, env });
  await expect(chat.signIn("github", "github.com")).rejects.toMatchObject({ status: 409 });
  let now = 5_000_000, answer: unknown = { error: "access_denied" };
  const f = fake([
    [/device\/code/, () => ({ device_code: "d", user_code: "X", verification_uri: "https://github.com/login/device", expires_in: 60, interval: 5 })],
    [/access_token/, () => answer],
  ]);
  const withId = new Chat({ file: join(root, "cfg2", "chat.toml"), project: notes, fetch: f, cli: async () => null, env: { ...env, ISORITE_GITHUB_CLIENT_ID: "id" }, now: () => now });
  await withId.signIn("github", "github.com");
  expect(await withId.poll("github", "github.com")).toEqual({ state: "denied" });
  await expect(withId.poll("github", "github.com")).rejects.toMatchObject({ status: 409 });
  await withId.signIn("github", "github.com");
  now += 61_000;
  expect(await withId.poll("github", "github.com")).toEqual({ state: "expired" });
});

test("the host's own tool can be used instead: its token is asked of it each time, and not copied", async () => {
  const file = join(root, "cfg3", "chat.toml"), notes = project("viacli", "https://gitlab.com/g/p.git");
  const f = fake([[/GET https:\/\/gitlab.com\/api\/v4\/user$/, () => ({ username: "cy", name: "Cy", avatar_url: "https://x/cy.png", web_url: "" })], [/projects\/g%2Fp\/issues\?/, () => []]]);
  const chat = new Chat({ file, project: notes, fetch: f, cli: async (host) => (host === "gitlab" ? "glpat-xyz" : null), env });
  expect((await chat.state()).hosts.find((h) => h.server === "gitlab.com")).toMatchObject({ cli: true, me: null });
  expect(await chat.useCli("gitlab", "gitlab.com")).toMatchObject({ login: "cy" });
  expect(readFileSync(file, "utf8")).not.toContain("glpat-xyz");
  expect((await chat.state()).hosts.find((h) => h.server === "gitlab.com")).toMatchObject({ via: "cli", me: { login: "cy" } });
  expect(await chat.threads("gitlab", "gitlab.com", "g/p")).toEqual({ threads: [], note: "" });
});

test("only the project's repositories and servers may be asked about, and a refused token signs out", async () => {
  const file = join(root, "cfg4", "chat.toml"), notes = project("named", "git@github.com:ana/proj.git");
  let refused = false;
  const f = fake([[/GET https:\/\/api.github.com\/user$/, () => ana], [/issues\?/, () => (refused ? new Response("{}", { status: 401 }) : [])], [/graphql/, () => ({ data: { repository: { hasDiscussionsEnabled: false } } })]]);
  const chat = new Chat({ file, project: notes, fetch: f, cli: async () => "tok", env });
  await chat.useCli("github", "github.com");
  await expect(chat.threads("github", "github.com", "someone/else")).rejects.toMatchObject({ status: 403 });
  await expect(chat.threads("gitlab", "evil.example.com", "a/b")).rejects.toMatchObject({ status: 400 });
  await expect(chat.threads("github", "gitlab.com", "ana/proj")).rejects.toMatchObject({ status: 400 });
  expect((await chat.threads("github", "github.com", "ana/proj")).threads).toEqual([]);
  refused = true;
  await expect(chat.threads("github", "github.com", "ana/proj")).rejects.toMatchObject({ status: 401 });
  expect((await chat.state()).hosts.find((h) => h.id === "github")?.me).toBeNull();
});

test("the routes send only when asked with the page's token, and never carry a token", async () => {
  const notes = project("routes", "git@github.com:ana/proj.git");
  const f = fake([[/GET https:\/\/api.github.com\/user$/, () => ana], [/POST .*\/issues\/3\/comments$/, () => ({ id: 1, user: ana, body: "Hello", created_at: "2026-01-04T00:00:00Z" })]]);
  const chat = new Chat({ file: join(root, "cfg5", "chat.toml"), project: notes, fetch: f, cli: async () => "tok", env });
  const api = await openEngine(locate(notes), "testdev1", null);
  const server = nodeServe({ fetch: createApp({ api, token: "tk", loopback: true, web: root, notes, chat }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const post = (path: string, body: unknown, token = "tk") => fetch(url + path, { method: "POST", headers: { Origin: url, "Content-Type": "application/json", [TOKEN_HEADER]: token }, body: JSON.stringify(body) });
    const where = { host: "github", server: "github.com" };
    expect((await post("/api/chat/signin", { ...where, via: "cli" })).status).toBe(200);
    const state = (await (await fetch(url + "/api/chat")).json()) as { hosts: { id: string }[] };
    expect(JSON.stringify(state)).not.toContain("tok\"");
    expect(state.hosts.find((h) => h.id === "github")).toMatchObject({ me: { login: "ana" }, via: "cli" });
    const reply = { ...where, repo: "ana/proj", kind: "issue", number: 3, text: "Hello" };
    expect((await post("/api/chat/reply", reply, "wrong")).status).toBe(403);
    expect(await (await post("/api/chat/reply", reply)).json()).toMatchObject({ body: "Hello" });
    expect((await post("/api/chat/reply", { ...reply, repo: "other/repo" })).status).toBe(403);
    expect((await fetch(url + "/api/chat/threads?host=github&server=github.com")).status).toBe(400);
  } finally { server.close(); }
});
