<script lang="ts">
  // One change of a rewrite, set in the line straight after the passage it would replace (which is struck
  // through): what the passage would become, and its own keep and remove. The text is shown as it would be
  // written into the file.
  import type { NoteIso } from "$lib/iso.svelte.ts";

  let { iso, key }: { iso: NoteIso; key: string } = $props();

  const change = $derived(iso.changes.find((c) => c.key === key));
  const text = $derived(change ? change.proposal.regions[change.k]!.new : "");
  const waiting = $derived(iso.busy === key || iso.busy === "all");
</script>

{#if change}
  <span class="change" data-change={key}>
    {#if text.trim()}<span class="new">{text.trim()}</span>{:else}<span class="gone">taken out</span>{/if}
    <span class="act">
      <button class="keep" type="button" disabled={waiting} onclick={() => iso.keepChange(change)} aria-label="Keep this change">keep</button><button class="remove" type="button" disabled={waiting} onclick={() => iso.discardChange(change)} aria-label="Remove this change">remove</button>
    </span>
  </span>
{/if}

<style>
  .change { margin-left: .3em; }
  /* Proposed text is dotted until it is kept, like every proposed line on the boards. Gold: it is Iso's. */
  .new { white-space: pre-wrap; text-decoration: underline dotted var(--growth); text-decoration-thickness: 1.5px; text-underline-offset: 4px; background: var(--growth-soft); }
  .gone { font: 12px var(--font-ui); color: var(--text-faint); }
  .act { display: inline-flex; gap: 2px; margin-left: .4em; vertical-align: 2px; white-space: nowrap; }
  button { border: 0; height: 20px; padding: 0 7px; font: 700 11px/20px var(--font-ui); color: #07101C; }
  button:disabled { opacity: .5; }
  .keep { background: #7DDDB5; }
  .remove { background: #F7A8BA; }
</style>
