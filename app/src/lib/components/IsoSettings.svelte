<script lang="ts">
  // Iso's settings, under its pane's header: AGENTS.md, the base's own instructions, read by every agent attached
  // (M15). An agent's model and key are its own (M25), set up as for its own terminal.
  import { app } from "$lib/app.svelte.ts";

  let problem = $state("");
  /** The base's AGENTS.md, as it is on disk, and as it is being written here. */
  let agents = $state<string | null>(null);
  let saved = "";
  $effect(() => { void app.api.agents().then((a) => { agents = a.text ?? ""; saved = agents; }, () => undefined); });
  async function keepAgents() {
    if (agents === null || agents === saved) return;
    problem = "";
    try { await app.api.saveAgents(agents); saved = agents; } catch (e) { problem = (e as Error).message; }
  }
</script>

<section>
  {#if agents !== null}
    <h2 class="label">AGENTS.md</h2>
    <label class="hidden-label" for="agents">AGENTS.md: your instructions for this base</label>
    <textarea id="agents" class="agents" bind:value={agents} rows="6" spellcheck="true" placeholder="notation, level, language, how notes are named" title="Your instructions for this base, read by the agents you attach. Kept at the top of your notes, as AGENTS.md." onblur={() => void keepAgents()}></textarea>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .bad { color: var(--rose); }
  .agents { width: 100%; min-height: 96px; resize: vertical; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 8px 10px; font: 12.5px/1.55 var(--font-mono); color: var(--text); }
  .agents:focus { border-color: var(--line-strong); outline: none; }
</style>
