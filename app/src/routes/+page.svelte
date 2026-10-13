<script lang="ts">
  import { resolve } from "$app/paths";
  // Opening isorite opens the notes. (The Atlas takes this place when it is built.)
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  onMount(() => { void goto(resolve("/notes"), { replaceState: true }); });
</script>
