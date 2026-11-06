// The engine over HTTP, for the app in a browser. Who may ask (the Host,
// against DNS rebinding), who may write (the Origin, the token the page was
// given, JSON only), then the engine's own answer. Carried over from rdstudio.

import { existsSync, readFileSync, statSync } from "node:fs";
import { pictureType } from "@isorite/core";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Conflict, EngineError, MAX_FILE_BYTES, MAX_NOTE_BYTES, type Api, type Given as GivenPart } from "@isorite/engine";
import type { BasesPort } from "./bases.ts";
import { given as withGiven, givenEmbedded, type AcpFollower, type Rpc } from "./acp.ts";
import type { PaneSessions } from "./sessions.ts";
import { McpEndpoint, agentName, clientName, type Rpc as McpRpc } from "./mcp-http.ts";
import { VERSION } from "./version.ts";
import { proposal, writeProposal } from "./connect.ts";
import type { PiControl } from "./pi/index.ts";
import { registryAgents, type AgentRunner } from "./agents.ts";
import { configPath } from "./config.ts";
import { listAgents } from "./detect.ts";
import { historyChoice, ownRepoInfo, setHistoryChoice } from "./own-repo.ts";

export const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
export const TOKEN_HEADER = "x-isorite-token";

export interface ServerOptions {
  api: Api;
  token: string;
  /** Bound to this machine only: then only its own names are answered. */
  loopback: boolean;
  /** The built app's folder, or null to serve the API alone. */
  web: string | null;
  /** Other names this server may be reached by (isorite serve --allow-host). */
  allowHosts?: Iterable<string>;
  /** Where the knowledge base is on disk, for an agent's harness to tell its notes from code. */
  notes?: string;
  /** The agents' sessions, through `isorite acp` (M25): what passed between a front end and its agent, and the pane's
   *  view of one. */
  acp?: AcpFollower;
  /** What serves the pane's sessions (M35), where it is not the ACP follower's: the pages read and ask through this. */
  terminal?: PaneSessions;
  /** The model and keys of the native agent (M36), set from this machine only. */
  pi?: PiControl;
  /** The agent chosen in the base's settings, started for the pane (M25). */
  agents?: AgentRunner;
  /** The other bases the server holds (M20), and this one's name among them. */
  bases?: BasesPort;
  base?: string;
  /** The configuration's file, where what this machine chose for a base is kept. */
  config?: string;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon",
  ".wasm": "application/wasm", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
};

/** What a picture may do when opened on its own: be drawn, and nothing else (no script, no fetch, no form). */
export const PICTURE_CSP = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";

const Edit = z.object({ base: z.string().max(64), text: z.string() }).strict();
const Make = z.object({ text: z.string() }).strict();
const Given = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), id: z.string().max(400) }).strict(),
  z.object({ kind: z.literal("folder"), id: z.string().max(400) }).strict(),
  z.object({ kind: z.literal("passage"), id: z.string().max(400), text: z.string().max(20_000) }).strict(),
]);
const Named = z.object({ proposal: z.string().max(64), region: z.number().int().min(0).max(40).optional() }).strict();
const Revised = z.object({ proposal: z.string().max(64), text: z.union([z.string(), z.array(z.string()).max(40)]) }).strict();
const AgentName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const AgentLook = z.object({ agent: AgentName, session: z.string().min(1).max(200), tool: z.string().max(64), args: z.record(z.string(), z.unknown()), asked: z.string().max(4000).optional() }).strict();
const AgentEdit = z.union([
  z.object({ oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() }).strict(),
  z.object({ content: z.string() }).strict(),
]);
const AgentChange = z.object({ agent: AgentName, session: z.string().min(1).max(200), note: z.string().max(400), asked: z.string().max(4000), edit: AgentEdit }).strict();
const AgentStatus = z.object({ agent: AgentName, session: z.string().min(1).max(200), busy: z.boolean() }).strict();

