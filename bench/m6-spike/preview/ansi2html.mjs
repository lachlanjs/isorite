// Turns a `tmux capture-pane -e` dump into an HTML page, one cell per character.
import { readFileSync, writeFileSync } from "node:fs"
const [src, out, title = "pane"] = process.argv.slice(2)
const text = readFileSync(src, "utf8")
const pal = (n) => {
  const base = ["#000","#c00","#0c0","#cc0","#00c","#c0c","#0cc","#ccc","#666","#f66","#6f6","#ff6","#66f","#f6f","#6ff","#fff"]
  if (n < 16) return base[n]
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})` }
  n -= 16; const c = [0, 95, 135, 175, 215, 255]
  return `rgb(${c[Math.floor(n / 36)]},${c[Math.floor(n / 6) % 6]},${c[n % 6]})`
}
let st = { fg: null, bg: null, b: false, i: false, u: false, dim: false }
const t = 1 / 3
// Block and diagonal glyphs drawn as shapes, as terminals with built-in box drawing do.
const shapes = {
  "█": [[0, 0], [1, 0], [1, 1], [0, 1]],
  "▀": [[0, 0], [1, 0], [1, 0.5], [0, 0.5]],
  "▄": [[0, 0.5], [1, 0.5], [1, 1], [0, 1]],
  "◢": [[1, 0], [1, 1], [0, 1]], "◣": [[0, 0], [1, 1], [0, 1]],
  "◤": [[0, 0], [1, 0], [0, 1]], "◥": [[0, 0], [1, 0], [1, 1]],
  "\u{1FB4A}": [[0, 1], [1, t], [1, 1]],
  "\u{1FB42}": [[0, t], [1, 0], [1, 1], [0, 1]],
  "\u{1FB4D}": [[0, 0], [1, t], [1, 1], [0, 1]],
  "\u{1FB3F}": [[0, t], [1, 1], [0, 1]],
  "\u{1FB63}": [[0, 0], [1, 0], [1, t]],
  "\u{1FB55}": [[0, 0], [1, 0], [1, 1], [0, t]],
  "\u{1FB60}": [[0, 0], [1, 0], [1, t], [0, 1]],
  "\u{1FB58}": [[0, 0], [1, 0], [0, t]],
}
const glyph = (ch) => `<span class="g"><svg viewBox="0 0 1 1" preserveAspectRatio="none" shape-rendering="crispEdges"><polygon fill="currentColor" points="${shapes[ch].map((p) => p.join(",")).join(" ")}"/></svg></span>`
const esc = (s) => [...s].map((ch) => (shapes[ch] ? glyph(ch) : ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch)).join("")
let html = ""
for (const line of text.split("\n")) {
  let row = ""
  const parts = line.split(/(\x1b\[[0-9;:]*m)/)
  for (const p of parts) {
    const m = p.match(/^\x1b\[([0-9;:]*)m$/)
    if (m) {
      const a = (m[1] || "0").split(/[;:]/).map(Number)
      for (let k = 0; k < a.length; k++) {
        const v = a[k]
        if (v === 0) st = { fg: null, bg: null, b: false, i: false, u: false, dim: false }
        else if (v === 1) st.b = true
        else if (v === 2) st.dim = true
        else if (v === 3) st.i = true
        else if (v === 4) st.u = true
        else if (v === 22) { st.b = false; st.dim = false }
        else if (v === 23) st.i = false
        else if (v === 24) st.u = false
        else if (v === 39) st.fg = null
        else if (v === 49) st.bg = null
        else if (v >= 30 && v <= 37) st.fg = pal(v - 30)
        else if (v >= 90 && v <= 97) st.fg = pal(v - 82)
        else if (v >= 40 && v <= 47) st.bg = pal(v - 40)
        else if (v >= 100 && v <= 107) st.bg = pal(v - 92)
        else if (v === 38 || v === 48) {
          let col
          if (a[k + 1] === 2) { col = `rgb(${a[k + 2]},${a[k + 3]},${a[k + 4]})`; k += 4 }
          else if (a[k + 1] === 5) { col = pal(a[k + 2]); k += 2 }
          if (v === 38) st.fg = col; else st.bg = col
        }
      }
      continue
    }
    if (!p) continue
    const css = [st.fg && `color:${st.fg}`, st.bg && `background:${st.bg}`, st.b && "font-weight:700", st.i && "font-style:italic", st.u && "text-decoration:underline", st.dim && "opacity:.6"].filter(Boolean).join(";")
    row += css ? `<span style="${css}">${esc(p)}</span>` : esc(p)
  }
  html += `<div class="r">${row || " "}</div>`
}
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>${title}</title><style>
@font-face{font-family:"Ioskeley Mono";src:url("fonts/7a3139777c365d35902d15c1dd39dd6c.woff2") format("woff2");font-weight:400}
@font-face{font-family:"Ioskeley Mono";src:url("fonts/7047de9ddc5a2739808071cdb92f6575.woff2") format("woff2");font-weight:700}
body{margin:0;background:#07101C;color:#E9EEF5}
.t{font:13px/15px "Ioskeley Mono","DejaVu Sans Mono",monospace;padding:12px;white-space:pre;display:inline-block}
.r{height:15px;overflow:visible}\n.g{display:inline-block;width:1ch;height:15px;vertical-align:top;position:relative;z-index:1}\n.g svg{display:block;width:calc(100% + 1px);height:calc(100% + 1px);overflow:visible}
</style><div class="t">${html}</div>`)
