// The note editor: CodeMirror 6 on the Markdown source, shown as a live
// preview (livePreview.ts) or as plain source. Carried over from rdstudio.
// Colours and fonts come from the style's variables, so both grounds apply.

import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { blocksTheme, renderedBlocks } from "./blocks.ts";
import { format, formatKeymap, type Format } from "./commands.ts";
import { linkAt, linkControl } from "./linkControl.ts";
import { linkCompletion, type LinkTarget } from "./links.ts";
import { livePreview, livePreviewTheme } from "./livePreview.ts";
import { mathsSyntax } from "./maths.ts";
import { noteOf } from "./noteOf.ts";
import { overlays, type Mount } from "./overlays.ts";

export type { Format, LinkTarget };

export interface EditorOptions {
  doc: string;
  onChange: (text: string) => void;
  onSave: () => void;
  label: string;
  notes: () => LinkTarget[];
  /** Plain Markdown, the whole file, instead of the live preview. */
  source?: boolean;
  placeholder?: string;
  /** A link to a note was followed (Ctrl or Cmd and a click): its id. */
  onFollow?: (id: string) => void;
  /** Iso was asked for (Ctrl or Cmd and Enter): the line the cursor is on, from 0. */
  onAsk?: (line: number) => void;
  /** The cursor moved: the line it is on, from 0. */
  onCursor?: (line: number) => void;
  /** Draws a block laid over the text (overlays.ts). */
  mountOverlay?: Mount;
}

// Plain source is set in the monospaced face; the live preview in the reading one.
const sourceTheme = EditorView.theme({ ".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "14px", lineHeight: "1.6" } });

const theme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "visible" },
  ".cm-content": { padding: "12px 0 40vh", caretColor: "var(--lattice)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--lattice)", borderLeftWidth: "2px" },
  // The selection, clearly visible on both grounds. Dimmer when not focused.
  ".cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--lattice) 22%, transparent) !important" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--lattice) 40%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--text-faint)" },
  ".cm-tooltip-autocomplete": { background: "var(--ground-1)", border: "1px solid var(--line-strong)", fontFamily: "var(--font-ui)", fontSize: "13px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-ui)", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "6px 10px !important", lineHeight: "1.3" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "var(--lattice-soft)", color: "var(--text)" },
  ".cm-completionDetail": { color: "var(--text-faint)", fontStyle: "normal", marginLeft: "10px" },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700", color: "var(--text)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--lattice)" },
  { tag: [tags.processingInstruction, tags.punctuation, tags.contentSeparator], color: "var(--text-faint)" },
  { tag: tags.monospace, color: "var(--text-soft)" },
  { tag: tags.quote, color: "var(--text-soft)", fontStyle: "italic" },
]);

export function createEditor(parent: HTMLElement, opts: EditorOptions): EditorView {
  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, extensions: [mathsSyntax], completeHTMLTags: false }),
      syntaxHighlighting(highlight),
      theme,
      ...(opts.source ? [sourceTheme] : [livePreview, livePreviewTheme, renderedBlocks, blocksTheme, linkControl]),
      closeBrackets(),
      // Only brackets: closing quotes would get in the way of apostrophes in prose.
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "["] } }]),
      ...(opts.mountOverlay ? [overlays(opts.mountOverlay)] : []),
      linkCompletion(opts.notes),
      placeholder(opts.placeholder ?? "Write the note here. # for a heading, [[ to link to another note, $x$ for maths."),
      EditorView.contentAttributes.of({ "aria-label": opts.label, spellcheck: "true", autocapitalize: "sentences", autocorrect: "on" }),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { opts.onSave(); return true; } },
        { key: "Mod-Enter", preventDefault: true, run: (view) => { opts.onAsk?.(view.state.doc.lineAt(view.state.selection.main.head).number - 1); return Boolean(opts.onAsk); } },
        ...formatKeymap,
        ...closeBracketsKeymap,
        ...completionKeymap,
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.domEventHandlers({
        mousedown(event, view) {
          if (!opts.onFollow || !(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
          const link = pos === null ? null : linkAt(view.state, pos);
          const id = link && !link.embed ? noteOf(link.url) : null;
          if (id === null) return false;
          event.preventDefault();
          opts.onFollow(id);
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) opts.onChange(u.state.doc.toString());
        if (opts.onCursor && (u.selectionSet || u.docChanged)) opts.onCursor(u.state.doc.lineAt(u.state.selection.main.head).number - 1);
      }),
    ],
  });
  return new EditorView({ state, parent });
}

/** Bold, a heading, a link…; the editor keeps the focus. */
export function applyFormat(view: EditorView, what: Format): void {
  format(view, what);
  view.focus();
}

/** Replace the whole text (their version after a conflict, a note changed elsewhere), keeping the cursor where it can. */
export function setText(view: EditorView, text: string): void {
  if (text === view.state.doc.toString()) return;
  const at = Math.min(view.state.selection.main.head, text.length);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: at } });
}
