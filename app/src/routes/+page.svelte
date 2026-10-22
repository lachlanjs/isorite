<script lang="ts">
  // Opening isorite opens the note last open, or else the notes. The Atlas and Iso stand beside it (M10).
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { onMount } from "svelte";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";

  onMount(() => {
    const last = app.listing.notes.some((n) => n.id === panes.last) ? panes.last : "";
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
    void goto(last ? noteHref(last) : resolve("/notes"), { replaceState: true });
  });
</script>
