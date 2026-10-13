<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source. Iso's blocks
  // are laid over it (overlays.ts) at the places the note's journal gives them.
  import { mount, onMount, unmount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText } from "$lib/editor/codemirror.ts";
  import { setOverlays, type Overlay } from "$lib/editor/overlays.ts";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";
  import IsoBlock from "./IsoBlock.svelte";

  let { note, iso, source }: { note: NoteSession; iso: NoteIso; source: boolean } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();

  // The source shows the whole file; the live preview shows the text under the frontmatter.
  const head = $derived(source ? 0 : iso.head);

  /** Iso's blocks, each before a line of what the editor shows. */
  const blocks = $derived.by((): Overlay[] => {
    const out: Overlay[] = iso.proposals.map((p) => ({ key: `p:${p.id}`, line: iso.lineOf(p) - head }));
    if (iso.asking) out.push({ key: "asking", line: iso.asking.line - head });
    if (iso.failed) out.push({ key: "failed", line: iso.failed.line - head });
    if (iso.prompt !== null) out.push({ key: "prompt", line: iso.prompt - head });
    return out.map((o) => ({ ...o, line: Math.max(0, o.line) })).sort((a, b) => a.line - b.line);
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
      // Ctrl+Enter: ask Iso for text under the paragraph the cursor is in.
      onAsk: (line) => iso.promptAt(line + (source ? 0 : iso.head)),
      onCursor: (line) => { iso.cursor = line + (source ? 0 : iso.head); },
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
    const list = blocks;
    if (view) view.dispatch({ effects: setOverlays.of(list) });
  });
</script>

<div class="editor" class:source bind:this={host}></div>

<style>
  .editor { min-height: 50vh; }
</style>
