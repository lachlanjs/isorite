// Which model for search by meaning: each candidate, 8-bit ONNX as published, run as isorite runs its model
// (onnxruntime-web's WebAssembly, one thread), over the same notes and questions. Search by meaning only.
//   node bench/embedders.ts <models folder> <folder of notes> <questions.json> [--each]
// The models folder holds one folder per model (model.onnx, tokenizer.json, tokenizer_config.json, and
// model.onnx_data or the like where the model keeps its weights apart). How each is used is in MODELS below.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { loadBundle } from "@isorite/core/node";
import { Meaning, MemoryFiles, type Embedder } from "@isorite/engine";

const SEARCH = "Represent this sentence for searching relevant passages: ";
/** How each model is meant to be used, from its model card: pooling, and a prefix for queries. */
const MODELS: Record<string, { pool: "cls" | "mean"; query?: string }> = {
  "bge-s": { pool: "cls", query: SEARCH },        // as isorite uses it now, as its card suggests for short queries
  "bge-s-noprefix": { pool: "cls" },
  "arctic-s": { pool: "cls", query: SEARCH },
  "mxbai-xs": { pool: "mean" },
  "granite-s": { pool: "cls" },
};
const MAX_TOKENS = 512;

const [models, notes, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!models || !notes || !file) { console.error("usage: node bench/embedders.ts <models folder> <folder of notes> <questions.json> [--each]"); process.exit(2); }
const ort = await import("onnxruntime-web/wasm");
const { Tokenizer } = await import("@huggingface/tokenizers");
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmBinary = readFileSync(join(dirname(createRequire(import.meta.url).resolve("onnxruntime-web")), "ort-wasm-simd-threaded.wasm"));

async function embedder(name: string): Promise<Embedder & { querying: boolean }> {
  const how = MODELS[name]!, dir = join(models, name.split("-noprefix")[0]!);
  const tok = new Tokenizer(JSON.parse(readFileSync(join(dir, "tokenizer.json"), "utf8")), JSON.parse(readFileSync(join(dir, "tokenizer_config.json"), "utf8")));
  const data = readdirSync(dir).filter((f) => f.endsWith("_data")).map((f) => ({ path: f, data: readFileSync(join(dir, f)) }));
  const session = await ort.InferenceSession.create(readFileSync(join(dir, "model.onnx")), { executionProviders: ["wasm"], ...(data.length ? { externalData: data } : {}) });
  const typed = session.inputNames.includes("token_type_ids");
  const self = {
    model: name, dim: 384, querying: false,
    async embed(text: string): Promise<Float32Array> {
      // isorite's search puts bge's prefix on every question itself: taken off here, and each model's own put on.
      if (self.querying) text = (how.query ?? "") + (text.startsWith(SEARCH) ? text.slice(SEARCH.length) : text);
      let ids: number[] = tok.encode(text).ids;
      if (ids.length > MAX_TOKENS) ids = [...ids.slice(0, MAX_TOKENS - 1), ids.at(-1)!];
      const big = (v: number[]) => new ort.Tensor("int64", BigInt64Array.from(v, BigInt), [1, ids.length]);
      const out = await session.run({ input_ids: big(ids), attention_mask: big(ids.map(() => 1)), ...(typed ? { token_type_ids: big(ids.map(() => 0)) } : {}) });
      const state = (out.last_hidden_state ?? Object.values(out)[0])!, all = state.data as Float32Array, dim = state.dims.at(-1)!;
      if (how.pool === "cls") return Float32Array.from(all.subarray(0, dim));
      const v = new Float32Array(dim);
      for (let t = 0; t < ids.length; t++) for (let i = 0; i < dim; i++) v[i]! += all[t * dim + i]! / ids.length;
      return v;
    },
  };
  return self;
}

const { questions } = JSON.parse(readFileSync(file, "utf8")) as { questions: { q: string; note: string; also?: string[] }[] };
const b = loadBundle(resolve(notes));
const N = 15, KS = [1, 3, 5, 10];
console.log(`${b.concepts.size} notes, ${questions.length} questions: an answering note within the first k by meaning\n`);
console.log(`${"model".padEnd(14)}${KS.map((k) => `  @${k}`.padStart(6)).join("")}    MRR   missed   embed`);
const each: string[] = [];
for (const name of Object.keys(MODELS)) {
  if (!existsSync(join(models, name.split("-noprefix")[0]!, "model.onnx"))) continue;
  const e = await embedder(name), meaning = new Meaning(e, new MemoryFiles(), "vectors.json");
  const t0 = Date.now();
  const made = await meaning.refresh(b);
  const secs = (Date.now() - t0) / 1000;
  e.querying = true;
  const ranks: number[] = [];
  for (const { q, note, also = [] } of questions) {
    const hits = (await meaning.similar(b, q, { limit: N })).hits.map((h) => h.note);
    const k = hits.findIndex((id) => [note, ...also].includes(id));
    ranks.push(k < 0 ? 99 : k + 1);
    if (process.argv.includes("--each")) each.push(`${name.padEnd(14)}${String(k < 0 ? "-" : k + 1).padStart(3)}  ${q}  [${hits[0]}]`);
  }
  e.querying = false;
  const pct = (k: number) => `${Math.round((100 * ranks.filter((r) => r <= k).length) / ranks.length)}%`.padStart(6);
  const mrr = ranks.reduce((s, r) => s + (r <= N ? 1 / r : 0), 0) / ranks.length;
  console.log(`${name.padEnd(14)}${KS.map(pct).join("")}  ${mrr.toFixed(3)}  ${String(ranks.filter((r) => r > N).length).padStart(6)}  ${(1000 * secs / made.made).toFixed(0).padStart(4)} ms/piece`);
}
if (each.length) console.log("\n" + each.join("\n"));
