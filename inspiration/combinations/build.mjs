// Builds sketches.html from sketches.src.html with the app's fonts inlined, so the page works opened from anywhere.
// node inspiration/combinations/build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const fonts = new URL("../../app/static/fonts/", import.meta.url);
const src = readFileSync(new URL("sketches.src.html", here), "utf8");
const out = src.replace(/url\(FONT:([\w.-]+\.woff2)\)/g, (_, name) => `url(data:font/woff2;base64,${readFileSync(new URL(name, fonts)).toString("base64")})`);
writeFileSync(new URL("sketches.html", here), out);
console.log(`sketches.html: ${Math.round(out.length / 1024)} KB`);
