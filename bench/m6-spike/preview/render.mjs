// Renders a `tmux capture-pane -e` dump through xterm.js (WebGL, custom glyphs) and screenshots it.
// usage: node render.mjs pane.ans out.png [cols] [rows]
import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
const [src, out, cols = "160", rows = "44"] = process.argv.slice(2)
const here = path.dirname(new URL(import.meta.url).pathname)
const data = readFileSync(src, "utf8").replace(/\n$/, "").split("\n").join("\r\n")
const page = path.join(here, ".render.html")
writeFileSync(page, `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="node_modules/@xterm/xterm/css/xterm.css">
<style>
@font-face{font-family:"Ioskeley Mono";src:url("fonts/7a3139777c365d35902d15c1dd39dd6c.woff2") format("woff2");font-weight:400}
@font-face{font-family:"Ioskeley Mono";src:url("fonts/7047de9ddc5a2739808071cdb92f6575.woff2") format("woff2");font-weight:700}
html,body{margin:0;background:#07101C}#t{padding:16px;display:inline-block}
</style>
<div id="t"></div>
<script src="node_modules/@xterm/xterm/lib/xterm.js"></script>
<script src="node_modules/@xterm/addon-webgl/lib/addon-webgl.js"></script>
<script>
(async () => {
  await Promise.all([document.fonts.load('13px "Ioskeley Mono"'), document.fonts.load('bold 13px "Ioskeley Mono"')])
  const term = new Terminal({ cols: ${Number(cols)}, rows: ${Number(rows)}, fontFamily: '"Ioskeley Mono", "DejaVu Sans Mono", monospace', fontSize: 13, lineHeight: 1.0, customGlyphs: true, allowTransparency: false, cursorInactiveStyle: "none", theme: { background: "#07101C", foreground: "#E9EEF5" } })
  term.open(document.getElementById("t"))
  try { term.loadAddon(new WebglAddon.WebglAddon()) } catch (e) { document.title = "nowebgl" }
  term.write(${JSON.stringify(data)}, () => { document.body.dataset.done = "1" })
})()
</script>`)
const w = Math.ceil(Number(cols) * 7.9 + 60), h = Math.ceil(Number(rows) * 15 + 140)
execFileSync("/opt/pw-browsers/chromium", ["--headless", "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--allow-file-access-from-files", `--window-size=${w},${h}`, "--virtual-time-budget=8000", `--screenshot=${path.resolve(out)}`, "file://" + page], { stdio: "ignore" })
