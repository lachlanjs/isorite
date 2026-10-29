<script lang="ts">
  import { page } from "$app/state";
  import { citeKind } from "@isorite/core";
  import FilePage from "$lib/components/FilePage.svelte";
  import NotePage from "$lib/components/NotePage.svelte";
  import { app } from "$lib/app.svelte.ts";

  const id = $derived(page.params.id ?? "");
  // A file of the notes that isn't a note (M23): an artifact, data, a picture, a document or anything else, by its
  // path with its extension. A note whose name has a dot in it is still a note.
  const file = $derived(!id.startsWith("@") && citeKind(id) !== null && !app.listing.notes.some((n) => n.id === id));
</script>

{#key id}
  {#if file}
    <FilePage path={id} />
  {:else}
    <NotePage {id} />
  {/if}
{/key}
