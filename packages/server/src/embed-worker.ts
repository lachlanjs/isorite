// The embedding model, run in a thread of its own so the server answers while
// it works. granite-embedding-small-english-r2 (8-bit), through onnxruntime-web's WebAssembly
// build: no native binary, and the same runtime a webview has. Asked for a
// vector by a message {id, text}; answers {id, vector} or {id, error}.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

const MAX_TOKENS = 512; // the model reads no more
const { dir, dim, pooling } = workerData as { dir: string; dim: number; pooling: "cls" | "mean" };

const ort = await import("onnxruntime-web/wasm");
const { Tokenizer } = await import("@huggingface/tokenizers");
// One thread: the web runtime's own workers do not start under Node. And it cannot fetch its binary from a file here, so it is handed it.
ort.env.wasm.numThreads = 1;
// Beside this file as built for npm; in a checkout, in the package.
const WASM = "ort-wasm-simd-threaded.wasm", beside = join(dirname(fileURLToPath(import.meta.url)), WASM);
ort.env.wasm.wasmBinary = readFileSync(existsSync(beside) ? beside : join(dirname(createRequire(import.meta.url).resolve("onnxruntime-web")), WASM));
// tokenizer_config.json is granite's; another model may have none.
const config = join(dir, "tokenizer_config.json");
const tok = new Tokenizer(JSON.parse(readFileSync(join(dir, "tokenizer.json"), "utf8")), existsSync(config) ? JSON.parse(readFileSync(config, "utf8")) : {});
// The weights, where the model keeps them apart from its graph, under the names the graph gives them.
const externalData = readdirSync(dir).filter((f) => f.endsWith(".onnx_data")).map((path) => ({ path, data: readFileSync(join(dir, path)) }));
const session = await ort.InferenceSession.create(readFileSync(join(dir, "model.onnx")), { executionProviders: ["wasm"], externalData });
const typed = session.inputNames.includes("token_type_ids");

async function embed(text: string): Promise<Float32Array> {
  let ids: number[] = tok.encode(text).ids;
  if (ids.length > MAX_TOKENS) ids = [...ids.slice(0, MAX_TOKENS - 1), ids.at(-1)!];
  const big = (v: number[]) => new ort.Tensor("int64", BigInt64Array.from(v, BigInt), [1, ids.length]);
  const out = await session.run({ input_ids: big(ids), attention_mask: big(ids.map(() => 1)), ...(typed ? { token_type_ids: big(ids.map(() => 0)) } : {}) });
  const state = (out.last_hidden_state ?? Object.values(out)[0])!, width = state.dims.at(-1)!, data = state.data as Float32Array;
  if (width !== dim) throw new Error(`its vectors have ${width} numbers, not ${dim}`);
  // The first token's state stands for the whole text, as granite is used; or, for a model used so, the mean of them all.
  if (pooling === "cls" || state.dims.length < 3) return Float32Array.from(data.subarray(0, dim));
  const n = data.length / dim, mean = new Float32Array(dim);
  for (let t = 0; t < n; t++) for (let k = 0; k < dim; k++) mean[k]! += data[t * dim + k]! / n;
  return mean;
}

parentPort!.on("message", (m: { id: number; text: string }) => {
  embed(m.text).then((vector) => parentPort!.postMessage({ id: m.id, vector }), (e: Error) => parentPort!.postMessage({ id: m.id, error: e.message }));
});
