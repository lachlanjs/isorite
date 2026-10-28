// Builds kit/isorite.css from kit/isorite.src.css with the app's fonts inlined. A sandboxed artifact can't fetch fonts
// from anywhere (font loads need CORS, and its origin is opaque), so the theme carries them.
// node inspiration/artifacts/build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const kit = new URL("kit/", import.meta.url), fonts = new URL("../../app/static/fonts/", import.meta.url);
const src = readFileSync(new URL("isorite.src.css", kit), "utf8");
const out = src.replace(/url\(FONT:([\w.-]+\.woff2)\)/g, (_, name) => `url(data:font/woff2;base64,${readFileSync(new URL(name, fonts)).toString("base64")})`);
writeFileSync(new URL("isorite.css", kit), out);
console.log(`kit/isorite.css: ${Math.round(out.length / 1024)} KB`);
