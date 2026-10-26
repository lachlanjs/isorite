<script lang="ts">
  // The Atlas has its own pane (M10): an old link to it brings that pane forward, beside the note last open.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";

  onMount(() => {
    const last = app.listing.notes.some((n) => n.id === panes.last) ? panes.last : "";
    // What the link asks of the Atlas (?pick=…), without the base the page is for (M20), which stays in the address.
    const asked = new URLSearchParams(page.url.search);
    asked.delete("base");
    const search = asked.size ? `?${asked}` : "";
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
    void goto((last ? noteHref(last) : resolve("/notes")) + search, { replaceState: true }).then(() => panes.to("atlas"));
  });
</script>
