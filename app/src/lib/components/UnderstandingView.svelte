<script lang="ts">
  // The note's Understanding note (M10): Iso's reading of your understanding of the note, and your scratchpad, which
  // Iso does not write: written in the note editor, Markdown and maths as you type, [[ to link a note (V9).
  import type { UnderstandingReport } from "@isorite/engine";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText } from "$lib/editor/codemirror.ts";
  import { render } from "$lib/markdown.ts";
  import { panes } from "$lib/panes.svelte.ts";

  let { id, title }: { id: string; title: string } = $props();

  let report = $state.raw<UnderstandingReport | null>(null);
  let problem = $state("");
  let pad = $state("");
  let saving = $state<"" | "saving" | "saved" | "failed">("");
  let typed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let host: HTMLDivElement;
  let editor: EditorView | undefined;

  async function read(): Promise<void> {
    try {
      const r = await app.api.understanding(id);
      report = r;
      if (!typed) { pad = r.scratchpad; if (editor) setText(editor, pad); }
    } catch (e) { problem = (e as Error).message; }
  }
  onMount(() => {
    editor = createEditor(host, {
      doc: pad,
      label: "Scratchpad",
      placeholder: "Anything you like about this note. [[ links a note, $x$ is maths.",
      notes: () => app.listing.notes.filter((n) => n.id !== id).map((n) => ({ id: n.id, title: n.title, folder: n.dir })),
      onChange: (text) => { pad = text; typing(); },
      onSave: () => { if (typed) void save(); },
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      onFollow: (to) => { void goto(noteHref(to)); },
    });
    void read();
    const off = app.on((e) => {
      if (e.type === "note-changed" && (e.id === `@understanding/${id}` || e.id === id)) void read();
    });
    return () => { off(); clearTimeout(timer); if (typed) void save(); editor?.destroy(); };
  });

  function typing(): void {
    typed = true; saving = "";
    clearTimeout(timer);
    timer = setTimeout(() => void save(), 1200);
  }
  async function save(): Promise<void> {
    if (!report) return;
    saving = "saving";
    try { report = await app.api.saveScratchpad(id, pad, report.version); typed = false; saving = "saved"; }
    catch (e) { saving = "failed"; problem = (e as Error).message; }
  }

</script>

<article class="u">
  <p class="eyebrow">Understanding</p>
  <h1 class="serif">{title}</h1>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}

  <section>
    <h2>Iso's reading of your understanding</h2>
    {#if report?.reading}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      <div class="reading prose">{@html render(report.reading)}</div>
    {:else}
      <p class="faint">Iso has no reading of this note yet. Talk it through in Understand mode, and Iso writes one here.</p>
      <button class="link" type="button" onclick={() => { panes.setMode("understand"); panes.to("iso"); }}>Understand mode ›</button>
    {/if}
  </section>

  <section>
    <h2><span>Scratchpad</span>{#if saving}<span class="state" class:bad={saving === "failed"} role="status">{saving === "failed" ? "not saved" : saving}</span>{/if}</h2>
    <div class="pad" bind:this={host} onfocusout={() => { if (typed) void save(); }}></div>
  </section>
</article>

<style>
  .u { max-width: calc(var(--measure) + 2 * var(--space-4)); margin: 0 auto; padding: 40px var(--space-4) 64px; display: flex; flex-direction: column; gap: 26px; }
  .eyebrow { font-size: 12px; color: var(--malachite); margin-bottom: -20px; }
  h1 { font-size: 30px; line-height: 1.2; display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
  h2 { font: 400 12px var(--font-ui); color: var(--text-faint); display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  h2::after { content: ""; flex: 1; height: 1px; background: var(--line); order: 1; }
  h2 .state { order: 2; }
  .reading { font: 16px/1.6 var(--font-text); border-left: 2px solid var(--growth); padding-left: 14px; }
  .reading :global(p + p) { margin-top: 10px; }
  .pad { min-height: 140px; background: var(--ground-1); border: 1px solid var(--line); padding: 6px 12px; }
  .pad:focus-within { border-color: var(--line-strong); }
  .pad :global(.cm-editor) { min-height: 126px; }
  .link { background: none; border: 0; padding: 0; margin-top: 8px; color: var(--lattice); font: inherit; font-size: 12px; cursor: pointer; }
  .bad { color: var(--rose); }
  @media (max-width: 600px) { .u { padding: 20px 20px 48px; } }
</style>
