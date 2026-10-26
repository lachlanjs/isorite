<script lang="ts">
  // The Note pane's settings, and what belongs to no one pane: the base, the ground, fullscreen, and on a desktop the
  // layouts and which panes show (M10b: from the header, which is gone).
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { app } from "$lib/app.svelte.ts";
  import { CODE_LOOKS, GROUNDS, codeLook, ground } from "$lib/ground.svelte.ts";
  import { LAYOUTS, PANES, panes, type Pane } from "$lib/panes.svelte.ts";
  import { makeKind } from "$lib/make.ts";

  const NAME: Record<Pane, string> = { note: "Note", atlas: "Atlas", iso: "Iso" };
  const LAYOUT_NAME: Record<string, string> = { cols: "Three columns", stack: "The note beside the Atlas over Iso", one: "One pane: the one in focus" };

  // Fullscreen where the browser has it. Opened from the Home Screen, isorite already has the whole screen.
  let can = $state(false);
  let full = $state(false);
  onMount(() => {
    can = !!document.fullscreenEnabled && !matchMedia("(display-mode: standalone)").matches;
    const changed = () => { full = document.fullscreenElement !== null; };
    changed();
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  });
  // The guide's site (M16, Q73): what you did is kept in this browser until you start again, which asks once more.
  const site = import.meta.env.MODE === "guide";
  let sure = $state(false);
  async function startAgain(): Promise<void> {
    if (!sure) { sure = true; return; }
    const { forgetKept } = await import("$lib/guide/kept.ts");
    await forgetKept();
    try { localStorage.removeItem("isorite.last"); } catch { /* not kept */ }
    location.hash = "";
    location.reload();
  }
  function fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }
</script>

{#if app.open && !app.open.startsWith("@")}
  {@const open = app.open}
  <section>
    <h2 class="label">this note</h2>
    <div class="row">
      <button class="btn" type="button" onclick={() => { panes.settings = null; void makeKind("question", open); }}>A question about it</button>
      <button class="btn" type="button" onclick={() => { panes.settings = null; void makeKind("problem", open); }}>A problem using it</button>
    </div>
  </section>
{/if}

{#if app.session}
  <section>
    <h2 class="label">the base</h2>
    <p><span class="name">{app.session.name}</span> <span class="faint">· {app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span></p>
    {#if site}
      <div class="row">
        <button class="btn" class:danger={sure} type="button" title="The guide as it was first, here in this browser: what you changed in it goes" onclick={() => void startAgain()} onblur={() => (sure = false)}>{sure ? "start again: your changes go" : "start the guide again"}</button>
      </div>
    {/if}
  </section>
{/if}

<section>
  <h2 class="label">the ground</h2>
  <div class="row" role="radiogroup" aria-label="Ground">
    {#each GROUNDS as [value, name] (value)}
      <button class="btn" class:on={ground.chosen === value} type="button" role="radio" aria-checked={ground.chosen === value} onclick={() => ground.choose(value)}>{name}</button>
    {/each}
  </div>
</section>

<section>
  <h2 class="label">the code</h2>
  <div class="row" role="radiogroup" aria-label="Code">
    {#each CODE_LOOKS as [value, name] (value)}
      <button class="btn" class:on={codeLook.chosen === value} type="button" role="radio" aria-checked={codeLook.chosen === value} title={value ? "keywords bold, comments faint, as in print" : "coloured by what each word is"} onclick={() => codeLook.choose(value)}>{name}</button>
    {/each}
  </div>
</section>

{#if can || !panes.narrow}
  <section>
    <h2 class="label">the screen</h2>
    <div class="row">
      {#if can}<button class="btn" class:on={full} type="button" aria-pressed={full} onclick={fullscreen}>fullscreen</button>{/if}
      {#if !panes.narrow}
        <span class="icons" role="group" aria-label="Layout">
          {#each LAYOUTS as l (l)}
            <button class="icon" type="button" aria-pressed={panes.layout === l} aria-label={LAYOUT_NAME[l]} title="{LAYOUT_NAME[l]}  (Alt+L)" onclick={() => panes.setLayout(l)}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" />{#if l === "cols"}<path d="M5.8 2.5v11M10.2 2.5v11" />{:else if l === "stack"}<path d="M8 2.5v11M8 8h6.5" />{/if}</svg>
            </button>
          {/each}
        </span>
        <span class="icons" role="group" aria-label="Panes shown">
          {#each PANES as p (p)}
            <button class="icon" type="button" class:off={!panes.show[p]} aria-pressed={panes.show[p]} aria-label="Show {NAME[p]}" title="Show or hide {NAME[p]}  (Alt+{PANES.indexOf(p) + 1} brings it back){p === 'iso' ? ' · hide it when your terminal has the session' : ''}" onclick={() => panes.toggle(p)}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">{#if p === "note"}<path d="M4 2.5h6l2.5 2.5v8.5H4zM6 7h5M6 9.5h5" />{:else if p === "atlas"}<rect x="2" y="2.5" width="5" height="4" /><rect x="9" y="9.5" width="5" height="4" /><path d="M4.5 6.5v5H9" />{:else}<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" />{/if}</svg>
            </button>
          {/each}
        </span>
      {/if}
    </div>
  </section>
{/if}

<p class="foot"><a href={resolve("/parts")} onclick={() => (panes.settings = null)}>the parts</a></p>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-2); }
  h2 { font-weight: 400; }
  .name { color: var(--text); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
  .btn.on { --fill: var(--text); color: var(--ground-0); font-weight: 700; }
  .icons { display: flex; align-items: center; gap: 2px; }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); background: none; border: 0; padding: 0; cursor: pointer; }
  .icon:hover, .icon:focus-visible { color: var(--text); }
  .icon[aria-pressed="true"] { color: var(--text); background: var(--ground-3); }
  .icon.off { opacity: 0.45; background: none; }
  .foot { border-top: 1px solid var(--line); padding-top: var(--space-3); margin: 0; font-size: 12px; }
</style>
