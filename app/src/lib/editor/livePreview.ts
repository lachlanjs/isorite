// Live preview: the Markdown looks like the note while it is written. Headings
// are set large, emphasis and links render, and the markup (#, **, [..](..))
// is hidden except on the lines being edited, where it shows so it can be
// changed. Only decorations: the text, and so the file, is never altered.

import { syntaxTree } from "@codemirror/language";
import { Facet, RangeSetBuilder, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import katex from "katex";
import { formula } from "./maths.ts";

class BulletWidget extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-bullet";
    span.textContent = "•";
    return span;
  }
}

class RuleWidget extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-hr";
    return span;
  }
}

// The language a code block is written in, at its top right.
class LangWidget extends WidgetType {
  constructor(readonly name: string) { super(); }
  eq(other: LangWidget): boolean { return other.name === this.name; }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-lang";
    span.textContent = this.name;
    return span;
  }
}

// Inline maths, set by KaTeX as on the note page.
class MathsWidget extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(other: MathsWidget): boolean { return other.source === this.source; }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-imaths";
    const { tex, display } = formula(this.source);
    span.innerHTML = katex.renderToString(tex, { displayMode: display, throwOnError: false });
    return span;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });

/** Lines the cursor or a selection touches, while the editor has focus: their markup shows. */
function activeLines(state: EditorState, focused: boolean): Set<number> {
  const out = new Set<number>();
  if (!focused) return out;
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(state, view.hasFocus);
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const decos: Range<Decoration>[] = [];
  const lineClass = (from: number, to: number, cls: string) => {
    for (let n = state.doc.lineAt(from).number, last = state.doc.lineAt(to).number; n <= last; n++) {
      decos.push(line(cls).range(state.doc.line(n).from));
    }
  };

  // One pass over everything visible (separate ranges would visit shared nodes twice).
  const ranges = view.visibleRanges;
  if (ranges.length) {
    const from = ranges[0]!.from, to = ranges[ranges.length - 1]!.to;
    // An empty line is the space between two blocks, not a line of text: it is set as a gap, so paragraphs,
    // equations and tables stand one gap apart, as on the boards. (Inside a code block it is a line of code.)
    // As in the note when it is read, a run of empty lines is one gap: those after the first are all but closed,
    // and the gaps beside a rule are half ones, the rule being a break already. The line the cursor is on is
    // always left open, so there is somewhere to type.
    const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;
    const first = state.doc.lineAt(from).number, last = state.doc.lineAt(to).number;
    const text = (n: number) => (n >= 1 && n <= state.doc.lines ? state.doc.line(n).text : "");
    for (let n = first; n <= last; n++) {
      const l = state.doc.line(n);
      if (l.length !== 0 || /Code|Math|HTML|Comment/.test(syntaxTree(state).resolveInner(l.from, 1).name)) continue;
      const more = n > 1 && state.doc.line(n - 1).length === 0 && !active.has(n);
      const byRule = RULE.test(text(n - 1)) || RULE.test(text(n + 1));
      decos.push(line(more ? "cm-lp-gap cm-lp-gap-more" : byRule ? "cm-lp-gap cm-lp-gap-rule" : "cm-lp-gap").range(l.from));
    }
    syntaxTree(state).iterate({
      from, to,
      enter: (node) => {
        const name = node.name;
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          lineClass(node.from, node.to, `cm-lp-h${heading[1]}`);
          return;
        }
        switch (name) {
          case "HeaderMark": {
            if (isActive(node.from)) break;
            const parent = node.node.parent?.name ?? "";
            if (parent.startsWith("SetextHeading")) { decos.push(hide.range(state.doc.lineAt(node.from).from, node.to)); break; }
            // "# " at the start (and closing #s): hide with the space after.
            const end = state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            if (end > node.from) decos.push(hide.range(node.from, end));
            break;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!isActive(node.from)) decos.push(hide.range(node.from, node.to));
            break;
          case "Emphasis": decos.push(mark("cm-lp-em").range(node.from, node.to)); break;
          case "StrongEmphasis": decos.push(mark("cm-lp-strong").range(node.from, node.to)); break;
          case "Strikethrough": decos.push(mark("cm-lp-strike").range(node.from, node.to)); break;
          case "InlineCode": {
            decos.push(mark("cm-lp-code").range(node.from, node.to));
            if (!isActive(node.from)) {
              const n = node.node;
              for (let c = n.firstChild; c; c = c.nextSibling) if (c.name === "CodeMark") decos.push(hide.range(c.from, c.to));
            }
            return false;
          }
          case "InlineMath":
            if (isActive(node.from)) decos.push(mark("cm-lp-mathsrc").range(node.from, node.to));
            else decos.push(Decoration.replace({ widget: new MathsWidget(state.sliceDoc(node.from, node.to)) }).range(node.from, node.to));
            return false;
          case "BlockMath":
          case "Table":
            // Drawn by blocks.ts away from the cursor; its source, when editing it.
            lineClass(node.from, node.to, "cm-lp-codeblock");
            return false;
          case "Link": {
            // [text](url "title"): the text as a link; the rest hidden off the editing line.
            const n = node.node;
            const marks = [];
            let url = false;
            for (let c = n.firstChild; c; c = c.nextSibling) {
              if (c.name === "LinkMark") marks.push(c);
              if (c.name === "URL") url = true;
            }
            const open = marks[0], close = marks[1];
            // Out of the base (M12): to the web, or to code in its repository, which may be gone.
            const u = n.getChild("URL"), href = u ? state.sliceDoc(u.from, u.to) : "";
            const code = href.startsWith("code:"), web = /^https?:/i.test(href);
            const cls = code ? (state.facet(codeBroken)(href) ? "cm-lp-link cm-lp-codelink cm-lp-broken" : "cm-lp-link cm-lp-codelink") : web ? "cm-lp-link cm-lp-weblink" : "cm-lp-link";
            if (open && close && close.from > open.to) decos.push((code ? Decoration.mark({ class: cls, attributes: { title: state.facet(codeBroken)(href) ? `${href.slice(5)}: not in the repository` : href.slice(5) } }) : mark(cls)).range(open.to, close.from));
            if (!isActive(node.from) && url && open && close) {
              decos.push(hide.range(open.from, open.to));
              decos.push(hide.range(close.from, node.to));
            }
            break; // on into the text, for emphasis or code inside it
          }
          case "ListMark": {
            const text = state.sliceDoc(node.from, node.to);
            if (!isActive(node.from) && /^[-*+]$/.test(text)) decos.push(bullet.range(node.from, node.to));
            else decos.push(mark("cm-lp-listmark").range(node.from, node.to));
            break;
          }
          case "TaskMarker": decos.push(mark("cm-lp-task").range(node.from, node.to)); break;
          case "Blockquote": lineClass(node.from, node.to, "cm-lp-quote"); break;
          case "QuoteMark":
            if (!isActive(node.from)) {
              const end = state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              decos.push(hide.range(node.from, end));
            }
            break;
          case "HorizontalRule":
            if (!isActive(node.from)) { decos.push(rule.range(node.from, node.to)); lineClass(node.from, node.to, "cm-lp-ruleline"); }
            break;
          case "FencedCode": {
            // As on the boards: the fences hidden off their lines, leaving the block's padding, and the language's
            // name at the top right. Its code is coloured by the language (code.ts).
            lineClass(node.from, node.to, "cm-lp-codeblock");
            const n = node.node, first = state.doc.lineAt(node.from), last = state.doc.lineAt(node.to);
            const info = n.getChild("CodeInfo"), close = n.lastChild?.name === "CodeMark" && n.lastChild.from >= last.from ? n.lastChild : null;
            if (!isActive(first.from)) {
              decos.push(line("cm-lp-fence").range(first.from));
              const name = info ? state.sliceDoc(info.from, info.to).trim().split(/\s/)[0]! : "";
              decos.push((name ? Decoration.replace({ widget: new LangWidget(name) }) : hide).range(first.from, first.to));
            }
            if (close && last.number > first.number && !isActive(last.from)) {
              decos.push(line("cm-lp-fence").range(last.from));
              if (last.to > last.from) decos.push(hide.range(last.from, last.to));
            }
            return false;
          }
          case "CodeBlock":
            lineClass(node.from, node.to, "cm-lp-codeblock");
            return false;
          case "HTMLBlock":
          case "CommentBlock":
            lineClass(node.from, node.to, "cm-lp-codeblock");
            return false;
        }
        return undefined;
      },
    });
  }
  // Line decorations must come before others at the same position.
  decos.sort((a, b) => a.from - b.from || (a.value.startSide - b.value.startSide));
  const builder = new RangeSetBuilder<Decoration>();
  for (const d of decos) builder.add(d.from, d.to, d.value);
  return builder.finish();
}

