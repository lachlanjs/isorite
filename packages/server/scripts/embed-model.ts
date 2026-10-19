// Fetch the model for search by meaning into packages/server/models/:
//   npm run model
// It is not kept in git (34 MB): run this once in a checkout of the repository. Installed from npm, the same is
// `isorite model` (src/model.ts).

import { fileURLToPath } from "node:url";
import { fetchModel } from "../src/model.ts";

await fetchModel(fileURLToPath(new URL("../models/bge-small-en-v1.5/", import.meta.url)));
