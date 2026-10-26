// isorite serve: open a folder of notes, with isorite's own files in its .isorite/, and serve the app and the
// engine on this machine.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { serve as nodeServe } from "@hono/node-server";
import { CONFIG_FILE, GITATTRIBUTES, OWN_DIR, StudyError } from "@isorite/core";
import { Engine, KEY, systemClock, type Http, type Secrets } from "@isorite/engine";
import { ConfigSecrets, configPath, deviceId, gatewayTls, providerConfig } from "./config.ts";
import { gatewayHttp, relay } from "./gateway.ts";
import { cacheDir, modelDir, nodeEmbedder } from "./embedder.ts";
import { LOOPBACK, createApp } from "./http.ts";
import { Terminal } from "./terminal.ts";
import { NodeFiles } from "./nodefiles.ts";
import { defaultStudyPath, openStudyBase } from "./studybase.ts";

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

export async function openEngine({ notes }: Opened, device = deviceId(), config = configPath(), http?: Http, model: string | null = modelDir(), secrets: Secrets = new ConfigSecrets(config)): Promise<Engine> {
  const provider = providerConfig(config);
  const own = makeOwn(notes);
  // The provider is OpenRouter unless the configuration names another. The engine compares against OPENROUTER to know.
  return Engine.open({
    notes: new NodeFiles(notes), own: new NodeFiles(own), clock: systemClock, device, name: basename(notes),
    http: http ?? gatewayHttp(provider, gatewayTls(config)), secrets, provider,
    // The repository code links point into (M12): named in .isorite/settings.toml, from the notes folder.
    repository: (path) => { const dir = resolve(notes, path); return existsSync(dir) && statSync(dir).isDirectory() ? new NodeFiles(dir) : null; },
    // Search by meaning, where the model is installed (npm run model). Its vectors are a cache of this base's
    // notes, kept outside both repositories under a name made from where the notes are.
    ...(model ? { embedder: nodeEmbedder(model), cache: { files: new NodeFiles(cacheDir()), name: `vectors-${createHash("sha256").update(notes).digest("hex").slice(0, 16)}.json` } } : {}),
  });
}

/** A link most terminals let you click (OSC 8), when the output is a terminal; the address as it is otherwise. */
export const link = (url: string, tty = Boolean(process.stdout.isTTY)): string => (tty ? `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\` : url);

/** `stand`: in place of the provider, an answerer of its own, as the guide's finder is when no model is set up
 *  (M16). It needs no key, and the key kept, if any, is not sent to it. */
export async function serve(path: string, { host = "127.0.0.1", port = 4767, allowHosts = [] as string[], stand }: { host?: string; port?: number; allowHosts?: string[]; stand?: Http } = {}): Promise<void> {
  const opened = locate(path);
  const config = configPath(), provider = providerConfig(config), http = stand ?? gatewayHttp(provider, gatewayTls(config));
  const kept = new ConfigSecrets(config);
  const secrets: Secrets = stand ? { get: (name) => (name === KEY ? Promise.resolve("none") : kept.get(name)), set: (name, value) => kept.set(name, value) } : kept;
  const api = await openEngine(opened, deviceId(config), config, http, modelDir(), secrets);
  // The provider is relayed to OpenCode only on this machine: from a tailnet it would be anyone's to use.
  const gateway = LOOPBACK.has(host) ? relay(provider, http, () => secrets.get(KEY)) : undefined;
  const web = existsSync(join(WEB_DIR, "index.html")) ? WEB_DIR : null;
  const terminal = new Terminal();
  const app = createApp({ api, token: randomBytes(24).toString("base64url"), loopback: LOOPBACK.has(host), web, allowHosts, notes: opened.notes, terminal, gateway });
  const server = nodeServe({ fetch: app.fetch, hostname: host, port });
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(e.code === "EADDRINUSE" ? `port ${port} is in use (isorite serve --port <n>)` : e.message);
    process.exit(1);
  });
  console.log(`isorite: ${opened.notes}`);
  console.log(api.meaning ? "  search by meaning: on" : "  search by meaning: off (isorite model fetches its model)");
  console.log(web ? `  ${link(`http://localhost:${port}/`)}` : `  the app is not built (npm run build); the engine alone is at http://localhost:${port}/api/`);
  if (process.env.SSH_CONNECTION && LOOPBACK.has(host)) console.log(`  over SSH, the link opens on this machine; from your own, first run: ssh -L ${port}:localhost:${port} ${hostname()}`);
  const stop = () => { server.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
