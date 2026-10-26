// Pointing between the note and the Atlas (M17). A link to a note under the mouse is told to `onPoint`, so the
// Atlas can outline it; and the links to the note pointed at on the Atlas are marked here, set by `setPointedNote`.

import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
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

const theme = EditorView.theme({
  ".cm-pointed": { backgroundColor: "var(--lattice-soft)", boxShadow: "0 2px 0 var(--lattice)" },
});

/** Both ways: `onPoint` hears the link under a mouse (null when it leaves one), and `setPointedNote` marks links. */
export function pointingLinks(onPoint?: (to: Pointed | null) => void): Extension {
  if (!onPoint) return [pointedField, theme];
  let last = "";
  const tell = (to: Pointed | null) => {
    const key = to ? `${to.folder ? "d" : "n"}:${to.id}` : "";
    if (key !== last) { last = key; onPoint(to); }
  };
  return [pointedField, theme, EditorView.domEventHandlers({
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
