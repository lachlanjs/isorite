import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { nodeEmbedder } from "../src/embedder.ts";
import { ModelFetchError, RELEASE_SHA256, byHand, fetchModel, installFrom, mirrorOf, modelCommand, modelDir, type FILES } from "../src/model.ts";

// Fetching the model, with two small stand-in files in place of the model's: from a package npm unpacks (a .tgz
// here, as a registry would serve it), from a folder, and refused when a file is not the one expected.
const root = mkdtempSync(join(tmpdir(), "isorite-model-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const files: typeof FILES = [["a", "model.onnx", sha("graph")], ["b", "tokenizer.json", sha("words")]];
const src = join(root, "src");
mkdirSync(src);
writeFileSync(join(src, "model.onnx"), "graph");
writeFileSync(join(src, "tokenizer.json"), "words");
writeFileSync(join(src, "package.json"), JSON.stringify({ name: "stand-in-model", version: "1.0.0" }));
const tgz = join(root, execFileSync("npm", ["pack", src, "--silent", "--pack-destination", root], { encoding: "utf8", shell: process.platform === "win32" }).trim().split("\n").at(-1)!);
const quiet = () => {};

test("from an npm package: its files kept, each checked", async () => {
  const out = join(root, "npm");
  await fetchModel(out, quiet, { pkg: tgz, files });
  expect([readFileSync(join(out, "model.onnx"), "utf8"), readFileSync(join(out, "tokenizer.json"), "utf8")]).toEqual(["graph", "words"]);
});

test("from a folder, and a file that is not the one expected is refused", async () => {
  const out = join(root, "folder");
  await fetchModel(out, quiet, { from: src, files });
  expect(readFileSync(join(out, "tokenizer.json"), "utf8")).toBe("words");
  await expect(fetchModel(join(root, "wrong"), quiet, { from: src, files: [["a", "model.onnx", sha("another graph")]] })).rejects.toThrow(/not the file expected/);
});

// A port nothing listens on, and a server that hands out the package's .tgz, as the GitHub release would.
const closedPort = () => new Promise<number>((done) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as AddressInfo).port; s.close(() => done(p)); }); });
const serveTgz = () => new Promise<{ url: string; close: () => void }>((done) => {
  const s = createServer((_req, res) => res.end(readFileSync(tgz))).listen(0, "127.0.0.1", () => done({ url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/isorite-model-granite-1.0.0.tgz`, close: () => s.close() }));
});

test("npm refusing, the package comes from the GitHub release", async () => {
  const out = join(root, "release"), said: string[] = [], release = await serveTgz();
  try {
    await fetchModel(out, (l) => said.push(l), { pkg: join(root, "no-such.tgz"), release: release.url, hub: null, files });
    expect(readFileSync(join(out, "model.onnx"), "utf8")).toBe("graph");
    expect(said.some((l) => l.startsWith("From npm ("))).toBe(true);
  } finally { release.close(); }
});

test("from nowhere, it says each source it tried and why each failed", async () => {
  const port = await closedPort();
  const err = await fetchModel(join(root, "nowhere"), quiet, { pkg: join(root, "no-such.tgz"), release: `http://127.0.0.1:${port}/m.tgz`, hub: `http://127.0.0.1:${port}/hub`, files }).catch((e: unknown) => e) as ModelFetchError;
  expect(err).toBeInstanceOf(ModelFetchError);
  expect(err.tried).toHaveLength(3);
  expect(err.tried[0]).toMatch(/^npm \(/);
  expect(err.tried[1]).toContain(`ECONNREFUSED 127.0.0.1:${port}`);
  expect(err.tried[2]).toMatch(/^Hugging Face \(127\.0\.0\.1:\d+\): connect ECONNREFUSED/);
});

test("isorite model says what is installed and where, and fetches nothing", async () => {
  const data = join(root, "data-found");
  mkdirSync(join(data, "isorite", "models", "granite-embedding-small-english-r2"), { recursive: true });
  for (const f of ["model.onnx", "tokenizer.json"]) writeFileSync(join(data, "isorite", "models", "granite-embedding-small-english-r2", f), f);
  const said: string[] = [];
  expect(await modelCommand(undefined, (l) => said.push(l), { XDG_DATA_HOME: data, ISORITE_EMBED_DIR: join(data, "isorite", "models", "granite-embedding-small-english-r2") })).toBe(0);
  expect(said[0]).toMatch(/^search by meaning: granite-embedding-small-english-r2 at .* \(sha256 [0-9a-f]{12}, cls pooling\), found by ISORITE_EMBED_DIR$/);
  expect(said.at(-1)).toBe("Nothing to fetch.");
});

test("isorite model with nothing installed and nothing reachable says where it looked, what it tried, and what to do", async () => {
  const port = await closedPort(), said: string[] = [];
  const code = await modelCommand(undefined, (l) => said.push(l), { ISORITE_EMBED_DIR: join(root, "empty") }, { pkg: join(root, "no-such.tgz"), release: `http://127.0.0.1:${port}/m.tgz`, hub: null });
  expect(code).toBe(1);
  const text = said.join("\n");
  expect(text).toContain(`No model in ${join(root, "empty")}`);
  expect(text).toContain("The model could not be fetched:");
  expect(text).toContain("isorite model --from <folder>");
  expect(text).toContain(`  SHA-256 ${RELEASE_SHA256}`);
  expect(text).toContain("isorite model --from ~/Downloads/isorite-model-granite-1.0.0.tgz");
  expect(said[1]).toMatch(/^If it can't be fetched from here: https:\/\/github\.com\/.*\(SHA-256 8d8ab528/);
  expect(text).toContain("Search by words works without it.");
});

test("a mirror (ISORITE_MODEL_BASE_URL) is tried first; --url is tried alone; a .tgz not the one expected isn't unpacked", async () => {
  expect(mirrorOf({ ISORITE_MODEL_BASE_URL: "https://mirror.corp/isorite/" })).toBe("https://mirror.corp/isorite/isorite-model-granite-1.0.0.tgz");
  expect(mirrorOf({})).toBeNull();
  const served = await serveTgz(), port = await closedPort();
  try {
    const said: string[] = [];
    await fetchModel(join(root, "mirror"), (l) => said.push(l), { mirror: served.url, pkg: join(root, "no-such.tgz"), release: `http://127.0.0.1:${port}/m.tgz`, hub: null, files });
    expect(said[0]).toBe(`From the mirror (ISORITE_MODEL_BASE_URL): ${served.url}`);
    expect(said.some((l) => l.startsWith("From npm") || l.startsWith("From GitHub"))).toBe(false);

    const only: string[] = [];
    const err = await fetchModel(join(root, "url"), (l) => only.push(l), { url: `http://127.0.0.1:${port}/m.tgz`, mirror: served.url, files }).catch((e: unknown) => e) as ModelFetchError;
    expect(err.tried).toEqual([expect.stringMatching(/^--url \(http:\/\/127\.0\.0\.1:\d+\/m\.tgz\): connect ECONNREFUSED/)]);

    const wrong = await fetchModel(join(root, "wrong-tgz"), quiet, { url: served.url, files, tgzSha: sha("another package") }).catch((e: unknown) => e) as ModelFetchError;
    expect(wrong.tried[0]).toMatch(/not the file expected: its SHA-256 is [0-9a-f]{64}, not [0-9a-f]{64}, so it was not unpacked/);
  } finally { served.close(); }
});

test("by hand: the file, its SHA-256 and the command; and a .tgz given to --from is checked first", async () => {
  expect(byHand({ ISORITE_MODEL_BASE_URL: "https://mirror.corp/m" })).toEqual([
    "Fetch this file another way (a browser, or a machine that can reach it):",
    "  https://github.com/lachlanjs/isorite/releases/download/model-granite-1.0.0/isorite-model-granite-1.0.0.tgz",
    "  or from your mirror: https://mirror.corp/m/isorite-model-granite-1.0.0.tgz",
    `  SHA-256 ${RELEASE_SHA256}`,
    "then run:",
    "  isorite model --from ~/Downloads/isorite-model-granite-1.0.0.tgz",
  ]);
  await expect(installFrom(tgz, quiet, { XDG_DATA_HOME: join(root, "d-tgz") })).rejects.toThrow(/is not isorite-model-granite-1\.0\.0\.tgz: its SHA-256 is/);
});

test("a folder without a model is refused, saying what it needs", async () => {
  await expect(installFrom(src.replace(/src$/, "nothing"), quiet, { XDG_DATA_HOME: join(root, "d") })).rejects.toThrow(/needs model\.onnx and tokenizer\.json/);
});

// The real model, where it is installed (npm run model): granite, told to pool by the mean, is another model.
const real = modelDir({});
test.skipIf(!real)("any compatible model is checked by use, kept beside granite, used from then on, and its vectors are its own", async () => {
  const other = join(root, "granite-mean"), data = join(root, "data-other");
  mkdirSync(other);
  for (const f of readdirSync(real!)) if (/onnx|tokenizer/.test(f)) copyFileSync(join(real!, f), join(other, f));
  rmSync(join(other, "tokenizer_config.json"));
  writeFileSync(join(other, "isorite-model.json"), JSON.stringify({ name: "granite-mean", pooling: "mean" }));
  const info = await installFrom(other, quiet, { XDG_DATA_HOME: data });
  expect(info).toMatchObject({ name: "granite-mean", pooling: "mean", dir: join(data, "isorite", "models", "granite-mean") });
  expect(info.id).toMatch(/^granite-mean-[0-9a-f]{12}-mean$/);
  expect(readFileSync(join(data, "isorite", "models", "use"), "utf8").trim()).toBe("granite-mean");
  expect(modelDir({ XDG_DATA_HOME: data })).toBe(info.dir);
  const e = nodeEmbedder(info.dir);
  try {
    expect(e.model).toBe(info.id);
    expect((await e.embed("entropy")).length).toBe(384);
  } finally { await e.close(); }
}, 120_000);
