<script lang="ts">
  // The provider's setup (M18), in Iso's settings: OpenRouter, or a gateway of your own, with what a gateway may
  // ask for folded under the address and key. Checked as isorite doctor checks it, before it is kept; kept, it is
  // in use at once. Secrets go to the server and never come back: they show as held. The setup is changed only
  // from this machine; elsewhere it is shown, the key and the check still to hand.
  import { OPENROUTER } from "@isorite/engine";
  import type { ProviderSetup, Settings, SetupCheck, SetupDraft, SetupPair, SetupView, Tier } from "@isorite/engine";
  import type { SetupApi } from "$lib/api.ts";
  import { app } from "$lib/app.svelte.ts";

  let { api, settings, onsettings }: { api: SetupApi; settings: Settings; onsettings: (s: Settings) => void } = $props();

  const TIERS: Tier[] = ["low", "mid", "max"];
  const MARK: Record<SetupCheck["outcome"], string> = { ok: "✓", warn: "!", fail: "✗", skip: "–" };

  let view = $state.raw<SetupView | null>(null);
  /** The setup as it is being written here; kept, it becomes the view's. */
  let draft = $state<ProviderSetup | null>(null);
  /** A key for a new address, and the .pfx's password: sent with the setup when it is kept. */
  let fresh = $state("");
  let passphrase = $state("");
  /** A key for the address kept, held at once as before. */
  let key = $state("");
  let checks = $state.raw<SetupCheck[] | null>(null);
  let models = $state.raw<string[] | null>(null);
  let busy = $state<"" | "check" | "keep" | "report">("");
  let report = $state("");
  let problem = $state("");

  const tidy = (url: string) => url.trim().replace(/\/+$/, "");
  const load = (v: SetupView) => { view = v; draft = structuredClone(v.setup); fresh = ""; passphrase = ""; };
  $effect(() => { void api.view().then(load, (e) => (problem = (e as Error).message)); });

  /** Whether the key would go somewhere else than the address it was given for: it is then given again. */
  const at = (s: ProviderSetup) => (s.kind === "gateway" ? tidy(s.url) : OPENROUTER.url);
  const moved = $derived(Boolean(draft && view && at(draft) !== at(view.setup)));
  const changed = $derived(Boolean(draft && view && (JSON.stringify(draft) !== JSON.stringify(view.setup) || fresh || passphrase)));
  const local = $derived(view?.local ?? false);

  function sent(): SetupDraft {
    const d: SetupDraft = $state.snapshot(draft)!;
    if (moved && fresh.trim()) d.key = fresh.trim();
    if (passphrase) d.passphrase = passphrase;
    return d;
  }

  async function act<T>(what: typeof busy, run: () => Promise<T>): Promise<T | undefined> {
    problem = "";
    busy = what;
    try { return await run(); } catch (e) { problem = (e as Error).message; return undefined; } finally { busy = ""; }
  }
  const check = () => act("check", async () => { checks = await api.check(local && changed ? sent() : null); });
  const keep = () => act("keep", async () => {
    load(await api.keep(sent()));
    checks = null;
    models = null;
    onsettings(await app.api.settings());
  });
  /** The provider's list, asked the first time a tier is chosen. */
  async function listModels() {
    if (models) return;
    models = [];
    try { models = await api.models(local && changed ? sent() : null); } catch { /* typed instead */ }
  }
  const copyReport = () => act("report", async () => {
    report = await api.report();
    try { await navigator.clipboard.writeText(report); report = ""; } catch { /* shown, to be copied by hand */ }
  });

  async function setKey(value: string | null) {
    problem = "";
    app.signIn = null;
    try { onsettings(await app.api.setKey(value)); key = ""; load(await api.view()); } catch (e) { problem = (e as Error).message; }
  }
  async function signIn() {
    problem = "";
    app.signIn = null;
    try { await app.startSignIn(); } catch (e) { problem = (e as Error).message; }
  }

  const add = (pairs: SetupPair[]) => pairs.push({ name: "", value: "" });
  /** A name that looks secret, as the server judges it: its value is typed unseen, and held once kept. */
  const secret = (pair: SetupPair) => pair.held || (/key|token|secret|pass|auth|cookie/i.test(pair.name) && !/^\$[A-Za-z_]\w*$/.test(pair.value));
</script>

