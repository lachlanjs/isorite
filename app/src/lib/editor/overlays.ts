// Blocks laid over the note that are not part of its text: Iso's unkept text,
// its reply as it arrives, and the line a prompt is written on. Each sits
// before a line of the document (or after its last) as a block widget. The
// document, and so the file, never holds them. What a block shows is drawn by
// whoever sets them (a Svelte component mounted into the widget), so a block
// whose key has not changed keeps its DOM while its content changes.

import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export interface Overlay {
  /** Stays the same for as long as the block is the same thing. */
  key: string;
  /** The line (from 0) it sits before; the number of lines puts it after the last. */
  line: number;
}

/** Draws a block into `el`; what it returns takes it down again. */
export type Mount = (el: HTMLElement, key: string) => () => void;

export const setOverlays = StateEffect.define<Overlay[]>();

/** Lines of the note marked for what Iso is doing with them: chosen for a rewrite, or to be replaced by one. */
export interface LineMark { from: number; to: number; kind: "picked" | "old" }
export const setLineMarks = StateEffect.define<LineMark[]>();

class OverlayWidget extends WidgetType {
  private down: (() => void) | null = null;
  constructor(readonly key: string, readonly mount: Mount) { super(); }
  eq(other: OverlayWidget): boolean { return other.key === this.key; }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-overlay";
    el.contentEditable = "false";
    this.down = this.mount(el, this.key);
    return el;
  }
  destroy(): void { this.down?.(); this.down = null; }
  // What happens inside (typing a prompt, pressing keep) is the block's own business, not the editor's.
  ignoreEvent(): boolean { return true; }
  get estimatedHeight(): number { return 120; }
}

export function overlays(mount: Mount): Extension {
  const build = (list: Overlay[], doc: EditorView["state"]["doc"]): DecorationSet =>
    Decoration.set(list.map((o) => {
      const after = o.line >= doc.lines;
      const pos = after ? doc.length : doc.line(Math.max(1, o.line + 1)).from;
      return Decoration.widget({ widget: new OverlayWidget(o.key, mount), block: true, side: after ? 1 : -1 }).range(pos);
    }), true);
  const field = StateField.define<{ list: Overlay[]; decos: DecorationSet }>({
    create: () => ({ list: [], decos: Decoration.none }),
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setOverlays)) return { list: e.value, decos: build(e.value, tr.state.doc) };
      // Until the places are worked out again from the new text, the blocks ride along with the lines they were on.
      return tr.docChanged ? { list: value.list, decos: value.decos.map(tr.changes) } : value;
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
  });
  const marks = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) {
        if (!e.is(setLineMarks)) continue;
        const doc = tr.state.doc, out = [];
        for (const m of e.value) for (let n = Math.max(1, m.from + 1); n <= Math.min(doc.lines, m.to); n++) out.push(Decoration.line({ class: `cm-iso-${m.kind}` }).range(doc.line(n).from));
        return Decoration.set(out, true);
      }
      return tr.docChanged ? value.map(tr.changes) : value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [field, marks, EditorView.theme({
    ".cm-overlay": { cursor: "default", userSelect: "text" },
    // Chosen for Iso to rewrite: yours, so lattice. To be replaced if the rewrite is kept: struck, as on the boards.
    ".cm-iso-picked": { background: "var(--lattice-soft)", boxShadow: "-10px 0 0 var(--lattice-soft), -13px 0 0 var(--lattice), 10px 0 0 var(--lattice-soft)" },
    ".cm-iso-old": { textDecoration: "line-through", color: "var(--text-faint)" },
    ".cm-iso-old *": { color: "var(--text-faint) !important" },
  })];
}
