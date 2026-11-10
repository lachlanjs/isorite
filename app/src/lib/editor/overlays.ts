// What is laid over the note's text without being part of it: marks on stretches of the text (what the note's
// provenance lens shows, words an agent wrote and passages given to it) and the lines a moment of the timeline
// changed. The document, and so the file, never holds them.

import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/** A stretch of the text, by character, marked for whose it is: words an agent wrote, or a passage given to it. */
export interface Mark { from: number; to: number; kind: "by-agent" | "given" }

/** Lines (from 0) a moment of the timeline changed, marked whole, in lattice for yours and growth for the agent's. */
export interface Touched { lines: number[]; who: "you" | "agent" }
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
    ".cm-line.cm-touched-agent": { background: "var(--growth-soft)", boxShadow: "-10px 0 0 var(--growth-soft), -13px 0 0 var(--growth), 10px 0 0 var(--growth-soft)" },
  }),
];
export const setMarks = StateEffect.define<Mark[]>();

export function overlays(): Extension {
  const marks = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) {
        if (!e.is(setMarks)) continue;
        const len = tr.state.doc.length, out: Range<Decoration>[] = [];
        for (const m of e.value) {
          const from = Math.max(0, Math.min(len, m.from)), to = Math.max(0, Math.min(len, m.to));
          if (to > from) out.push(Decoration.mark({ class: `cm-agent-${m.kind}` }).range(from, to));
        }
        return Decoration.set(out, true);
      }
      return tr.docChanged ? value.map(tr.changes) : value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [marks, EditorView.theme({
    // The note's agent lens (M10): words the agent wrote, in soft gold; a passage given to the agent, a dashed gold underline.
    ".cm-agent-by-agent": { background: "var(--growth-soft)", boxShadow: "inset 0 -1.5px 0 var(--growth)" },
    ".cm-agent-given": { textDecoration: "underline dashed var(--growth)", textUnderlineOffset: "4px", textDecorationThickness: "1.5px" },
  })];
}
