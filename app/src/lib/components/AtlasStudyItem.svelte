<script lang="ts">
  // An item of a study folder: cut corners, and its kind on its top edge.
  import type { LayoutItem } from "@isorite/core/atlas";

  let { item, title, kind, mark = "", dim = false, href, onpick, onpoint }: {
    item: LayoutItem;
    title: string;
    kind: string;
    mark?: "" | "at" | "req" | "bld";
    dim?: boolean;
    href: string;
    onpick: (event: MouseEvent) => void;
    onpoint: (on: boolean) => void;
  } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the address given is resolved (noteHref) -->
<a class="sn frame {mark}" class:dim {href} aria-label="{kind}: {title}" data-note={item.ref} style="--x:{item.gx};--y:{item.gy};--w:{item.w};--h:{item.h}"
  onclick={onpick}
  onpointerenter={(e) => { if (e.pointerType === "mouse") onpoint(true); }}
  onpointerleave={(e) => { if (e.pointerType === "mouse") onpoint(false); }}
  onfocus={() => onpoint(true)} onblur={() => onpoint(false)}><span class="frame-title kind">{kind}</span><span class="t">{title}</span></a>

<style>
  .sn {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    --cut: min(8px, calc(var(--u) * 1.1)); --edge: var(--text-soft); --inside: var(--ground-1); --behind: var(--ground-1);
    padding: 0 min(7px, calc(var(--u) * .8)); display: flex; align-items: center;
    font-size: var(--fs); line-height: 1.2; color: var(--text); text-decoration: none; transition: opacity .15s;
  }
  .sn:hover { text-decoration: none; color: var(--text); }
  .t, .kind { display: none; }
  .t { overflow: hidden; -webkit-line-clamp: var(--lines, 2); line-clamp: var(--lines, 2); -webkit-box-orient: vertical; }
  :global(.atlas-world.labels) .t { display: -webkit-box; }
  :global(.atlas-world.labels) .kind { display: block; }
  .kind { top: -8px; left: 12px; font-size: 10px; line-height: 14px; padding: 0 5px; color: var(--text-soft); }
  .dim { opacity: .5; }
  .at, .req, .bld { outline: 2px solid var(--text); outline-offset: 2px; }
  .req { outline-color: var(--requires); }
  .bld { outline-color: var(--builds); }
  .sn:focus-visible { outline: 2px solid var(--lattice); outline-offset: 2px; }
</style>
