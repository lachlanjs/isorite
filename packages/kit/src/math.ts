// Maths, on KaTeX, added to an artifact only when it writes some (plan-m23 §3.1): $…$ inline and $$…$$ displayed, in
// any text of the page, as a note writes it; <iso-math>…</iso-math> for a formula on its own; iso.math(tex) for a
// script. Its stylesheet and fonts are put in by the build (math.css), since nothing is fetched.

import katex from "katex";

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "INPUT", "ISO-MATH"]);
/** $$…$$ and $…$ (not $ followed by a space or a digit and space, so "$5 and $6" stays), and \(…\), \[…\]. */
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)\$(?!\d)/g;

function render(tex: string, display: boolean): string {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: true, output: "htmlAndMathml" }); }
  catch (e) { window.iso.complain(`maths that couldn't be read: ${tex.slice(0, 60)} (${(e as Error).message.replace(/^KaTeX parse error: /, "")})`); return katex.renderToString(tex, { displayMode: display, throwOnError: false }); }
}

/** Every formula in the text under an element, rendered. */
function typeset(root: Element = document.body): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
    for (let p = n.parentElement; p && p !== root.parentElement; p = p.parentElement) if (SKIP.has(p.tagName) || p.classList.contains("katex")) return NodeFilter.FILTER_REJECT;
    return /\$|\\\(|\\\[/.test(n.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  } });
  const found: Text[] = [];
  while (walker.nextNode()) found.push(walker.currentNode as Text);
  for (const node of found) {
    const text = node.nodeValue ?? "";
    MATH.lastIndex = 0;
    if (!MATH.test(text)) continue;
    const span = document.createElement("span");
    span.innerHTML = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(MATH, (_, dd, sq, rd, d) => render((dd ?? sq ?? rd ?? d).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), dd !== undefined || sq !== undefined));
    node.replaceWith(...span.childNodes);
  }
}

window.iso._.define("iso-math", class extends HTMLElement {
  connectedCallback() { if (!this.dataset.done) { this.dataset.done = "1"; this.innerHTML = render(this.textContent ?? "", !this.hasAttribute("inline")); } }
});
(window.iso as unknown as { math(tex: string, display?: boolean): string; typeset(el?: Element): void }).math = (tex, display = false) => render(tex, display);
(window.iso as unknown as { typeset(el?: Element): void }).typeset = typeset;
if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => typeset()); else typeset();
