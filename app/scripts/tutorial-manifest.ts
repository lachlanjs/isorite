// After `npm run build:tutorial`: the tutorial's manifest scoped to the folder it is served from. On GitHub Pages the
// page is /isorite (src/app.html takes off the slash), outside the scope "./" (/isorite/), and a browser will not
// install a page outside its manifest's scope. BASE_PATH is the folder, as for the build; at the root, "./" is right.

import { readFileSync, writeFileSync } from "node:fs";

const base = process.env.BASE_PATH ?? "";
const file = new URL("../../site/manifest.webmanifest", import.meta.url);
if (base) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...manifest, start_url: base, scope: base }, null, 2) + "\n");
}
