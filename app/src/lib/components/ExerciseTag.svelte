<script lang="ts">
  // A label set in an exercise's text, not part of it: beside the working's heading, the marks' count or how to
  // mark the answer; after the answer, "your answer"; after a wrong passage, "× wrong" (Study-Written, Mobile-Study).
  import type { ExerciseState } from "$lib/exercise.svelte.ts";

  let { exercise, key }: { exercise: ExerciseState; key: string } = $props();
</script>

{#if key === "x:head"}
  <span class="head">
    {#if exercise.marks.length}
      {#if exercise.counts.right}<span class="chip malachite">{exercise.counts.right} right</span>{/if}
      {#if exercise.counts.wrong}<span class="chip rose">× {exercise.counts.wrong} wrong</span>{/if}
    {:else if exercise.answerAt}
      <span class="label">only what you marked is your answer</span>
    {:else}
      <span class="label">select a part of your working to mark it as your answer</span>
    {/if}
  </span>
{:else if key === "x:answer"}
  <span class="label tag">your answer</span>
{:else}
  <span class="wrong tag">× wrong</span>
{/if}

<style>
  /* On the heading's row (Study-Written): the heading is 12 px text in a line of the 18 px reading face, so the
     chips are brought down to its middle and the label, smaller, to its baseline. */
  .head { float: right; display: inline-flex; gap: 6px; align-items: center; margin-top: 6px; font: 400 12px/1.5 var(--font-ui); text-transform: none; }
  .head .label { white-space: nowrap; position: relative; top: 3px; }
  @media (max-width: 600px) { .head .label { display: none; } }
  .head .label::before { content: none; }
  .tag { margin-left: 14px; font-family: var(--font-ui); font-size: 12px; white-space: nowrap; }
  .wrong { color: var(--rose); }
</style>
