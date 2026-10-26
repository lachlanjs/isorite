// Mermaid diagrams (```mermaid), drawn by Pele (M19): in the note editor (blocks.ts) and wherever Markdown is
// rendered (render() leaves a placeholder that drawDiagrams fills). Pele, and each kind of diagram, load the first
// time one is drawn. Its colours are isorite's (app.css, --pele-*). Links and images in a diagram are off, and the
// drawing is sanitised as everything from a note or a model is; maths in a label is set by KaTeX.

import katex from "katex";
import DOMPurify from "dompurify";
import type { MathMarkup, MountOptions, Mounted } from "pele/lazy";

type Pele = typeof import("pele/lazy");
let pele: Promise<Pele> | null = null;
const load = (): Promise<Pele> => (pele ??= import("pele/lazy"));

/** `$…$` in a label, set by KaTeX at the label's size and measured off the page. */
function maths(tex: string, size: number): MathMarkup | null {
  const html = katex.renderToString(tex, { throwOnError: false, output: "html" });
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;white-space:nowrap;font-size:${size}px`;
  probe.innerHTML = html;
  document.body.append(probe);
  const { width, height } = probe.getBoundingClientRect();
  probe.remove();
  return width ? { html, width: Math.ceil(width), height: Math.ceil(height) } : null;
}

function sanitize(svg: string): Node {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ["foreignObject"], HTML_INTEGRATION_POINTS: { "annotation-xml": true, foreignobject: true }, RETURN_DOM_FRAGMENT: true });
}

const OPTIONS: MountOptions = { links: false, images: false, autoDirection: true, zoom: false, math: maths, sanitize, fontSize: 12 };

/** Draws `source` into `el`, and keeps it fitted to its width. A diagram that can't be drawn shows Pele's error, over
 *  the last drawing if there was one. */
export async function drawDiagram(el: HTMLElement, source: string, onError?: (error: unknown) => void): Promise<Mounted> {
  const p = await load();
  return p.mountAsync(el, source, onError ? { ...OPTIONS, onError } : OPTIONS);
}

/** Draws `source` again in a diagram already drawn, loading its kind first if it changed. */
export async function redrawDiagram(mounted: Mounted, source: string): Promise<void> {
  const p = await load();
  await p.load(p.detectType(source));
  mounted.update(source);
}

/** Fill the placeholders render() leaves (`div.diagram`, holding its source) inside an element. A Svelte action. */
export function drawDiagrams(node: HTMLElement, _given?: unknown) {
  const run = () => {
    for (const el of node.querySelectorAll<HTMLElement>("div.diagram:not([data-drawn])")) {
      el.dataset.drawn = "";
      void drawDiagram(el, el.textContent ?? "");
    }
  };
  run();
  return { update: run };
}
