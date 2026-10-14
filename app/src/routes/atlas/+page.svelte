<script lang="ts">
  import { page } from "$app/state";
  import Atlas from "$lib/components/Atlas.svelte";

  // `?pick=<a note for Iso>`: the map is then for linking notes to it.
  // With hash routing the question mark is inside the fragment.
  const pick = $derived(page.url.searchParams.get("pick") ?? new URLSearchParams(page.url.hash.split("?")[1] ?? "").get("pick") ?? "");
</script>

<div class="map"><Atlas pick={pick ? `@draft/${pick}` : ""} /></div>

<style>
  /* The map has the page: all that the header, the status line and (on a phone) the tabs leave. */
  .map { height: calc(100dvh - var(--bar-h) - 28px); }
  @media (max-width: 600px) { .map { height: calc(100dvh - var(--bar-h) - 28px - 56px - env(safe-area-inset-bottom)); } }
</style>
