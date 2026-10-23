<script lang="ts">
  // Iso's settings, under its pane's header: the provider key, and what each tier asks. The key goes to the
  // device's configuration and is never shown again: this only says whether one is held.
  import type { Settings } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";

  let settings = $state.raw<Settings | null>(null);
  let key = $state("");
  let problem = $state("");

  $effect(() => { void app.api.settings().then((s) => (settings = s), (e) => (problem = (e as Error).message)); });
  // What the last sign-in said is let go with the settings.
  $effect(() => () => { app.signIn = null; });

  async function setKey(value: string | null) {
    problem = "";
    app.signIn = null;
    try { settings = await app.api.setKey(value); key = ""; } catch (e) { problem = (e as Error).message; }
  }
  async function signIn() {
    problem = "";
    app.signIn = null;
    try { await app.startSignIn(); } catch (e) { problem = (e as Error).message; }
  }
</script>

<section>
  <h2 class="label">the provider</h2>
  {#if settings}
    <p class="soft">Asked through {settings.provider}. {settings.key ? "A key is held on this device." : "No key is held yet, so Iso cannot be asked."}</p>
    <form class="row" onsubmit={(e) => { e.preventDefault(); if (key.trim()) void setKey(key); }}>
      <label class="hidden-label" for="key">Provider key</label>
      <input id="key" class="field grow" type="password" bind:value={key} placeholder={settings.key ? "paste another key to replace it" : "paste a key"} autocomplete="off" spellcheck="false" />
      <button class="btn primary" type="submit" disabled={!key.trim()}>hold it</button>
      {#if settings.key}<button class="btn" type="button" onclick={() => setKey(null)}>forget it</button>{/if}
    </form>
    {#if settings.connect}
      <div class="row">
        <span class="faint">or</span>
        <button class="btn" type="button" onclick={signIn}>sign in at {settings.provider} for a new key</button>
      </div>
      <p class="faint">You sign in there, and the key it makes comes straight here. A spending limit for it is set on the provider's page of keys.</p>
    {/if}
    {#if app.signIn}<p class={app.signIn.ok ? "soft" : "bad"} role="status">{app.signIn.message}</p>{/if}
    <p class="faint">The key is kept in this device's configuration, never in a base, and is not shown again.</p>
    <dl class="tiers">
      {#each ["low", "mid", "max"] as const as t (t)}<dt>{t}</dt><dd class="faint">{settings.tiers[t]}</dd>{/each}
    </dl>
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
</style>
