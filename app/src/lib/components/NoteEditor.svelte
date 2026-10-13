<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source.
  import { onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText } from "$lib/editor/codemirror.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";

  let { note, source }: { note: NoteSession; source: boolean } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    view = createEditor(host, {
      doc: source ? note.text : note.body,
      source,
      label: source ? "The note's file" : "The note",
      notes: () => app.listing.notes.filter((n) => n.id !== note.id).map((n) => ({ id: n.id, title: n.title, folder: n.dir })),
      onChange: (text) => (source ? note.setText(text) : note.setBody(text)),
      onSave: () => { void note.save(); },
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      onFollow: (id) => { void goto(noteHref(id)); },
    });
    return () => view?.destroy();
  });

  // The text was replaced from outside the editor (their version, a change made elsewhere).
  $effect(() => {
    void note.revision;
    untrack(() => { if (view) setText(view, source ? note.text : note.body); });
  });
</script>

<div class="editor" class:source bind:this={host}></div>

<style>
  .editor { min-height: 50vh; }
</style>
