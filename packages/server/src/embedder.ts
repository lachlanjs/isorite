// The engine's Embedder port on this machine: the model in a worker thread
// (embed-worker.ts), started the first time a vector is asked for. Where the
// model's files are not installed there is no embedder, and Iso has keyword
// search and links alone.

import { homedir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { Embedder } from "@isorite/engine";
import { DIM, MODEL, modelDir, modelInfo } from "./model.ts";

export { DIM, MODEL, modelDir };

/** The folder caches are kept in: outside both repositories, rebuilt from the notes whenever it is lost. */
export const cacheDir = (env: NodeJS.ProcessEnv = process.env): string => join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "isorite");

export function nodeEmbedder(dir: string): Embedder & { close(): Promise<void> } {
  const info = modelInfo(dir);
  let worker: Worker | null = null, next = 0;
  const waiting = new Map<number, { done: (v: Float32Array) => void; fail: (e: Error) => void }>();
  const start = (): Worker => {
    // Beside this file: embed-worker.ts in a checkout, embed-worker.js as built for npm.
    const w = new Worker(new URL(`./embed-worker.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url), { workerData: { dir, dim: DIM, pooling: info.pooling } });
    w.on("message", (m: { id: number; vector?: Float32Array; error?: string }) => {
      const asked = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.vector) asked?.done(m.vector); else asked?.fail(new Error(m.error ?? "the model failed"));
    });
    const lost = (e: Error) => { for (const a of waiting.values()) a.fail(e); waiting.clear(); worker = null; };
    w.on("error", lost);
    w.on("exit", (code) => { if (code !== 0) lost(new Error("the model's thread stopped")); });
    return w;
  };
  return {
    model: info.id, dim: DIM,
    embed: (text) => new Promise((done, fail) => {
      worker ??= start();
      const id = next++;
      waiting.set(id, { done, fail });
      worker.postMessage({ id, text });
    }),
    close: async () => { await worker?.terminate(); worker = null; },
  };
}
