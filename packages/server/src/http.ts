// The engine over HTTP, for the app in a browser. Who may ask (the Host,
// against DNS rebinding), who may write (the Origin, the token the page was
// given, JSON only), then the engine's own answer. Carried over from rdstudio.

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Conflict, EngineError, MAX_NOTE_BYTES, type Api } from "@isorite/engine";

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
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon",
  ".wasm": "application/wasm", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
};

const Edit = z.object({ base: z.string().max(64), text: z.string() }).strict();
const Make = z.object({ text: z.string() }).strict();
const Anchor = z.object({ text: z.string(), nth: z.number().int().min(0) }).strict();
const Tier = z.enum(["low", "mid", "max"]);
const Ask = z.discriminatedUnion("form", [
  z.object({ note: z.string(), form: z.literal("insert"), after: Anchor.nullable(), before: Anchor.nullable(), asked: z.string(), tier: Tier }).strict(),
  z.object({ note: z.string(), form: z.literal("rewrite"), regions: z.array(Anchor).min(1).max(40), after: Anchor.nullable(), before: Anchor.nullable(), asked: z.string(), tier: Tier }).strict(),
  z.object({ note: z.string(), form: z.literal("note"), tier: Tier }).strict(),
]);
const Named = z.object({ proposal: z.string().max(64), region: z.number().int().min(0).max(40).optional() }).strict();
const Revised = z.object({ proposal: z.string().max(64), text: z.union([z.string(), z.array(z.string()).max(40)]) }).strict();
const Key = z.object({ key: z.string().nullable() }).strict();

export function createApp({ api, token, loopback, web, allowHosts = [] }: ServerOptions): Hono {
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
  app.get("/api/map", (c) => answer(c, () => api.map()));
  app.get("/api/search", (c) => answer(c, () => api.search(c.req.query("q") ?? "")));

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
  post("/api/iso/stop", z.object({ request: z.string().max(64) }).strict(), (_c, b) => api.stop(b.request));
  post("/api/proposal/keep", Named, (c, b) => api.keep(id(c), b.proposal, b.region));
  post("/api/proposal/revise", Revised, (c, b) => api.revise(id(c), b.proposal, b.text));
  post("/api/proposal/discard", Named, (c, b) => api.discard(id(c), b.proposal, b.region));
  app.get("/api/drafts", (c) => answer(c, () => api.drafts()));
  post("/api/drafts", z.object({}).strict(), () => api.createDraft());
  post("/api/draft/keep", z.object({ proposal: z.string().max(64), folder: z.string().max(400) }).strict(), (c, b) => api.keepDraft(id(c), b.proposal, b.folder));
  post("/api/draft/discard", z.object({}).strict(), (c) => api.discardDraft(id(c)));
  app.get("/api/context", (c) => answer(c, () => api.context(c.req.query("id") || undefined)));
  post("/api/context/clear", z.object({}).strict(), () => api.clearConversation());
  // The key goes in and never comes out: settings say only whether one is held.
  app.get("/api/settings", (c) => answer(c, () => api.settings()));
  post("/api/settings/key", Key, (_c, b) => api.setKey(b.key), "put");

  // Everything the engine does, as it happens. A comment every 25 seconds keeps the connection open.
  app.get("/api/events", (c) => streamSSE(c, async (stream) => {
    const stop = api.events((event) => { void stream.writeSSE({ event: event.type, data: JSON.stringify(event) }); });
    const beat = setInterval(() => { void stream.write(": still here\n\n"); }, 25_000);
    await stream.writeSSE({ event: "open", data: "{}" });
    await new Promise<void>((done) => stream.onAbort(done));
    clearInterval(beat);
    stop();
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
