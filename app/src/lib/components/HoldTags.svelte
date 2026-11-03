<script lang="ts">
  // What a press and hold on a note or a folder shows (M33): the three tags, and the item's name following the pointer
  // once it is picked up. Blue moves, rose deletes, gold sends it to Iso (docs/taste.md). `mode`: the tags standing above
  // their row (the list), standing at the point held (the Atlas), or the name carried.
  import type { Gesture } from "$lib/gesture.svelte.ts";

  let { g, mode, bounds }: { g: Gesture; mode: "row" | "point" | "ghost"; /** For "point": the box the tags are kept within. */ bounds?: DOMRect | null } = $props();
  /** Carried out to the page, so a pane that clips what is inside it does not cut the name short. */
  const toBody = (node: HTMLElement) => { document.body.append(node); return { destroy: () => node.remove() }; };
  const at = $derived.by(() => {
    if (mode !== "point") return "";
    const w = 300, b = bounds ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const left = Math.max(b.left + 8, Math.min(g.origin.x - w / 2, b.right - w - 8)), top = Math.max(b.top + 8, g.origin.y - 46);
    return `left:${left}px;top:${top}px`;
  });
</script>

{#if mode === "ghost"}
  {#if g.phase === "moving" && g.item}<div class="ghost" use:toBody style:left="{g.x + 14}px" style:top="{g.y + 10}px">{g.item.title}</div>{/if}
{:else if g.phase === "held"}
  <span class="tags" class:point={mode === "point"} style={at} role="presentation">
    <span class="tag move" class:on={g.tag === "move"} data-tag="move">move</span>
    <span class="tag delete" class:on={g.tag === "delete"} data-tag="delete">delete</span>
    <span class="tag send" class:on={g.tag === "send"} data-tag="send">send to Iso</span>
  </span>
{/if}

<style>
  .tags { position: absolute; z-index: 30; right: 8px; bottom: calc(100% + 4px); display: flex; gap: 6px; }
  .tags.point { position: fixed; right: auto; bottom: auto; z-index: 60; }
  .tag { padding: 5px 10px; font: 12px var(--font-ui); color: var(--text-soft); background: var(--ground-3); border: 1px solid var(--line-strong); white-space: nowrap; user-select: none; }
  .tag.move { border-color: var(--lattice); } .tag.delete { border-color: var(--rose); } .tag.send { border-color: var(--growth); }
  .tag.on { color: var(--ground-0); }
  .tag.move.on { background: var(--lattice); } .tag.delete.on { background: var(--rose); } .tag.send.on { background: var(--growth); }
  .ghost { position: fixed; z-index: 60; pointer-events: none; padding: 5px 10px; font: 13px var(--font-ui); background: var(--ground-2); border: 1px solid var(--lattice); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
