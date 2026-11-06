// isorite serve: open a folder of notes, with isorite's own files in its .isorite/, and serve the app and the
// engine on this machine.

import { bold, dim } from "./term.ts";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { serve as nodeServe } from "@hono/node-server";
import { CONFIG_FILE, GITATTRIBUTES, OWN_DIR, StudyError } from "@isorite/core";
import { Engine, systemClock, type ArtifactRun, type Elsewhere, type Embedder } from "@isorite/engine";
import { configPath, deviceId, rememberBase, touchBase } from "./config.ts";
import { repoOf } from "./git.ts";
import { Bases } from "./bases.ts";
import { cacheDir, modelDir, nodeEmbedder } from "./embedder.ts";
import { LOOPBACK, createApp } from "./http.ts";
import { AcpFollower } from "./acp.ts";
import { PiControl, piHostFor } from "./pi/index.ts";
import { AgentRunner } from "./agents.ts";
import { projectOf } from "./connect.ts";
import { NodeFiles } from "./nodefiles.ts";
import { defaultStudyPath, openStudyBase } from "./studybase.ts";
import { KIT_FILES, assemble, manifestOf, type KitFiles } from "@isorite/kit";
import { findBrowser, renderArtifact, type Reader } from "./render.ts";

/** The built app: in a checkout, where npm run build puts it; installed from npm, in the package's web/. */
export const WEB_DIR = [join(dirname(fileURLToPath(import.meta.url)), "..", "web"), join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "build")]
  .find((dir) => existsSync(join(dir, "index.html"))) ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "build");

export interface Opened { notes: string }

const moveIt = (study: string) => `${study} is a study base, which this isorite no longer reads (format 1). Move it into its notes with: isorite migrate ${study}`;

/** The folder of notes for `isorite serve <path>`. A study base (format 1), named or found beside notes that have
 *  no journals of their own yet, is refused with how to move it in. */
export function locate(path: string): Opened {
  const at = resolve(path);
  if (!existsSync(at) || !statSync(at).isDirectory()) throw new StudyError(`no folder at ${at}: isorite new ${path} makes one`);
  if (existsSync(join(at, CONFIG_FILE))) throw new StudyError(moveIt(at));
  const beside = defaultStudyPath(at);
  if (!existsSync(join(at, OWN_DIR, "journal")) && existsSync(join(beside, CONFIG_FILE)) && openStudyBase(beside).notes === at) throw new StudyError(moveIt(beside));
  return { notes: at };
}

/** isorite's own folder in the notes, made the first time a base is opened, with what lets two devices' journals
 *  merge. */
function makeOwn(notes: string): string {
  const own = join(notes, OWN_DIR);
  if (!existsSync(own)) { mkdirSync(own, { recursive: true }); writeFileSync(join(own, ".gitattributes"), GITATTRIBUTES); }
  return own;
}

/** `isorite new <folder>`: the folder (and its parents), empty, with isorite's own folder in it. No notes are
 *  written: they are yours. A folder that already holds anything but .isorite/ is refused. */
export function newBase(path: string): string {
  const at = resolve(path);
  if (existsSync(at) && !statSync(at).isDirectory()) throw new StudyError(`${at} is a file`);
  if (existsSync(at) && readdirSync(at).some((f) => f !== OWN_DIR)) throw new StudyError(`${at} has files in it already: open it as it is, with isorite serve ${path}`);
  mkdirSync(at, { recursive: true });
  makeOwn(at);
  return at;
}

export interface EngineExtras {
  /** Its name, as the bases have it (M20); the folder's when not given. */
  name?: string;
  /** The other bases lent to it. */
  elsewhere?: Elsewhere;
  /** One embedder for every base a server holds: the model is loaded once. */
  embedder?: Embedder | null;
}

export async function openEngine({ notes }: Opened, device = deviceId(), model: string | null = modelDir(), extras: EngineExtras = {}): Promise<Engine> {
  const own = makeOwn(notes), found = repoOf(notes);
  const embedder = extras.embedder !== undefined ? extras.embedder : model ? nodeEmbedder(model) : null;
  return Engine.open({
    notes: new NodeFiles(notes), own: new NodeFiles(own), clock: systemClock, device, name: extras.name ?? basename(notes),
    // The repository code links point into (M12): named in .isorite/settings.toml, from the notes folder, else the
    // one the notes are in.
    ...(found !== null ? { foundRepository: relative(notes, found) || "." } : {}),
    repository: (path) => { const dir = resolve(notes, path); return existsSync(dir) && statSync(dir).isDirectory() ? new NodeFiles(dir) : null; },
    // Search by meaning, where the model is installed (npm run model). Its vectors are a cache of this base's
    // notes, kept outside both repositories under a name made from where the notes are.
    ...(embedder ? { embedder, cache: { files: new NodeFiles(cacheDir()), name: `vectors-${createHash("sha256").update(notes).digest("hex").slice(0, 16)}.json` } } : {}),
    ...(extras.elsewhere ? { elsewhere: extras.elsewhere } : {}),
    // An artifact an agent writes is run unseen (M23), in a browser found on this machine, with the kit the app is built with.
    renderArtifact: (path, html) => runArtifact(notes, path, html),
  });
}

