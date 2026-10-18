// The version isorite is released as is packages/server/package.json's:
//   node scripts/version.ts               prints it
//   node scripts/version.ts 0.2.0         sets it
//   node scripts/version.ts --tag v0.2.0  fails unless the tag is v followed by it (the release workflow's check)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PATH = join(import.meta.dirname, "..", "packages", "server", "package.json");
const pkg = JSON.parse(readFileSync(PATH, "utf8")) as { version: string };
const [first, second] = process.argv.slice(2);

if (first === "--tag") {
  if (second !== `v${pkg.version}`) { console.error(`the tag ${second} is not v${pkg.version}, the version in packages/server/package.json`); process.exit(1); }
  console.log(`tag ${second} matches`);
} else if (first) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(first)) { console.error(`not a version: ${first}`); process.exit(2); }
  pkg.version = first;
  writeFileSync(PATH, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`isorite is now ${first}`);
} else console.log(pkg.version);
