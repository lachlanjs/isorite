// The model for search by meaning: fetched, not shipped (53 MB). IBM's granite-embedding-small-english-r2
// (Apache-2.0), 8-bit quantised ONNX as converted by onnx-community for transformers.js, chosen against bge-small
// and others on real notes (bench/embedders.ts). Its files are checked against their SHA-256 wherever they come from:
// the npm package `isorite-model-granite` (packages/model), through whatever registry npm is set to use, so a
// company's mirror serves it; else Hugging Face, pinned to one revision; or a folder you copied them into.
// In a checkout `npm run model` fetches them into packages/model, for the package and the server; installed,
// `isorite model` puts them in the user's data folder. Any compatible model (an ONNX one that gives 384 numbers)
// can be used instead: `isorite model --from <folder>` checks it by using it, and keeps it beside granite.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unreachable } from "@isorite/engine";

export const NAME = "granite-embedding-small-english-r2";
/** What the search index calls granite's vectors: a base's vectors are made again when the model changes. */
export const MODEL = `${NAME}-q8`;
export const DIM = 384;
/** The model's .tgz, as npm packs it, on a GitHub release of its own: for a machine whose npm can't reach it. */
export const RELEASE_FILE = "isorite-model-granite-1.0.0.tgz";
export const RELEASE = `https://github.com/lachlanjs/isorite/releases/download/model-granite-1.0.0/${RELEASE_FILE}`;
/** The .tgz's own SHA-256, checked before it's unpacked (M21), as each file in it is checked after. */
export const RELEASE_SHA256 = "8d8ab528ae289dfc81fd2bfa80c867ca0c8342a2d98f7c86141df4b15fdf028c";

