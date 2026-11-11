// The note editor: CodeMirror 6 on the Markdown source, shown as a live
// preview (livePreview.ts) or as plain source. Carried over from rdstudio.
// Colours and fonts come from the style's variables, so both grounds apply.

import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { EditorState, Prec, RangeSet, StateEffect } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, drawSelection, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { codeHighlighter, languages } from "$lib/code.ts";
import { blocksTheme, embeds, renderedBlocks, type Embeds } from "./blocks.ts";
import { tables } from "./tables.ts";
import { endList, format, formatKeymap, type Format } from "./commands.ts";
import { linkAt, linkControl } from "./linkControl.ts";
import { linkCompletion, type LinkTarget, type NoteMaker, type PictureSource } from "./links.ts";
import { artifacts, livePreview, livePreviewTheme, codeBroken, pictures, type ArtifactAt, type PictureAt } from "./livePreview.ts";
import { mathsSyntax } from "./maths.ts";
import { fileOf, noteOf } from "./noteOf.ts";
import { overlays, touchedLines } from "./overlays.ts";
import { pointingLinks, type Pointed } from "./pointing.ts";

export type { Format, LinkTarget };

/** Where the main selection is: the line its head is on (from 0), and its ends by character (equal for a bare cursor). */
export interface Where { line: number; from: number; to: number }

export interface EditorOptions {
  doc: string;
  onChange: (text: string) => void;
  onSave: () => void;
  label: string;
  notes: () => LinkTarget[];
  /** Offers to make a note from a `[[` name that is no note's yet (M34), beside the note being written. */
  noteMaker?: NoteMaker;
  /** Plain Markdown, the whole file, instead of the live preview. */
  source?: boolean;
  placeholder?: string;
  /** A link to a note or a file was followed (Ctrl or Cmd and a click): the note's id, or the file's path. */
  onFollow?: (id: string) => void;
  /** A link to code was followed (Ctrl or Cmd and a click): the link, `code:path#anchor`, to be read in full (M34). */
  onCode?: (href: string) => void;
  /** The agent was asked for (Ctrl or Cmd and Enter): where the cursor or the selection is. */
  onAsk?: (where: Where) => void;
  /** Shown, not written in: a version of the note from its timeline. */
  readOnly?: boolean;
  /** What an embed (`[[!name]]`, M12) names, and how it opens: drawn as a callout in the live preview. */
  embeds?: Embeds;
  /** Whether a code link names a file no longer in the base's repository (M12). */
  codeBroken?: (href: string) => boolean;
  /** The picture an image's address names, drawn in place (M22). */
  pictures?: (href: string) => PictureAt | null;
  /** The artifact an address names, shown working in place (M23). */
  artifacts?: (href: string) => ArtifactAt | null;
  /** The notes' pictures, as `[[!` and `](` offer them (M22). */
  pictureSource?: PictureSource;
  /** Pictures pasted (`pasted`) or dropped at a place in the text (M22). */
  onPictures?: (files: File[], at: number, pasted: boolean) => void;
  /** The note or folder a link under the mouse names, and null once it leaves one (M17: lit on the Atlas). */
  onPoint?: (to: Pointed | null) => void;
}

// Plain source is set in the monospaced face; the live preview in the reading one.
const sourceTheme = EditorView.theme({ ".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "0.875rem", lineHeight: "1.6" } });

const theme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "1rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "visible" },
  ".cm-content": { padding: "12px 0 40vh", caretColor: "var(--lattice)", overflowWrap: "anywhere" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--lattice)", borderLeftWidth: "2px" },
  // The selection, clearly visible on both grounds. Dimmer when not focused.
  ".cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--lattice) 22%, transparent) !important" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--lattice) 40%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--text-faint)" },
  ".cm-tooltip-autocomplete": { background: "var(--ground-1)", border: "1px solid var(--line-strong)", fontFamily: "var(--font-ui)", fontSize: "0.8125rem" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-ui)", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "6px 10px !important", lineHeight: "1.3" },
  ".cm-picture-thumb": { width: "32px", height: "32px", objectFit: "cover", verticalAlign: "middle", marginRight: "8px", background: "var(--ground-2)" },
  ".cm-tooltip-autocomplete > ul > li:has(.cm-picture-thumb)": { padding: "3px 10px !important" },
  ".cm-picture-preview": { padding: "8px" },
  ".cm-picture-preview img": { display: "block", maxWidth: "240px", maxHeight: "240px" },
  ".cm-picture-size": { fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "4px" },
  ".cm-completionInfo": { background: "var(--ground-1)", border: "1px solid var(--line-strong)", padding: "0" },
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

