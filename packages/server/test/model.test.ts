import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { fetchModel, type FILES } from "../src/model.ts";

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
const tgz = join(root, execFileSync("npm", ["pack", src, "--silent", "--pack-destination", root], { encoding: "utf8" }).trim().split("\n").at(-1)!);
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
