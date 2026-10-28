// node packages/kit/build.ts [out]: builds the kit into app/static/kit/ (or out), where the app and the server find it.
// Each part is one script: kit.js (always), chart.js (Plot, with <iso-chart>), model.js (three.js, with <iso-model>
// and <iso-chart3d>). The isorite theme carries its fonts, since a sandboxed artifact can't fetch any. Licences of what
// is bundled go beside them. Nothing here is fetched at run time (plan-m23 §3.8).
import { build } from "rolldown";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dirname, ROOT = join(HERE, "..", "..");
const out = process.argv[2] ?? join(ROOT, "app", "static", "kit");
mkdirSync(out, { recursive: true });

for (const part of ["kit", "chart", "model"]) {
  await build({
    input: join(HERE, "src", `${part}.ts`),
    platform: "browser",
    output: { file: join(out, `${part}.js`), format: "iife", codeSplitting: false, minify: part !== "kit" },
    logLevel: "warn",
  });
}

const fonts = join(ROOT, "app", "static", "fonts");
const isorite = readFileSync(join(HERE, "src", "theme", "isorite.css"), "utf8")
  .replace(/url\(FONT:([\w.-]+\.woff2)\)/g, (_, name: string) => `url(data:font/woff2;base64,${readFileSync(join(fonts, name)).toString("base64")})`);
writeFileSync(join(out, "isorite.css"), isorite);
for (const f of ["plain.css", "kit.css"]) copyFileSync(join(HERE, "src", "theme", f), join(out, f));

// The licences of what the parts bundle.
const lic = join(out, "licenses");
mkdirSync(lic, { recursive: true });
for (const name of ["@observablehq/plot", "three", "d3", "interval-tree-1d", "isoformat"]) {
  const at = [join(ROOT, "node_modules", name), join(HERE, "node_modules", name)].find((d) => existsSync(join(d, "LICENSE")));
  if (at) copyFileSync(join(at, "LICENSE"), join(lic, `${name.replace("@", "").replace("/", "-")}.txt`));
}
const sizes = ["kit.js", "chart.js", "model.js", "isorite.css", "plain.css", "kit.css"].map((f) => `${f} ${Math.round(readFileSync(join(out, f)).length / 1024)} kB`);
console.log(`kit 1 → ${out}: ${sizes.join(", ")}`);
