<script lang="ts">
  import { page } from "$app/state";
  import DraftPage from "$lib/components/DraftPage.svelte";
</script>

{#key page.params.id}<DraftPage id={`@draft/${page.params.id ?? ""}`} />{/key}
