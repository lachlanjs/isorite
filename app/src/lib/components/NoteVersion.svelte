<script lang="ts">
  // The note as it was just after a moment of its timeline: its title and text, read only, with what the moment
  // changed marked, what was asked above it, and Iso's text where the moment offered some that was not kept.
  import { onMount } from "svelte";
  import { splitSource } from "@isorite/core";
  import type { EditorView } from "@codemirror/view";
  import { createEditor } from "$lib/editor/codemirror.ts";
  import { setTouched, type Touched } from "$lib/editor/overlays.ts";

  let { text, title: now, touched, asked, offered }: {
    /** The whole file as it was. */
    text: string;
    /** The note's title as it is: the old one is shown only where it differs. */
    title: string;
    /** What the moment changed, by line of the whole file. */
    touched: Touched | null;
    asked?: string | undefined;
    offered?: string | undefined;
  } = $props();

  // The title from the frontmatter, and the text under it with how many lines the frontmatter took.
  const parts = $derived.by(() => {
    try {
      const [prefix, head, body] = splitSource(text);
      const title = /^title:\s*(.*)$/m.exec(head ?? "")?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
      return { title, body, lines: prefix.split("\n").length - 1 };
    } catch { return { title: "", body: text, lines: 0 }; }
  });

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();
  onMount(() => {
    view = createEditor(host, { doc: parts.body, onChange: () => undefined, onSave: () => undefined, label: "The note as it was", notes: () => [], readOnly: true });
    return () => view?.destroy();
  });
  $effect(() => {
    const t = touched, lines = parts.lines;
    view?.dispatch({ effects: setTouched.of(t ? { who: t.who, lines: t.lines.map((l) => l - lines) } : null) });
  });
</script>

<div class="version">
  {#if parts.title && parts.title !== now}<h1 class="serif title">{parts.title}</h1>{/if}
  {#if asked !== undefined}<p class="asked"><i class="dia" aria-hidden="true"></i><span>{asked}</span></p>{/if}
  <div class="text" bind:this={host}></div>
  {#if offered !== undefined}
    <div class="offered" aria-label="What Iso offered">
      <p class="serif">{offered}</p>
    </div>
  {/if}
</div>

<style>
  .version { display: flex; flex-direction: column; gap: var(--space-2); }
  .title { font-size: 34px; line-height: 1.2; font-weight: 700; margin: 0; padding: 0 2px; }
  .asked { display: flex; align-items: baseline; gap: 10px; margin: 0; font-size: 13px; color: var(--text-soft); }
  .asked .dia { flex: none; position: relative; top: -1px; }
  .text :global(.cm-content) { padding-bottom: 24px; }
  .offered { border-top: 2px dotted var(--growth); border-bottom: 2px dotted var(--growth); padding: 12px 2px; margin-bottom: 40vh; }
  .offered p { margin: 0; font-size: 17px; line-height: 1.6; white-space: pre-wrap; }
  @media (max-width: 600px) { .title { font-size: 30px; } }
</style>
