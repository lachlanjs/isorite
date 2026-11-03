<script lang="ts">
  import { page } from "$app/state";
  import CodeReader from "$lib/components/CodeReader.svelte";

  const path = $derived(page.params.path ?? "");
  // The hash router keeps the query inside the hash, which the page's own `url.searchParams` does not read.
  const at = $derived(new URLSearchParams(page.url.href.split("?")[1]?.split("#")[0] ?? "").get("at") ?? "");
</script>

{#key `${path}#${at}`}
  <CodeReader {path} {at} />
{/key}
