// isorite serve: open a knowledge base and its study base, and serve the app
// and the engine on this machine.

import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve as nodeServe } from "@hono/node-server";
import { CONFIG_FILE, StudyError } from "@isorite/core";
import { Engine, systemClock } from "@isorite/engine";
import { deviceId } from "./config.ts";
import { LOOPBACK, createApp } from "./http.ts";
import { NodeFiles } from "./nodefiles.ts";
import { defaultStudyPath, openStudyBase } from "./studybase.ts";

/** The built app, when it has been built (npm run build). */
export const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "build");

export interface Opened { notes: string; study: string | null }

/** The two folders for `isorite serve <path>`: a study base names its notes; a folder of notes is looked beside for its study base. */
export function locate(path: string): Opened {
  const at = resolve(path);
  if (!existsSync(at) || !statSync(at).isDirectory()) throw new StudyError(`no folder at ${at}`);
  if (existsSync(join(at, CONFIG_FILE))) {
    const { notes } = openStudyBase(at);
    if (!existsSync(notes)) throw new StudyError(`this study base studies ${notes}, which is not there`);
    return { notes, study: at };
  }
  const beside = defaultStudyPath(at);
  return { notes: at, study: existsSync(join(beside, CONFIG_FILE)) && openStudyBase(beside).notes === at ? beside : null };
}

export async function openEngine({ notes, study }: Opened, device = deviceId()): Promise<Engine> {
  return Engine.open({ notes: new NodeFiles(notes), study: study ? new NodeFiles(study) : null, clock: systemClock, device, name: basename(notes) });
}

export async function serve(path: string, { host = "127.0.0.1", port = 4767 } = {}): Promise<void> {
  const opened = locate(path);
  const api = await openEngine(opened);
  const web = existsSync(join(WEB_DIR, "index.html")) ? WEB_DIR : null;
  const app = createApp({ api, token: randomBytes(24).toString("base64url"), loopback: LOOPBACK.has(host), web });
  const server = nodeServe({ fetch: app.fetch, hostname: host, port });
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(e.code === "EADDRINUSE" ? `port ${port} is in use (isorite serve --port <n>)` : e.message);
    process.exit(1);
  });
  console.log(`isorite: ${opened.notes}`);
  console.log(opened.study ? `  study base ${opened.study}` : "  no study base beside it: no journal is kept (isorite study init)");
  console.log(web ? `  http://localhost:${port}/` : `  the app is not built (npm run build); the engine alone is at http://localhost:${port}/api/`);
  const stop = () => { server.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
