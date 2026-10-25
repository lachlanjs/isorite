<script lang="ts">
  // A folder on the Atlas: a cut-corner frame with its name in its top edge. One too small on screen to open is
  // a single block that says how many notes it holds. The frame is in the map's units, in the layer scaled to the
  // zoom (M12); what it says is held at its size on screen.
  import type { LayoutItem } from "@isorite/core/atlas";

  let { item, name, count, open, titled = true, held = { req: 0, bld: 0 }, dim = false, given = false, onpick }: {
    item: LayoutItem;
    name: string;
    /** The notes in it, however deep. */
    count: number;
    open: boolean;
    /** Open, whether its name is written in its top edge: not where it would run into the name of the folder it is in. */
    titled?: boolean;
    /** With a note chosen elsewhere: how many notes in here it requires, and how many build on it. */
    held?: { req: number; bld: number };
    dim?: boolean;
    /** In what Iso is sent (the Iso lens, M10). */
    given?: boolean;
    onpick: () => void;
  } = $props();

  // A tone apart from the folder it is in: the ground and the surface, turn about.
  const inside = $derived(item.depth % 2 ? "var(--ground-1)" : "var(--ground-0)");
  const behind = $derived(item.depth % 2 ? "var(--ground-0)" : "var(--ground-1)");
  const tone = $derived(held.req ? "req" : held.bld ? "bld" : "");
  const says = $derived([held.req ? `${held.req} required here` : "", held.bld ? `${held.bld} ${held.bld === 1 ? "builds" : "build"} on it` : ""].filter(Boolean).join(" · "));
  const place = $derived(`--x:${item.gx};--y:${item.gy};--w:${item.w};--h:${item.h}`);
</script>

{#if open}
  <div class="folder frame {tone}" class:given data-folder={item.ref} style="{place};--inside:{inside};--behind:{behind};--ground-here:{inside}">
    {#if titled}<button class="frame-title" type="button" onclick={onpick}>{name}</button>{/if}
    {#if says}<span class="frame-title held">{says}</span>{/if}
  </div>
{:else}
  <button class="folder frame closed {tone}" class:dim class:given type="button" data-folder={item.ref} style={place} onclick={onpick}>
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
  .frame-title:hover { color: var(--text); }
  .closed { --inside: var(--ground-2); padding: 0; text-align: left; font-size: 12px; line-height: 1.5; overflow: hidden; color: var(--text); }
  /* What a closed folder says, at a screen's size: the block's size at the zoom, scaled back. */
  .closed .inner { position: absolute; left: 0; top: 0; width: calc(100% * var(--k)); height: calc(100% * var(--k)); transform-origin: 0 0; transform: scale(var(--ik)); padding: 9px 12px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; container-type: size; }
  .closed:hover { --inside: var(--ground-3); }
  .req { --edge: var(--requires); }
  .bld { --edge: var(--builds); }
  .held { top: auto; bottom: 0; left: auto; right: 22px; transform-origin: 100% 100%; transform: scale(var(--ik)) translateY(50%); max-width: calc((100% - 44px) * var(--k)); overflow: hidden; text-overflow: ellipsis; color: var(--edge); cursor: default; pointer-events: none; }
  .closed.req .label, .closed.bld .label { color: var(--edge); }
  .dim { opacity: .5; }
  .closed span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 70px) { .name, .label { display: none; } }
  @container (max-height: 22px) { .name, .label { display: none; } }
  @container (max-height: 44px) { .closed .label { display: none; } }
  .given { outline: calc(2 * var(--px)) solid var(--growth); outline-offset: calc(2 * var(--px)); }
</style>
