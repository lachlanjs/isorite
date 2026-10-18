// The model for search by meaning: fetched, not shipped (34 MB). bge-small-en-v1.5 (BAAI, MIT licence), 8-bit
// quantised ONNX, as converted by Xenova for transformers.js, pinned to one revision and checked against its
// SHA-256. In a checkout `npm run model` puts it beside the server; installed, `isorite model` puts it in the
// user's data folder.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REVISION = "ea104dacec62c0de699686887e3f920caeb4f3e3";
const BASE = `https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/${REVISION}`;
const FILES: [from: string, to: string, sha256: string][] = [
  ["onnx/model_quantized.onnx", "model.onnx", "6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4"],
  ["tokenizer.json", "tokenizer.json", "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66"],
  ["tokenizer_config.json", "tokenizer_config.json", "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3"],
];
const sha = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

/** Where `isorite model` keeps the model: the user's data folder, outside any repository. */
export const userModelDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "isorite", "models", "bge-small-en-v1.5");

/** Fetch the model's files into `out`, keeping only files whose SHA-256 is the one expected. */
export async function fetchModel(out: string, say: (line: string) => void = console.log): Promise<void> {
  mkdirSync(out, { recursive: true });
  for (const [from, to, want] of FILES) {
    const path = join(out, to);
    if (existsSync(path) && sha(readFileSync(path)) === want) { say(`${to}: already here`); continue; }
    const res = await fetch(`${BASE}/${from}`);
    if (!res.ok) throw new Error(`${from}: ${res.status} ${res.statusText}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (sha(buf) !== want) throw new Error(`${from}: not the file expected (its SHA-256 differs), so it was not kept`);
    writeFileSync(path + ".tmp", buf);
    renameSync(path + ".tmp", path);
    say(`${to}: ${(buf.length / 1e6).toFixed(1)} MB`);
  }
  say(`The model is in ${out}`);
}
