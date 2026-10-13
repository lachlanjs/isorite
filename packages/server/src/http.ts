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
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon",
  ".wasm": "application/wasm", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
};

const Edit = z.object({ base: z.string().max(64), text: z.string() }).strict();
const Make = z.object({ text: z.string() }).strict();

export function createApp({ api, token, loopback, web }: ServerOptions): Hono {
  const app = new Hono();
  const reply = (c: Context, status: number, value: unknown) =>
    c.body(JSON.stringify(value), status as 200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  const refuse = (c: Context, status: number, error: string) => reply(c, status, { error });

  const hostOk = (c: Context): boolean => {
    let host = "";
    try { host = new URL("http://" + (c.req.header("host") ?? "")).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { /* none */ }
    return !loopback || LOOPBACK.has(host);
  };
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

  app.use("/api/*", async (c, next) => (hostOk(c) ? next() : refuse(c, 403, "host not allowed")));

  // The token is given to the page that asks from this origin. Another site's page cannot read the reply.
  app.get("/api/session", (c) => answer(c, async () => ({ ...(await api.session()), token })));
  app.get("/api/notes", (c) => answer(c, () => api.notes()));
  app.get("/api/note", (c) => answer(c, () => api.readNote(id(c))));
  app.get("/api/journal", (c) => answer(c, () => api.journal(id(c))));
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
  app.on(["GET", "HEAD"], "*", (c) => (web && hostOk(c) ? staticFile(c, web) : c.text("Not found", 404)));
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
