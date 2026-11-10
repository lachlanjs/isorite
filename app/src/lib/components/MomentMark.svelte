<script lang="ts">
  // One moment of the timeline as its mark alone (Desktop-Editor, with the words left off): a square for yours, a
  // diamond for the agent's, an open square for a change made
  // elsewhere, and a grey diamond for another agent's.
  import type { Moment } from "@isorite/core";

  let { moment }: { moment: Moment } = $props();

  // "iso:" is how the built-in agent signed the journal, before agents were attached; it is read as before.
  const legacy = $derived(moment.who.startsWith("iso:")), agent = $derived(moment.who.startsWith("agent:"));
</script>

{#if legacy || agent}
  <i class="dia" class:agent aria-hidden="true"></i>
{:else}
  <i class="sq" class:empty={moment.who === "external"} aria-hidden="true"></i>
{/if}

<style>
  .agent { background: var(--text-soft); }
</style>
