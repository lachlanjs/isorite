// Blocks the live preview draws rendered: display maths ($$…$$, \[…\]),
// tables, and embeds of a question or a problem ([[!name]] on a line of its
// own, M12), drawn as a callout that opens it. Away from the cursor a block is replaced by its rendering; with the
// cursor in it, its source shows for editing, and maths keeps its rendering
// beneath it, updated as you type. Clicking a rendering puts the cursor in
// its source. Mermaid diagrams (```mermaid, M19) are drawn by Pele, and keep
// their drawing beneath their source while edited, as maths does. Carried over
// from rdstudio; pictures and artifacts are not drawn yet.
// (Decorations that replace whole lines must come from a state field, not a
// view plugin, so this is separate from livePreview.ts.)

import { syntaxTree } from "@codemirror/language";
import { Facet, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { render } from "$lib/markdown.ts";
import { drawDiagram, redrawDiagram } from "$lib/diagram.ts";
import type { Mounted } from "pele/lazy";

type Kind = "maths" | "table";

/** A note an embed names, as the callout draws it. */
export interface Embedded { id: string; title: string; kind: "note" | "question" | "problem"; done: boolean }
/** How the editor finds what an embed names, and opens it. */
export interface Embeds { find: (ref: string) => Embedded | null; open: (id: string) => void }
export const embeds = Facet.define<Embeds, Embeds | null>({ combine: (all) => all[0] ?? null });

const EMBED = /^[ \t]*\[\[!([^\]\n]+)\]\][ \t]*$/;
const GLYPH: Record<Embedded["kind"], string> = {
  question: '<path d="M5.6 5.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5v.9"/><path d="M8 12v1.2"/>',
  problem: '<path d="M8 2.5l5.8 10.5H2.2z"/>',
  note: '<rect x="3.5" y="2.5" width="9" height="11"/>',
};
const DONE_GLYPH = '<path d="M3 8.5l3 3 7-7"/>';

class EmbedWidget extends WidgetType {
  constructor(readonly ref: string, readonly found: Embedded | null, readonly at: number) { super(); }
  eq(other: EmbedWidget): boolean { return other.ref === this.ref && JSON.stringify(other.found) === JSON.stringify(this.found) && other.at === this.at; }
  toDOM(view: EditorView): HTMLElement {
    const f = this.found, el = document.createElement("div");
    el.className = `cm-lp-embed${f ? ` cm-lp-embed-${f.kind}` : " cm-lp-embed-broken"}${f?.done ? " cm-lp-embed-done" : ""}`;
    el.title = `[[!${this.ref}]]`;
    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    glyph.setAttribute("viewBox", "0 0 16 16"); glyph.setAttribute("width", "16"); glyph.setAttribute("height", "16"); glyph.setAttribute("aria-hidden", "true");
    glyph.innerHTML = f?.done ? DONE_GLYPH : GLYPH[f?.kind ?? "question"];
    const t = document.createElement("span");
    t.textContent = f ? f.title : this.ref;
    el.append(glyph, t);
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      // A click opens what it names; with Alt, or naming nothing, the cursor goes to its source.
      if (f && !e.altKey) view.state.facet(embeds)?.open(f.id);
      else { view.dispatch({ selection: { anchor: this.at }, scrollIntoView: true }); view.focus(); }
    });
    return el;
  }
  ignoreEvent(): boolean { return true; }
  get estimatedHeight(): number { return 44; }
}

class BlockWidget extends WidgetType {
  constructor(readonly kind: Kind, readonly source: string, readonly at: number, readonly beneath: boolean) { super(); }

  eq(other: BlockWidget): boolean {
    return other.kind === this.kind && other.source === this.source && other.at === this.at && other.beneath === this.beneath;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("div");
    el.className = `cm-lp-block cm-lp-${this.kind}${this.beneath ? " cm-lp-beneath" : ""}`;
    const inner = document.createElement("div");
    inner.className = "prose";
    el.append(inner);
    inner.innerHTML = render(this.source); // sanitised there
    if (!this.beneath) {
      el.title = "Click to edit";
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ selection: { anchor: this.at }, scrollIntoView: true });
        view.focus();
      });
    }
    return el;
  }

  ignoreEvent(): boolean { return true; }
  get estimatedHeight(): number { return this.kind === "maths" ? 60 : 120; }
}

// A diagram, drawn by Pele. Typing in its source redraws it in place rather than drawing it anew, so it doesn't
// flicker; one that can't be drawn shows Pele's error, over the last drawing while it is edited, and under its source
// away from it.
const drawings = new WeakMap<HTMLElement, { mounted: Promise<Mounted>; source: string }>();
class DiagramWidget extends WidgetType {
  constructor(readonly source: string, readonly at: number, readonly beneath: boolean) { super(); }
  eq(other: DiagramWidget): boolean { return other.source === this.source && other.at === this.at && other.beneath === this.beneath; }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("div");
    el.className = `cm-lp-block cm-lp-diagram${this.beneath ? " cm-lp-beneath" : ""}`;
    const src = document.createElement("pre");
    src.className = "cm-lp-diagram-src";
    src.textContent = this.source;
    const drawing = document.createElement("div");
    drawing.className = "diagram";
    el.append(src, drawing);
    drawings.set(el, { mounted: drawDiagram(drawing, this.source, () => el.classList.add("cm-lp-broken-diagram")), source: this.source });
    if (!this.beneath) {
      el.title = "Click to edit";
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ selection: { anchor: this.at }, scrollIntoView: true });
        view.focus();
      });
    }
    return el;
  }

  updateDOM(dom: HTMLElement): boolean {
    const drawn = drawings.get(dom);
    if (!drawn || !this.beneath || !dom.classList.contains("cm-lp-beneath")) return false;
    if (drawn.source !== this.source) {
      drawn.source = this.source;
      dom.classList.remove("cm-lp-broken-diagram");
      (dom.querySelector(".cm-lp-diagram-src") as HTMLElement).textContent = this.source;
      void drawn.mounted.then((m) => redrawDiagram(m, this.source));
    }
    return true;
  }

  ignoreEvent(): boolean { return true; }
  get estimatedHeight(): number { return 160; }
}