function where(state: EditorState): Where {
  const r = state.selection.main;
  return { line: state.doc.lineAt(r.to).number - 1, from: r.from, to: r.to };
}

/** Pictures pasted or dropped are handed on rather than put in the text as it is (M22); anything else is as usual. */
function pictureDrops(on: (files: File[], at: number, pasted: boolean) => void) {
  const pictures = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
  return EditorView.domEventHandlers({
    paste(e, view) {
      const files = pictures(e.clipboardData?.files);
      if (!files.length) return false;
      e.preventDefault();
      on(files, view.state.selection.main.head, true);
      return true;
    },
    drop(e, view) {
      const files = pictures(e.dataTransfer?.files);
      if (!files.length) return false;
      e.preventDefault();
      on(files, view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head, false);
      return true;
    },
  });
}

export function createEditor(parent: HTMLElement, opts: EditorOptions): EditorView {
  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      // Typing keeps a few lines of room below the cursor (and above, going up): the line written is not pressed to
      // the pane's edge. CodeMirror keeps it for every scroller it is in, the Note pane's own included.
      EditorView.cursorScrollMargin.of({ x: 5, y: 80 }),
      // Lowest, so the glow is drawn inside the other marks (whose words are whose, a link) and never splits one.
      Prec.lowest(arrived), arrivedTheme,
      // Before Markdown's own Enter, which is set high.
      Prec.highest(keymap.of([{ key: "Enter", run: endList }])),
      markdown({ base: markdownLanguage, extensions: [mathsSyntax], completeHTMLTags: false, codeLanguages: languages }),
      syntaxHighlighting(highlight),
      syntaxHighlighting(codeHighlighter),
      theme,
      ...(opts.source ? [sourceTheme] : [livePreview, livePreviewTheme, renderedBlocks, blocksTheme, linkControl, ...(opts.embeds ? [embeds.of(opts.embeds)] : []), ...(opts.codeBroken ? [codeBroken.of(opts.codeBroken)] : []), ...(opts.pictures ? [pictures.of(opts.pictures)] : []), ...(opts.artifacts ? [artifacts.of(opts.artifacts)] : [])]),
      closeBrackets(),
      tables(),
      // Only brackets: closing quotes would get in the way of apostrophes in prose.
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "["] } }]),
      overlays(),
      touchedLines,
      pointingLinks(opts.onPoint),
      ...(opts.readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
      linkCompletion(opts.notes, opts.pictureSource ?? null, opts.noteMaker ?? null),
      ...(opts.onPictures && !opts.readOnly ? [pictureDrops(opts.onPictures)] : []),
      placeholder(opts.placeholder ?? "Write the note here. # for a heading, [[ to link to another note, [[! to show a picture, $x$ for maths."),
      EditorView.contentAttributes.of({ "aria-label": opts.label, spellcheck: "true", autocapitalize: "sentences", autocorrect: "on" }),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { opts.onSave(); return true; } },
        { key: "Mod-Enter", preventDefault: true, run: (view) => { opts.onAsk?.(where(view.state)); return Boolean(opts.onAsk); } },
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
          // A link to code (`code:path#anchor`) is not one the link control knows (it has no kind), so it is looked for here.
          const code = pos === null || link ? null : codeLinkAt(view.state, pos);
          if (code && opts.onCode) { event.preventDefault(); opts.onCode(code); return true; }
          // A note, or since M23 a file of the notes (an artifact, data, …), shown in place or linked.
          const id = !link ? null : link.embed ? fileOf(link.url) : noteOf(link.url) ?? fileOf(link.url);
          if (id === null) {
            if (!link || !opts.onCode || !/^(code|global):/.test(link.url.trim())) return false;
            event.preventDefault();
            opts.onCode(link.url.trim());
            return true;
          }
          event.preventDefault();
          opts.onFollow(id);
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) opts.onChange(u.state.doc.toString());
      }),
    ],
  });
  return new EditorView({ state, parent });
}

/** The address of the link to code (`code:…`), plain or an embed, that a position is in or at the end of. */
function codeLinkAt(state: EditorState, pos: number): string | null {
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    for (let n: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, side); n; n = n.parent) {
      if (n.name !== "Link" && n.name !== "Image") continue;
      const u = n.getChild("URL"), url = u ? state.sliceDoc(u.from, u.to).trim() : "";
      return /^(code|global):/.test(url) ? url : null;
    }
  }
  return null;
}

