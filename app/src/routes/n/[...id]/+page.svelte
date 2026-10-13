<script lang="ts">
  import { page } from "$app/state";
  import NotePage from "$lib/components/NotePage.svelte";
</script>

{#key page.params.id}<NotePage id={page.params.id ?? ""} />{/key}
