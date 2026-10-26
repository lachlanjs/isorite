// Fetch the model for search by meaning into packages/model/, for the server in this checkout and for the npm
// package that carries it (isorite-model-granite):
//   npm run model
// It is not kept in git (53 MB). Fetched from Hugging Face, pinned and checked; installed from npm, the same is
// `isorite model` (src/model.ts).

import { fileURLToPath } from "node:url";
import { fetchModel } from "../src/model.ts";

await fetchModel(fileURLToPath(new URL("../../model/", import.meta.url)), console.log, { pkg: null, release: null });
