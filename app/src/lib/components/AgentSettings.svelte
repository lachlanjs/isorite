<script lang="ts">
  // The agent's settings, under its pane's header: AGENTS.md, the base's own instructions, read by every agent attached
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
  const keep = () => act(async () => { await pi!.setKey(provider, key); key = ""; }, "Saved.");
  const forget = () => act(() => pi!.removeKey(provider), "Removed.");
  // Chosen, the model is used at once: where the pane was not the agent's, it is now.
  const choose = () => act(() => pi!.choose(provider, name), "In use.");
  /** The models the provider offers, suggested as the name is typed. */
  let offered = $state<string[]>([]);
  $effect(() => { const p = provider; offered = []; if (pi && local) void pi.models(p).then((m) => { if (provider === p) offered = m; }, () => undefined); });
  /** One short request with what is set: it answers, or says why not. */
  let checking = $state(false), checked = $state<{ ok: boolean; text: string } | null>(null);
  async function check() {
    checking = true; checked = null; problem = "";
    try { const r = await pi!.check(provider, name); checked = { ok: true, text: `Answered in ${(r.ms / 1000).toFixed(1)}s${r.said ? `: “${r.said}”` : ""}` }; }
    catch (e) { checked = { ok: false, text: (e as Error).message }; }
    finally { checking = false; }
  }
  $effect(() => { void provider; void name; checked = null; });
  const gateway = $derived(model?.gateway && !("problem" in model.gateway) ? model.gateway : null);
  const gatewayProblem = $derived(model?.gateway && "problem" in model.gateway ? model.gateway.problem : "");
</script>

<section>
  {#if agents !== null}
    <h2 class="label">AGENTS.md</h2>
    <label class="hidden-label" for="agents">AGENTS.md: your instructions for this base</label>
    <textarea id="agents" class="agents" bind:value={agents} rows="6" spellcheck="true" placeholder="Instructions for every agent" title="AGENTS.md" onblur={() => void keepAgents()}></textarea>
  {/if}
  {#if model}
    <h2 class="label">Model</h2>
    {#if model.source === "environment"}<p class="note">ISORITE_PI sets the model.</p>{/if}
    {#if model.active && model.choice}<p class="note in-use" data-testid="pi-in-use"><i class="dot" aria-hidden="true"></i>In use: {model.choice.provider === "gateway" ? gateway?.name ?? "your gateway" : model.providers.find((p) => p.id === model?.choice?.provider)?.name ?? model.choice.provider}, {model.choice.model}</p>{/if}
    <label class="hidden-label" for="pi-provider">Provider</label>
    <select id="pi-provider" class="field" bind:value={provider}>
      {#each model.providers as p (p.id)}<option value={p.id}>{p.id === "gateway" && gateway ? gateway.name : p.name}{model.keys[p.id] ? " ✓" : ""}</option>{/each}
    </select>
    {#if provider === "gateway"}
      <!-- A gateway of your own: what config.toml's [provider] names, never its secrets; or how to name one. -->
      {#if gateway}
        <dl class="gw" data-testid="pi-gateway">
          <dt>address</dt><dd>{gateway.url}</dd>
          <dt>certificate</dt><dd>{gateway.certificate.length ? gateway.certificate.join(", ") : "none"}</dd>
          <dt>key</dt><dd>{gateway.keyHeader ? `in ${gateway.keyHeader}` : "Authorization: Bearer"}</dd>
          {#if gateway.headers.length}<dt>headers</dt><dd>{gateway.headers.join(", ")}</dd>{/if}
        </dl>
      {:else if gatewayProblem}
        <p class="bad" role="alert">{gatewayProblem}</p>
      {:else}
        <p class="note"><code>~/.config/isorite/config.toml</code>:</p>
        <pre class="snippet">[provider]
url = "https://gateway.example.com/v1"
pfx = '~/certs/me.pfx'          # if it asks for a certificate
pfx_passphrase = "$PFX_PASSPHRASE"
ca = 'company-ca.pem'           # if its authority is the company's</pre>
      {/if}
    {/if}
    <p class="note" class:has={!!model.keys[provider]} data-testid="pi-key-state">{#if model.keys[provider] === "saved"}Key saved.{:else if model.keys[provider] === "environment"}Key from {model.providers.find((p) => p.id === provider)?.env}.{:else if provider === "gateway"}No key{gateway?.certificate.length ? ": the certificate may be enough" : ""}.{:else}No key.{/if}</p>
    <label class="hidden-label" for="pi-key">Key for this provider</label>
    <div class="row">
      <input id="pi-key" class="field" type="password" autocomplete="off" spellcheck="false" bind:value={key} placeholder="Paste a key" />
      <button type="button" class="btn" disabled={!key.trim()} onclick={() => void keep()}>Save</button>
      {#if model.keys[provider] === "saved"}<button type="button" class="btn quiet" onclick={() => void forget()}>Remove</button>{/if}
    </div>
    <label class="hidden-label" for="pi-model">Model</label>
    <input id="pi-model" class="field" type="text" list="pi-models" bind:value={name} placeholder={provider === "openrouter" ? "anthropic/claude-haiku-5.5" : offered[0] ?? "model name"} spellcheck="false" autocomplete="off" />
    <datalist id="pi-models">{#each offered as m (m)}<option value={m}></option>{/each}</datalist>
    <div class="row">
      <button type="button" class="btn" disabled={!name.trim() || checking} onclick={() => void check()}>{checking ? "Testing…" : "Test"}</button>
      <button type="button" class="btn primary" disabled={!name.trim()} onclick={() => void choose()}>Use</button>
    </div>
    {#if checked}<p class="note" class:ok={checked.ok} class:bad={!checked.ok} role="status" data-testid="pi-check">{checked.ok ? "✓ " : "✗ "}{checked.text}</p>{/if}
    {#if said}<p class="note" role="status">{said}</p>{/if}
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .note { margin: 0; color: var(--text-soft); font: var(--fs-small)/1.45 var(--font-ui); }
  .note.has { color: var(--text-faint); }
  .row { display: flex; gap: var(--space-2); align-items: center; }
  .row > .field { flex: 1 1 auto; }
  .in-use { display: flex; align-items: center; gap: 6px; }
  .in-use .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--malachite); flex: none; }
  h2 + * { margin-top: -2px; }
  h2:not(:first-child) { margin-top: var(--space-3); }
  input:not([type="radio"], [type="checkbox"]), select { width: 100%; min-width: 0; font: 12.5px var(--font-mono); }
  .in-use { color: var(--text); }
  .ok { color: var(--malachite, var(--growth)); }
  .gw { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font-size: 12px; }
  .gw dt { color: var(--text-faint); } .gw dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
  .snippet { margin: 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); white-space: pre; overflow-x: auto; }
  code { font: 11.5px var(--font-mono); }
  .bad { color: var(--rose); }
  .agents { width: 100%; min-height: 96px; resize: vertical; field-sizing: content; background: var(--surface-raised); border: 1px solid var(--line-faint); border-radius: var(--round); padding: 8px 10px; font: 12.5px/1.55 var(--font-mono); color: var(--text); }
  .agents:focus { border-color: var(--line-strong); outline: none; }
</style>