/** Where a mirror keeps the .tgz (M21): ISORITE_MODEL_BASE_URL names the folder it's in, tried before the rest. */
export function mirrorOf(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.ISORITE_MODEL_BASE_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}/${RELEASE_FILE}` : null;
}

/** How to fetch the model by hand, to copy: the file, its SHA-256, and the command that takes it. */
export function byHand(env: NodeJS.ProcessEnv = process.env): string[] {
  const mirror = mirrorOf(env);
  return [
    "Fetch this file another way (a browser, or a machine that can reach it):",
    `  ${RELEASE}`,
    ...(mirror ? [`  or from your mirror: ${mirror}`] : []),
    `  SHA-256 ${RELEASE_SHA256}`,
    "then run:",
    `  isorite model --from ~/Downloads/${RELEASE_FILE}`,
  ];
}
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

/** Where `isorite model` keeps models: the user's data folder, outside any repository. Each model is in a folder
 *  of its own; `use` names the one to use, if not granite. */
export const userModelsDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "isorite", "models");
export const userModelDir = (env: NodeJS.ProcessEnv = process.env): string => join(userModelsDir(env), NAME);

/** Where the server looks for the model, in order, and why each place is there. */
export function modelPlaces(env: NodeJS.ProcessEnv = process.env): { dir: string; why: string }[] {
  if (env.ISORITE_EMBED_DIR) return [{ dir: env.ISORITE_EMBED_DIR, why: "ISORITE_EMBED_DIR" }];
  let use = "";
  try { use = readFileSync(join(userModelsDir(env), "use"), "utf8").trim(); } catch { /* granite */ }
  return [
    ...(use && use !== NAME && !/[/\\]/.test(use) ? [{ dir: join(userModelsDir(env), use), why: "isorite model --from" }] : []),
    // Beside the package: packages/model in a checkout.
    { dir: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "model"), why: "beside isorite" },
    { dir: userModelDir(env), why: "isorite model" },
  ];
}

const hasModel = (dir: string) => existsSync(join(dir, "model.onnx")) && existsSync(join(dir, "tokenizer.json"));

/** Where the model is, or null when it is not installed or is switched off (ISORITE_EMBED=off). */
export function modelDir(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.ISORITE_EMBED === "off") return null;
  return modelPlaces(env).find((p) => hasModel(p.dir))?.dir ?? null;
}

/** A model as found: its name, the SHA-256 of its graph, how its vectors are pooled, and what the index calls them. */
export interface ModelInfo { dir: string; name: string; sha: string; pooling: "cls" | "mean"; id: string }

/** What is in a model's folder. `isorite-model.json` beside the files may give its `name` and `pooling` ("cls",
 *  the first token's state, as granite is used; or "mean", the average of them all, as all-MiniLM is). */
export function modelInfo(dir: string): ModelInfo {
  let own: { name?: unknown; pooling?: unknown } = {};
  try { own = JSON.parse(readFileSync(join(dir, "isorite-model.json"), "utf8")) as typeof own; } catch { /* none */ }
  const graph = sha(readFileSync(join(dir, "model.onnx"))), granite = graph === FILES[0]![2];
  const pooling = own.pooling === "mean" ? "mean" : "cls";
  const name = typeof own.name === "string" && own.name ? own.name : granite ? NAME : basename(dir);
  return { dir, name, sha: graph, pooling, id: granite && pooling === "cls" ? MODEL : `${name}-${graph.slice(0, 12)}-${pooling}` };
}

type Say = (line: string) => void;
export interface Fetch {
  /** A folder holding the files already: nothing is fetched. */
  from?: string;
  /** The npm package to fetch them from (a name@version, or a .tgz), or null to go straight to Hugging Face. */
  pkg?: string | null;
  /** The package's .tgz on the web (a GitHub release), tried after npm; null to skip it. */
  release?: string | null;
  /** A mirror's .tgz (ISORITE_MODEL_BASE_URL), tried first; null to skip it. */
  mirror?: string | null;
  /** The one address to fetch the .tgz from (`--url`): nothing else is tried. */
  url?: string;
  /** The .tgz's SHA-256: RELEASE_SHA256 for granite's files, else not checked (tests' own packages). */
  tgzSha?: string | null;
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

/** The model could not be fetched from anywhere: each source, and why it failed. */
export class ModelFetchError extends Error {
  readonly tried: string[];
  constructor(tried: string[]) {
    super(`The model could not be fetched:\n${tried.map((t) => `  ${t}`).join("\n")}`);
    this.tried = tried;
  }
}

/** Fetch the model's files into `out`, keeping only files whose SHA-256 is the one expected: from a folder if one is
 *  named; else from npm, then the GitHub release, then Hugging Face, each tried in turn. */
export async function fetchModel(out: string, say: Say = console.log, { from, pkg = PACKAGE, release = RELEASE, mirror = null, url, hub = HUB, files = FILES, tgzSha = files === FILES ? RELEASE_SHA256 : null }: Fetch & { hub?: string | null } = {}): Promise<void> {
  mkdirSync(out, { recursive: true });
  const missing = () => files.filter(([, to, want]) => !(existsSync(join(out, to)) && sha(readFileSync(join(out, to))) === want));
  for (const [, to] of files) if (!missing().some((f) => f[1] === to)) say(`${to}: already here`);
  if (from) {
    for (const [, to, want] of missing()) {
      if (!existsSync(join(from, to))) throw new Error(`${to} is not in ${from}`);
      keep(out, to, want, readFileSync(join(from, to)), say);
    }
    say(`The model is in ${out}`);
    return;
  }
  const tried: string[] = [];
  const fromPackage = (tgz: string) => {
    let dir: string | null = null;
    try {
      dir = unpack(tgz);
      for (const [, to, want] of missing()) {
        if (!existsSync(join(dir, "package", to))) throw new Error(`the package has no ${to}`);
        keep(out, to, want, readFileSync(join(dir, "package", to)), say);
      }
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  };
  const why = (e: unknown, url: string) => ((e as Error).message === "fetch failed" || (e as { cause?: unknown }).cause ? unreachable(e, url) : (e as Error).message);
  /** The .tgz at an address, checked by its SHA-256 before it's unpacked; a failure is kept in `tried`. */
  const fromWeb = async (where: string, address: string): Promise<void> => {
    const tmp = mkdtempSync(join(tmpdir(), "isorite-model-release-"));
    try {
      say(`From ${where}: ${address}`);
      const res = await fetch(address);
      if (!res.ok) throw new Error(`it said ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (tgzSha && sha(buf) !== tgzSha) throw new Error(`not the file expected: its SHA-256 is ${sha(buf)}, not ${tgzSha}, so it was not unpacked`);
      const tgz = join(tmp, basename(new URL(address).pathname) || RELEASE_FILE);
      writeFileSync(tgz, buf);
      fromPackage(tgz);
    } catch (e) {
      tried.push(`${where} (${address}): ${why(e, address)}`);
      say(`From ${where}: ${why(e, address)}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };
  if (url) {
    await fromWeb("--url", url);
    if (missing().length) throw new ModelFetchError(tried);
    say(`The model is in ${out}`);
    return;
  }
  if (missing().length && mirror) await fromWeb("the mirror (ISORITE_MODEL_BASE_URL)", mirror);
  if (missing().length && pkg) {
    try { fromPackage(pkg); } catch (e) { tried.push(`npm (${pkg}): ${(e as Error).message}`); say(`From npm (${pkg}): ${(e as Error).message}`); }
  }
  if (missing().length && release) await fromWeb("GitHub", release);
  if (missing().length && hub) {
    say("From Hugging Face");
    try {
      for (const [at, to, want] of missing()) {
        const res = await fetch(`${hub}/${at}`);
        if (!res.ok) throw new Error(`${at}: it said ${res.status}`);
        keep(out, to, want, new Uint8Array(await res.arrayBuffer()), say);
      }
    } catch (e) {
      tried.push(`Hugging Face (${new URL(hub).host}): ${why(e, hub)}`);
    }
  }
  if (missing().length) throw new ModelFetchError(tried);
  say(`The model is in ${out}`);
}

/** The files of a model that go with it from a folder: its graph and weights, its tokenizer, and what it says of
 *  itself. */
const modelFiles = (dir: string): string[] => readdirSync(dir).filter((f) => /^(model\.onnx|.*\.onnx_data|tokenizer\.json|tokenizer_config\.json|isorite-model\.json)$/.test(f));

/** `isorite model --from <folder>`: granite's files, checked against their SHA-256 as fetched; or any other model,
 *  checked by using it: it must load, and give DIM numbers for a sentence. Kept in the user's models, and used from
 *  then on. */
export async function installFrom(from: string, say: Say = console.log, env: NodeJS.ProcessEnv = process.env): Promise<ModelInfo> {
  // The release's .tgz, fetched by hand (M21): checked by its SHA-256, unpacked, and its files taken from it.
  if (/\.(tgz|tar\.gz)$/.test(from) && existsSync(from) && statSync(from).isFile()) {
    const got = sha(readFileSync(from));
    if (got !== RELEASE_SHA256) throw new Error(`${from} is not ${RELEASE_FILE}: its SHA-256 is ${got}, not ${RELEASE_SHA256}`);
    const dir = unpack(resolve(from));
    try { return await installFrom(join(dir, "package"), say, env); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (!hasModel(from)) throw new Error(`${from} has no model: it needs model.onnx and tokenizer.json`);
  const granite = !existsSync(join(from, "isorite-model.json")) && FILES.every(([, to, want]) => existsSync(join(from, to)) && sha(readFileSync(join(from, to))) === want);
  let out = userModelDir(env);
  if (granite) await fetchModel(out, say, { from });
  else {
    const info = modelInfo(from);
    say(`${info.name} is not the model isorite fetches; checking it by use`);
    const { nodeEmbedder } = await import("./embedder.ts");
    const e = nodeEmbedder(from);
    try {
      const v = await e.embed("A sentence to see that the model works.");
      if (v.length !== DIM || !v.every(Number.isFinite) || v.every((x) => x === 0)) throw new Error(`it gives ${v.length} numbers, not ${DIM} that are of use`);
    } catch (err) {
      throw new Error(`${from} could not be used: ${(err as Error).message}. isorite needs a model that gives ${DIM} numbers (granite-embedding-small, all-MiniLM-L6-v2, bge-small); name its pooling ("cls" or "mean") in isorite-model.json beside it`);
    } finally { await e.close(); }
    out = join(userModelsDir(env), info.name.replace(/[^A-Za-z0-9._-]+/g, "-"));
    mkdirSync(out, { recursive: true });
    for (const f of modelFiles(from)) copyFileSync(join(from, f), join(out, f));
    say(`${info.name}: ${modelFiles(out).join(", ")}`);
  }
  writeFileSync(join(userModelsDir(env), "use"), basename(out) + "\n");
  return modelInfo(out);
}

/** `isorite model [--from <folder>]`: says which model is installed and where, or installs one, and on failure
 *  where it looked, what it tried, and what to do. */
export async function modelCommand(from: string | undefined, say: Say = console.log, env: NodeJS.ProcessEnv = process.env, sources: Fetch & { hub?: string | null } = {}, url?: string): Promise<number> {
  const told = (i: ModelInfo, why: string) => say(`search by meaning: ${i.name} at ${i.dir} (sha256 ${i.sha.slice(0, 12)}, ${i.pooling} pooling), found by ${why}`);
  if (env.ISORITE_EMBED === "off") say("ISORITE_EMBED=off: search by meaning is switched off, whatever is installed");
  if (from) {
    try { const i = await installFrom(from, say, env); told(i, env.ISORITE_EMBED_DIR ? "isorite model, but ISORITE_EMBED_DIR names another" : "isorite model"); return 0; }
    catch (e) { say((e as Error).message); return 1; }
  }
  const places = modelPlaces(env), found = places.find((p) => hasModel(p.dir));
  if (found) { told(modelInfo(found.dir), found.why); say("Nothing to fetch."); return 0; }
  say(`No model in ${places.map((p) => p.dir).join(", ")}`);
  // Said before it starts, so that a fetch that hangs behind a proxy has already said what to fetch by hand (M21).
  if (!url) say(`If it can't be fetched from here: ${RELEASE} (SHA-256 ${RELEASE_SHA256}), then isorite model --from <that file>`);
  try {
    await fetchModel(userModelDir(env), say, { mirror: mirrorOf(env), ...sources, ...(url ? { url } : {}) });
    return 0;
  } catch (e) {
    say((e as Error).message);
    say([
      ...byHand(env),
      "Or:",
      `  - a mirror: ISORITE_MODEL_BASE_URL=<the folder ${RELEASE_FILE} is in> isorite model, or isorite model --url <its address>`,
      `  - the model's files from a machine that has them (${userModelDir()} there): isorite model --from <folder>`,
      `  - any compatible model (ONNX, ${DIM} numbers out, with its tokenizer.json): isorite model --from <folder>, or ISORITE_EMBED_DIR=<folder>`,
      "Search by words works without it.",
    ].join("\n"));
    return 1;
  }
}