/** Run an artifact unseen: null when there's no browser, or no built kit, to run it with. */
export async function runArtifact(notes: string, path: string, html: string): Promise<ArtifactRun | null> {
  const executable = findBrowser(), kitDir = join(WEB_DIR, "kit");
  if (!executable || !existsSync(join(kitDir, "kit.js"))) return null;
  const kit = Object.fromEntries(KIT_FILES.map((f) => [f, readFileSync(join(kitDir, f), "utf8")])) as KitFiles;
  const dir = dirname(resolve(notes, path)), uses = manifestOf(html).uses;
  const read: Reader = async (rel) => {
    const at = resolve(dir, rel);
    if (!at.startsWith(resolve(notes) + sep) || !existsSync(at)) return null;
    return /\.(csv|tsv|json|jsonl|ndjson|txt|gltf|obj)$/i.test(at) ? readFileSync(at, "utf8") : new Uint8Array(readFileSync(at));
  };
  const got = await renderArtifact(assemble(html, kit), uses, read, { executable });
  return { rendered: got.rendered, errors: got.errors, drawn: got.drawn };
}

/** A link most terminals let you click (OSC 8), when the output is a terminal; the address as it is otherwise. */
export const link = (url: string, tty = Boolean(process.stdout.isTTY)): string => (tty ? `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\` : url);

/** The server's bases, opened: the one named (remembered in bases.toml, M20) and every lent one, each with its
 *  engine and app, and the server's answer to a request for any of them. `idle`: what to do once the last of those
 *  holding the server lets it go. */
export async function openServer(path: string, { host = "127.0.0.1", port = 4767, allowHosts = [] as string[], idle, config = configPath(), model = modelDir() }: { host?: string; port?: number; allowHosts?: string[]; idle?: () => void; config?: string; model?: string | null } = {}): Promise<{ notes: string; bases: Bases; embedder: boolean; fetch: (req: Request, env?: unknown) => Promise<Response> }> {
  const opened = locate(path);
  const device = deviceId(config);
  const first = rememberBase(opened.notes, { path: config });
  touchBase(opened.notes, { path: config });
  const embedder = model ? nodeEmbedder(model) : null;
  const token = randomBytes(24).toString("base64url"), loopback = LOOPBACK.has(host);
  const web = existsSync(join(WEB_DIR, "index.html")) ? WEB_DIR : null;
  const pi = new PiControl();
  const bases: Bases = new Bases({
    config, first, ...(idle ? { idle } : {}),
    make: async (known) => {
      const api = await openEngine({ notes: known.path }, device, model, { name: known.name, elsewhere: bases, embedder });
      const acp = new AcpFollower({ api, notes: known.path });
      // The pi agent in the pane instead of an ACP one, where ISORITE_PI chooses it (M35, a prototype).
      const terminal = await piHostFor(api, process.env, projectOf(known.path).repo, known.path, pi);
      // The agent chosen for this base's pane, started once the server is listening (the wrapper waits for it).
      const agents = new AgentRunner({ base: known.name, url: `http://127.0.0.1:${port}${known.name === first ? "" : `/b/${known.name}`}`, folder: projectOf(known.path).repo, config });
      if (loopback) void agents.start();
      const app = createApp({ api, token, loopback, web, allowHosts, notes: known.path, acp, ...(terminal ? { terminal } : {}), ...(loopback ? { pi } : {}), bases, base: known.name, ...(loopback ? { agents } : {}), config });
      return { engine: api, fetch: app.fetch };
    },
  });
  await bases.start();
  return { notes: opened.notes, bases, embedder: Boolean(embedder), fetch: (req, env) => bases.fetch(req, env) };
}

/** `held`: started by isorite acp or mcp, it stops once the last of them lets it go. */
export async function serve(path: string, { host = "127.0.0.1", port = 4767, allowHosts = [] as string[], held = false }: { host?: string; port?: number; allowHosts?: string[]; held?: boolean } = {}): Promise<void> {
  let stop = () => undefined as void;
  const { notes, bases, embedder, fetch } = await openServer(path, { host, port, allowHosts, ...(held ? { idle: () => stop() } : {}) });
  const server = nodeServe({ fetch, hostname: host, port });
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(e.code === "EADDRINUSE" ? `port ${port} is in use (isorite serve --port <n>)` : e.message);
    process.exit(1);
  });
  // What is up, a word to a line (M32): the label dimmed, the thing as it is.
  const row = (label: string, text: string) => console.log(`  ${dim(label.padEnd(8))}${text}`);
  console.log(`${bold("isorite")}  ${notes}`);
  row("search", embedder ? "by meaning" : `by words ${dim("(isorite model fetches the model, 53 MB)")}`);
  const lent = bases.lent().filter((l) => l.name !== bases.first).map((l) => l.name);
  if (lent.length) row("lent", `${lent.join(", ")} ${dim("(isorite bases)")}`);
  if (existsSync(join(WEB_DIR, "index.html"))) row("open", link(`http://localhost:${port}/`));
  else row("open", `the app is not built (npm run build); the engine alone is at http://localhost:${port}/api/`);
  if (process.env.SSH_CONNECTION && LOOPBACK.has(host)) row("ssh", `opens on this machine; from your own, first: ssh -L ${port}:localhost:${port} ${hostname()}`);
  stop = () => { server.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
