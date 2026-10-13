<script lang="ts">
  // What is behind the logo: the settings. The ground, and Iso's provider key. The key goes to the device's
  // configuration and is never shown again: this only says whether one is held.
  import { resolve } from "$app/paths";
  import type { Settings } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";
  import { GROUNDS, ground } from "$lib/ground.svelte.ts";

  let { close }: { close: () => void } = $props();

  let settings = $state.raw<Settings | null>(null);
  let key = $state("");
  let problem = $state("");
  let panel: HTMLDivElement;

  $effect(() => { void app.api.settings().then((s) => (settings = s), (e) => (problem = (e as Error).message)); });
  $effect(() => { panel.focus(); });

  async function setKey(value: string | null) {
    problem = "";
    try { settings = await app.api.setKey(value); key = ""; } catch (e) { problem = (e as Error).message; }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") close(); }} />
<button class="shade" type="button" aria-label="Close settings" onclick={close}></button>

<div class="frame menu" role="dialog" aria-label="Settings" tabindex="-1" bind:this={panel}>
  <span class="frame-title">settings</span>

  <section>
    <h2 class="label">the ground</h2>
    <div class="row" role="radiogroup" aria-label="Ground">
      {#each GROUNDS as [value, name] (value)}
        <button class="btn" class:on={ground.chosen === value} type="button" role="radio" aria-checked={ground.chosen === value} onclick={() => ground.choose(value)}>{name}</button>
      {/each}
    </div>
  </section>

  <section>
    <h2 class="label">Iso</h2>
    {#if settings}
      <p class="soft">Asked through {settings.provider}. {settings.key ? "A key is held on this device." : "No key is held yet, so Iso cannot be asked."}</p>
      <form class="row" onsubmit={(e) => { e.preventDefault(); if (key.trim()) void setKey(key); }}>
        <label class="hidden-label" for="key">Provider key</label>
        <input id="key" class="field grow" type="password" bind:value={key} placeholder={settings.key ? "paste another key to replace it" : "paste a key"} autocomplete="off" spellcheck="false" />
        <button class="btn primary" type="submit" disabled={!key.trim()}>hold it</button>
        {#if settings.key}<button class="btn" type="button" onclick={() => setKey(null)}>forget it</button>{/if}
      </form>
      <p class="faint">The key is kept in this device's configuration, never in a base, and is not shown again.</p>
      <dl class="tiers">
        {#each ["low", "mid", "max"] as const as t (t)}<dt>{t}</dt><dd class="faint">{settings.tiers[t]}</dd>{/each}
      </dl>
    {/if}
    {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  </section>

  <div class="row foot">
    <a href={resolve("/parts")} onclick={close}>the parts</a>
    <span class="grow"></span>
    <button class="btn quiet" type="button" onclick={close}>close</button>
  </div>
</div>

<style>
  .shade { position: fixed; inset: 0; z-index: 20; background: color-mix(in srgb, var(--ground-0) 60%, transparent); border: 0; cursor: default; }
  .menu { --inside: var(--ground-2); position: fixed; z-index: 21; top: 52px; left: 12px; width: min(420px, calc(100vw - 24px)); padding: 24px 18px 14px; display: flex; flex-direction: column; gap: var(--space-6); white-space: normal; }
  .menu:focus-visible { outline: none; }
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .btn.on { --fill: var(--text); color: var(--ground-0); font-weight: 700; }
  .tiers { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-3); margin: var(--space-1) 0 0; font-size: 12px; }
  .tiers dd { margin: 0; overflow-wrap: anywhere; }
  .bad { color: var(--rose); }
  .foot { border-top: 1px solid var(--line); padding-top: var(--space-3); }
</style>
