// The engine over HTTP, for the app in a browser. Who may ask (the Host,
// against DNS rebinding), who may write (the Origin, the token the page was
// given, JSON only), then the engine's own answer. Carried over from rdstudio.

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Conflict, EngineError, MAX_NOTE_BYTES, type Api, type Choice } from "@isorite/engine";
import type { BasesPort } from "./bases.ts";
import type { Setup } from "./setup.ts";
import { given as withGiven, type Terminal } from "./terminal.ts";

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
  /** Where the knowledge base is on disk, for a terminal agent's harness to tell its notes from code. */
  notes?: string;
  /** The terminal's session, when `isorite term` attaches one (M11). */
  terminal?: Terminal;
  /** The provider, relayed at /api/gateway for OpenCode: it asks with the token as its key (M13). */
  gateway?: (path: string, req: Request) => Promise<Response>;
  /** The provider's setup, from Iso's settings (M18). */
  setup?: Setup;
  /** The other bases the server holds (M20), and this one's name among them. */
  bases?: BasesPort;
  base?: string;
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
const Anchor = z.object({ text: z.string(), nth: z.number().int().min(0) }).strict();
const Tier = z.enum(["low", "mid", "max"]);
/** What you chose of Iso's context (I3): parts switched off by id, and whether it may look up more. */
const ChoiceSchema = z.object({ off: z.array(z.string().max(400)).max(500).optional(), lookup: z.boolean().optional() }).strict();
const Ask = z.discriminatedUnion("form", [
  z.object({ note: z.string(), form: z.literal("insert"), after: Anchor.nullable(), before: Anchor.nullable(), asked: z.string(), tier: Tier, choice: ChoiceSchema.optional() }).strict(),
  z.object({ note: z.string(), form: z.literal("rewrite"), regions: z.array(Anchor).min(1).max(40), after: Anchor.nullable(), before: Anchor.nullable(), asked: z.string(), tier: Tier, choice: ChoiceSchema.optional() }).strict(),
  z.object({ note: z.string(), form: z.literal("note"), tier: Tier }).strict(),
]);
const Given = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), id: z.string().max(400) }).strict(),
  z.object({ kind: z.literal("folder"), id: z.string().max(400) }).strict(),
  z.object({ kind: z.literal("passage"), id: z.string().max(400), text: z.string().max(20_000) }).strict(),
  z.object({ kind: z.literal("understanding"), id: z.string().max(400) }).strict(),
]);
const Mode = z.enum(["ask", "write", "build"]);
const TurnAsk = z.object({ conversation: z.string().max(64).optional(), mode: Mode, asked: z.string().max(8000), given: z.array(Given).max(40), tier: Tier, lookup: z.boolean().optional(), off: z.array(z.string().max(320)).max(500).optional() }).strict();
const TurnShape = TurnAsk.omit({ asked: true });
const Named = z.object({ proposal: z.string().max(64), region: z.number().int().min(0).max(40).optional() }).strict();
const Revised = z.object({ proposal: z.string().max(64), text: z.union([z.string(), z.array(z.string()).max(40)]) }).strict();
const Key = z.object({ key: z.string().nullable() }).strict();
const Pair = z.object({ name: z.string().max(200), value: z.string().max(4000), held: z.boolean().optional() }).strict();
const Path = z.string().max(1000);
const SetupDraft = z.object({
  kind: z.enum(["openrouter", "gateway"]), name: z.string().max(100), url: z.string().max(2000), keyHeld: z.boolean(), keyHeader: z.string().max(200), keyPrefix: z.string().max(50).default(""),
  headers: z.array(Pair).max(40), query: z.array(Pair).max(40), pfx: Path, passphraseHeld: z.boolean(), cert: Path, certKey: Path, ca: Path,
  streamUsage: z.boolean(), maxTokens: z.number().int().positive().max(1_000_000).nullable(), tiers: z.object({ low: z.string().max(200), mid: z.string().max(200), max: z.string().max(200) }).strict(),
  key: z.string().max(400).nullable().optional(), passphrase: z.string().max(1000).nullable().optional(),
}).strict();
const AgentName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const AgentLook = z.object({ agent: AgentName, session: z.string().min(1).max(200), tool: z.string().max(64), args: z.record(z.string(), z.unknown()), asked: z.string().max(4000).optional() }).strict();
const AgentEdit = z.union([
  z.object({ oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() }).strict(),
  z.object({ content: z.string() }).strict(),
]);
const AgentChange = z.object({ agent: AgentName, session: z.string().min(1).max(200), note: z.string().max(400), asked: z.string().max(4000), edit: AgentEdit }).strict();
const AgentStatus = z.object({ agent: AgentName, session: z.string().min(1).max(200), busy: z.boolean() }).strict();

