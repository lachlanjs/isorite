// isorite serve: open a folder of notes, with isorite's own files in its .isorite/, and serve the app and the
// engine on this machine.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { serve as nodeServe } from "@hono/node-server";
import { CONFIG_FILE, GITATTRIBUTES, OWN_DIR, StudyError } from "@isorite/core";
import { Engine, KEY, OPENROUTER, systemClock, type ArtifactRun, type Elsewhere, type Embedder, type Http, type ProviderConfig, type Secrets } from "@isorite/engine";
import { ConfigSecrets, configPath, deviceId, gatewayTls, hasModel, providerConfig, rememberBase } from "./config.ts";
import { Bases } from "./bases.ts";
import { gatewayHttp, relay } from "./gateway.ts";
import { cacheDir, modelDir, nodeEmbedder } from "./embedder.ts";
import { LOOPBACK, createApp } from "./http.ts";
import { Terminal } from "./terminal.ts";
import { NodeFiles } from "./nodefiles.ts";
import { Setup } from "./setup.ts";
import { VERSION } from "./version.ts";
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

export async function openEngine({ notes }: Opened, device = deviceId(), config = configPath(), http?: Http, model: string | null = modelDir(), secrets: Secrets = new ConfigSecrets(config), extras: EngineExtras = {}): Promise<Engine> {
  const provider = providerConfig(config);
  const own = makeOwn(notes);
  const embedder = extras.embedder !== undefined ? extras.embedder : model ? nodeEmbedder(model) : null;
  // The provider is OpenRouter unless the configuration names another. The engine compares against OPENROUTER to know.
  return Engine.open({
    notes: new NodeFiles(notes), own: new NodeFiles(own), clock: systemClock, device, name: extras.name ?? basename(notes),
    http: http ?? gatewayHttp(provider, gatewayTls(config)), secrets, provider,
    // The repository code links point into (M12): named in .isorite/settings.toml, from the notes folder.
    repository: (path) => { const dir = resolve(notes, path); return existsSync(dir) && statSync(dir).isDirectory() ? new NodeFiles(dir) : null; },
    // Search by meaning, where the model is installed (npm run model). Its vectors are a cache of this base's
    // notes, kept outside both repositories under a name made from where the notes are.
    ...(embedder ? { embedder, cache: { files: new NodeFiles(cacheDir()), name: `vectors-${createHash("sha256").update(notes).digest("hex").slice(0, 16)}.json` } } : {}),
    ...(extras.elsewhere ? { elsewhere: extras.elsewhere } : {}),
    // An artifact Iso writes is run unseen (M23), in a browser found on this machine, with the kit the app is built with.
    renderArtifact: (path, html) => runArtifact(notes, path, html),
  });
}

/** Run an artifact unseen: null when there's no browser, or no built kit, to run it with. */
async function runArtifact(notes: string, path: string, html: string): Promise<ArtifactRun | null> {
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

/** The guide's finder, as a provider: no key, no sign-in, and a name that says what it is. */
const { auth: _auth, ...openrouter } = OPENROUTER;
const FINDER: ProviderConfig = { ...openrouter, name: "finder", url: "http://finder.invalid/v1" };

/** The provider as the configuration has it now: kept from the settings (M18), it is taken into use at once, by
 *  Iso and the relay. With `stand`, that is asked while there is no model here. */
export async function liveProvider(config: string, stand?: Http): Promise<{ provider: ProviderConfig; http: Http }> {
  if (stand && !(await hasModel(config))) return { provider: FINDER, http: stand };
  const provider = providerConfig(config);
  return { provider, http: gatewayHttp(provider, gatewayTls(config)) };
}

/** A link most terminals let you click (OSC 8), when the output is a terminal; the address as it is otherwise. */
export const link = (url: string, tty = Boolean(process.stdout.isTTY)): string => (tty ? `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\` : url);

/** The server's bases, opened: the one named (remembered in bases.toml, M20) and every lent one, each with its
 *  engine and app, and the server's answer to a request for any of them. `stand`: in place of the provider, an
 *  answerer of its own, as the guide's finder is when no model is set up (M16), asked while there is no model here.
 *  `idle`: what to do once the last of those holding the server lets it go. */
export async function openServer(path: string, { host = "127.0.0.1", port = 4767, allowHosts = [] as string[], stand, idle, config = configPath(), model = modelDir() }: { host?: string; port?: number; allowHosts?: string[]; stand?: Http; idle?: () => void; config?: string; model?: string | null } = {}): Promise<{ notes: string; bases: Bases; embedder: boolean; fetch: (req: Request, env?: unknown) => Promise<Response> }> {
  const opened = locate(path);
  const current = () => liveProvider(config, stand);
  let live = await current();
  const secrets = new ConfigSecrets(config), device = deviceId(config);
  const first = rememberBase(opened.notes, { path: config });
  const embedder = model ? nodeEmbedder(model) : null;
  const token = randomBytes(24).toString("base64url"), loopback = LOOPBACK.has(host);
  // The provider is relayed to OpenCode only on this machine: from a tailnet it would be anyone's to use.
  const gateway = loopback ? relay(() => live, () => secrets.get(KEY)) : undefined;
  const web = existsSync(join(WEB_DIR, "index.html")) ? WEB_DIR : null;
  const bases: Bases = new Bases({
    config, first, ...(idle ? { idle } : {}),
    make: async (known) => {
      const api = await openEngine({ notes: known.path }, device, config, live.http, model, secrets, { name: known.name, elsewhere: bases, embedder });
      api.setProvider(live.provider, live.http);
      const app = createApp({ api, token, loopback, web, allowHosts, notes: known.path, terminal: new Terminal(), gateway, setup, bases, base: known.name });
      return { engine: api, fetch: app.fetch };
    },
  });
  const setup = new Setup({ config, notes: opened.notes, version: VERSION, port, kept: async () => { live = await current(); bases.each((api) => api.setProvider(live.provider, live.http)); } });
  await bases.start();
  return { notes: opened.notes, bases, embedder: Boolean(embedder), fetch: (req, env) => bases.fetch(req, env) };
}

/** `held`: started by isorite term or mcp, it stops once the last of them lets it go. */
export async function serve(path: string, { host = "127.0.0.1", port = 4767, allowHosts = [] as string[], stand, held = false }: { host?: string; port?: number; allowHosts?: string[]; stand?: Http; held?: boolean } = {}): Promise<void> {
  let stop = () => undefined as void;
  const { notes, bases, embedder, fetch } = await openServer(path, { host, port, allowHosts, ...(stand ? { stand } : {}), ...(held ? { idle: () => stop() } : {}) });
  const server = nodeServe({ fetch, hostname: host, port });
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(e.code === "EADDRINUSE" ? `port ${port} is in use (isorite serve --port <n>)` : e.message);
    process.exit(1);
  });
  console.log(`isorite: ${notes}`);
  console.log(embedder ? "  search by meaning: on" : "  search by meaning: off (isorite model fetches its model)");
  const lent = bases.lent().filter((l) => l.name !== bases.first).map((l) => l.name);
  if (lent.length) console.log(`  lent to every session: ${lent.join(", ")} (isorite bases)`);
  console.log(existsSync(join(WEB_DIR, "index.html")) ? `  ${link(`http://localhost:${port}/`)}` : `  the app is not built (npm run build); the engine alone is at http://localhost:${port}/api/`);
  if (process.env.SSH_CONNECTION && LOOPBACK.has(host)) console.log(`  over SSH, the link opens on this machine; from your own, first run: ssh -L ${port}:localhost:${port} ${hostname()}`);
  stop = () => { server.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
