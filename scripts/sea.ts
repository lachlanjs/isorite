// Build isorite as one executable for this machine (M21), into .sea/:
//   npm run package:sea
//
// It's Node itself, as a single executable application, with isorite inside as one asset: the package
// `npm run package` builds, its npm dependencies installed beside it (the plugin's @opentui with its native library
// for this platform), packed and gzipped. scripts/sea-boot.cjs unpacks it into ~/.cache/isorite/<version>/ the
// first time that version runs. Each platform's executable is built on that platform, by the release workflow.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = join(import.meta.dirname, "..");
const PKG = join(ROOT, ".npm", "isorite"), OUT = join(ROOT, ".sea"), WORK = join(OUT, "work");
const win = process.platform === "win32";
const run = (cmd: string, args: string[], cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell: win });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// The package, installed from its .tgz as `npm i isorite` installs it, so its dependencies are the tree a person
// gets from npm, for this platform only.
run(process.execPath, [join(ROOT, "scripts", "package.ts")]);
const version = (JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { version: string }).version;
run("npm", ["pack", "--pack-destination", WORK, "--loglevel=error"], PKG);
const APP = join(WORK, "app");
mkdirSync(APP);
writeFileSync(join(APP, "package.json"), "{}\n");
run("npm", ["install", "--omit=dev", "--no-package-lock", "--no-fund", "--no-audit", "--loglevel=error", join(WORK, `isorite-${version}.tgz`)], APP);

// Packed: every file but npm's links in .bin (nothing runs them), with whether it's executable.
const files: [string, number, number][] = [], parts: Buffer[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name), st = lstatSync(path);
    if (st.isSymbolicLink() || name === ".bin") continue;
    if (st.isDirectory()) { walk(path); continue; }
    const bytes = readFileSync(path);
    files.push([relative(APP, path).split(sep).join("/"), bytes.length, st.mode & 0o777]);
    parts.push(bytes);
  }
};
walk(join(APP, "node_modules"));
const index = Buffer.from(JSON.stringify(files)), head = Buffer.alloc(4);
head.writeUInt32LE(index.length, 0);
const pack = gzipSync(Buffer.concat([head, index, ...parts]), { level: 9 });
writeFileSync(join(WORK, "isorite.pack"), pack);
writeFileSync(join(WORK, "version"), version + "\n");
console.log(`packed ${files.length} files, ${(pack.length / 1e6).toFixed(1)} MB`);

// The executable: Node's own, with the blob injected (postject), signed again on macOS.
writeFileSync(join(WORK, "sea.json"), JSON.stringify({
  main: join(ROOT, "scripts", "sea-boot.cjs"),
  output: join(WORK, "sea.blob"),
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  assets: { "isorite.pack": join(WORK, "isorite.pack"), version: join(WORK, "version") },
}));
run(process.execPath, ["--experimental-sea-config", join(WORK, "sea.json")]);
const platform = { darwin: "macos", win32: "windows" }[process.platform as string] ?? process.platform;
const exe = join(OUT, `isorite-${platform}-${process.arch}${win ? ".exe" : ""}`);
copyFileSync(process.execPath, exe);
if (process.platform === "darwin") run("codesign", ["--remove-signature", exe]);
run("npx", ["-y", "postject@1.0.0-alpha.6", exe, "NODE_SEA_BLOB", join(WORK, "sea.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", ...(process.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : [])]);
if (process.platform === "darwin") run("codesign", ["--sign", "-", exe]);

const sum = createHash("sha256").update(readFileSync(exe)).digest("hex");
writeFileSync(`${exe}.sha256`, `${sum}  ${exe.split(sep).at(-1)}\n`);
rmSync(WORK, { recursive: true, force: true });
console.log(`isorite ${version}: ${exe} (${(statSync(exe).size / 1e6).toFixed(0)} MB), sha256 ${sum}`);
