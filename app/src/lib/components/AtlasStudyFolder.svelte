<script lang="ts">
  // A study folder: the same surface as any folder, set apart by a solid band for its title and a small grown
  // mark, a plant of its own, seeded by its name, that grows a step for each exercise in it last marked right.
  import { sprout } from "@isorite/core";
  import type { LayoutItem } from "@isorite/core/atlas";

  const GROWN = 4;

  let { item, name, count, open, passes = 0, onpick }: {
    item: LayoutItem;
    /** The folder it studies. */
    name: string;
    count: number;
    open: boolean;
    /** Its exercises last marked right. */
    passes?: number;
    onpick: () => void;
  } = $props();

  const inside = $derived(item.depth % 2 ? "var(--ground-1)" : "var(--ground-0)");
  const place = $derived(`--x:${item.gx};--y:${item.gy};--w:${item.w};--h:${item.h}`);
  // A bare shoot before anything is passed. Its first step only lengthens the stem, which at this size looks the
  // same, so the first pass is two steps: it branches. Past four it is too fine to read.
  const plant = $derived(sprout([...item.ref].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99991, 7), passes ? Math.min(passes + 1, GROWN) : 0));
</script>

{#snippet band()}
  <span class="name">study · {name}</span>
  <svg viewBox={plant.viewBox} data-passes={passes} style="width:{16 * plant.ratio}px" aria-hidden="true"><path d={plant.d} /></svg>
{/snippet}

{#if open}
  <div class="folder frame" data-folder={item.ref} style="{place};--inside:{inside};--ground-here:{inside}">
    <button class="band" type="button" onclick={onpick}>{@render band()}</button>
  </div>
{:else}
  <button class="folder frame closed" type="button" data-folder={item.ref} style="{place};--inside:{inside}" onclick={onpick}>
    <span class="band">{@render band()}</span>
    <span class="label">{count} {count === 1 ? "item" : "items"}</span>
  </button>
{/if}

<style>
  .folder {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    --cut: calc(10px * var(--k)); --edge: var(--text-soft); container-type: size; padding: 0; text-align: left;
  }
  .band {
    position: absolute; left: 1px; right: 1px; top: 1px; height: min(20px, 100%); padding: 0 12px 0 14px; border: 0;
    display: flex; align-items: center; gap: 10px; font-size: 12px; white-space: nowrap; overflow: hidden;
    background: var(--text-soft); color: var(--ground-0); --c: calc(var(--cut) - .6px);
    clip-path: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% 100%, 0 100%, 0 var(--c));
  }
  .name { overflow: hidden; text-overflow: ellipsis; }
  svg { height: 16px; flex: none; margin-left: auto; overflow: visible; }
  path { fill: none; stroke: var(--ground-0); stroke-width: .6; stroke-linecap: round; stroke-linejoin: round; }
  .closed { cursor: pointer; }
  .closed .label { position: absolute; left: 14px; top: 26px; }
  @container (max-width: 70px) { .name, .label, svg { display: none; } }
  @container (max-height: 46px) { .label { display: none; } }
</style>
