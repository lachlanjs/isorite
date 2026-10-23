// The model for search by meaning: fetched, not shipped (53 MB). IBM's granite-embedding-small-english-r2
// (Apache-2.0), 8-bit quantised ONNX as converted by onnx-community for transformers.js, chosen against bge-small
// and others on real notes (bench/embedders.ts). Its files are checked against their SHA-256 wherever they come from:
// the npm package `isorite-model-granite` (packages/model), through whatever registry npm is set to use, so a
// company's mirror serves it; else Hugging Face, pinned to one revision; or a folder you copied them into.
// In a checkout `npm run model` fetches them into packages/model, for the package and the server; installed,
// `isorite model` puts them in the user's data folder.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const NAME = "granite-embedding-small-english-r2";
/** The npm package that carries the files, and the version this isorite expects. */
export const PACKAGE = "isorite-model-granite@1.0.0";
const REVISION = "1dc7835ba0cb9c76a3618d0bf0c427c97671b3c8";
const HUB = `https://huggingface.co/onnx-community/granite-embedding-small-english-r2-ONNX/resolve/${REVISION}`;
/** Each file: where it is on Hugging Face, its name here, and its SHA-256. The weights are kept apart from the
 *  graph, under the name the graph gives them. */
export const FILES: [from: string, to: string, sha256: string][] = [
  ["onnx/model_quantized.onnx", "model.onnx", "a3fad524afc3f060216a8ddbb1ac89c9b6498fba8995b5718bde879076a2e9ba"],
  ["onnx/model_quantized.onnx_data", "model_quantized.onnx_data", "1f4cf47e4adec7f7ae09db03d071ba8667e07f9a4203142c7efa8d37fe453597"],
  ["tokenizer.json", "tokenizer.json", "feeb83348dcb033bc6b9d2e1f7906ca9eb2d122845000c9416d894d7c2927149"],
  ["tokenizer_config.json", "tokenizer_config.json", "ce06781b38bb393db68c9e0709bddd31ef5d88f2c6fbb3fd9f369778fb85e451"],
];
const sha = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

/** Where `isorite model` keeps the model: the user's data folder, outside any repository. */
export const userModelDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "isorite", "models", NAME);

type Say = (line: string) => void;
export interface Fetch {
  /** A folder holding the files already: nothing is fetched. */
  from?: string;
  /** The npm package to fetch them from (a name@version, or a .tgz), or null to go straight to Hugging Face. */
  pkg?: string | null;
  files?: typeof FILES;
}

/** Keep `buf` as `out/to` if it is the file expected. */
function keep(out: string, to: string, want: string, buf: Uint8Array, say: Say): void {
  if (sha(buf) !== want) throw new Error(`${to}: not the file expected (its SHA-256 differs), so it was not kept`);
  writeFileSync(join(out, to) + ".tmp", buf);
  renameSync(join(out, to) + ".tmp", join(out, to));
  say(`${to}: ${(buf.length / 1e6).toFixed(1)} MB`);
}

/** The package's files, unpacked into a temporary folder by npm itself (so its registry, proxy and mirror settings
 *  apply). The folder is the caller's to remove. */
function unpack(pkg: string): string {
  const tmp = mkdtempSync(join(tmpdir(), "isorite-model-"));
  const win = process.platform === "win32";
  const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: tmp, encoding: "utf8", shell: win });
  const packed = run("npm", ["pack", pkg, "--loglevel=error"]);
  const tgz = packed.stdout?.trim().split("\n").at(-1);
  if (packed.status !== 0 || !tgz) { rmSync(tmp, { recursive: true, force: true }); throw new Error((packed.stderr?.split("\n").find((l) => /^npm error \d{3} /.test(l)) ?? packed.stderr?.split("\n").find((l) => /error/i.test(l)))?.replace(/^npm error\s*/, "").trim() || packed.error?.message || "npm pack failed"); }
  const untar = run("tar", ["-xzf", tgz]);
  if (untar.status !== 0) { rmSync(tmp, { recursive: true, force: true }); throw new Error("could not unpack " + tgz); }
  return tmp;
}

/** Fetch the model's files into `out`, keeping only files whose SHA-256 is the one expected: from a folder if one is
 *  named, else from npm, else from Hugging Face. */
export async function fetchModel(out: string, say: Say = console.log, { from, pkg = PACKAGE, files = FILES }: Fetch = {}): Promise<void> {
  mkdirSync(out, { recursive: true });
  const missing = files.filter(([, to, want]) => !(existsSync(join(out, to)) && sha(readFileSync(join(out, to))) === want));
  for (const [, to] of files) if (!missing.some((f) => f[1] === to)) say(`${to}: already here`);
  if (missing.length && from) {
    for (const [, to, want] of missing) {
      if (!existsSync(join(from, to))) throw new Error(`${to} is not in ${from}`);
      keep(out, to, want, readFileSync(join(from, to)), say);
    }
  } else if (missing.length && pkg) {
    let dir: string | null = null;
    try {
      dir = unpack(pkg);
      for (const [, to, want] of missing) keep(out, to, want, readFileSync(join(dir, "package", to)), say);
      missing.length = 0;
    } catch (e) {
      say(`From npm (${pkg}): ${(e as Error).message}. Trying Hugging Face.`);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  }
  if (missing.length && !from) {
    for (const [hub, to, want] of missing.filter(([, to, want]) => !(existsSync(join(out, to)) && sha(readFileSync(join(out, to))) === want))) {
      const res = await fetch(`${HUB}/${hub}`);
      if (!res.ok) throw new Error(`${hub}: ${res.status} ${res.statusText}`);
      keep(out, to, want, new Uint8Array(await res.arrayBuffer()), say);
    }
  }
  say(`The model is in ${out}`);
}
