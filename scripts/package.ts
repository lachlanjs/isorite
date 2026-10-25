// Build the `isorite` package for npm into .npm/isorite, ready for `npm pack` or `npm publish` there:
//   npm run package
//
// Node runs TypeScript only outside node_modules, so the command is bundled to JavaScript: the server's main and
// its embedding worker, each one file, every @isorite/* package inlined and the npm dependencies left as
// dependencies. Beside them go what they read at run time, where they look for it: the built app (web/), the
// example base's notes (notes/), the OpenCode plugin (plugin/, run by OpenCode's Bun as TypeScript, its
// @isorite/core turned into dist/core.js), the tutorial agent's code (dist/tutorial/), and onnxruntime's one
// WebAssembly file, in place of the whole of onnxruntime-web (139 MB).

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { build } from "rolldown";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, ".npm", "isorite");
const at = (...p: string[]) => join(ROOT, ...p);
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

const server = json(at("packages/server/package.json"));
const version = process.env.ISORITE_VERSION ?? server.version;

// What is bundled: every @isorite/* package. Everything else from npm stays a dependency.
const ours = (id: string) => id.startsWith("@isorite/") || id.startsWith(".") || id.startsWith("/") || id.startsWith("\0");
const BUNDLED = new Set(["onnxruntime-web", "onnxruntime-web/wasm"]); // the worker's runtime, in the bundle

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "dist"), { recursive: true });

if (!existsSync(at("app/build/index.html"))) execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });

const used = new Set<string>();
const external = (id: string) => {
  if (ours(id) || BUNDLED.has(id)) return false;
  if (!id.startsWith("node:")) used.add(id.startsWith("@") ? id.split("/").slice(0, 2).join("/") : id.split("/")[0]!);
  return true;
};
for (const [entry, name] of [["packages/server/src/main.ts", "main"], ["packages/server/src/embed-worker.ts", "embed-worker"], ["packages/core/src/index.ts", "core"]] as const) {
  await build({
    input: at(entry),
    platform: "node",
    external,
    transform: { define: name === "main" ? { ISORITE_VERSION: JSON.stringify(version) } : {} },
    output: { file: join(OUT, "dist", `${name}.js`), format: "esm", codeSplitting: false },
    logLevel: "warn",
  });
}

// What the bundles read at run time.
cpSync(at("app/build"), join(OUT, "web"), { recursive: true });
cpSync(at("packages/example/notes"), join(OUT, "notes"), { recursive: true });
cpSync(at("packages/opencode/src/tutorial"), join(OUT, "dist", "tutorial"), { recursive: true });
const ort = dirname(createRequire(at("packages/server/package.json")).resolve("onnxruntime-web"));
cpSync(join(ort, "ort-wasm-simd-threaded.wasm"), join(OUT, "dist", "ort-wasm-simd-threaded.wasm"));
cpSync(at("packages/opencode/plugin"), join(OUT, "plugin"), { recursive: true });
for (const file of readdirSync(join(OUT, "plugin"))) {
  if (!/\.tsx?$/.test(file)) continue;
  const path = join(OUT, "plugin", file), text = readFileSync(path, "utf8");
  writeFileSync(path, text.replaceAll(`from "@isorite/core"`, `from "../dist/core.js"`));
}

// The dependencies the bundles import, at the versions this repository asks for; and the plugin's, which its
// host may provide but which it finds here as it does in a checkout.
const ranges: Record<string, string> = {};
for (const pkg of ["packages/server", "packages/core", "packages/engine", "packages/example", "packages/opencode"]) {
  const p = json(at(pkg, "package.json"));
  Object.assign(ranges, p.devDependencies ?? {}, p.dependencies ?? {});
}
const PLUGIN = ["@opentui/core", "@opentui/solid", "solid-js"];
const dependencies = Object.fromEntries([...used, ...PLUGIN].filter((d) => !d.startsWith("@isorite/")).sort().map((d) => {
  if (!ranges[d]) throw new Error(`${d} is imported but no package.json here asks for it`);
  return [d, ranges[d]!];
}));

writeFileSync(join(OUT, "package.json"), JSON.stringify({
  name: "isorite",
  version,
  description: "An agentic harness for understanding: your notes as a knowledge base, an Atlas of them, an agent that reads them, and study.",
  license: "MIT",
  type: "module",
  bin: { isorite: "dist/main.js" },
  engines: { node: ">=24" },
  repository: { type: "git", url: "git+https://github.com/lachlanjs/isorite.git" },
  homepage: "https://lachlanjs.github.io/isorite/",
  keywords: ["notes", "knowledge-base", "markdown", "study", "agent", "opencode"],
  files: ["dist", "web", "notes", "plugin", "docs", "README.md", "LICENSE"],
  dependencies,
}, null, 2) + "\n");
cpSync(at("LICENSE"), join(OUT, "LICENSE"));
cpSync(at("packages/server/README.npm.md"), join(OUT, "README.md"));
// The setup guides, for people and for an AI helping them: `isorite help setup` prints the second.
mkdirSync(join(OUT, "docs"), { recursive: true });
for (const doc of ["setup.md", "setup-for-agents.md", "terminal.md"]) cpSync(at("docs", doc), join(OUT, "docs", doc));
console.log(`isorite ${version} is in ${OUT}; dependencies: ${Object.keys(dependencies).join(", ")}`);
