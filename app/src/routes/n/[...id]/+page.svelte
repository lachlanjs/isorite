<script lang="ts">
  import { page } from "$app/state";
  import NotePage from "$lib/components/NotePage.svelte";
  import UnderstandingView from "$lib/components/UnderstandingView.svelte";
  import { app } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";

  // In the Understand lens a note of the base shows its Understanding note (M10). The note stays open under it, so
  // what was being written is not lost.
  const id = $derived(page.params.id ?? "");
  const understand = $derived(panes.lens.note === "understand" && !id.startsWith("@"));
  const title = $derived(app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id);
</script>

{#key id}
  <div hidden={understand}><NotePage {id} /></div>
  {#if understand}<UnderstandingView {id} {title} />{/if}
{/key}
