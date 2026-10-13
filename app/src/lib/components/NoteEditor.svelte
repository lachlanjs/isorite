<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source. Iso's blocks
  // are laid over it (overlays.ts) at the places the note's journal gives them.
  import { mount, onMount, unmount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText, type Where } from "$lib/editor/codemirror.ts";
  import { setMarks, setOverlays, type Inline, type Mark, type Overlay } from "$lib/editor/overlays.ts";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";
  import IsoBlock from "./IsoBlock.svelte";
  import IsoChange from "./IsoChange.svelte";

  // Without `iso` (a note written for Iso) there is no prompt line and nothing is laid over the text.
  let { note, iso, source }: { note: NoteSession; iso?: NoteIso; source: boolean } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();

  // The source shows the whole file; the live preview shows the text under the frontmatter. Iso's places are of
  // the whole file, so they are moved by the frontmatter's lines and characters on the way in and out.
  const head = $derived(source || !iso ? { lines: 0, chars: 0 } : iso.head);

  /** What Iso has over the text, placed in what the editor shows. */
  const laid = $derived.by((): { blocks: Overlay[]; marks: Mark[]; inline: Inline[] } => {
    if (!iso) return { blocks: [], marks: [], inline: [] };
    const within = (kind: Mark["kind"]) => (s: { from: number; to: number }): Mark => ({ kind, from: s.from - head.chars, to: s.to - head.chars });
    return {
      blocks: iso.layout.blocks.map((b) => ({ key: b.key, line: Math.max(0, b.line - head.lines) })).sort((a, b) => a.line - b.line),
      marks: [...iso.layout.picked.map(within("picked")), ...iso.layout.old.map(within("old"))].filter((m) => m.to > 0),
      inline: iso.layout.inline.map((i) => ({ key: i.key, at: i.at - head.chars })).filter((i) => i.at >= 0),
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
        // Ctrl+Enter opens the prompt under the cursor's paragraph; with text selected, asking for a rewrite of it.
        onAsk: (w: Where) => iso.promptAt(w.line + head.lines, { from: w.from + head.chars, to: w.to + head.chars }),
        onCursor: (w: Where) => { iso.cursor = { line: w.line + head.lines, from: w.from + head.chars, to: w.to + head.chars }; },
        // While the prompt asks for a rewrite, text selected in the note is chosen for it.
        picking: () => iso.picking,
        onPick: (ranges: { from: number; to: number }[]) => iso.pick(ranges.map((r) => ({ from: r.from + head.chars, to: r.to + head.chars }))),
        onUnpick: (at: number) => iso.unpick(at + head.chars),
        mountOverlay: (el: HTMLElement, key: string) => {
          const piece = mount(key.startsWith("r:") ? IsoChange : IsoBlock, { target: el, props: { iso, key } }); // "r:…" is one change of a rewrite
          return () => { void unmount(piece); };
        },
      } : { placeholder: "Write what you understand, what you do not, and what you want from Iso. [[ links a note it should rest on." }),
    });
    view = made;
    return () => made.destroy();
  });

  // The text was replaced from outside the editor (their version, a change made elsewhere, a proposal kept).
  $effect(() => {
    void note.revision;
    untrack(() => { if (view) setText(view, source ? note.text : note.body); });
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
