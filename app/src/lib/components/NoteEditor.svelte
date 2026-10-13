<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source. Iso's blocks
  // are laid over it (overlays.ts) at the places the note's journal gives them.
  import { mount, onMount, unmount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText } from "$lib/editor/codemirror.ts";
  import { setLineMarks, setOverlays, type LineMark, type Overlay } from "$lib/editor/overlays.ts";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";
  import IsoBlock from "./IsoBlock.svelte";

  let { note, iso, source }: { note: NoteSession; iso: NoteIso; source: boolean } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();

  // The source shows the whole file; the live preview shows the text under the frontmatter.
  const head = $derived(source ? 0 : iso.head);

  /** Iso's blocks, each before a line of what the editor shows, and the lines it marks. */
  const laid = $derived.by(() => {
    const blocks: Overlay[] = iso.layout.blocks.map((b) => ({ key: b.key, line: Math.max(0, b.line - head) })).sort((a, b) => a.line - b.line);
    const within = (kind: LineMark["kind"]) => (l: { from: number; to: number }): LineMark => ({ kind, from: Math.max(0, l.from - head), to: l.to - head });
    return { blocks, marks: [...iso.layout.picked.map(within("picked")), ...iso.layout.old.map(within("old"))] };
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
      // Ctrl+Enter: with a bare cursor, text under its paragraph; with a selection, a rewrite of what it touches.
      onAsk: (from, to) => { const h = source ? 0 : iso.head; iso.promptAt(from + h, to + h, !made.state.selection.main.empty); },
      onCursor: (from, to) => { const h = source ? 0 : iso.head; iso.cursor = { from: from + h, to: made.state.selection.main.empty ? from + h : to + h + 1 }; },
      mountOverlay: (el, key) => {
        const block = mount(IsoBlock, { target: el, props: { iso, key } });
        return () => { void unmount(block); };
      },
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
    const { blocks, marks } = laid;
    if (view) view.dispatch({ effects: [setOverlays.of(blocks), setLineMarks.of(marks)] });
  });
</script>

<div class="editor" class:source bind:this={host}></div>

<style>
  .editor { min-height: 50vh; }
</style>
