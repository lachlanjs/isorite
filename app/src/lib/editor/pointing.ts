// Pointing between the note and the Atlas (M17). A link to a note under the mouse is told to `onPoint`, so the
// Atlas can outline it; and the links to the note pointed at on the Atlas are marked here, set by `setPointedNote`.

import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { linkAt } from "./linkControl.ts";

/** What a link names, for pointing: a note, or a folder. */
export interface Pointed { id: string; folder: boolean }

/** The note or folder a link's address names (`/a/b.md`, `/a/b.md#Section`, `/a/`), or null for anything else. */
export function pointedOf(url: string): Pointed | null {
  const path = url.split("#")[0]!.split("?")[0]!;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.endsWith(".md")) return { id: decodeURIComponent(path.slice(1, -3)), folder: false };
  if (path.endsWith("/") && path.length > 1) return { id: decodeURIComponent(path.slice(1, -1)), folder: true };
  return null;
}

/** The note pointed at on the Atlas, whose links are marked; "" for none. */
export const setPointedNote = StateEffect.define<string>();

const marked = Decoration.mark({ class: "cm-pointed" });

function marksFor(state: EditorState, id: string): DecorationSet {
  if (!id) return Decoration.none;
  const out: ReturnType<typeof marked.range>[] = [];
  syntaxTree(state).iterate({ enter: (n) => {
    if (n.name !== "Link") return;
    const l = linkAt(state, n.from + 1);
    if (l && !l.embed && l.from === n.from && pointedOf(l.url)?.id === id) out.push(marked.range(l.from, l.to));
    return false;
  } });
  return Decoration.set(out);
}

const pointedField = StateField.define<{ id: string; marks: DecorationSet }>({
  create: () => ({ id: "", marks: Decoration.none }),
  update(v, tr) {
    let id = v.id;
    for (const e of tr.effects) if (e.is(setPointedNote)) id = e.value;
    return id !== v.id || (id && tr.docChanged) ? { id, marks: marksFor(tr.state, id) } : v;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.marks),
});

/** The words a pointer in the prompt is of, marked while it is pointed at (pointers): by line of what the editor shows. */
export const setPointedLines = StateEffect.define<{ from: number; to: number } | null>();
const range = Decoration.mark({ class: "cm-pointer-range" });
const rangeField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setPointedLines)) {
      const l = e.value, n = tr.state.doc.lines;
      if (!l || l.to < 1 || l.from > n) return Decoration.none;
      const a = tr.state.doc.line(Math.max(1, l.from)), b = tr.state.doc.line(Math.min(n, l.to));
      return b.to > a.from ? Decoration.set([range.range(a.from, b.to)]) : Decoration.none;
    }
    return tr.docChanged ? Decoration.none : v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Where a pointer pressed came from (pointers.open), by line of what the editor shows: lit, with a bloom as it comes,
 *  until the text is changed or the cursor is put somewhere. `changed`: its words are not in the note any more, so these
 *  are the lines they were on, and a line over them says so. */
export const setRevealed = StateEffect.define<{ from: number; to: number; changed: boolean } | null>();
class Changed extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-revealed-said";
    el.setAttribute("role", "status");
    el.textContent = "changed since it was pointed to";
    return el;
  }
}
const revealedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setRevealed)) {
      const l = e.value, n = tr.state.doc.lines;
      if (!l || l.to < 1 || l.from > n) return Decoration.none;
      const a = tr.state.doc.line(Math.max(1, l.from)), b = tr.state.doc.line(Math.min(n, l.to));
      const out: Range<Decoration>[] = [];
      if (l.changed) out.push(Decoration.widget({ widget: new Changed(), block: true, side: -1 }).range(a.from));
      if (b.to > a.from) out.push(Decoration.mark({ class: l.changed ? "cm-revealed cm-revealed-changed" : "cm-revealed" }).range(a.from, b.to));
      return Decoration.set(out);
    }
    if (tr.docChanged || tr.isUserEvent("select")) return Decoration.none;
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  ".cm-revealed": { backgroundColor: "color-mix(in srgb, var(--lattice) 18%, transparent)", boxShadow: "0 2px 0 color-mix(in srgb, var(--lattice) 60%, transparent)", borderRadius: "2px", animation: "cm-revealed var(--t-result) var(--ease-out)" },
  ".cm-revealed-changed": { backgroundColor: "color-mix(in srgb, var(--text-faint) 14%, transparent)", boxShadow: "0 1px 0 var(--text-faint)" },
  "@keyframes cm-revealed": { from: { backgroundColor: "color-mix(in srgb, var(--lattice) 42%, transparent)", boxShadow: "0 0 12px color-mix(in srgb, var(--lattice) 50%, transparent)" } },
  "@media (prefers-reduced-motion: reduce)": { ".cm-revealed": { animation: "none" } },
  ".cm-revealed-said": { font: "var(--fs-small) var(--font-ui)", color: "var(--text-faint)", padding: "2px 2px 0" },
  ".cm-pointed": { backgroundColor: "var(--lattice-soft)", boxShadow: "0 2px 0 var(--lattice)" },
  ".cm-pointer-range": { backgroundColor: "color-mix(in srgb, var(--lattice) 22%, transparent)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--lattice) 22%, transparent)", borderRadius: "2px" },
});

/** Both ways: `onPoint` hears the link under a mouse (null when it leaves one), and `setPointedNote` marks links. */
export function pointingLinks(onPoint?: (to: Pointed | null) => void): Extension {
  if (!onPoint) return [pointedField, rangeField, revealedField, theme];
  let last = "";
  const tell = (to: Pointed | null) => {
    const key = to ? `${to.folder ? "d" : "n"}:${to.id}` : "";
    if (key !== last) { last = key; onPoint(to); }
  };
  return [pointedField, rangeField, revealedField, theme, EditorView.domEventHandlers({
    pointermove(e, view) {
      if (e.pointerType !== "mouse") return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
      const l = pos === null ? null : linkAt(view.state, pos);
      tell(l && !l.embed ? pointedOf(l.url) : null);
      return false;
    },
    pointerleave() { tell(null); return false; },
  })];
}