export function createApp({ api, token, loopback, web, allowHosts = [], notes, terminal, gateway, setup, bases, base }: ServerOptions): Hono {
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

  // The provider, for OpenCode: with its certificate, headers, query and key added here, so that OpenCode is given
  // none of them. It asks as an OpenAI-compatible client does, with the token as its Bearer key, and no Origin; a
  // page on another site cannot send that header without a preflight, which this server does not answer.
  app.on(["GET", "POST"], "/api/gateway/*", (c) => {
    if (!gateway) return refuse(c, 404, "this server relays no provider");
    if (c.req.header("authorization") !== `Bearer ${token}`) return refuse(c, 403, "bad token");
    return gateway(c.req.path.slice("/api/gateway".length), c.req.raw);
  });

  // The token is given to the page that asks from this origin. Another site's page cannot read the reply.
  app.get("/api/session", (c) => answer(c, async () => ({ ...(await api.session()), token })));
  app.get("/api/notes", (c) => answer(c, () => api.notes()));
  app.get("/api/note", (c) => answer(c, () => api.readNote(id(c))));
  app.get("/api/journal", (c) => answer(c, () => api.journal(id(c))));
  app.get("/api/version", (c) => answer(c, async () => ({ text: await api.version(id(c), c.req.query("entry") ?? "") })));
  app.get("/api/map", (c) => answer(c, () => api.map()));
  app.get("/api/timeline", (c) => answer(c, () => api.timeline()));
  app.get("/api/search", (c) => answer(c, () => api.search(c.req.query("q") ?? "")));
  // A picture (M22): `path` in the notes, or `code` in the repository. Only a picture: the engine gives nothing
  // else. An SVG opened here on its own would run its scripts beside the token, so every answer is sandboxed.
  app.get("/api/file", async (c) => {
    const code = c.req.query("code"), path = code ?? c.req.query("path") ?? "";
    let found;
    try { found = await api.file(path, code === undefined ? "notes" : "code"); } catch (e) {
      if (e instanceof EngineError) return refuse(c, e.status, e.message);
      throw e;
    }
    if (!found) return refuse(c, 404, `no picture at ${path}`);
    const etag = `"${found.version}"`;
    const headers = { "Content-Type": found.type, "Cache-Control": "no-cache", ETag: etag, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": PICTURE_CSP };
    if (c.req.header("if-none-match") === etag) return c.body(null, 304, headers);
    return c.body(found.bytes as Uint8Array<ArrayBuffer>, 200, headers);
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
  post("/api/iso/ask", Ask, (_c, b) => api.ask(b));
  post("/api/iso/converse", TurnAsk, (_c, b) => api.converse(b));
  app.get("/api/understanding", (c) => answer(c, () => api.understanding(id(c))));
  post("/api/understanding/scratchpad", z.object({ scratchpad: z.string().max(200_000), base: z.string().max(64).nullable() }).strict(), (c, b) => api.saveScratchpad(id(c), b.scratchpad, b.base));
  post("/api/iso/take", z.object({ conversation: z.string().max(64), turn: z.string().max(64), item: z.string().max(64) }).strict(), (_c, b) => api.takeItem(b.conversation, b.turn, b.item));
  post("/api/iso/context", z.object({ conversation: z.string().max(64), part: z.string().max(320), on: z.boolean() }).strict(), (_c, b) => api.setContext(b.conversation, b.part, b.on));
  post("/api/iso/compact", z.object({ conversation: z.string().max(64), keep: z.number().int().min(0).max(1000).optional() }).strict(), (_c, b) => api.compact(b.conversation, b.keep));
  app.get("/api/agents", (c) => answer(c, () => api.agents()));
  post("/api/agents", z.object({ text: z.string().max(50_000) }).strict(), (_c, b) => api.saveAgents(b.text));
  post("/api/iso/branch", z.object({ conversation: z.string().max(64) }).strict(), (_c, b) => api.branch(b.conversation));
  post("/api/iso/undo", z.object({ conversation: z.string().max(64), turn: z.string().max(64) }).strict(), (_c, b) => api.undoTurn(b.conversation, b.turn));
  post("/api/iso/answer", z.object({ turn: z.string().max(64), permission: z.string().max(64), decision: z.enum(["once", "always", "reject"]) }).strict(), (_c, b) => api.answer(b.turn, b.permission, b.decision));
  app.get("/api/conversation", (c) => answer(c, async () => (await api.conversation(c.req.query("id") || undefined)) ?? { id: "", turns: [] }));
  app.get("/api/turn/context", (c) => answer(c, () => {
    let raw: unknown = {};
    try { raw = JSON.parse(c.req.query("turn") ?? "{}"); } catch { /* the shape check says so */ }
    return api.turnContext(TurnShape.parse(raw));
  }));
  post("/api/iso/stop", z.object({ request: z.string().max(64) }).strict(), (_c, b) => api.stop(b.request));
  post("/api/note/restore", z.object({ entry: z.string().max(64), base: z.string().max(64) }).strict(), (c, b) => api.restore(id(c), b.entry, b.base));
  post("/api/note/move", z.object({ to: z.string().max(400), base: z.string().max(64) }).strict(), (c, b) => api.moveNote(id(c), b.to, b.base));
  post("/api/note/delete", z.object({ base: z.string().max(64) }).strict(), (c, b) => api.deleteNote(id(c), b.base));
  post("/api/note/done", z.object({ done: z.boolean(), base: z.string().max(64) }).strict(), (c, b) => api.setDone(id(c), b.done, b.base));
  post("/api/proposal/keep", Named, (c, b) => api.keep(id(c), b.proposal, b.region));
  post("/api/proposal/revise", Revised, (c, b) => api.revise(id(c), b.proposal, b.text));
  post("/api/proposal/discard", Named, (c, b) => api.discard(id(c), b.proposal, b.region));
  app.get("/api/drafts", (c) => answer(c, () => api.drafts()));
  post("/api/drafts", z.object({}).strict(), () => api.createDraft());
  post("/api/draft/keep", z.object({ proposal: z.string().max(64), folder: z.string().max(400) }).strict(), (c, b) => api.keepDraft(id(c), b.proposal, b.folder));
  post("/api/draft/discard", z.object({}).strict(), (c) => api.discardDraft(id(c)));
  app.get("/api/context", (c) => answer(c, () => api.context(c.req.query("id") || undefined, choiceOf(c.req.query("choice")))));
  post("/api/context/clear", z.object({}).strict(), () => api.clearConversation());
  // The key goes in and never comes out: settings say only whether one is held.
  app.get("/api/settings", (c) => answer(c, () => api.settings()));
  post("/api/settings/key", Key, async (_c, b) => { const s = await api.setKey(b.key); await setup?.changed(); return api.settings().catch(() => s); }, "put");
  app.get("/api/spend", (c) => answer(c, () => api.spend()));
  post("/api/settings/spend-cap", z.object({ usd: z.number().positive().max(1e6).nullable() }).strict(), (_c, b) => api.setSpendCap(b.usd), "put");
  // Or made by signing in at the provider: the page to go to, and the code it comes back with, which the engine
  // exchanges for the key itself. The page never holds the key.
  post("/api/settings/connect", z.object({ callback: z.string().max(2000) }).strict(), (_c, b) => api.connect(b.callback));
  post("/api/settings/connected", z.object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(200) }).strict(), async (_c, b) => { const s = await api.connected(b.code, b.state); await setup?.changed(); return api.settings().catch(() => s); });
  // The provider's setup (M18): shown anywhere, changed only from this machine, since the key goes where it says.
  // From elsewhere, only the setup as kept is checked.
  if (setup) {
    const FROM_HERE = "The provider's setup is changed only from this machine (localhost): the key goes where it says.";
    const here = (c: Context) => { if (!local(c)) throw new EngineError(FROM_HERE, 403); };
    app.get("/api/settings/provider", (c) => answer(c, async () => setup.view(local(c))));
    post("/api/settings/provider", SetupDraft, (c, b) => { here(c); return setup.keep(b, true); }, "put");
    post("/api/settings/provider/check", z.object({ draft: SetupDraft.nullable() }).strict(), (c, b) => setup.check(local(c) ? b.draft : null));
    post("/api/settings/provider/models", z.object({ draft: SetupDraft.nullable() }).strict(), async (c, b) => ({ models: await setup.models(local(c) ? b.draft : null) }));
    // A post, as the check is: it asks the provider, which costs, so another site's page may not set it off.
    post("/api/settings/report", z.object({}).strict(), async () => ({ text: await setup.report() }));
  }

  // The bases this server holds (M20): listed for the switcher; lent, opened by folder and held open only from this
  // machine, as the provider's setup is (M18).
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
    // Held open while the stream is: isorite term and mcp hold a server they started until they are done with it.
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

  // A terminal agent (isorite term, or another harness through MCP) looks things up with Iso's tools; the Atlas
  // draws its steps. It is a process on this machine, and asks as the page does: the Origin and the token.
  app.get("/api/agent/tools", (c) => answer(c, () => api.agentTools()));
  post("/api/agent/look", AgentLook, (_c, b) => api.agentLook(b));
  app.get("/api/agent/base", (c) => answer(c, async () => ({ notes: notes ?? null, name: base ?? null, lent: (bases?.list() ?? []).filter((b) => b.lend && b.name !== base).map((b) => b.name) })));
  post("/api/agent/write", AgentChange, (_c, b) => api.agentWrite(b));
  post("/api/agent/send", z.object({ note: z.string().max(400), passage: z.string().max(10_000).optional(), said: z.string().max(4000) }).strict(), (_c, b) => api.agentSend(b));
  post("/api/agent/received", z.object({ id: z.string().max(64), agent: AgentName }).strict(), (_c, b) => api.agentReceived(b.id, b.agent));
  post("/api/agent/status", AgentStatus, (_c, b) => api.agentStatus(b.agent, b.session, b.busy));

  // The terminal's session (M11). `isorite term` attaches OpenCode's server, on this machine only; pages read the
  // session, ask in it, stop it and answer what it asks, and never reach OpenCode themselves.
  if (terminal) {
    const Local = z.string().max(200).refine((u) => { try { const h = new URL(u).hostname; return h === "127.0.0.1" || h === "localhost" || h === "[::1]"; } catch { return false; } }, "OpenCode's server must be on this machine");
    post("/api/terminal/attach", z.object({ url: Local, password: z.string().min(1).max(200), directory: z.string().max(4000) }).strict(), async (_c, b) => {
      await terminal.attach(b).catch((e: Error) => { throw new EngineError(`OpenCode's server did not answer: ${e.message}`, 502); });
      // The folder the terminal runs in is the base's repository, the first time (Q28): code links point into it.
      if (b.directory && notes) await api.nameRepository(isAbsolute(b.directory) ? relative(notes, b.directory) || "." : b.directory);
    });
    post("/api/terminal/detach", z.object({}).strict(), async () => { terminal.detach(); });
    app.get("/api/terminal", (c) => answer(c, async () => terminal.view()));
    const failed = (e: Error) => { throw new EngineError(e.message, 409); };
    post("/api/terminal/prompt", z.object({ asked: z.string().min(1).max(8000), given: z.array(Given).max(40) }).strict(), async (_c, b) => {
      const titles = new Map((await api.notes()).notes.map((n) => [n.id, n.title]));
      const broken = await api.brokenNews("agent");
      const text = withGiven(b.asked, b.given, (id) => titles.get(id) ?? id) + (broken.length ? `\n\n(isorite: code links in the notes that no longer resolve: ${broken.map((x) => `${x.href} in /${x.id}.md`).join("; ")}.)` : "");
      await terminal.prompt(text).catch(failed);
    });
    post("/api/terminal/stop", z.object({}).strict(), async () => { await terminal.interrupt().catch(failed); });
    post("/api/terminal/permission", z.object({ id: z.string().max(200), decision: z.enum(["once", "always", "reject"]) }).strict(), async (_c, b) => { await terminal.reply(b.id, b.decision).catch(failed); });
  }

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
    const send = (view: ReturnType<Terminal["view"]>) => { void stream.writeSSE({ event: "terminal", data: JSON.stringify({ type: "terminal", terminal: view }) }).catch(() => undefined); };
    const unfollow = terminal?.listen(send);
    const beat = setInterval(() => { void stream.write(": still here\n\n"); }, 25_000);
    await stream.writeSSE({ event: "open", data: "{}" });
    if (terminal?.view().connected) send(terminal.view());
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

/** The choice of what Iso is sent, as the context route takes it: JSON, and only its known fields kept. */
function choiceOf(raw: string | undefined): Choice | undefined {
  if (!raw) return undefined;
  try {
    const c = JSON.parse(raw) as { off?: unknown; lookup?: unknown };
    return { ...(Array.isArray(c.off) ? { off: c.off.filter((x): x is string => typeof x === "string").slice(0, 500) } : {}), ...(typeof c.lookup === "boolean" ? { lookup: c.lookup } : {}) };
  } catch { return undefined; }
}
