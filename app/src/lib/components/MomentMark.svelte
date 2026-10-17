<script lang="ts">
  // One moment of the timeline as its mark alone (Desktop-Editor, with the words left off): a square for yours, a
  // diamond for Iso's (filled once kept, open while it waits, faint once removed), an open square for a change made
  // elsewhere, a grey diamond for another agent's, and a marking's result as the study page draws it.
  import type { Moment } from "@isorite/core";

  let { moment }: { moment: Moment } = $props();

  const iso = $derived(moment.who.startsWith("iso:")), agent = $derived(moment.who.startsWith("agent:"));
</script>

{#if moment.what === "marked"}
  <i class="pip" class:ok={moment.result === "right"} class:part={moment.result === "partly"} class:no={moment.result === "wrong"} aria-hidden="true"></i>
{:else if iso || agent}
  <i class="dia" class:open={moment.what === "offered" || moment.what === "discarded"} class:gone={moment.what === "discarded"} class:agent aria-hidden="true"></i>
{:else}
  <i class="sq" class:empty={moment.who === "external"} aria-hidden="true"></i>
{/if}

<style>
  .gone { opacity: 0.45; }
  .agent { background: var(--text-soft); }
  .agent.open { background: transparent; border-color: var(--text-soft); }
</style>
