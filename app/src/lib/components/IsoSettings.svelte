<script lang="ts">
  // Iso's settings, under its pane's header: AGENTS.md, the base's own instructions, read by every agent attached
  // (M15). An agent's model and key are its own (M25), set up as for its own terminal.
  import type { PiApi, PiState } from "$lib/api.ts";
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

  // The native agent's model and keys (M36 step 8): from this machine only, since a key is typed here.
  const pi = (app.api as { pi?: PiApi } | undefined)?.pi ?? null;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let model = $state.raw<PiState | null>(null);
  let provider = $state("openrouter");
  let name = $state("");
  let key = $state("");
  let said = $state("");
  async function reload() { if (pi && local) { try { model = await pi.state(); } catch { model = null; } } }
  $effect(() => { void reload(); });
  $effect(() => { if (model?.choice) { provider = model.choice.provider; name = model.choice.model; } });
  async function act(what: () => Promise<void>, done: string) {
    problem = ""; said = "";
    try { await what(); said = done; await reload(); } catch (e) { problem = (e as Error).message; }
  }
  const keep = () => act(async () => { await pi!.setKey(provider, key); key = ""; }, "Key kept. The next turn uses it.");
  const forget = () => act(() => pi!.removeKey(provider), "Key removed.");
  const choose = () => act(() => pi!.choose(provider, name), model?.active ? "Model chosen. The next turn uses it." : "Model chosen. Restart isorite for the pane to use it.");
</script>

<section>
  {#if agents !== null}
    <h2 class="label">AGENTS.md</h2>
    <label class="hidden-label" for="agents">AGENTS.md: your instructions for this base</label>
    <textarea id="agents" class="agents" bind:value={agents} rows="6" spellcheck="true" placeholder="notation, level, language, how notes are named" title="Your instructions for this base, read by the agents you attach. Kept at the top of your notes, as AGENTS.md." onblur={() => void keepAgents()}></textarea>
  {/if}
  {#if model}
    <h2 class="label">Model for isorite's own agent</h2>
    <p class="note">Used when the pane runs isorite's own agent rather than one of yours. Keys are kept in isorite's data folder, readable only by you, never in your notes or repository.</p>
    {#if model.source === "environment"}<p class="note">ISORITE_PI names the model ({model.choice?.provider}/{model.choice?.model}) and wins while it is set.</p>{/if}
    <label class="hidden-label" for="pi-provider">Provider</label>
    <select id="pi-provider" bind:value={provider}>
      {#each model.providers as p (p.id)}<option value={p.id}>{p.name}{model.keys[p.id] ? " ✓" : ""}</option>{/each}
    </select>
    <p class="note" data-testid="pi-key-state">{#if model.keys[provider] === "saved"}A key is saved.{:else if model.keys[provider] === "environment"}Using the key in {model.providers.find((p) => p.id === provider)?.env}.{:else}No key is set.{/if}</p>
    <label class="hidden-label" for="pi-key">Key for this provider</label>
    <input id="pi-key" type="password" autocomplete="off" spellcheck="false" bind:value={key} placeholder="paste a key" />
    <div class="row">
      <button type="button" disabled={!key.trim()} onclick={() => void keep()}>Keep key</button>
      <button type="button" disabled={model.keys[provider] !== "saved"} onclick={() => void forget()}>Remove key</button>
    </div>
    <label class="hidden-label" for="pi-model">Model</label>
    <input id="pi-model" type="text" bind:value={name} placeholder={provider === "openrouter" ? "anthropic/claude-haiku-5.5" : "model name"} spellcheck="false" />
    <div class="row"><button type="button" disabled={!name.trim()} onclick={() => void choose()}>Use this model</button></div>
    {#if said}<p class="note" role="status">{said}</p>{/if}
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .note { color: var(--text-dim, var(--text)); font-size: 12px; }
  .row { display: flex; gap: var(--space-2); }
  input, select { background: var(--ground-1); border: 1px solid var(--line); padding: 6px 8px; font: 12.5px var(--font-mono); color: var(--text); }
  .bad { color: var(--rose); }
  .agents { width: 100%; min-height: 96px; resize: vertical; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 8px 10px; font: 12.5px/1.55 var(--font-mono); color: var(--text); }
  .agents:focus { border-color: var(--line-strong); outline: none; }
</style>
