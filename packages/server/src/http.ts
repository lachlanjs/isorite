// The engine over HTTP, for the app in a browser. Who may ask (the Host,
// against DNS rebinding), who may write (the Origin, the token the page was
// given, JSON only), then the engine's own answer. Carried over from rdstudio.

import { existsSync, readFileSync, statSync } from "node:fs";
import { brotliCompressSync, constants as zc, gzipSync } from "node:zlib";
import { pictureType } from "@isorite/core";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Conflict, EngineError, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_NOTE_BYTES, type Api, type Given as GivenPart } from "@isorite/engine";
import type { BasesPort } from "./bases.ts";
import { given as withGiven } from "./given.ts";
import type { PaneSessions } from "./sessions.ts";
import { McpEndpoint, agentName, clientName, type Rpc as McpRpc } from "./mcp-http.ts";
import { VERSION } from "./version.ts";
import type { PiControl } from "./pi/index.ts";
import { Skills, dirsFor } from "./pi/skills.ts";
import { dataDir } from "./pi/credentials.ts";
import { configPath } from "./config.ts";
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
  /** What serves the pane's sessions: the pages read and ask through this. */
  terminal?: PaneSessions;
  /** The model and keys of the native agent (M36), set from this machine only. */
  pi?: PiControl;
  /** The tests' scripted model, put in the pane and taken out (ISORITE_SCRIPTED=1 only). */
  scripted?: { on(textOnly?: boolean): Promise<void>; off(): Promise<void> };
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

/** The bytes as the asker accepts them: brotli, else gzip, else as they are (and which). Quality 4 keeps brotli quick
 *  enough to do for each reply. */
function encoded(c: Context, bytes: Buffer, quality = 4): { body: Uint8Array; encoding: string | null } {
  const accept = c.req.header("accept-encoding") ?? "";
  if (bytes.length < 1024) return { body: new Uint8Array(bytes), encoding: null };
  if (/\bbr\b/.test(accept)) return { body: brotliCompressSync(bytes, { params: { [zc.BROTLI_PARAM_QUALITY]: quality } }), encoding: "br" };
  if (/\bgzip\b/.test(accept)) return { body: gzipSync(bytes), encoding: "gzip" };
  return { body: new Uint8Array(bytes), encoding: null };
}

/** What a picture may do when opened on its own: be drawn, and nothing else (no script, no fetch, no form). */
export const PICTURE_CSP = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";

const Edit = z.object({ base: z.string().max(64), text: z.string() }).strict();
const Make = z.object({ text: z.string() }).strict();
const Given = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), id: z.string().max(400) }).strict(),
  z.object({ kind: z.literal("folder"), id: z.string().max(400) }).strict(),
  z.object({ kind: z.literal("passage"), id: z.string().max(400), text: z.string().max(20_000) }).strict(),
]);
const AgentName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const AgentLook = z.object({ agent: AgentName, session: z.string().min(1).max(200), tool: z.string().max(64), args: z.record(z.string(), z.unknown()), asked: z.string().max(4000).optional() }).strict();
const AgentEdit = z.union([
  z.object({ oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() }).strict(),
  z.object({ content: z.string() }).strict(),
]);
const AgentChange = z.object({ agent: AgentName, session: z.string().min(1).max(200), note: z.string().max(400), asked: z.string().max(4000), edit: AgentEdit }).strict();
const AgentStatus = z.object({ agent: AgentName, session: z.string().min(1).max(200), busy: z.boolean() }).strict();

/** How often, at most, a page is sent the pane's view while it changes (ms): about two frames. */
const VIEW_EVERY = 32;

