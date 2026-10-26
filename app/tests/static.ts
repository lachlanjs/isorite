// The built site (site/, npm run build:guide), served as GitHub Pages would serve it: plain files, nothing else. For
// its browser tests (npm run test:site).

import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

export const SITE_PORT = 4797;
const ROOT = join(import.meta.dirname, "..", "..", "site");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain" };

if (process.argv[1] === import.meta.filename) {
  createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(ROOT, path);
    try { if (statSync(file).isDirectory()) file = join(file, "index.html"); res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file)); }
    catch { res.writeHead(404).end("not found"); }
  }).listen(SITE_PORT, "127.0.0.1");
}
