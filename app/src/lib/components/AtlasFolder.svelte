<script lang="ts">
  // A folder on the Atlas: a cut-corner frame with its name in its top edge. One too small on screen to open is
  // a single block that says how many notes it holds.
  import type { LayoutItem } from "@isorite/core/atlas";

  let { item, name, count, open, onpick }: {
    item: LayoutItem;
    name: string;
    /** The notes in it, however deep. */
    count: number;
    open: boolean;
    onpick: () => void;
  } = $props();

  // A tone apart from the folder it is in: the ground and the surface, turn about.
  const inside = $derived(item.depth % 2 ? "var(--ground-1)" : "var(--ground-0)");
  const behind = $derived(item.depth % 2 ? "var(--ground-0)" : "var(--ground-1)");
  const place = $derived(`--x:${item.gx};--y:${item.gy};--w:${item.w};--h:${item.h}`);
</script>

{#if open}
  <div class="folder frame" data-folder={item.ref} style="{place};--inside:{inside};--behind:{behind};--ground-here:{inside}">
    <button class="frame-title" type="button" onclick={onpick}>{name}</button>
  </div>
{:else}
  <button class="folder frame closed" type="button" data-folder={item.ref} style={place} onclick={onpick}>
    <span class="name">{name}</span><span class="label">{count} {count === 1 ? "note" : "notes"}</span>
  </button>
{/if}

<style>
  .folder {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    --cut: min(10px, calc(var(--u) * 1.5)); container-type: size;
  }
  .frame-title { z-index: 1; border: 0; max-width: calc(100% - 44px); overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  .frame-title:hover { color: var(--text); }
  .closed { --inside: var(--ground-2); padding: 9px 12px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; font-size: 12px; line-height: 1.5; overflow: hidden; color: var(--text); }
  .closed:hover { --inside: var(--ground-3); }
  .closed span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 70px) { .name, .label, .frame-title { display: none; } }
  @container (max-height: 22px) { .name, .label { display: none; } }
  @container (max-height: 44px) { .closed .label { display: none; } }
</style>
