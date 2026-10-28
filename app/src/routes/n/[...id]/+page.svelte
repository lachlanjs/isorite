<script lang="ts">
  import { page } from "$app/state";
  import { citeKind } from "@isorite/core";
  import FilePage from "$lib/components/FilePage.svelte";
  import NotePage from "$lib/components/NotePage.svelte";
  import UnderstandingView from "$lib/components/UnderstandingView.svelte";
  import { app } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";

  // With the sprig in the Note pane's header pressed, a note of the base shows its Understanding note (M10). The note
  // stays open under it, so what was being written is not lost.
  const id = $derived(page.params.id ?? "");
  // A file of the notes that isn't a note (M23): an artifact, data, a picture, a document or anything else, by its
  // path with its extension. A note whose name has a dot in it is still a note.
  const file = $derived(!id.startsWith("@") && citeKind(id) !== null && !app.listing.notes.some((n) => n.id === id));
  const understand = $derived(panes.understanding && !id.startsWith("@") && !file);
  const title = $derived(app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id);
</script>

{#key id}
  {#if file}
    <FilePage path={id} />
  {:else}
    <div hidden={understand}><NotePage {id} /></div>
    {#if understand}<UnderstandingView {id} {title} />{/if}
  {/if}
{/key}
