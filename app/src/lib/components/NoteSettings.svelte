<script lang="ts">
  // The Note pane's settings, and what belongs to no one pane: the base, the ground, fullscreen, and on a desktop the
  // layouts and which panes show (M10b: from the header, which is gone).
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { app } from "$lib/app.svelte.ts";
  import { GROUNDS, ground } from "$lib/ground.svelte.ts";
  import { LAYOUTS, PANES, panes, type Pane } from "$lib/panes.svelte.ts";
  import { makeKind } from "$lib/make.ts";
  import { kept } from "$lib/here.ts";
  import Glyph from "./Glyph.svelte";
  import { growOpen } from "$lib/motion.ts";

  const NAME: Record<Pane, string> = { note: "Note", atlas: "Atlas", agent: "Agent" };
  const LAYOUT_NAME: Record<string, string> = { cols: "Three columns", stack: "Note beside Atlas over Agent", one: "One pane" };

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
    try { localStorage.removeItem(kept("isorite.last")); } catch { /* not kept */ }
    location.hash = "";
    location.reload();
  }
  // Deleting the open note (M23: from the menu, away from its name in the label). Asked first, saying who links here.
  let asking = $state<string[] | null>(null), problem = $state("");
  async function askDelete(id: string): Promise<void> {
    problem = "";
    try {
      const map = await app.api.map();
      asking = [...new Set(map.model.edges.filter(([from, to]) => to === id && from !== id && !from.startsWith("@")).map(([from]) => map.notes[from]?.title || from))];
    } catch (e) { problem = (e as Error).message; }
  }
  async function remove(id: string): Promise<void> {
    try {
      await app.api.deleteNote(id, (await app.api.readNote(id)).version);
      asking = null;
      panes.settings = null;
      await app.refresh();
      await goto(resolve("/notes"), { replaceState: true });
    } catch (e) { problem = (e as Error).message; asking = null; }
  }

  function fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }
</script>

{#if app.open && !app.open.startsWith("@")}
  {@const open = app.open}
  <section>
    <div class="setting">
      <span class="label">note</span>
      <div class="row">
        <button class="icon" type="button" aria-label="A question about this note" title="A question about this note" onclick={() => { panes.settings = null; void makeKind("question", open); }}><Glyph kind="question" size={18} /></button>
        <button class="icon" type="button" aria-label="A problem using this note" title="A problem using this note" onclick={() => { panes.settings = null; void makeKind("problem", open); }}><Glyph kind="problem" size={18} /></button>
        {#if asking === null && app.listing.notes.some((n) => n.id === open)}<button class="icon danger-text" type="button" aria-label="Delete this note" title="Delete this note" onclick={() => void askDelete(open)}><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" /></svg></button>{/if}
      </div>
    </div>
    {#if asking !== null}
      <div class="ask" role="alertdialog" aria-label="delete this note" transition:growOpen>
        <span>Delete this note?{#if asking.length} Linked from {asking.join(", ")}: the links break.{/if}</span>
        <div class="row">
          <button class="btn danger" type="button" onclick={() => void remove(open)}>delete</button>
          <button class="btn quiet" type="button" onclick={() => { asking = null; }}>keep it</button>
        </div>
      </div>
    {/if}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </section>
{/if}

{#if app.session}
  <section>
    <div class="setting">
      <span class="label">base</span>
      <div class="row">
        <span class="name">{app.session.name}</span>
        {#if site}<button class="btn quiet" class:danger={sure} type="button" title="The guide as it was first, here in this browser" onclick={() => void startAgain()} onblur={() => (sure = false)}>{sure ? "Reset? Your changes go" : "Reset guide"}</button>{/if}
      </div>
    </div>
  </section>
{/if}

<section>
  <div class="setting">
    <span class="label" id="ground-label">ground</span>
    <div class="segs" role="radiogroup" aria-labelledby="ground-label">
      {#each GROUNDS as [value, name] (value)}
        <button type="button" role="radio" aria-checked={ground.chosen === value} onclick={() => ground.choose(value)}>{name}</button>
      {/each}
    </div>
  </div>
  {#if !panes.narrow}
    <div class="setting">
      <span class="label">layout</span>
      <span class="icons" role="group" aria-label="Layout">
        {#each LAYOUTS as l (l)}
          <button class="icon" type="button" aria-pressed={panes.layout === l} aria-label={LAYOUT_NAME[l]} title="{LAYOUT_NAME[l]}  (Alt+L)" onclick={() => panes.setLayout(l)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" />{#if l === "cols"}<path d="M5.8 2.5v11M10.2 2.5v11" />{:else if l === "stack"}<path d="M8 2.5v11M8 8h6.5" />{/if}</svg>
          </button>
        {/each}
      </span>
    </div>
    <div class="setting">
      <span class="label">panes</span>
      <span class="icons" role="group" aria-label="Panes shown">
        {#each PANES as p (p)}
          <button class="icon" type="button" class:off={!panes.show[p]} aria-pressed={panes.show[p]} aria-label="Show {NAME[p]}" title="{NAME[p]}  (Alt+{PANES.indexOf(p) + 1})" onclick={() => panes.toggle(p)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">{#if p === "note"}<path d="M4 2.5h6l2.5 2.5v8.5H4zM6 7h5M6 9.5h5" />{:else if p === "atlas"}<rect x="2" y="2.5" width="5" height="4" /><rect x="9" y="9.5" width="5" height="4" /><path d="M4.5 6.5v5H9" />{:else}<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" />{/if}</svg>
          </button>
        {/each}
      </span>
    </div>
  {/if}
  {#if can}
    <div class="setting">
      <span class="label">window</span>
      <div class="segs"><button type="button" aria-pressed={full} onclick={fullscreen}>fullscreen</button></div>
    </div>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-3); }
  .icon.danger-text { color: var(--text-faint); }
  .name { color: var(--text); }
  .danger-text:hover, .danger-text:focus-visible { color: var(--rose); }
  .ask { display: flex; flex-direction: column; gap: var(--space-2); color: var(--text-soft); font-size: 0.8125rem; }
  .problem { margin: 0; color: var(--rose); font-size: 0.75rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
  .icons { display: flex; align-items: center; gap: 2px; }
  .icon { position: relative; width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); background: none; border: 0; padding: 0; cursor: pointer; clip-path: var(--chosen-cut); transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
  .icon:hover, .icon:focus-visible { color: var(--text); background: var(--fill-hover); }
  /* On, quietly: a tint and a bar under it (design audit, P0). */
  .icon::after { content: ""; position: absolute; left: 6px; right: 6px; bottom: 0; height: 2px; background: var(--lattice); transform: scaleX(0); transition: transform var(--dur-2) var(--ease-out); }
  .icon[aria-pressed="true"] { background: color-mix(in srgb, var(--lattice) var(--tint), transparent); color: var(--lattice); }
  .icon[aria-pressed="true"]::after { transform: scaleX(1); }
  .icon.off { opacity: 0.6; }
</style>
