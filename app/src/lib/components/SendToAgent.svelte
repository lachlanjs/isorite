<script lang="ts">
  // Send this note, or the passage chosen in it, to the terminal's agent, with what you want of it ("from you" on
  // the Terminal board). Whichever agent is listening takes it into its session on screen, to be read with the next
  // message there, and says so; if none does, that is said.
  import { agentName } from "@isorite/core";
  import { app } from "$lib/app.svelte.ts";

  let { note, passage, onclose }: { note: string; passage: string; onclose: () => void } = $props();

  let said = $state("");
  let outcome = $state<"" | "sending" | "taken" | "none" | "failed">("");
  let taker = $state("");
  let message = $state("");
  const WAIT_MS = 4000;

  async function send(): Promise<void> {
    outcome = "sending";
    // Listening first: an agent can take it before the server has answered.
    const taken = new Map<string, string>();
    const stop = app.on((e) => { if (e.type === "agent-received") taken.set(e.id, e.agent); });
    try {
      const { id } = await app.api.agentSend({ note, ...(passage ? { passage } : {}), said });
      for (const started = Date.now(); !taken.has(id) && Date.now() - started < WAIT_MS; ) await new Promise((r) => setTimeout(r, 100));
      taker = agentName(taken.get(id));
      outcome = taken.has(id) ? "taken" : "none";
      if (outcome === "taken") said = "";
    } catch (e) {
      outcome = "failed";
      message = (e as Error).message;
    } finally { stop(); }
  }
</script>

<div class="send" role="group" aria-label="Send to the terminal's agent">
  <span class="label what">{passage ? "the passage you chose" : "this note"}</span>
  <input type="text" bind:value={said} placeholder="what you want of it (optional)" aria-label="What you want of it" maxlength="4000"
    onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } if (e.key === "Escape") onclose(); }} />
  <button class="btn primary" type="button" disabled={outcome === "sending"} onclick={send}>send to agent</button>
  <button class="link" type="button" onclick={onclose}>[ close ]</button>
  {#if outcome === "taken"}<span class="label ok" role="status">{taker} has it, in the terminal</span>
  {:else if outcome === "none"}<span class="label bad" role="status">no terminal agent took it: is isorite term running?</span>
  {:else if outcome === "failed"}<span class="label bad" role="alert">{message}</span>{/if}
</div>

<style>
  .send { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: var(--space-2) 0 var(--space-3); }
  .what { flex: none; }
  input { flex: 1 1 16rem; min-width: 0; height: 32px; padding: 0 var(--space-2); font: 13px var(--font-ui); color: var(--text); background: var(--ground-2); border: 1px solid var(--line); }
  .btn { height: 32px; }
  .link { background: none; border: 0; padding: 4px 0; font: 13px var(--font-ui); color: var(--lattice); white-space: nowrap; cursor: pointer; }
  .ok { color: var(--malachite); flex-basis: 100%; }
  .bad { color: var(--rose); flex-basis: 100%; }
</style>