const isDiagram = (state: EditorState, info: { from: number; to: number } | null) =>
  info !== null && state.sliceDoc(info.from, info.to).trim().split(/\s/)[0]!.toLowerCase() === "mermaid";

function build(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  const tree = syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      let kind: Kind | null = null;
      let source = "";
      if (node.name === "BlockMath") { kind = "maths"; source = state.sliceDoc(node.from, node.to); }
      else if (node.name === "Table") { kind = "table"; source = state.sliceDoc(node.from, node.to); }
      else if (node.name === "FencedCode" && isDiagram(state, node.node.getChild("CodeInfo"))) {
        const code = node.node.getChild("CodeText"), source = code ? state.sliceDoc(code.from, code.to) : "";
        const from = state.doc.lineAt(node.from).from, to = state.doc.lineAt(node.to).to;
        const editing = sel.some((r) => r.to >= from && r.from <= to);
        if (!editing) decos.push(Decoration.replace({ widget: new DiagramWidget(source, node.from, false), block: true }).range(from, to));
        else if (source.trim()) decos.push(Decoration.widget({ widget: new DiagramWidget(source, node.from, true), block: true, side: 1 }).range(to));
        return false;
      }
      else if (node.name === "Document" || node.name === "Blockquote" || /List|ListItem/.test(node.name)) {
        return undefined; // blocks can sit inside these
      }
      if (!kind) return false;
      const from = state.doc.lineAt(node.from).from, to = state.doc.lineAt(node.to).to;
      const editing = sel.some((r) => r.to >= from && r.from <= to);
      if (!editing) {
        decos.push(Decoration.replace({ widget: new BlockWidget(kind, source, node.from, false), block: true }).range(from, to));
      } else if (kind !== "table" && source.trim()) {
        decos.push(Decoration.widget({ widget: new BlockWidget(kind, source, node.from, true), block: true, side: 1 }).range(to));
      }
      return false;
    },
  });
  // Embeds: a line of their own, outside code; drawn unless the cursor is on it.
  const lookup = state.facet(embeds);
  if (lookup) {
    let fenced = false;
    for (let n = 1; n <= state.doc.lines; n++) {
      const line = state.doc.line(n);
      if (/^\s*(```|~~~)/.test(line.text)) { fenced = !fenced; continue; }
      const m = fenced ? null : EMBED.exec(line.text);
      if (!m || sel.some((r) => r.to >= line.from && r.from <= line.to)) continue;
      const ref = m[1]!.trim();
      decos.push(Decoration.replace({ widget: new EmbedWidget(ref, lookup.find(ref), line.from), block: true }).range(line.from, line.to));
    }
  }
  return Decoration.set(decos, true);
}

export const renderedBlocks = StateField.define<DecorationSet>({
  create: build,
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return build(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const blocksTheme = EditorView.theme({
  // No space of its own: the empty lines around a block are the gap (livePreview.ts).
  ".cm-lp-block": { padding: "0", cursor: "text" },
  ".cm-lp-block .katex-display > .katex": { fontSize: "1.17em" },
  ".cm-lp-block .prose": { maxWidth: "none" },
  ".cm-lp-block .prose > :last-child, .cm-lp-block .table-wrap": { marginBottom: "0" },
  ".cm-lp-block .katex-display": { margin: "0" },
  // A diagram, in the boards' figure (app.css sets Pele's colours). Its source shows only when it can't be drawn.
  ".cm-lp-diagram .diagram": { overflowX: "auto", overflowY: "hidden" },
  ".cm-lp-diagram-src": { display: "none", margin: "0", font: "13px/20px var(--font-mono)", whiteSpace: "pre-wrap", color: "var(--text-soft)" },
  ".cm-lp-diagram.cm-lp-broken-diagram:not(.cm-lp-beneath) .cm-lp-diagram-src": { display: "block" },
  ".cm-lp-beneath": { borderLeft: "2px solid var(--line)", paddingLeft: "12px", marginTop: "4px", opacity: ".9" },
  ".cm-lp-block:not(.cm-lp-beneath):hover": { outline: "1px dashed var(--line)", outlineOffset: "2px" },
  // An embedded question (rose) or problem, as a callout (M12): green with a check once resolved or solved.
  ".cm-lp-embed": { display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", border: "1px solid var(--rose)", borderLeftWidth: "3px", background: "var(--rose-soft)", fontFamily: "var(--font-text)", fontSize: "16px", lineHeight: "1.45", cursor: "pointer" },
  ".cm-lp-embed svg": { flex: "none", fill: "none", stroke: "var(--rose)", strokeWidth: "1.4" },
  ".cm-lp-embed-problem": { borderColor: "var(--line-strong)", background: "var(--ground-1)" },
  ".cm-lp-embed-problem svg": { stroke: "var(--text-soft)" },
  ".cm-lp-embed-done": { borderColor: "var(--malachite)", background: "var(--malachite-soft)" },
  ".cm-lp-embed-done svg": { stroke: "var(--malachite)" },
  ".cm-lp-embed-broken": { borderStyle: "dashed", borderColor: "var(--line-strong)", background: "none", color: "var(--text-faint)" },
  ".cm-lp-embed-broken svg": { stroke: "var(--text-faint)" },
  ".cm-lp-embed:hover": { borderColor: "var(--text-soft)" },
});