/** Take a text written elsewhere (an agent's edit, their version after a conflict, a version restored). Only what
 *  differs is replaced, between what the two have in common at the start and at the end: the cursor stays with the
 *  words it was in, the lines around are kept as they are (so the pane's scroll holds on to them, and the page does
 *  not move), and what came in is lit for a moment. Replaced whole, the cursor kept its offset into other words and
 *  every edit moved the page. */
export function setText(view: EditorView, text: string): void {
  const old = view.state.doc.toString();
  if (text === old) return;
  const n = Math.min(old.length, text.length);
  let a = 0;
  while (a < n && old.charCodeAt(a) === text.charCodeAt(a)) a++;
  let b = 0;
  while (b < n - a && old.charCodeAt(old.length - 1 - b) === text.charCodeAt(text.length - 1 - b)) b++;
  // Not between the halves of a character outside the BMP.
  if (a > 0 && /[\uD800-\uDBFF]/.test(old[a - 1]!)) a--;
  if (b > 0 && /[\uDC00-\uDFFF]/.test(old[old.length - b]!)) b--;
  const insert = text.slice(a, text.length - b);
  // The words at the top of what is in view stay where they are on the screen. CodeMirror holds them by the heights it
  // has measured, and a paragraph that came in above, never drawn, it can only guess at: it is put right once drawn.
  const scroller = scrollParent(view.dom), box = scroller?.getBoundingClientRect();
  const top = box ? view.posAtCoords({ x: view.contentDOM.getBoundingClientRect().left + 1, y: Math.max(box.top, view.contentDOM.getBoundingClientRect().top) + 2 }, false) : null;
  const was = top === null ? null : view.coordsAtPos(top, 1)?.top ?? null;
  const tr = view.state.update({ changes: { from: a, to: old.length - b, insert }, effects: insert.trim() ? arrive.of({ from: a, to: a + insert.length }) : [] });
  view.dispatch(tr);
  if (scroller && top !== null && was !== null && top >= a) {
    const at = tr.changes.mapPos(top, 1);
    requestAnimationFrame(() => { const now = view.coordsAtPos(at, 1)?.top; if (now !== undefined && Math.abs(now - was) >= 1) scroller.scrollTop += now - was; });
  }
}
/** The nearest element above `el` that scrolls up and down. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let e = el.parentElement; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e;
  return null;
}

// What came in from elsewhere glows in the agent's gold and fades (--t-result twice over). The fade is set back by the
// time gone whenever the line is drawn again, so a redraw (the cursor arriving, say) does not start it over.
const ARRIVE_MS = 1200;
const arrive = StateEffect.define<{ from: number; to: number }>();
const arrived = ViewPlugin.fromClass(class {
  ranges: { from: number; to: number }[] = [];
  t0 = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  decorations: DecorationSet = Decoration.none;
  constructor(readonly view: EditorView) {}
  update(u: ViewUpdate): void {
    if (u.docChanged) this.ranges = this.ranges.map((r) => ({ from: u.changes.mapPos(r.from, 1), to: u.changes.mapPos(r.to, -1) })).filter((r) => r.to > r.from);
    for (const tr of u.transactions) for (const e of tr.effects) if (e.is(arrive)) {
      this.ranges = [e.value];
      this.t0 = performance.now();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.ranges = []; this.view.dispatch({}); }, ARRIVE_MS);
    }
    const gone = Math.round(performance.now() - this.t0);
    this.decorations = this.ranges.length ? RangeSet.of(this.ranges.map((r) => Decoration.mark({ class: "cm-arrived", attributes: { style: `animation-delay: -${gone}ms` } }).range(r.from, r.to)), true) : Decoration.none;
  }
  destroy(): void { clearTimeout(this.timer); }
}, { decorations: (p) => p.decorations });
const arrivedTheme = EditorView.theme({
  ".cm-arrived": { animation: `cm-arrived ${ARRIVE_MS}ms cubic-bezier(.2, .7, .2, 1) forwards`, borderRadius: "2px" },
  "@keyframes cm-arrived": { from: { backgroundColor: "color-mix(in srgb, var(--growth) 34%, transparent)", boxShadow: "0 0 10px color-mix(in srgb, var(--growth) 30%, transparent)" }, to: { backgroundColor: "transparent", boxShadow: "0 0 0 transparent" } },
  "@media (prefers-reduced-motion: reduce)": { ".cm-arrived": { animation: "none" } },
});
