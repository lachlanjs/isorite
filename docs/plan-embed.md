# Search by meaning: granite, from npm

Agreed on the refinement page (F5, Q35), 2026-10-23.

## Why

The model was fetched from Hugging Face only, which a machine without the internet, or a company network, may not
reach. And bge-small-en-v1.5 (2023) was no longer the best of its size. `bench/embedders.ts` ran four small models
over 78 questions on two bases (the example base, and a differential geometry base of 63 notes), each as its model
card says to use it. Answering note found first: bge-small 67%, arctic-embed-s 77%, mxbai-xsmall 74%,
**granite-embedding-small-english-r2 85%** (97% within the first three). Granite is 53 MB against 34, and about 15%
slower to index.

## What was built

1. **The model:** IBM's granite-embedding-small-english-r2 (Apache-2.0), 8-bit ONNX as converted by onnx-community,
   pinned to one revision; every file checked against its SHA-256. Its weights are kept apart from its graph
   (`model_quantized.onnx_data`), which the worker now hands to onnxruntime.
2. **A model's own question prefix:** `Embedder.query` (bge wanted one; granite wants none). The engine no longer
   puts bge's prefix on every question.
3. **`isorite-model-granite` on npm** (`packages/model`): the four files, IBM's licence and a notice, no code.
   `isorite model` fetches it with `npm pack`, so npm's own registry, proxy and mirror settings apply; if npm cannot
   reach it, Hugging Face as before. `isorite model --from <folder>` takes the files from a copy.
4. A base's vectors are made again once, on the first start after the change (the cache names its model).

Checked: every package's tests, types; `bench/retrieval.ts` through the server's own embedder gives the same 91%
found first on the differential geometry base; the package built, unpacked and installed with no network; the
fallback to Hugging Face when the package is not on npm; the bundled worker on the installed files.

## Not done

- Publishing `isorite-model-granite` 1.0.0: yours to do (below), before the next isorite release.
- The browser tutorial has no search by meaning, so nothing changes there.

## Publishing the model package

The first version of a new package is published by hand (trusted publishing can only be set up for a package that
exists):

```sh
npm run model                      # the files into packages/model, checked
cd packages/model && npm publish   # as you, with your 2FA
```

Its version is the one `PACKAGE` names in `packages/server/src/model.ts`. A new model is a new package version, and
a new isorite release.