export function createApp({ api, token, loopback, web, allowHosts = [], notes, terminal, bases, base, config, pi, scripted }: ServerOptions): Hono {
  const pane: PaneSessions | undefined = terminal;
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
  /** A reply that names the state it was made from (an ETag), answers 304 when the asker has that state, and is
   *  compressed: the list and the map are the two replies the page asks for after every save. */
  const tagged = async (c: Context, act: () => Promise<unknown>): Promise<Response> => {
    let tag: string | null = null;
    try { tag = api.revision ? `W/"${await api.revision()}"` : null; } catch { /* sent without one */ }
    if (tag && (c.req.header("if-none-match") ?? "").split(",").some((t) => t.trim() === tag)) return c.body(null, 304, { ETag: tag, "Cache-Control": "no-cache" });
    const res = await answer(c, act);
    if (res.status !== 200) return res;
    const { body, encoding } = encoded(c, Buffer.from(await res.arrayBuffer()));
    return c.body(body as Uint8Array<ArrayBuffer>, 200, { "Content-Type": "application/json", "Cache-Control": "no-cache", Vary: "Accept-Encoding", ...(tag ? { ETag: tag } : {}), ...(encoding ? { "Content-Encoding": encoding } : {}) });
  };
  app.get("/api/notes", (c) => tagged(c, () => api.notes()));
  app.get("/api/note", (c) => answer(c, () => api.readNote(id(c))));
  app.get("/api/journal", (c) => answer(c, () => api.journal(id(c))));
  app.get("/api/note/where", (c) => answer(c, () => api.resolveNote(id(c))));
  app.get("/api/version", (c) => answer(c, async () => ({ text: await api.version(id(c), c.req.query("entry") ?? "") })));
  app.get("/api/map", (c) => tagged(c, () => api.map()));
  app.get("/api/lenses", (c) => tagged(c, () => api.lenses()));
  app.get("/api/lens", (c) => tagged(c, () => api.lens(c.req.query("name") ?? "")));
  app.get("/api/timeline", (c) => answer(c, () => api.timeline()));
  app.get("/api/search", (c) => answer(c, () => api.search(c.req.query("q") ?? "")));
  app.get("/api/find", (c) => answer(c, () => api.find((c.req.query("q") ?? "").slice(0, 300))));
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
  // An image dropped or pasted onto a note or the Atlas: its bytes as the body, saved beside the note (`dir`) under the
  // name it came with (`name`), made safe and not taken. Only from this machine; the kind is read from the bytes.
  app.post("/api/image", async (c) => {
    if (!local(c)) return refuse(c, 403, "an image is saved only from this machine");
    let origin = "";
    try { origin = new URL(c.req.header("origin") ?? "").host; } catch { /* no origin */ }
    if (!c.req.header("origin") || origin !== c.req.header("host")) return refuse(c, 403, "cross-origin request refused");
    if (c.req.header(TOKEN_HEADER) !== token) return refuse(c, 403, "bad token");
    if (Number(c.req.header("content-length") ?? 0) > MAX_IMAGE_BYTES) return refuse(c, 413, "image too large");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return refuse(c, 413, "image too large");
    return answer(c, () => api.addImage(c.req.query("dir") ?? "", (c.req.query("name") ?? "").slice(0, 200), bytes));
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
    // A PDF is shown in the Note pane by the browser's own viewer, framed from here, which a sandbox (or object-src
    // 'none') stops in Chrome; given as application/pdf with nosniff, it cannot run as a page of this origin anyway.
    const pdf = found.type === "application/pdf";
    const name = (path.split("/").at(-1) ?? "file.pdf").replace(/["\\\r\n]/g, "_");
    const headers: Record<string, string> = { "Content-Type": found.type, "Cache-Control": "no-cache", ETag: etag, "X-Content-Type-Options": "nosniff",
      ...(pdf ? { "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}` } : { "Content-Security-Policy": PICTURE_CSP }) };
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
  app.get("/api/hidden", (c) => answer(c, () => api.hidden()));
  post("/api/hidden", z.object({ ids: z.array(z.string().max(512)).max(5000) }).strict(), (_c, b) => api.setHidden(b.ids));
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
    post("/api/bases/title", z.object({ name: z.string().max(40), title: z.string().max(60) }).strict(), async (c, b) => {
      mine(c);
      if (!bases.title(b.name, b.title)) throw new EngineError(`no base ${b.name} is known here`, 404);
      return { bases: bases.list() };
    });
    post("/api/bases/open", z.object({ path: z.string().min(1).max(4000) }).strict(), async (c, b) => {
      mine(c);
      if (!isAbsolute(b.path) || !existsSync(b.path) || !statSync(b.path).isDirectory()) throw new EngineError(`no folder at ${b.path}`, 404);
      return bases.open(b.path);
    });
    // Held open while the stream is: isorite mcp holds a server it started until they are done with it.
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
  app.get("/api/agent/base", (c) => answer(c, async () => ({ notes: notes ?? null, name: base ?? null, lent: (bases?.lent() ?? []).filter((b) => b.name !== base).map((b) => b.name) })));
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
    app.get("/api/pi/models", (c) => answer(c, async () => { mine(c); return { models: await pi.models(c.req.query("provider") ?? "") }; }));
    // One short request, so a key, a model or a gateway is known to work before the first question (it costs a few tokens).
    // The agent's skills for this base (skills.ts): each with where it came from and whether it is on; a skill that could
    // not be read with why. Read again at each request. What is off is kept in the base's settings.
    if (notes) {
      const skills = new Skills(dirsFor(notes, dataDir()), async () => (await api.agentSkillsOff()).off);
      // Listing them is open to whoever can use the pane (a slash menu on a phone, or through a forwarded port): names and
      // descriptions only. Switching one stays with this machine.
      app.get("/api/pi/skills", (c) => answer(c, async () => ({ skills: await skills.list() })));
      post("/api/pi/skills", z.object({ name: z.string().min(1).max(64), enabled: z.boolean() }).strict(), async (c, b) => {
        mine(c);
        if (!(await skills.list()).some((s) => s.name === b.name && !s.error)) throw new EngineError(`there is no skill "${b.name}" to switch`, 404);
        const off = new Set((await api.agentSkillsOff()).off);
        if (b.enabled) off.delete(b.name); else off.add(b.name);
        await api.setAgentSkillsOff([...off]);
        return { skills: await skills.list() };
      });
    }
    post("/api/pi/check", z.object({ provider: Provider, model: z.string().min(1).max(200) }).strict(), async (c, b) => { mine(c); let r: { ms: number; said: string } | undefined; await invalid(async () => { r = await pi.check(b.provider, b.model); }); return r; });
  }

  // The pane's agent session: pages read it, ask in it, stop it and answer what it asks,
  // and never reach the agent themselves.
  if (pane) {
    app.get("/api/terminal", (c) => answer(c, async () => pane.view()));
    const failed = (e: Error) => { throw new EngineError(e.message, 409); };
    // An image from the pane's box: its bytes as the body, kept by the agent's host and named by id for the prompt that
    // sends it; and read back by that id, to show in the session. Only from this machine.
    app.post("/api/terminal/image", async (c) => {
      if (!local(c)) return refuse(c, 403, "an image is given to the agent only from this machine");
      let origin = "";
      try { origin = new URL(c.req.header("origin") ?? "").host; } catch { /* no origin */ }
      if (!c.req.header("origin") || origin !== c.req.header("host")) return refuse(c, 403, "cross-origin request refused");
      if (c.req.header(TOKEN_HEADER) !== token) return refuse(c, 403, "bad token");
      if (!pane.keepImage) return refuse(c, 409, "this agent takes no images");
      if (Number(c.req.header("content-length") ?? 0) > MAX_IMAGE_BYTES) return refuse(c, 413, "image too large");
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      try { return reply(c, 200, await pane.keepImage(bytes)); } catch (e) { return refuse(c, (e as Error).message.includes("MB") ? 413 : 415, (e as Error).message); }
    });
    app.get("/api/terminal/image", async (c) => {
      const found = await pane.image?.(c.req.query("id") ?? "");
      if (!found) return refuse(c, 404, "no such image");
      return c.body(found.bytes as Uint8Array<ArrayBuffer>, 200, { "Content-Type": found.type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": PICTURE_CSP });
    });
    post("/api/terminal/prompt", z.object({ asked: z.string().min(1).max(8000), given: z.array(Given).max(40), images: z.array(z.string().regex(/^[0-9a-f]{24}\.(png|jpg|gif|webp)$/)).max(6).optional() }).strict(), async (_c, b) => {
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      const broken = await api.brokenNews();
      const news = broken.length ? `\n\n(isorite: code links in the notes that no longer resolve: ${broken.map((x) => `${x.href} in /${x.id}.md`).join("; ")}.)` : "";
      const title = (id: string) => titles.get(id) ?? id;
      // What was given goes apart, once a session (M25).
      await pane.give(b.given as GivenPart[], (parts) => withGiven("", parts, title).trim()).catch(failed);
      await pane.prompt(b.asked.trim() + news, b.images).catch(failed);
    });
    post("/api/terminal/steer", z.object({ asked: z.string().min(1).max(8000), given: z.array(Given).max(40) }).strict(), async (_c, b) => {
      if (!pane.steer) throw new EngineError("this agent cannot be steered while it works: stop it and ask again", 409);
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      const title = (id: string) => titles.get(id) ?? id;
      await pane.give(b.given as GivenPart[], (parts) => withGiven("", parts, title).trim()).catch(failed);
      await pane.steer(b.asked.trim()).catch(failed);
    });
    post("/api/terminal/withdraw", z.object({ given: Given }).strict(), async (_c, b) => ({ withdrawn: pane.withdraw ? await pane.withdraw(b.given as GivenPart) : false }));
    post("/api/terminal/stop", z.object({}).strict(), async () => { await pane.interrupt().catch(failed); });
    if (scripted) post("/api/terminal/scripted", z.object({ on: z.boolean(), textOnly: z.boolean().optional() }).strict(), async (_c, b) => { await (b.on ? scripted.on(b.textOnly) : scripted.off()); });
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

  // What is in the pane's tray, and the pane's sessions: shown, carried on, forked, removed. Asked as the page asks.
  if (pane) {
    const refused = (e: Error) => { throw new EngineError(e.message, 409); };
    const Session = z.object({ agent: z.string().max(40), session: z.string().min(1).max(200) }).strict();
    post("/api/terminal/give", z.object({ given: z.array(Given).max(40) }).strict(), async (_c, b) => {
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      await pane.give(b.given as GivenPart[], (parts) => withGiven("", parts, (id) => titles.get(id) ?? id).trim()).catch(refused);
    });
    post("/api/terminal/follow", Session, async (_c, b) => { await pane.follow(b.agent, b.session).catch(refused); });
    post("/api/terminal/fork", Session, async (_c, b) => { if (!pane.fork) throw new EngineError("this agent's sessions cannot be forked here", 409); await pane.fork(b.agent, b.session).catch(refused); });
    post("/api/terminal/forget", Session, async (_c, b) => { await pane.forget(b.agent, b.session).catch(refused); });
    post("/api/terminal/new", z.object({ agent: z.string().max(40) }).strict(), async (_c, b) => { await pane.fresh(b.agent).catch(refused); });
    post("/api/terminal/list", z.object({}).strict(), async () => { pane.refresh(); });
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
    // The pane's view is the whole session; while an agent streams it changes many times a frame. A page is sent the
    // newest at most every VIEW_EVERY ms, the first of a quiet spell at once, so a long session does not grow slower.
    let latest: ReturnType<PaneSessions["view"]> | null = null, timer: ReturnType<typeof setTimeout> | null = null, last = 0;
    const flush = () => {
      timer = null;
      if (!latest) return;
      const view = latest;
      latest = null;
      last = Date.now();
      void stream.writeSSE({ event: "terminal", data: JSON.stringify({ type: "terminal", terminal: view }) }).catch(() => undefined);
    };
    const send = (view: ReturnType<PaneSessions["view"]>) => {
      latest = view;
      if (timer) return;
      const wait = VIEW_EVERY - (Date.now() - last);
      if (wait <= 0) flush(); else timer = setTimeout(flush, wait);
    };
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
    if (timer) clearTimeout(timer);
    stop();
    unfollow?.();
  }));

  app.all("/api/*", (c) => refuse(c, 404, "not found"));
  app.on(["GET", "HEAD"], "*", (c) => (!hostOk(c) ? c.text(NOT_HERE, 403) : web ? staticFile(c, web) : c.text("Not found", 404)));
  return app;
}

const COMPRESSED = /^\.(html|js|css|json|webmanifest|svg|wasm|map|txt)$/;
const packed = new Map<string, { tag: string; body: Uint8Array }>();

function staticFile(c: Context, web: string): Response {
  let rel: string;
  try { rel = decodeURIComponent(new URL(c.req.url).pathname); } catch { return c.text("Bad request", 400); }
  const root = resolve(web);
  let file = resolve(root, "." + rel);
  if (file !== root && !file.startsWith(root + sep)) return c.text("Not found", 404);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return c.text("Not found", 404);
  // Built files carry a hash in their names and never change, nor do the fonts; the page itself is asked for again each
  // time, but answered 304 while it is as it was.
  const forever = rel.includes("/_app/immutable/") || rel.startsWith("/fonts/");
  const stat = statSync(file), tag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  const headers = { "Cache-Control": forever ? "public, max-age=31536000, immutable" : "no-cache", ETag: tag, "X-Content-Type-Options": "nosniff", Vary: "Accept-Encoding" };
  if ((c.req.header("if-none-match") ?? "").split(",").some((t) => t.trim() === tag)) return c.body(null, 304, headers);
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  if (!COMPRESSED.test(extname(file).toLowerCase())) return c.body(new Uint8Array(readFileSync(file)), 200, { ...headers, "Content-Type": type });
  // Text is sent compressed, each file compressed once (at its best) while it is as it is.
  const accept = c.req.header("accept-encoding") ?? "", how = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
  if (!how) return c.body(new Uint8Array(readFileSync(file)), 200, { ...headers, "Content-Type": type });
  const key = `${how} ${file}`;
  let kept = packed.get(key);
  if (!kept || kept.tag !== tag) {
    const raw = readFileSync(file);
    packed.set(key, (kept = { tag, body: how === "br" ? brotliCompressSync(raw) : gzipSync(raw, { level: 9 }) }));
  }
  return c.body(kept.body as Uint8Array<ArrayBuffer>, 200, { ...headers, "Content-Type": type, "Content-Encoding": how });
}
