import { afterAll, expect, test } from "vitest";
import { DIM, MODEL, modelDir, nodeEmbedder } from "../src/embedder.ts";

// The real model, where it is installed (npm run model). Without it there is nothing to test here.
const dir = modelDir();
const embedder = dir ? nodeEmbedder(dir) : null;
afterAll(async () => { await embedder?.close(); });

const cos = (a: Float32Array, b: Float32Array) => {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i]! * b[i]!; aa += a[i]! * a[i]!; bb += b[i]! * b[i]!; }
  return ab / Math.sqrt(aa * bb);
};

test.skipIf(!embedder)("the model turns text into vectors, and texts that mean alike are nearer", async () => {
  const [entropy, surprise, bread] = await Promise.all([
    embedder!.embed("Entropy is the average uncertainty of a random variable."),
    embedder!.embed("How unpredictable a source of symbols is, on average."),
    embedder!.embed("Knead the dough and leave it to rise overnight."),
  ]);
  expect([embedder!.model, embedder!.dim, entropy!.length]).toEqual([MODEL, DIM, DIM]);
  expect(cos(entropy!, surprise!)).toBeGreaterThan(cos(entropy!, bread!) + 0.1);
}, 60_000);

test("with the model switched off or missing there is no embedder", () => {
  expect(modelDir({ ISORITE_EMBED: "off" })).toBeNull();
  expect(modelDir({ ISORITE_EMBED_DIR: "/nowhere" })).toBeNull();
});