{#snippet pairs(list: SetupPair[], what: string)}
  {#each list as pair, i (i)}
    <div class="row">
      <input class="field name" bind:value={pair.name} aria-label="{what} name" placeholder="name" autocomplete="off" spellcheck="false" />
      <input class="field grow" type={secret(pair) ? "password" : "text"} bind:value={pair.value} aria-label="{what} value" placeholder={pair.held ? "held" : "value, or $NAME"} title={pair.held ? "held, not shown: type another to replace it" : "a value, or $NAME for an environment variable"} autocomplete="off" spellcheck="false" />
      <button class="icon" type="button" aria-label="remove {pair.name || what}" title="remove" onclick={() => list.splice(i, 1)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" /></svg>
      </button>
    </div>
  {/each}
  <button class="icon" type="button" aria-label="add a {what}" title="add a {what}" onclick={() => add(list)}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.3" /></svg>
  </button>
{/snippet}

<div class="head">
  <h2 class="label">the provider</h2>
  <span class="grow"></span>
  <button class="icon" type="button" aria-label="check" title={local && changed ? "check this setup before keeping it: its models, a few words from each, a tool call (a few hundred tokens)" : "check the setup kept: its models, a few words from each, a tool call (a few hundred tokens)"} disabled={busy !== ""} aria-busy={busy === "check"} onclick={check}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.5 8.5h3l1.8-4.5 3 8 1.9-3.5h3.3" stroke="currentColor" stroke-width="1.3" fill="none" /></svg>
  </button>
  {#if local}
    <button class="icon" type="button" aria-label="keep" title="keep it, in use at once (config.toml is written again, without its comments: the first time, the file as it was is kept beside it as config.toml.bak). A running isorite term takes new models when it is next started" disabled={!changed || busy !== ""} aria-busy={busy === "keep"} onclick={keep}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="1.4" fill="none" /></svg>
    </button>
  {/if}
  <button class="icon" type="button" aria-label="copy the report" title="copy isorite doctor's report, its secrets hidden, to paste to someone helping (it checks the provider too)" disabled={busy !== ""} aria-busy={busy === "report"} onclick={copyReport}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="3.5" y="2.5" width="9" height="11.5" rx="1" stroke="currentColor" stroke-width="1.2" fill="none" /><path d="M6 2.5V1.5h4v1M5.8 6.5h4.4M5.8 9h4.4M5.8 11.5h2.6" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
  </button>
</div>

<p class="soft">Asked through {settings.provider}. {settings.key ? "A key is held on this device." : "No key is held yet."}</p>

{#if draft && view}
  <fieldset disabled={!local} title={local ? undefined : "changed only from this machine (localhost): the key goes where this says"}>
    <div class="kinds" role="radiogroup" aria-label="The provider">
      <label><input type="radio" bind:group={draft.kind} value="openrouter" /> OpenRouter</label>
      <label><input type="radio" bind:group={draft.kind} value="gateway" /> a gateway of your own</label>
    </div>
    {#if draft.kind === "gateway"}
      <div class="row">
        <input class="field grow" bind:value={draft.url} aria-label="The gateway's address" placeholder="https://… /v1" title="its address, as an OpenAI-compatible client is given it (…/v1)" autocomplete="off" spellcheck="false" />
        <input class="field name" bind:value={draft.name} aria-label="Its name" placeholder="name" title="what to call it" autocomplete="off" spellcheck="false" />
      </div>
    {/if}
  </fieldset>

  {#if moved}
    <input class="field" type="password" bind:value={fresh} disabled={!local} aria-label="A key for this address" placeholder={draft.kind === "gateway" ? "a key for this address" : "a key from OpenRouter"} title="the key goes with the address: the one held now is forgotten when this is kept, unless another is given" autocomplete="off" spellcheck="false" />
  {:else}
    <form class="row" onsubmit={(e) => { e.preventDefault(); if (key.trim()) void setKey(key); }}>
      <input class="field grow" type="password" bind:value={key} aria-label="Provider key" placeholder={settings.key ? "held: paste another to replace it" : "paste a key"} title="kept in this device's configuration, never in a base, and not shown again" autocomplete="off" spellcheck="false" />
      <button class="btn primary" type="submit" disabled={!key.trim()}>hold it</button>
      {#if settings.key}<button class="btn" type="button" onclick={() => setKey(null)}>forget it</button>{/if}
      {#if settings.connect}
        <button class="btn" type="button" onclick={signIn} title="you sign in at {settings.provider}, and the key it makes comes straight here; a spending limit for it is set on its page of keys">sign in for a key</button>
      {/if}
    </form>
    {#if app.signIn}<p class={app.signIn.ok ? "soft" : "bad"} role="status">{app.signIn.message}</p>{/if}
  {/if}

  <fieldset disabled={!local} title={local ? undefined : "changed only from this machine (localhost)"}>
    {#if draft.kind === "gateway"}
      <details>
        <summary class="label">what else it asks for</summary>
        <div class="more">
          <input class="field" bind:value={draft.keyHeader} aria-label="The header the key goes in" placeholder="the key's header" title="the header the key goes in (key_header), as api-key; left empty, Authorization: Bearer" autocomplete="off" spellcheck="false" />
          <h3 class="label">headers</h3>
          {@render pairs(draft.headers, "header")}
          <h3 class="label">query</h3>
          {@render pairs(draft.query, "query value")}
          <h3 class="label">client certificate</h3>
          <div class="row">
            <input class="field grow" bind:value={draft.pfx} aria-label="The .pfx file" placeholder="~/… .pfx" title="a .pfx (or .p12) on this machine: the certificate and its key" autocomplete="off" spellcheck="false" />
            <input class="field name" type="password" bind:value={passphrase} aria-label="The .pfx's password" placeholder={draft.passphraseHeld ? "password held" : "its password"} title="the .pfx's password: held, not shown" autocomplete="off" />
          </div>
          <div class="row">
            <input class="field grow" bind:value={draft.cert} aria-label="The certificate" placeholder="or a certificate" title="instead of a .pfx: the certificate (cert, a .pem)" autocomplete="off" spellcheck="false" />
            <input class="field grow" bind:value={draft.certKey} aria-label="The certificate's key" placeholder="and its key" title="and its private key (cert_key, a .pem)" autocomplete="off" spellcheck="false" />
          </div>
          <input class="field" bind:value={draft.ca} aria-label="The authority" placeholder="an authority" title="the authority the gateway's own certificate is signed by (ca, a .pem), added to those trusted: for a gateway whose certificate the company signs" autocomplete="off" spellcheck="false" />
          <div class="row">
            <label class="soft check" title="some gateways refuse stream_options: then the gauge can't count what Iso costs"><input type="checkbox" bind:checked={draft.streamUsage} /> reports usage</label>
            <input class="field name" type="number" min="1" step="1" value={draft.maxTokens ?? ""} oninput={(e) => { const n = Number(e.currentTarget.value); draft!.maxTokens = n > 0 ? Math.floor(n) : null; }} aria-label="max_tokens" placeholder="max_tokens" title="the most a reply may be, for models that think at length" />
          </div>
        </div>
      </details>
    {/if}
    <div class="tiers">
      {#each TIERS as t (t)}
        <label class="label" for="tier-{t}">{t}</label>
        <input id="tier-{t}" class="field" list="setup-models" bind:value={draft.tiers[t]} onfocus={listModels} autocomplete="off" spellcheck="false" title="the {t} tier's model: one the provider lists, or its name typed" />
      {/each}
      <datalist id="setup-models">{#each models ?? [] as m (m)}<option value={m}></option>{/each}</datalist>
    </div>
  </fieldset>

  {#if checks}
    <ul class="checks" aria-label="The check">
      {#each checks as c, i (i)}<li class={c.outcome}><span class="mark">{MARK[c.outcome]}</span><span>{c.step}</span><span class="faint said">{c.said}</span></li>{/each}
    </ul>
  {/if}
  {#if report}<pre class="report" aria-label="The report">{report}</pre>{/if}
{/if}
{#if problem}<p class="bad" role="alert">{problem}</p>{/if}

<style>
  .head { display: flex; align-items: center; gap: 2px; }
  h2 { font-weight: 400; }
  h3 { font-weight: 400; margin: var(--space-1) 0 0; }
  .grow { flex: 1; }
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .row .grow { min-width: 12em; }
  .name { width: 10em; }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: 13px; }
  .kinds label, .check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  details summary { cursor: pointer; list-style: none; }
  details summary::before { content: "▸ "; }
  details[open] summary::before { content: "▾ "; }
  .more { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2) 0 0 var(--space-3); }
  .tiers { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 4px var(--space-3); }
  .tiers .field { height: 28px; font-size: 12px; }
  .icon { width: 28px; height: 28px; display: inline-grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .icon:hover:not(:disabled), .icon:focus-visible { color: var(--text); }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .icon[aria-busy="true"] { opacity: 1; color: var(--text); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.4; } }
  .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .checks li { display: grid; grid-template-columns: 1em auto 1fr; gap: 0 var(--space-2); align-items: baseline; }
  .checks .said { overflow-wrap: anywhere; }
  .checks .ok .mark { color: var(--growth); }
  .checks .warn .mark { color: var(--text-soft); }
  .checks .fail .mark { color: var(--rose); }
  .report { margin: 0; max-height: 16em; overflow: auto; font: 11px/1.5 var(--font-mono); background: var(--ground-1); border: 1px solid var(--line); padding: 8px 10px; white-space: pre-wrap; user-select: text; }
  .bad { color: var(--rose); }
</style>