export function createApp({ api, token, loopback, web, allowHosts = [], notes, acp, terminal, bases, base, agents, config, pi }: ServerOptions): Hono {
  const pane: PaneSessions | undefined = terminal ?? acp;
  const app = new Hono();
  const allowed = new Set([...allowHosts].map((h) => h.toLowerCase()));
  const reply = (c: Context, status: number, value: unknown) =>
    c.body(JSON.stringify(value), status as 200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  const refuse = (c: Context, status: number, error: string) => reply(c, status, { error });

  const hostOk = (c: Context): boolean => {
    let host = "";
    try { host = new URL("http://" + (c.req.header("host") ?? "")).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { /* none */ }
    // A tailnet's names (tailscale serve) are yours: nobody outside the tailnet can point one at this machine.
    return !loopback || LOOPBACK.has(host) || host.endsWith(".ts.net") || allowed.has(host);
  };
  /** Asked from this machine itself: its own name, and (where the connection says) from its own address. A
   *  tailnet's name is not, even through tailscale serve, whose connections come from this machine. */
  const local = (c: Context): boolean => {
    let host = "";
    try { host = new URL("http://" + (c.req.header("host") ?? "")).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { /* none */ }
    const from = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
    return LOOPBACK.has(host) && (from === undefined || /^(127\.|::1$|::ffff:127\.)/.test(from));
  };
  const NOT_HERE = "isorite answers only to this machine's own names (localhost) and to a tailnet's (….ts.net). To be reached by another name, start it with: isorite serve <base> --allow-host <that name>";
  /** Why a write is refused, or null. */
  const writeRefused = (c: Context): Response | null => {
    let origin = "";
    try { origin = new URL(c.req.header("origin") ?? "").host; } catch { /* no origin */ }
    if (!c.req.header("origin") || origin !== c.req.header("host")) return refuse(c, 403, "cross-origin request refused");
    if (c.req.header(TOKEN_HEADER) !== token) return refuse(c, 403, "bad token");
    if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return refuse(c, 415, "JSON only");
    if (Number(c.req.header("content-length") ?? 0) > MAX_NOTE_BYTES + 1024) return refuse(c, 413, "note too large");
    return null;
  };
  /** Run the engine for a reply; what it refuses becomes the status it names. */
  const answer = async (c: Context, act: () => Promise<unknown>): Promise<Response> => {
    try {
      return reply(c, 200, await act());
    } catch (e) {
      if (e instanceof Conflict) return reply(c, 409, { error: e.message, current: e.current });
      if (e instanceof EngineError) return refuse(c, e.status, e.message);
      throw e;
    }
  };
  const body = async <T>(c: Context, shape: z.ZodType<T>): Promise<T | Response> => {
    let raw: unknown;
    try { raw = JSON.parse(await c.req.text()); } catch (e) { return refuse(c, 400, (e as Error).message); }
    const parsed = shape.safeParse(raw);
    return parsed.success ? parsed.data : refuse(c, 400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  };
  const id = (c: Context): string => c.req.query("id") ?? "";

  app.use("/api/*", async (c, next) => (hostOk(c) ? next() : refuse(c, 403, NOT_HERE)));

  // The token is given to the page that asks from this origin. Another site's page cannot read the reply.
  app.get("/api/session", (c) => answer(c, async () => ({ ...(await api.session()), token })));
  app.get("/api/notes", (c) => answer(c, () => api.notes()));
  app.get("/api/note", (c) => answer(c, () => api.readNote(id(c))));
  app.get("/api/journal", (c) => answer(c, () => api.journal(id(c))));
  app.get("/api/version", (c) => answer(c, async () => ({ text: await api.version(id(c), c.req.query("entry") ?? "") })));
  app.get("/api/map", (c) => answer(c, () => api.map()));
  app.get("/api/timeline", (c) => answer(c, () => api.timeline()));
  app.get("/api/search", (c) => answer(c, () => api.search(c.req.query("q") ?? "")));
  app.get("/api/pictures", (c) => answer(c, () => api.pictures()));
  // A picture pasted or dropped (M22): its bytes as the body, not JSON, of the type its name says. The same origin
  // and token as every write; never over a file that's there.
  app.post("/api/file", async (c) => {
    let origin = "";
    try { origin = new URL(c.req.header("origin") ?? "").host; } catch { /* no origin */ }
    if (!c.req.header("origin") || origin !== c.req.header("host")) return refuse(c, 403, "cross-origin request refused");
    if (c.req.header(TOKEN_HEADER) !== token) return refuse(c, 403, "bad token");
    const path = c.req.query("path") ?? "", type = pictureType(path);
    if (!type || (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== type) return refuse(c, 415, "a picture, of the type its name says");
    if (Number(c.req.header("content-length") ?? 0) > MAX_FILE_BYTES) return refuse(c, 413, "picture too large");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) return refuse(c, 413, "picture too large");
    return answer(c, () => api.savePicture(path, bytes));
  });
  // A file (M22, M23): any but a note by `path` in the notes, or a picture by `code` in the repository. An SVG or an
  // artifact opened here on its own would run its scripts beside the token, so every answer is sandboxed; the app
  // shows an artifact by reading it and giving a sandboxed frame the document (plan-m23 §3.4).
  app.get("/api/file", async (c) => {
    const code = c.req.query("code"), path = code ?? c.req.query("path") ?? "";
    let found;
    try { found = await api.file(path, code === undefined ? "notes" : "code"); } catch (e) {
      if (e instanceof EngineError) return refuse(c, e.status, e.message);
      throw e;
    }
    if (!found) return refuse(c, 404, `no file at ${path}`);
    const etag = `"${found.version}"`;
    const headers = { "Content-Type": found.type, "Cache-Control": "no-cache", ETag: etag, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": PICTURE_CSP };
    if (c.req.header("if-none-match") === etag) return c.body(null, 304, headers);
    return c.body(found.bytes as Uint8Array<ArrayBuffer>, 200, headers);
  });

  // The code a code link names, for showing in a note (M29); served as the repository's pictures are (`/api/file?code=`).
  app.get("/api/code", async (c) => {
    const href = c.req.query("href") ?? "";
    return answer(c, () => api.code(href, c.req.query("full") === "1"));
  });

  app.put("/api/note", async (c) => {
    const refused = writeRefused(c);
    if (refused) return refused;
    const edit = await body(c, Edit);
    return edit instanceof Response ? edit : answer(c, () => api.saveNote(id(c), edit));
  });
  app.post("/api/note", async (c) => {
    const refused = writeRefused(c);
    if (refused) return refused;
    const made = await body(c, Make);
    return made instanceof Response ? made : answer(c, () => api.createNote(id(c), made.text));
  });

  /** A write with a JSON body of a known shape, answered by the engine. */
  const post = <T>(path: string, shape: z.ZodType<T>, act: (c: Context, body: T) => Promise<unknown>, method: "post" | "put" = "post") =>
    app[method](path, async (c) => {
      const refused = writeRefused(c);
      if (refused) return refused;
      const sent = await body(c, shape);
      return sent instanceof Response ? sent : answer(c, async () => (await act(c, sent)) ?? {});
    });
  app.get("/api/agents", (c) => answer(c, () => api.agents()));
  post("/api/agents", z.object({ text: z.string().max(50_000) }).strict(), (_c, b) => api.saveAgents(b.text));
  app.get("/api/agents/notes", (c) => answer(c, () => api.agentNotes()));
  post("/api/agents/notes", z.object({ may: z.boolean() }).strict(), (_c, b) => api.setAgentNotes(b.may));
  app.get("/api/conversations", (c) => answer(c, () => api.conversations()));
  post("/api/conversation/delete", z.object({ id: z.string().max(64) }).strict(), (_c, b) => api.deleteConversation(b.id));
  app.get("/api/conversation", (c) => answer(c, async () => (await api.conversation(c.req.query("id") || undefined)) ?? { id: "", turns: [] }));
  post("/api/note/restore", z.object({ entry: z.string().max(64), base: z.string().max(64) }).strict(), (c, b) => api.restore(id(c), b.entry, b.base));
  post("/api/note/move", z.object({ to: z.string().max(400), base: z.string().max(64) }).strict(), (c, b) => api.moveNote(id(c), b.to, b.base));
  post("/api/folder", z.object({ path: z.string().max(400) }).strict(), (_c, b) => api.makeFolder(b.path));
  post("/api/folder/delete", z.object({ path: z.string().max(400) }).strict(), (_c, b) => api.deleteFolder(b.path));
  post("/api/folder/move", z.object({ from: z.string().max(400), to: z.string().max(400) }).strict(), (_c, b) => api.moveFolder(b.from, b.to));
  post("/api/note/delete", z.object({ base: z.string().max(64) }).strict(), (c, b) => api.deleteNote(id(c), b.base));
  post("/api/note/done", z.object({ done: z.boolean(), base: z.string().max(64) }).strict(), (c, b) => api.setDone(id(c), b.done, b.base));
  post("/api/proposal/keep", Named, (c, b) => api.keep(id(c), b.proposal, b.region));
  post("/api/proposal/revise", Revised, (c, b) => api.revise(id(c), b.proposal, b.text));
  post("/api/proposal/discard", Named, (c, b) => api.discard(id(c), b.proposal, b.region));
  // The bases this server holds (M20): listed for the switcher; lent, opened by folder and held open only from this
  // machine.
  if (bases) {
    app.get("/api/bases", (c) => answer(c, async () => ({ here: base ?? "", local: local(c), bases: bases.list() })));
    const mine = (c: Context) => { if (!local(c)) throw new EngineError("the bases are changed only from this machine", 403); };
    post("/api/bases/lend", z.object({ name: z.string().max(40), lend: z.boolean() }).strict(), async (c, b) => {
      mine(c);
      if (!(await bases.lend(b.name, b.lend))) throw new EngineError(`no base ${b.name} is known here`, 404);
      return { bases: bases.list() };
    });
    post("/api/bases/open", z.object({ path: z.string().min(1).max(4000) }).strict(), async (c, b) => {
      mine(c);
      if (!isAbsolute(b.path) || !existsSync(b.path) || !statSync(b.path).isDirectory()) throw new EngineError(`no folder at ${b.path}`, 404);
      return bases.open(b.path);
    });
    // Held open while the stream is: isorite acp and mcp hold a server they started until they are done with it.
    app.get("/api/server/hold", (c) => {
      if (!local(c)) return refuse(c, 403, "held only from this machine");
      return streamSSE(c, async (stream) => {
        const release = bases.hold();
        const beat = setInterval(() => { void stream.write(": held\n\n"); }, 25_000);
        await stream.writeSSE({ event: "held", data: "{}" });
        await new Promise<void>((done) => stream.onAbort(done));
        clearInterval(beat);
        release();
      });
    });
  }

  // An agent (through isorite's MCP, or a harness's plugin) looks things up with isorite's tools; the Atlas
  // draws its steps. It is a process on this machine, and asks as the page does: the Origin and the token.
  app.get("/api/agent/tools", (c) => answer(c, () => api.agentTools()));
  post("/api/agent/look", AgentLook, (_c, b) => api.agentLook(b));
  app.get("/api/agent/base", (c) => answer(c, async () => ({ notes: notes ?? null, name: base ?? null, lent: (bases?.list() ?? []).filter((b) => b.lend && b.name !== base).map((b) => b.name) })));
  post("/api/agent/write", AgentChange, (_c, b) => api.agentWrite(b));
  post("/api/agent/send", z.object({ note: z.string().max(400), passage: z.string().max(10_000).optional(), said: z.string().max(4000) }).strict(), (_c, b) => api.agentSend(b));
  post("/api/agent/received", z.object({ id: z.string().max(64), agent: AgentName }).strict(), (_c, b) => api.agentReceived(b.id, b.agent));
  post("/api/agent/status", AgentStatus, (_c, b) => api.agentStatus(b.agent, b.session, b.busy));
  post("/api/agent/take", z.object({ id: z.string().max(64) }).strict(), (_c, b) => api.agentTake(b.id));
  // Where isorite's own files are kept (M27): in a repository of their own, or the project's; with the commands to
  // copy. From this machine only: it names folders.
  if (notes) {
    const configFile = config ?? configPath();
    app.get("/api/own/repo", (c) => answer(c, async () => (local(c) ? ownRepoInfo(join(notes, ".isorite"), base ? historyChoice(base, configFile) : null) : null)));
    post("/api/own/choose", z.object({ choice: z.enum(["project", "separate"]) }).strict(), async (c, b) => {
      if (!local(c)) throw new EngineError("this is chosen only from this machine", 403);
      if (!base) throw new EngineError("this base has no name here", 409);
      setHistoryChoice(base, b.choice, configFile);
      return ownRepoInfo(join(notes, ".isorite"), b.choice);
    });
  }
  // The project's MCP config (M25): shown, then written on a yes, from this machine only.
  if (notes) {
    app.get("/api/connect", (c) => answer(c, async () => proposal(notes)));
    post("/api/connect", z.object({ files: z.array(z.string().max(200)).max(10).optional() }).strict(), async (c, b) => {
      if (!local(c)) throw new EngineError("the project's files are written only from this machine", 403);
      return { written: writeProposal(notes, b.files) };
    });
  }

  // The agent chosen for the pane (M25): from the ACP registry, or a command of your own. Choosing one runs a
  // program, so it is done from this machine only.
  if (agents) {
    app.get("/api/acp/agent", (c) => answer(c, async () => agents.state()));
    // Which known agents are installed here, and whether their keys are set, by name only; from this machine only.
    app.get("/api/acp/detected", (c) => answer(c, async () => { if (!local(c)) throw new EngineError("agents are looked for only from this machine", 403); return listAgents(); }));
    app.get("/api/acp/registry", (c) => answer(c, async () => registryAgents().catch((e: Error) => { throw new EngineError(e.message, 502); })));
    const Choice = z.union([z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/) }).strict(), z.object({ command: z.string().min(1).max(1000) }).strict(), z.null()]);
    post("/api/acp/choose", z.object({ choice: Choice }).strict(), async (c, b) => {
      if (!local(c)) throw new EngineError("an agent is chosen only from this machine", 403);
      return agents.choose(b.choice);
    });
  }

  // The native agent's model and keys (M36 step 8). A key is taken here and never given back: the pages are told
  // where it comes from. Only from this machine, and never logged.
  if (pi) {
    const mine = (c: Context) => { if (!local(c)) throw new EngineError("the model and keys are set only from this machine", 403); };
    app.get("/api/pi", (c) => answer(c, async () => { mine(c); return pi.state(); }));
    const Provider = z.string().regex(/^[a-z0-9-]{1,40}$/);
    const invalid = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { throw new EngineError((e as Error).message, 400); } };
    post("/api/pi/key", z.object({ provider: Provider, key: z.string().max(2000) }).strict(), async (c, b) => { mine(c); await invalid(() => pi.creds.set(b.provider, b.key)); });
    post("/api/pi/key/remove", z.object({ provider: Provider }).strict(), async (c, b) => { mine(c); await invalid(() => pi.creds.remove(b.provider)); });
    post("/api/pi/reach", z.object({ files: z.enum(["off", "read", "write"]), shell: z.boolean() }).strict(), async (c, b) => { mine(c); await invalid(() => pi.setReach(b)); });
    post("/api/pi/choose", z.object({ provider: Provider, model: z.string().min(1).max(200) }).strict(), async (c, b) => { mine(c); await invalid(() => pi.choose(b.provider, b.model)); });
  }

  // The pane's agent session (M11, on ACP since M25): pages read it, ask in it, stop it and answer what it asks,
  // and never reach the agent themselves.
  if (pane) {
    app.get("/api/terminal", (c) => answer(c, async () => pane.view()));
    const failed = (e: Error) => { throw new EngineError(e.message, 409); };
    post("/api/terminal/prompt", z.object({ asked: z.string().min(1).max(8000), given: z.array(Given).max(40) }).strict(), async (_c, b) => {
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      const broken = await api.brokenNews();
      const news = broken.length ? `\n\n(isorite: code links in the notes that no longer resolve: ${broken.map((x) => `${x.href} in /${x.id}.md`).join("; ")}.)` : "";
      const title = (id: string) => titles.get(id) ?? id;
      // What was given goes apart, once a session (M25).
      await pane.give(b.given as GivenPart[], (parts) => withGiven("", parts, title).trim(), (parts) => givenEmbedded(parts, title, base ?? "notes")).catch(failed);
      await pane.prompt(b.asked.trim() + news).catch(failed);
    });
    post("/api/terminal/steer", z.object({ asked: z.string().min(1).max(8000), given: z.array(Given).max(40) }).strict(), async (_c, b) => {
      if (!pane.steer) throw new EngineError("this agent cannot be steered while it works: stop it and ask again", 409);
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      const title = (id: string) => titles.get(id) ?? id;
      await pane.give(b.given as GivenPart[], (parts) => withGiven("", parts, title).trim(), (parts) => givenEmbedded(parts, title, base ?? "notes")).catch(failed);
      await pane.steer(b.asked.trim()).catch(failed);
    });
    post("/api/terminal/stop", z.object({}).strict(), async () => { await pane.interrupt().catch(failed); });
    post("/api/terminal/permission", z.object({ id: z.string().max(200), decision: z.enum(["once", "always", "reject"]) }).strict(), async (_c, b) => { await pane.reply(b.id, b.decision).catch(failed); });
  }

  // The base's tools over MCP (M25), for an agent on this machine: Streamable HTTP, a JSON answer to each request.
  // No token: the agent's harness is given this address in its config, and only this machine is answered.
  const endpoint = new McpEndpoint(api, { base: base ?? "notes", version: VERSION });
  app.post("/mcp", async (c) => {
    if (!local(c)) return refuse(c, 403, "MCP is answered only on this machine");
    let origin = "";
    try { origin = c.req.header("origin") ? new URL(c.req.header("origin")!).hostname : ""; } catch { origin = "?"; }
    if (origin && !LOOPBACK.has(origin.replace(/^\[|\]$/g, ""))) return refuse(c, 403, "cross-origin request refused");
    let raw: unknown;
    try { raw = JSON.parse(await c.req.text()); } catch { return reply(c, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "not JSON" } }); }
    const named = c.req.query("agent");
    const quiet = Number(c.req.query("quiet"));
    const who = (rpc: McpRpc) => {
      const agent = named && /^[a-z0-9][a-z0-9-]{0,39}$/.test(named) ? named : agentName(clientName(rpc) ?? "mcp");
      const asked = pane?.asked(agent) ?? "";
      return { agent, session: (c.req.query("session") ?? "http").slice(0, 200), ...(asked ? { asked } : {}), ...(quiet >= 100 && quiet <= 600_000 ? { quiet } : {}) };
    };
    const answers = (await Promise.all((Array.isArray(raw) ? raw : [raw]).map((r) => endpoint.answer(r as McpRpc, who(r as McpRpc))))).filter((a) => a !== null);
    if (!answers.length) return c.body(null, 202);
    return reply(c, 200, Array.isArray(raw) ? answers : answers[0]);
  });
  app.on(["GET", "DELETE"], "/mcp", (c) => c.body(null, 405, { Allow: "POST" }));

  // Agents' sessions (M25): `isorite acp`, on this machine, tells what passed between its front end and the agent,
  // and listens for what the pane asks. Asked as the page asks: the Origin and the token.
  if (acp) {
    const render = async () => {
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      const title = (id: string) => titles.get(id) ?? id;
      return { text: (parts: GivenPart[]) => withGiven("", parts, title).trim(), embed: (parts: GivenPart[]) => givenEmbedded(parts, title, base ?? "notes") };
    };
    const host: PaneSessions = pane ?? acp;
    const refused = (e: Error) => { throw new EngineError(e.message, 409); };
    // What is in the pane's tray: what the session shown has not been given yet goes before its next prompt.
    post("/api/acp/give", z.object({ given: z.array(Given).max(40) }).strict(), async (_c, b) => { const r = await render(); await host.give(b.given as GivenPart[], r.text, r.embed).catch(refused); });
    post("/api/acp/follow", z.object({ agent: z.string().max(40), session: z.string().min(1).max(200) }).strict(), async (_c, b) => { await host.follow(b.agent, b.session).catch(refused); });
    post("/api/acp/forget", z.object({ agent: z.string().max(40), session: z.string().min(1).max(200) }).strict(), async (_c, b) => { await host.forget(b.agent, b.session).catch(refused); });
    post("/api/acp/set", z.object({ kind: z.enum(["mode", "config"]), id: z.string().max(100), value: z.string().max(200) }).strict(), async (_c, b) => { try { host.set(b.kind, b.id, b.value); } catch (e) { throw new EngineError((e as Error).message, 409); } });
    post("/api/acp/new", z.object({ agent: z.string().max(40) }).strict(), async (_c, b) => { await host.fresh(b.agent).catch(refused); });
    post("/api/acp/list", z.object({}).strict(), async () => { host.refresh(); });
    post("/api/acp/tap", z.object({ link: z.string().min(1).max(100), messages: z.array(z.object({ way: z.enum(["in", "out", "ours"]), message: z.record(z.string(), z.unknown()) }).strict()).max(1000) }).strict(), async (_c, b) => { acp.tap(b.link, b.messages as { way: "in" | "out" | "ours"; message: Rpc }[]); });
    app.get("/api/acp/commands", (c) => {
      if (!local(c) || c.req.header(TOKEN_HEADER) !== token) return refuse(c, 403, "bad token");
      const link = c.req.query("link") ?? "";
      if (!/^[\w-]{1,100}$/.test(link)) return refuse(c, 400, "a wrapper names itself");
      return streamSSE(c, async (stream) => {
        const hangUp = acp.connect(link, (command) => { void stream.writeSSE({ event: "command", data: JSON.stringify(command) }).catch(() => undefined); }, { pane: c.req.query("pane") === "1" });
        const beat = setInterval(() => { void stream.write(": still here\n\n"); }, 25_000);
        await stream.writeSSE({ event: "open", data: "{}" });
        await new Promise<void>((done) => stream.onAbort(done));
        clearInterval(beat);
        hangUp();
      });
    });
  }
  app.get("/api/agent/records", (c) => answer(c, () => api.agentRecords()));
  app.get("/api/agent/record", (c) => answer(c, async () => {
    const r = await api.agentRecord(c.req.query("agent") ?? "", c.req.query("session") ?? "");
    if (!r) throw new EngineError("no such session is kept", 404);
    return r;
  }));

  // Everything the engine does, as it happens. A comment every 25 seconds keeps the connection open.
  // Every stream is told how many browser pages are listening (a harness's plugin listens with ?agent=<name>, and
  // is not counted): the terminal says the Atlas is following only when one is.
  const streams = new Map<{ writeSSE: (m: { event: string; data: string }) => Promise<void> }, boolean>();
  const watchers = () => {
    const browsers = [...streams.values()].filter(Boolean).length;
    for (const s of streams.keys()) void s.writeSSE({ event: "watchers", data: JSON.stringify({ type: "watchers", browsers }) }).catch(() => undefined);
  };
  app.get("/api/events", (c) => streamSSE(c, async (stream) => {
    const stop = api.events((event) => { void stream.writeSSE({ event: event.type, data: JSON.stringify(event) }); });
    const send = (view: ReturnType<PaneSessions["view"]>) => { void stream.writeSSE({ event: "terminal", data: JSON.stringify({ type: "terminal", terminal: view }) }).catch(() => undefined); };
    const unfollow = pane?.listen(send);
    const beat = setInterval(() => { void stream.write(": still here\n\n"); }, 25_000);
    await stream.writeSSE({ event: "open", data: "{}" });
    if (pane?.view().connected) send(pane.view());
    streams.set(stream, c.req.query("agent") === undefined);
    watchers();
    await new Promise<void>((done) => stream.onAbort(done));
    streams.delete(stream);
    watchers();
    clearInterval(beat);
    stop();
    unfollow?.();
  }));

  app.all("/api/*", (c) => refuse(c, 404, "not found"));
  app.on(["GET", "HEAD"], "*", (c) => (!hostOk(c) ? c.text(NOT_HERE, 403) : web ? staticFile(c, web) : c.text("Not found", 404)));
  return app;
}

function staticFile(c: Context, web: string): Response {
  let rel: string;
  try { rel = decodeURIComponent(new URL(c.req.url).pathname); } catch { return c.text("Bad request", 400); }
  const root = resolve(web);
  let file = resolve(root, "." + rel);
  if (file !== root && !file.startsWith(root + sep)) return c.text("Not found", 404);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return c.text("Not found", 404);
  // Built files carry a hash in their names and never change; the page itself is asked for again each time.
  const cache = rel.includes("/_app/immutable/") ? "public, max-age=31536000, immutable" : "no-cache";
  return c.body(new Uint8Array(readFileSync(file)), 200, {
    "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": cache, "X-Content-Type-Options": "nosniff",
  });
}
