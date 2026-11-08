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
  const reach = (files: "off" | "read" | "write", shell: boolean) => act(() => pi!.setReach(files, shell), "Saved. The next question uses it.");
  // Chosen, the model is used at once: where the pane was not the agent's, it is now.
  const choose = () => act(() => pi!.choose(provider, name), "In use: the pane is isorite's own agent, on this model.");
  /** The models the provider offers, suggested as the name is typed. */
  let offered = $state<string[]>([]);
  $effect(() => { const p = provider; offered = []; if (pi && local) void pi.models(p).then((m) => { if (provider === p) offered = m; }, () => undefined); });
  /** One short request with what is set: it answers, or says why not. */
  let checking = $state(false), checked = $state<{ ok: boolean; text: string } | null>(null);
  async function check() {
    checking = true; checked = null; problem = "";
    try { const r = await pi!.check(provider, name); checked = { ok: true, text: `Answered in ${(r.ms / 1000).toFixed(1)} s${r.said ? `: “${r.said}”` : ""}` }; }
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
    <textarea id="agents" class="agents" bind:value={agents} rows="6" spellcheck="true" placeholder="notation, level, language, how notes are named" title="Your instructions for this base, read by the agents you attach. Kept at the top of your notes, as AGENTS.md." onblur={() => void keepAgents()}></textarea>
  {/if}
  {#if model}
    <h2 class="label">Model for isorite's own agent</h2>
    <p class="note">Used when the pane runs isorite's own agent rather than one of yours. Keys are kept in isorite's data folder, readable only by you, never in your notes or repository.</p>
    {#if model.source === "environment"}<p class="note">ISORITE_PI names the model ({model.choice?.provider}/{model.choice?.model}) and wins while it is set.</p>{/if}
    {#if model.active && model.choice}<p class="note in-use" data-testid="pi-in-use">In use: {model.choice.provider === "gateway" ? gateway?.name ?? "your gateway" : model.providers.find((p) => p.id === model?.choice?.provider)?.name ?? model.choice.provider}, {model.choice.model}.</p>{/if}
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
        <p class="note">A gateway of your own (OpenAI-compatible, as a company's) is named in <code>~/.config/isorite/config.toml</code>:</p>
        <pre class="snippet">[provider]
url = "https://gateway.example.com/v1"
pfx = "~/certs/me.pfx"          # if it asks for a certificate
pfx_passphrase = "$PFX_PASSPHRASE"
ca = "company-ca.pem"           # if its authority is the company's</pre>
      {/if}
    {/if}
    <p class="note" data-testid="pi-key-state">{#if model.keys[provider] === "saved"}A key is saved.{:else if model.keys[provider] === "environment"}Using the key in {model.providers.find((p) => p.id === provider)?.env}.{:else if provider === "gateway"}No key is set{gateway?.certificate.length ? ": the certificate may be enough" : ""}.{:else}No key is set.{/if}</p>
    <label class="hidden-label" for="pi-key">Key for this provider</label>
    <input id="pi-key" class="field" type="password" autocomplete="off" spellcheck="false" bind:value={key} placeholder="paste a key" />
    <div class="row">
      <button type="button" class="btn" disabled={!key.trim()} onclick={() => void keep()}>Keep key</button>
      <button type="button" class="btn quiet" disabled={model.keys[provider] !== "saved"} onclick={() => void forget()}>Remove key</button>
    </div>
    <label class="hidden-label" for="pi-model">Model</label>
    <input id="pi-model" class="field" type="text" list="pi-models" bind:value={name} placeholder={provider === "openrouter" ? "anthropic/claude-haiku-5.5" : offered[0] ?? "model name"} spellcheck="false" autocomplete="off" />
    <datalist id="pi-models">{#each offered as m (m)}<option value={m}></option>{/each}</datalist>
    <div class="row">
      <button type="button" class="btn" disabled={!name.trim() || checking} title="One short request with this key and model (a few tokens), to know it answers" onclick={() => void check()}>{checking ? "checking…" : "Check"}</button>
      <button type="button" class="btn primary" disabled={!name.trim()} onclick={() => void choose()}>Use this model</button>
    </div>
    {#if checked}<p class="note" class:ok={checked.ok} class:bad={!checked.ok} role="status" data-testid="pi-check">{checked.ok ? "✓ " : "✗ "}{checked.text}</p>{/if}
    <h2 class="label">What it may do in your project</h2>
    <p class="note">Its tools for your notes are always on. These are for the project's files, which it does not need to manage the knowledge base.{#if model.reachFromEnvironment} ISORITE_PI_FILES or ISORITE_PI_SHELL sets this and wins while it is set.{/if}</p>
    <fieldset disabled={model.reachFromEnvironment}>
      <legend class="hidden-label">Project files</legend>
      <label><input type="radio" name="pi-files" checked={model.reach.files === "off"} onchange={() => void reach("off", model!.reach.shell)} /> No project files</label>
      <label><input type="radio" name="pi-files" checked={model.reach.files === "read"} onchange={() => void reach("read", model!.reach.shell)} /> Read files</label>
      <p class="note">Reads, searches and lists files inside the project folder. It can see everything there that you can, including files that hold secrets. It cannot change anything.</p>
      <label><input type="radio" name="pi-files" checked={model.reach.files === "write"} onchange={() => void reach("write", model!.reach.shell)} /> Read and write files</label>
      <p class="note">Also edits and creates files inside the project folder, never in .git. It changes your files directly: keep the project in version control.</p>
      <label><input type="checkbox" checked={model.reach.shell} onchange={(e) => void reach(model!.reach.files, e.currentTarget.checked)} /> Run shell commands</label>
      <p class="note warn">A shell is not confined. A command runs as you and can read or change any file you can, use the network, and reach outside the project folder; the checks on file paths do not apply to it. To confine it, run isorite inside a container or a disposable virtual machine, or under a separate user account that has only the project; or leave it off.</p>
    </fieldset>
    {#if said}<p class="note" role="status">{said}</p>{/if}
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .note { color: var(--text-dim, var(--text)); font-size: 12px; }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .warn { color: var(--rose); }
  .row { display: flex; gap: var(--space-2); }
  input:not([type="radio"], [type="checkbox"]), select { width: 100%; min-width: 0; font: 12.5px var(--font-mono); }
  .in-use { color: var(--growth); }
  .ok { color: var(--malachite, var(--growth)); }
  .gw { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font-size: 12px; }
  .gw dt { color: var(--text-faint); } .gw dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
  .snippet { margin: 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); white-space: pre; overflow-x: auto; }
  code { font: 11.5px var(--font-mono); }
  .bad { color: var(--rose); }
  .agents { width: 100%; min-height: 96px; resize: vertical; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 8px 10px; font: 12.5px/1.55 var(--font-mono); color: var(--text); }
  .agents:focus { border-color: var(--line-strong); outline: none; }
</style>
