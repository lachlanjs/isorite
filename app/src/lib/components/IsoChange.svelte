<script lang="ts">
  // One change of a rewrite: what a passage would become, and its own keep and remove. The passage itself is
  // struck through in the note. A change within a line is set in that line straight after the passage; one of
  // several lines is a block under it, so that code keeps its lines and its indentation. The text is shown as it
  // would be written into the file.
  import { agentName } from "@isorite/core";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";

  let { iso, key }: { iso: NoteIso; key: string } = $props();

  const change = $derived(iso.changes.find((c) => c.key === key));
  const text = $derived(change ? change.proposal.regions[change.k]!.new : "");
  const waiting = $derived(iso.busy === key || iso.busy === "all");
  // Rendered as the note renders, maths and all (I1): a change within a line without its paragraph's wrapping. Code
  // keeps its lines as written.
  const shown = $derived(render(text.trim()));
  const inline = $derived(shown.replace(/^<p>([\s\S]*)<\/p>\s*$/, "$1"));
  // A terminal agent's change says whose it is, and what it was asked, on pointing.
  const agent = $derived(change ? agentName(change.proposal.who) : "");
</script>

{#snippet act()}
  {#if agent}<span class="label who" title={change?.proposal.asked}>{agent}</span>{/if}
  <span class="act">
    <button class="keep" type="button" disabled={waiting} onclick={() => change && iso.keepChange(change)} aria-label="Keep this change">keep</button><button class="remove" type="button" disabled={waiting} onclick={() => change && iso.discardChange(change)} aria-label="Remove this change">remove</button>
  </span>
{/snippet}

{#if change?.block}
  <div class="change block" class:code={change.code} data-change={key}>
    {#if !text.trim()}<span class="gone">the passage above is taken out</span>
    {:else if change.code}<pre class="new">{text.replace(/^\n+|\s+$/g, "")}</pre>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
    {:else}<div class="new prose" use:drawn={shown}>{@html shown}</div>{/if}
    <div class="foot"><i class="dia" aria-hidden="true"></i><span class="label">in place of the lines struck through above</span><span class="grow"></span>{@render act()}</div>
  </div>
{:else if change}
  <span class="change" data-change={key}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
    {#if text.trim()}<span class="new">{@html inline}</span>{:else}<span class="gone">taken out</span>{/if}
    {@render act()}
  </span>
{/if}

<style>
  span.change { margin-left: .3em; }
  /* Proposed text is dotted until it is kept, like every proposed line on the boards. Gold: it is Iso's. */
  span.change .new { white-space: normal; text-decoration: underline dotted var(--growth); text-decoration-thickness: 1.5px; text-underline-offset: 4px; background: var(--growth-soft); }
  .gone { font: 12px var(--font-ui); color: var(--text-faint); }
  .act { display: inline-flex; gap: 2px; margin-left: .4em; vertical-align: 2px; white-space: nowrap; }
  button { border: 0; height: 20px; padding: 0 7px; font: 700 11px/20px var(--font-ui); color: #07101C; }
  button:disabled { opacity: .5; }
  .keep { background: #7DDDB5; }
  .remove { background: #F7A8BA; }

  /* Several lines: a block of its own, with Iso's dotted line down its side. */
  .block { display: flex; flex-direction: column; gap: 8px; border-left: 2px dotted var(--growth); padding: 6px 0 6px 14px; background: var(--growth-soft); }
  .block .new { margin: 0; font: var(--text-size)/1.55 var(--font-text); color: var(--text); }
  .block .new :global(p), .block .new :global(ul), .block .new :global(ol) { margin: 0 0 12px; }
  .block .new :global(> :last-child) { margin-bottom: 0; }
  .block .new :global(.katex-display) { margin: 4px 0; }
  .block.code .new { font: 13px/20px var(--font-mono); white-space: pre; overflow-x: auto; }
  .foot { display: flex; align-items: center; gap: 10px; font: 12px/1.5 var(--font-ui); padding-right: 8px; }
  .foot .dia { margin: 0 3px; }
  .foot .act { vertical-align: 0; }
  .who { margin-left: .4em; font: 11px/20px var(--font-ui); color: var(--text-faint); }
</style>
