<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source. Iso's blocks
  // are laid over it (overlays.ts) at the places the note's journal gives them.
  import { mount, onMount, unmount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText, type Where } from "$lib/editor/codemirror.ts";
  import { setMarks, setOverlays, setTouched, type Inline, type Mark, type Overlay, type Touched } from "$lib/editor/overlays.ts";
  import type { ExerciseState } from "$lib/exercise.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";
  import IsoBlock from "./IsoBlock.svelte";
  import IsoChange from "./IsoChange.svelte";
  import ExerciseTag from "./ExerciseTag.svelte";

  // Without `iso` (a note written for Iso) there is no prompt line and nothing is laid over the text.
  // With `exercise`, the question, the working's heading, the answer and Iso's marks are drawn over the text too.
  // `touched` is what a moment of the timeline changed, by line of the whole file, while it is pointed at.
  let { note, iso, exercise, source, placeholder, touched = null }: { note: NoteSession; iso?: NoteIso; exercise?: ExerciseState; source: boolean; placeholder?: string; touched?: Touched | null } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();

  // The source shows the whole file; the live preview shows the text under the frontmatter. Iso's places are of
  // the whole file, so they are moved by the frontmatter's lines and characters on the way in and out.
  const head = $derived(source || !iso ? { lines: 0, chars: 0 } : iso.head);

  /** What Iso has over the text, placed in what the editor shows. */
  const laid = $derived.by((): { blocks: Overlay[]; marks: Mark[]; inline: Inline[] } => {
    if (!iso) return { blocks: [], marks: [], inline: [] };
    const within = (kind: Mark["kind"]) => (s: { from: number; to: number }): Mark => ({ kind, from: s.from - head.chars, to: s.to - head.chars });
    const ex: Mark[] = [], tags: Inline[] = [];
    if (exercise?.is && !source) {
      const text = note.text;
      // The working's heading, and above it the question, from the end of the frontmatter.
      const h = /^##[ \t]+Working[ \t]*$/m.exec(text.slice(head.chars));
      const hFrom = h ? head.chars + h.index : text.length;
      const q = text.slice(head.chars, hFrom);
      const qFrom = head.chars + (q.length - q.trimStart().length), qTo = head.chars + q.trimEnd().length;
      if (qTo > qFrom) ex.push(within("question")({ from: qFrom, to: qTo }));
      if (h) {
        const end = hFrom + h[0].length;
        ex.push(within("working")({ from: text.indexOf("Working", hFrom), to: end }));
        tags.push({ key: "x:head", at: end - head.chars });
      }
      for (const [k, m] of exercise.marks.entries()) {
        ex.push(within(m.mark)(m));
        if (m.mark === "wrong") tags.push({ key: `x:wrong:${k}`, at: m.to - head.chars });
      }
      // Once a marking covers the answer, its mark is what shows (Mobile-Study); "your answer" still says which it is.
      const a = exercise.answerAt, covered = a && exercise.marks.some((m) => m.from <= a.from && a.to <= m.to);
      if (a && !covered) ex.push(within("answer")(a));
      if (a) tags.push({ key: "x:answer", at: a.to - head.chars });
    }
    return {
      blocks: iso.layout.blocks.map((b) => ({ key: b.key, line: Math.max(0, b.line - head.lines) })).sort((a, b) => a.line - b.line),
      marks: [...iso.layout.picked.map(within("picked")), ...iso.layout.old.map(within("old")), ...ex].filter((m) => m.to > 0),
      inline: [...iso.layout.inline.map((i) => ({ key: i.key, at: i.at - head.chars })), ...tags].filter((i) => i.at >= 0),
    };
  });

  onMount(() => {
    const made = createEditor(host, {
      doc: source ? note.text : note.body,
      source,
      label: source ? "The note's file" : "The note",
      notes: () => app.listing.notes.filter((n) => n.id !== note.id).map((n) => ({ id: n.id, title: n.title, folder: n.dir })),
      onChange: (text) => (source ? note.setText(text) : note.setBody(text)),
      onSave: () => { void note.save(); },
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      onFollow: (id) => { void goto(noteHref(id)); },
      ...(iso ? {
        // Ctrl+Enter goes to Iso's pane (M10), with the text selected, if any, given to Iso.
        onAsk: (w: Where) => {
          const chosen = note.text.slice(w.from + head.chars, w.to + head.chars).trim();
          if (chosen) tray.add({ kind: "passage", id: note.id, title: note.fields.title || note.id, text: chosen });
          panes.to("iso");
          requestAnimationFrame(() => document.getElementById("iso-box")?.focus());
        },
        onCursor: (w: Where) => { iso.cursor = { line: w.line + head.lines, from: w.from + head.chars, to: w.to + head.chars }; },
        // While the prompt asks for a rewrite, text selected in the note is chosen for it.
        picking: () => iso.picking,
        onPick: (ranges: { from: number; to: number }[]) => iso.pick(ranges.map((r) => ({ from: r.from + head.chars, to: r.to + head.chars }))),
        onUnpick: (at: number) => iso.unpick(at + head.chars),
        mountOverlay: (el: HTMLElement, key: string) => {
          // "x:…" is a label of the exercise's; "r:…" one change of a rewrite.
          if (key.startsWith("x:") && exercise) { const tag = mount(ExerciseTag, { target: el, props: { exercise, key } }); return () => { void unmount(tag); }; }
          const piece = mount(key.startsWith("r:") ? IsoChange : IsoBlock, { target: el, props: { iso, key } });
          return () => { void unmount(piece); };
        },
      } : { placeholder: untrack(() => placeholder) ?? "Write what you understand, what you do not, and what you want from Iso. [[ links a note it should rest on." }),
    });
    view = made;
    return () => made.destroy();
  });

  // The text was replaced from outside the editor (their version, a change made elsewhere, a proposal kept).
  $effect(() => {
    void note.revision;
    untrack(() => { if (view) setText(view, source ? note.text : note.body); });
  });

  // What a moment of the timeline changed, in the lines the editor shows.
  $effect(() => {
    const t = touched, lines = head.lines;
    if (view) view.dispatch({ effects: setTouched.of(t ? { who: t.who, lines: t.lines.map((l) => l - lines) } : null) });
  });

  // The blocks are placed again whenever the note or what Iso has in it changes.
  $effect(() => {
    const { blocks, marks, inline } = laid;
    if (view) view.dispatch({ effects: [setOverlays.of(blocks), setMarks.of({ marks, inline })] });
  });
</script>

<div class="editor" class:source bind:this={host}></div>

<style>
  .editor { min-height: 50vh; }
</style>
