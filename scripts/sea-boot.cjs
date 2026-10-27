// The single executable's start (M21): Node, with isorite inside as one asset. The first time a version runs, the
// asset is unpacked into ~/.cache/isorite/<version>/ (a node_modules: isorite, as `npm i isorite` installs it, and
// its dependencies, the plugin's among them), and from then on isorite runs from there, as it runs from npm: the
// browser's pages, the plugin OpenCode reads, the embedding worker and the guide are files where it looks for them.

const { getAsset } = require("node:sea");
const { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, chmodSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { gunzipSync } = require("node:zlib");

const version = getAsset("version", "utf8").trim();
const cacheRoot = process.env.XDG_CACHE_HOME || (process.platform === "win32" ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") : join(homedir(), ".cache"));
const at = join(cacheRoot, "isorite", version);
const DONE = ".unpacked";

/** The asset: a 4-byte length, a JSON list of [path, size, mode], then each file's bytes in turn; gzipped. */
function unpack(into) {
  const all = gunzipSync(Buffer.from(getAsset("isorite.pack")));
  const length = all.readUInt32LE(0);
  const files = JSON.parse(all.subarray(4, 4 + length).toString("utf8"));
  let offset = 4 + length;
  for (const [path, size, mode] of files) {
    const file = join(into, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, all.subarray(offset, offset + size));
    if (mode & 0o111 && process.platform !== "win32") chmodSync(file, 0o755);
    offset += size;
  }
}

if (!existsSync(join(at, DONE))) {
  // Unpacked beside, then moved into place: two starting at once each unpack, and the first to finish is kept.
  const tmp = `${at}.${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  unpack(tmp);
  writeFileSync(join(tmp, DONE), version + "\n");
  mkdirSync(dirname(at), { recursive: true });
  try { renameSync(tmp, at); } catch { rmSync(tmp, { recursive: true, force: true }); }
  if (!existsSync(join(at, DONE))) { console.error(`isorite: could not unpack itself into ${at}`); process.exit(1); }
}

import(pathToFileURL(join(at, "node_modules", "isorite", "dist", "main.js")).href)
  .then((isorite) => isorite.run(process.argv.slice(2)))
  .then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
