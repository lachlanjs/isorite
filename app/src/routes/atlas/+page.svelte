<script lang="ts">
  import Atlas from "$lib/components/Atlas.svelte";
</script>

<div class="map"><Atlas /></div>

<style>
  /* The map has the page: all that the header, the status line and (on a phone) the tabs leave. */
  .map { height: calc(100dvh - var(--bar-h) - 28px); }
  @media (max-width: 600px) { .map { height: calc(100dvh - var(--bar-h) - 28px - 56px - env(safe-area-inset-bottom)); } }
</style>