/** Whether a code link (`code:path#L1`, M12) names a file no longer in the base's repository. */
export const codeBroken = Facet.define<(href: string) => boolean, (href: string) => boolean>({ combine: (all) => all[0] ?? (() => false) });

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** How live preview looks: the note's own reading type, from the theme's variables.
 *  Backgrounds are translucent so a selection (drawn beneath the text) shows through. */
export const livePreviewTheme = EditorView.theme({
  ".cm-scroller": { fontFamily: "var(--font-text)", fontSize: "var(--text-size)", lineHeight: "1.55" },
  ".cm-lp-gap": { lineHeight: "20px" },
  ".cm-lp-gap-rule": { lineHeight: "10px" },
  ".cm-lp-gap-more": { lineHeight: "4px" },
  ".cm-lp-ruleline": { lineHeight: "12px" },
  ".cm-content": { fontVariationSettings: '"opsz" 18' },
  ".cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6": {
    fontWeight: "600", lineHeight: "1.3", fontVariationSettings: '"opsz" 36', paddingTop: ".5em !important",
  },
  ".cm-lp-h1": { fontSize: "26px" },
  ".cm-lp-h2": { fontSize: "22px" },
  ".cm-lp-h3": { fontSize: "19px" },
  ".cm-lp-h4": { fontSize: "17px", fontWeight: "700" },
  ".cm-lp-em": { fontStyle: "italic" },
  ".cm-lp-strong": { fontWeight: "700" },
  ".cm-lp-strike": { textDecoration: "line-through" },
  ".cm-lp-code": { fontFamily: "var(--font-mono)", fontSize: ".86em", background: "color-mix(in srgb, var(--text) 8%, transparent)", padding: ".1em .2em" },
  ".cm-lp-link": { color: "var(--lattice)", textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-lp-weblink": { textDecorationStyle: "dotted" },
  ".cm-lp-codelink": { fontFamily: "var(--font-mono)", fontSize: ".86em", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--lattice) 50%, transparent)" },
  ".cm-lp-broken": { color: "var(--rose)", textDecoration: "line-through", borderBottomColor: "transparent" },
  ".cm-lp-bullet": { color: "var(--text-faint)", display: "inline-block", minWidth: "1ch" },
  ".cm-lp-listmark, .cm-lp-task": { color: "var(--text-faint)", fontFamily: "var(--font-mono)" },
  ".cm-lp-quote": { borderLeft: "3px solid var(--lattice)", paddingLeft: "14px !important", color: "var(--text-soft)" },
  // A code block as on the boards: the interface's face on a raised ground, one line down its left side. The ground
  // is translucent, because the selection is drawn beneath the text and an opaque one would hide it.
  ".cm-lp-codeblock": { fontFamily: "var(--font-mono)", fontSize: "13px", lineHeight: "20px", background: "color-mix(in srgb, var(--line) 38%, transparent)", borderLeft: "2px solid var(--line-strong)", padding: "0 16px !important" },
  // The hidden fences are the block's padding, 12px above and below, as on the boards.
  ".cm-lp-codeblock.cm-lp-fence": { lineHeight: "12px", position: "relative" },
  ".cm-lp-lang": { position: "absolute", top: "8px", right: "12px", fontFamily: "var(--font-ui)", fontSize: "12px", lineHeight: "16px", color: "var(--text-faint)", pointerEvents: "none" },
  ".cm-lp-mathsrc": { fontFamily: "var(--font-mono)", fontSize: ".86em", color: "var(--text-soft)" },
  ".cm-lp-imaths .katex": { fontSize: "1.05em" },
  // A displayed equation written on a line of its own inside a paragraph ($$…$$ with no empty line round it) is
  // drawn in the line. KaTeX gives it a margin of a whole line above and below, which with the line's own height
  // left a hole in the text.
  ".cm-lp-imaths .katex-display": { margin: "0", padding: "6px 0" },
  ".cm-lp-imaths .katex-display > .katex": { fontSize: "1.17em" },
  ".cm-lp-hr": { display: "inline-block", width: "100%", borderTop: "1px solid var(--line)", verticalAlign: "middle" },
});
