<script lang="ts">
  // Iso's pane: the conversation, what Iso may do in its mode, and what it is sent.
  import { ALLOWS, panes } from "$lib/panes.svelte.ts";
</script>

<div class="iso-top"><span class="mname">{panes.mode[0]!.toUpperCase() + panes.mode.slice(1)} mode</span> · {ALLOWS[panes.mode]}</div>
<div class="chat">
  <p class="faint empty">Ask Iso about your notes. What it reads and changes shows on the Atlas and in the note.</p>
</div>

<style>
  .iso-top { flex: none; padding: 6px 16px; border-bottom: 1px solid var(--line); font-size: 12px; color: var(--text-faint); }
  .mname { color: var(--growth); }
  .chat { padding: 16px; }
  .empty { font-size: 12px; }
</style>
