<script lang="ts">
  // Iso's settings, under its pane's header: the provider (set up here where isorite serves the page, M18), the
  // spend cap and AGENTS.md. The key goes to the device's configuration and is never shown again: this only says
  // whether one is held.
  import type { Settings } from "@isorite/engine";
  import type { SetupApi } from "$lib/api.ts";
  import { app } from "$lib/app.svelte.ts";
  import ProviderSetup from "./ProviderSetup.svelte";
  import { converse } from "$lib/converse.svelte.ts";
  import { spend } from "$lib/spend.svelte.ts";

  let settings = $state.raw<Settings | null>(null);
  /** The provider's setup, where a server is there to keep it (not for the engine in the page). */
  const setup = (app.api as { setup?: SetupApi } | undefined)?.setup ?? null;
  let key = $state("");
  let problem = $state("");
  let cap = $state("");
  /** The base's AGENTS.md (M15), as it is on disk, and as it is being written here. */
  let agents = $state<string | null>(null);
  let saved = "";
  $effect(() => { void app.api.agents().then((a) => { agents = a.text ?? ""; saved = agents; }, () => undefined); });
  async function keepAgents() {
    if (agents === null || agents === saved) return;
    problem = "";
    try { await app.api.saveAgents(agents); saved = agents; converse.measure(); } catch (e) { problem = (e as Error).message; }
  }

  $effect(() => { void app.api.settings().then((s) => (settings = s), (e) => (problem = (e as Error).message)); });
  // What the last sign-in said is let go with the settings.
  $effect(() => () => { app.signIn = null; });

  async function setKey(value: string | null) {
    problem = "";
    app.signIn = null;
    try { settings = await app.api.setKey(value); key = ""; } catch (e) { problem = (e as Error).message; }
  }
  async function setCap(value: number | null) {
    problem = "";
    try { settings = await app.api.setSpendCap(value); cap = ""; void spend.refresh(); } catch (e) { problem = (e as Error).message; }
  }
  async function signIn() {
    problem = "";
    app.signIn = null;
    try { await app.startSignIn(); } catch (e) { problem = (e as Error).message; }
  }
</script>

<section>
  {#if settings && setup}
    <ProviderSetup api={setup} {settings} onsettings={(s) => { settings = s; void spend.refresh(); }} />
  {:else if settings}
    <h2 class="label">the provider</h2>
    <p class="soft">Asked through {settings.provider}. {settings.key ? "A key is held on this device." : "No key is held yet, so Iso cannot be asked."}</p>
    <form class="row" onsubmit={(e) => { e.preventDefault(); if (key.trim()) void setKey(key); }}>
      <label class="hidden-label" for="key">Provider key</label>
      <input id="key" class="field grow" type="password" bind:value={key} placeholder={settings.key ? "paste another key to replace it" : "paste a key"} title="kept in this device's configuration, never in a base, and not shown again" autocomplete="off" spellcheck="false" />
      <button class="btn primary" type="submit" disabled={!key.trim()}>hold it</button>
      {#if settings.key}<button class="btn" type="button" onclick={() => setKey(null)}>forget it</button>{/if}
      {#if settings.connect}<button class="btn" type="button" onclick={signIn} title="you sign in at {settings.provider}, and the key it makes comes straight here; a spending limit for it is set on its page of keys">sign in for a key</button>{/if}
    </form>
    {#if app.signIn}<p class={app.signIn.ok ? "soft" : "bad"} role="status">{app.signIn.message}</p>{/if}
    <dl class="tiers">
      {#each ["low", "mid", "max"] as const as t (t)}<dt>{t}</dt><dd class="faint">{settings.tiers[t]}</dd>{/each}
    </dl>
  {/if}
  {#if settings}
    <form class="row" onsubmit={(e) => { e.preventDefault(); const n = Number(cap); if (n > 0) void setCap(n); }}>
      <label class="hidden-label" for="cap">Monthly spend cap in dollars</label>
      <input id="cap" class="field grow" type="number" min="0.01" step="any" bind:value={cap} placeholder={settings.spendCap ? `$${settings.spendCap} a month; another amount replaces it` : "a monthly cap in dollars"} title="the lower bar in Iso's header fills toward this, over a calendar month; a key with a limit of its own at {settings.provider} is measured by that instead" autocomplete="off" />
      <button class="btn" type="submit" disabled={!(Number(cap) > 0)}>set it</button>
      {#if settings.spendCap}<button class="btn" type="button" onclick={() => setCap(null)}>no cap</button>{/if}
    </form>
  {/if}
  {#if agents !== null}
    <h2 class="label">AGENTS.md</h2>
    <label class="hidden-label" for="agents">AGENTS.md: your instructions for this base</label>
    <textarea id="agents" class="agents" bind:value={agents} rows="6" spellcheck="true" placeholder="notation, level, language, how notes are named" title="Your instructions for this base: sent with every turn, to Iso and to the terminal's agent. Kept at the top of your notes, as AGENTS.md." onblur={() => void keepAgents()}></textarea>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .tiers { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-3); margin: var(--space-1) 0 0; font-size: 12px; }
  .tiers dd { margin: 0; overflow-wrap: anywhere; }
  .bad { color: var(--rose); }
  .agents { width: 100%; min-height: 96px; resize: vertical; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 8px 10px; font: 12.5px/1.55 var(--font-mono); color: var(--text); }
  .agents:focus { border-color: var(--line-strong); outline: none; }
</style>
