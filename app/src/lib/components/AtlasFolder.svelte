<script lang="ts">
  // A folder on the Atlas: a cut-corner frame with its name in its top edge. One too small on screen to open is
  // a single block that says how many notes it holds. The frame is in the map's units, in the layer scaled to the
  // zoom (M12); what it says is held at its size on screen.
  import type { LayoutItem } from "@isorite/core/atlas";
  import { lustre } from "$lib/lustre.ts";

  let { item, name, count, open, titled = true, held = { req: 0, bld: 0 }, bare = false, dim = false, given = false, here = false, moment = "", onpick, onrename }: {
    item: LayoutItem;
    name: string;
    /** The notes in it, however deep. */
    count: number;
    open: boolean;
    /** Open, whether its name is written in its top edge: not where it would run into the name of the folder it is in. */
    titled?: boolean;
    /** With a note chosen elsewhere: how many notes in here it requires, and how many build on it. */
    held?: { req: number; bld: number };
    /** Open with nothing in it: a large ellipsis gives it body. */
    bare?: boolean;
    dim?: boolean;
    /** In what Iso is sent (the Iso lens, M10). */
    given?: boolean;
    /** Closed over the note open in the Note pane (M17): the block's bar. */
    here?: boolean;
    /** Pointed at from elsewhere, a link or a moment (M17, Atlas-Timeline): outlined, yours or Iso's. */
    moment?: "" | "you" | "iso";
    onpick: (e: MouseEvent) => void;
    /** Rename it (a double click on its name): the new name, or undefined where it cannot be. */
    onrename?: (name: string) => void;
  } = $props();

  // A tone apart from the folder it is in: the ground and the surface, turn about.
  const inside = $derived(item.depth % 2 ? "var(--ground-1)" : "var(--ground-0)");
  const behind = $derived(item.depth % 2 ? "var(--ground-0)" : "var(--ground-1)");
  const tone = $derived(held.req ? "req" : held.bld ? "bld" : "");
  const says = $derived([held.req ? `${held.req} required here` : "", held.bld ? `${held.bld} ${held.bld === 1 ? "builds" : "build"} on it` : ""].filter(Boolean).join(" · "));
  let editing = $state(false), draft = $state("");
  function edit(e: MouseEvent): void { if (!onrename) return; e.stopPropagation(); draft = name; editing = true; }
  function done(commit: boolean): void { const was = editing; editing = false; if (commit && was && draft.trim() && draft.trim() !== name) onrename?.(draft.trim()); }
  const focus = (el: HTMLInputElement): void => { el.focus(); el.select(); };
  // Lit as one the chosen note requires, or that builds on it: a pulse of light round its edge, in the tone's colour, as it comes.
  let face = $state<HTMLElement>();
  $effect(() => {
    const t = tone, el = face;
    if (t && el) requestAnimationFrame(() => { if (el.isConnected) lustre(el, true, t === "req" ? "--requires" : "--builds"); });
  });
  const place = $derived(`--x:${item.gx};--y:${item.gy};--w:${item.w};--h:${item.h}`);
</script>

{#if open}
  <div bind:this={face} class="folder frame {tone} {moment ? `mo-${moment}` : ''}" class:given data-folder={item.ref} style="{place};--inside:{inside};--behind:{behind};--ground-here:{inside}">
    {#if titled && editing}<input class="frame-title rename" aria-label="Rename the folder {name}" bind:value={draft} use:focus onpointerdown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") done(true); else if (e.key === "Escape") done(false); }} onblur={() => done(false)} />
    {:else if titled}<button class="frame-title" type="button" title={given ? "In Iso's context: shift+click takes it back. Double click renames it." : onrename ? "Double click renames it" : undefined} onclick={onpick} ondblclick={edit}>{name}</button>{/if}
    {#if says}<span class="frame-title held">{says}</span>{/if}
    {#if bare}<span class="bare" aria-hidden="true"><i></i><i></i><i></i></span>{/if}
  </div>
{:else}
  <button bind:this={face} class="folder frame closed {tone} {moment ? `mo-${moment}` : ''}" class:dim class:given class:here aria-current={here ? "page" : undefined} type="button" data-folder={item.ref} style={place} title={given ? "In Iso's context: shift+click takes it back" : undefined} onclick={onpick}>
    <span class="inner"><span class="name">{name}</span><span class="label">{says || `${count} ${count === 1 ? "note" : "notes"}`}</span></span>
  </button>
{/if}

<style>
  .folder {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    --cut: 10px; /* 10 units of the map, as core's CORNER: routes meet a cut corner in its middle */
  }
  /* Its name, a screen's size whatever the zoom: set in the edge, then scaled back from the layer's zoom. */
  .frame-title { z-index: 1; border: 0; top: 0; max-width: calc((100% - 44px) * var(--k)); overflow: hidden; text-overflow: ellipsis; cursor: pointer; transform-origin: 0 0; transform: scale(var(--ik)) translateY(-50%); }
  .rename { width: calc(180px * var(--k)); font: inherit; background: var(--ground-2); color: var(--text); border: 1px solid var(--lattice); padding: 1px 6px; }
  .frame-title:hover { color: var(--text); }
  .closed { --inside: var(--ground-2); padding: 0; text-align: left; font-size: 12px; line-height: 1.5; overflow: hidden; color: var(--text); }
  /* What a closed folder says, at a screen's size: the block's size at the zoom, scaled back. */
  .closed .inner { position: absolute; left: 0; top: 0; width: calc(100% * var(--k)); height: calc(100% * var(--k)); transform-origin: 0 0; transform: scale(var(--ik)); padding: 9px 12px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; container-type: size; }
  .closed:hover { --inside: var(--ground-3); }
  /* The ellipsis of an empty folder, a screen's size whatever the zoom, in the middle of the frame. */
  .bare { position: absolute; left: 0; top: 0; width: calc(100% * var(--k)); height: calc(100% * var(--k)); transform-origin: 0 0; transform: scale(var(--ik)); display: flex; align-items: center; justify-content: center; gap: 18px; pointer-events: none; user-select: none; }
  .bare i { width: 8px; height: 8px; background: var(--text-faint); }
  /* The tone is in the pulse that runs round the edge and in the words; the frame itself keeps its own edge. */
  .req { --tone: var(--requires); }
  .bld { --tone: var(--builds); }
  .held { top: auto; bottom: 0; left: auto; right: 22px; transform-origin: 100% 100%; transform: scale(var(--ik)) translateY(50%); max-width: calc((100% - 44px) * var(--k)); overflow: hidden; text-overflow: ellipsis; color: var(--tone); cursor: default; pointer-events: none; }
  .closed.req .label, .closed.bld .label { color: var(--tone); }
  .dim { opacity: .5; }
  .closed span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 70px) { .name, .label { display: none; } }
  @container (max-height: 22px) { .name, .label { display: none; } }
  @container (max-height: 44px) { .closed .label { display: none; } }
  .here { box-shadow: inset calc(3 * var(--px)) 0 0 var(--text); }
  .mo-you { outline: calc(2.5 * var(--px)) solid var(--lattice); outline-offset: calc(3 * var(--px)); z-index: 3; }
  .mo-iso { outline: calc(2.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); z-index: 3; }
  .given { outline: calc(2 * var(--px)) solid var(--growth); outline-offset: calc(2 * var(--px)); }
</style>
