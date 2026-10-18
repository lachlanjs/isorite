// What Iso lays over the note, none of it part of the note's text:
//
// - blocks before a line (its unkept text, its reply as it arrives, the line
//   a prompt is written on);
// - marks on stretches of the text (passages chosen for a rewrite; passages a
//   rewrite would replace, struck through);
// - small pieces set in the line after a stretch (what a passage would become,
//   with its own keep and remove).
//
// The document, and so the file, never holds them. What a block or a piece
// shows is drawn by whoever sets them (a Svelte component mounted into the
// widget), so one whose key has not changed keeps its DOM while its content
// changes.

import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export interface Overlay {
  /** Stays the same for as long as the block is the same thing. */
  key: string;
  /** The line (from 0) it sits before; the number of lines puts it after the last. */
  line: number;
}
/** A stretch of the text, by character, marked for what Iso is doing with it; in an exercise, also its question,
 *  the working's heading, the answer, and Iso's marks. */
export interface Mark { from: number; to: number; kind: "picked" | "old" | "question" | "working" | "answer" | "right" | "wrong" }
/** A piece set in the line at a character. */
export interface Inline { key: string; at: number }

/** Draws into `el`; what it returns takes it down again. */
export type Mount = (el: HTMLElement, key: string) => () => void;

export const setOverlays = StateEffect.define<Overlay[]>();
/** Lines (from 0) a moment of the timeline changed, marked whole, in lattice for yours and growth for Iso's. */
export interface Touched { lines: number[]; who: "you" | "iso" }
export const setTouched = StateEffect.define<Touched | null>();

/** The lines a moment changed, as the timeline points at it (Desktop-Editor): a soft ground and a bar at the left. */
export const touchedLines: Extension = [
  StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) {
        if (!e.is(setTouched)) continue;
        const doc = tr.state.doc, t = e.value;
        if (!t) return Decoration.none;
        const cls = Decoration.line({ class: `cm-touched cm-touched-${t.who}` });
        return Decoration.set([...new Set(t.lines)].filter((l) => l >= 0 && l < doc.lines && doc.line(l + 1).text.trim() !== "").sort((a, b) => a - b).map((l) => cls.range(doc.line(l + 1).from)));
      }
      return tr.docChanged ? value.map(tr.changes) : value;
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  EditorView.theme({
    ".cm-line.cm-touched-you": { background: "var(--lattice-soft)", boxShadow: "-10px 0 0 var(--lattice-soft), -13px 0 0 var(--lattice), 10px 0 0 var(--lattice-soft)" },
    ".cm-line.cm-touched-iso": { background: "var(--growth-soft)", boxShadow: "-10px 0 0 var(--growth-soft), -13px 0 0 var(--growth), 10px 0 0 var(--growth-soft)" },
  }),
];
export const setMarks = StateEffect.define<{ marks: Mark[]; inline: Inline[] }>();

class Mounted extends WidgetType {
  private down: (() => void) | null = null;
  private watch: ResizeObserver | null = null;
  constructor(readonly key: string, readonly mount: Mount, readonly block: boolean) { super(); }
  eq(other: Mounted): boolean { return other.key === this.key && other.block === this.block; }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement(this.block ? "div" : "span");
    el.className = this.block ? "cm-overlay" : "cm-iso-change";
    el.contentEditable = "false";
    this.down = this.mount(el, this.key);
    // What is drawn inside changes size on its own (a reply arriving, a row added): the editor must be told, or
    // it goes on believing the old height and puts a click below the block on the wrong line.
    this.watch = new ResizeObserver(() => view.requestMeasure());
    this.watch.observe(el);
    return el;
  }
  destroy(): void { this.watch?.disconnect(); this.watch = null; this.down?.(); this.down = null; }
  // What happens inside (typing a prompt, pressing keep) is the piece's own business, not the editor's.
  ignoreEvent(): boolean { return true; }
  get estimatedHeight(): number { return this.block ? 120 : -1; }
}

export function overlays(mount: Mount): Extension {
  const blocks = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) {
        if (!e.is(setOverlays)) continue;
        const doc = tr.state.doc;
        return Decoration.set(e.value.map((o) => {
          const after = o.line >= doc.lines;
          const pos = after ? doc.length : doc.line(Math.max(1, o.line + 1)).from;
          return Decoration.widget({ widget: new Mounted(o.key, mount, true), block: true, side: after ? 1 : -1 }).range(pos);
        }), true);
      }
      // Until the places are worked out again from the new text, the blocks ride along with the lines they were on.
      return tr.docChanged ? value.map(tr.changes) : value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  const marks = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) {
        if (!e.is(setMarks)) continue;
        const len = tr.state.doc.length, out: Range<Decoration>[] = [];
        for (const m of e.value.marks) {
          const from = Math.max(0, Math.min(len, m.from)), to = Math.max(0, Math.min(len, m.to));
          if (to > from) out.push(Decoration.mark({ class: `cm-iso-${m.kind}` }).range(from, to));
        }
        for (const i of e.value.inline) out.push(Decoration.widget({ widget: new Mounted(i.key, mount, false), side: 1 }).range(Math.max(0, Math.min(len, i.at))));
        return Decoration.set(out, true);
      }
      return tr.docChanged ? value.map(tr.changes) : value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [blocks, marks, EditorView.theme({
    // The space round a block is padding, inside what the editor measures. A margin on what is drawn inside would
    // fall outside it, and every click below the block would land a line off.
    // The editor keeps every space and line break of its text (white-space: break-spaces). What is drawn in a block is
    // not the note's text: left to inherit that, the line break after each paragraph of Iso's showed as an empty line.
    ".cm-overlay": { cursor: "default", userSelect: "text", padding: "10px 0", display: "flow-root", whiteSpace: "normal" },
    // Chosen for Iso to rewrite: yours, so lattice. To be replaced if the change is kept: struck, as on the boards.
    ".cm-iso-picked": { background: "var(--lattice-soft)", boxShadow: "inset 0 -2px 0 var(--lattice)", cursor: "pointer" },
    ".cm-iso-old": { textDecoration: "line-through", textDecorationColor: "var(--text-faint)", color: "var(--text-faint)" },
    ".cm-iso-old *": { color: "var(--text-faint) !important" },
    ".cm-iso-change": { cursor: "default" },
    // An exercise (Study-Written, Mobile-Study): the question in the reading face at 23 px; the working's heading as
    // its label; the answer in soft lattice, yours; Iso's right in a double malachite line, its wrong in rose.
    ".cm-iso-question": { fontFamily: "var(--font-text)", fontSize: "23px", lineHeight: "1.4" },
    // On a phone, the reading face's size, as the working is (Mobile-Study).
    "@media (max-width: 600px)": { ".cm-iso-question": { fontSize: "18px", lineHeight: "1.55" } },
    ".cm-line:has(.cm-iso-working)": { paddingTop: "12px" },
    ".cm-iso-working": { fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: "400", color: "var(--text-faint)", textTransform: "lowercase", letterSpacing: "0" },
    ".cm-iso-working::before": { content: "'your '" },
    ".cm-iso-working *": { fontSize: "12px !important", color: "var(--text-faint) !important", fontWeight: "400 !important" },
    ".cm-iso-answer": { background: "var(--lattice-soft)", boxShadow: "0 0 0 4px var(--lattice-soft)", borderBottom: "2px solid var(--lattice)" },
    ".cm-iso-right": { borderBottom: "3px double var(--malachite)" },
    ".cm-iso-wrong": { borderBottom: "2px solid var(--rose)" },
  })];
}
