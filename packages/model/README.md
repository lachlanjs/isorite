# isorite-model-granite

The model [isorite](https://github.com/lachlanjs/isorite) searches notes by meaning with: IBM's [granite-embedding-small-english-r2](https://huggingface.co/ibm-granite/granite-embedding-small-english-r2) (Apache-2.0), as the 8-bit ONNX [converted by onnx-community](https://huggingface.co/onnx-community/granite-embedding-small-english-r2-ONNX), unchanged. Files only, no code.

You don't install this yourself: `isorite model` fetches it through npm (so a company's npm mirror serves it), checks each file's SHA-256, and keeps the files in `~/.local/share/isorite/models/`.

| File | SHA-256 |
|---|---|
| `model.onnx` | `a3fad524afc3f060216a8ddbb1ac89c9b6498fba8995b5718bde879076a2e9ba` |
| `model_quantized.onnx_data` | `1f4cf47e4adec7f7ae09db03d071ba8667e07f9a4203142c7efa8d37fe453597` |
| `tokenizer.json` | `feeb83348dcb033bc6b9d2e1f7906ca9eb2d122845000c9416d894d7c2927149` |
| `tokenizer_config.json` | `ce06781b38bb393db68c9e0709bddd31ef5d88f2c6fbb3fd9f369778fb85e451` |

Why this model: `bench/embedders.ts` in isorite's repository compares it with bge-small-en-v1.5 and others on real notes.
