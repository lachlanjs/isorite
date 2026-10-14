<script lang="ts">
  // A note's block on the Atlas. Where you stand is its line and fill (not reached, opened, worked through,
  // understood); what is lit round it is an outline. It knows nothing of the layout or of Iso.
  import type { LayoutItem } from "@isorite/core/atlas";

  let { item, title, step, mark = "", far = 0, num = 0, iso = "", linked = false, dim = false, href, onpick, onpoint }: {
    item: LayoutItem;
    title: string;
    step: 0 | 1 | 2 | 3;
    /** Lit: the note chosen, what it requires, what builds on it, or what it is joined to by a weaker link ("uses", "see also"). */
    mark?: "" | "at" | "req" | "bld" | "use" | "also";
    /** For what it requires: how many steps back. Past the first the outline thins and fades. */
    far?: number;
    /** Picked for a note for Iso: its place in the order, from 1. */
    num?: number;
    /** On Iso's path (Marks): found by keyword, by meaning, along a link (or named outright), or being read now. */
    iso?: "" | "key" | "sem" | "link" | "used";
    /** Linked from the note for Iso being answered: what it was sent with. */
    linked?: boolean;
    dim?: boolean;
    href: string;
    onpick: (event: MouseEvent) => void;
    onpoint: (on: boolean) => void;
  } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the address given is resolved (noteHref) -->
<a class="n s{step} {iso ? `p-${iso}` : ''} {mark}" class:linked class:dim={dim && !num && !iso && !linked} class:far={far > 1} class:pick={num > 0} {href} aria-label={num ? `${title}: linked, number ${num}` : title} data-note={item.ref} style="--x:{item.gx};--y:{item.gy};--w:{item.w};--h:{item.h};--lit:{Math.max(34, 100 - (far - 1) * 20)}%"
  onclick={onpick}
  onpointerenter={(e) => { if (e.pointerType === "mouse") onpoint(true); }}
  onpointerleave={(e) => { if (e.pointerType === "mouse") onpoint(false); }}
  onfocus={() => onpoint(true)} onblur={() => onpoint(false)}><span class="t">{title}</span>{#if num}<b class="num">{num}</b>{/if}</a>

<style>
  .n {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    padding: 0 min(7px, calc(var(--u) * .8)); display: flex; align-items: center; overflow: hidden;
    font-size: var(--fs); line-height: 1.2; color: var(--text-soft); text-decoration: none;
    background: var(--ground-1); border: 1px solid var(--line-strong); transition: opacity .15s;
  }
  .n:hover { color: var(--text); text-decoration: none; }
  .t { display: none; overflow: hidden; -webkit-line-clamp: var(--lines, 2); line-clamp: var(--lines, 2); -webkit-box-orient: vertical; }
  :global(.atlas-world.labels) .t { display: -webkit-box; }
  .s0 { border-style: dotted; background: var(--ground-here, transparent); color: var(--text-faint); }
  .s2 { background: var(--ground-3); color: var(--text); }
  .s3 { border: 3px double var(--lattice); background: var(--ground-3); color: var(--text); }
  .dim { opacity: .5; }
  /* Iso's path (Marks, Desktop-Think), under the outlines of what is chosen. */
  .linked { outline: 2px solid var(--lattice); outline-offset: 3px; color: var(--text); }
  .p-key { outline: 1.5px dashed var(--growth); outline-offset: 3px; }
  .p-sem { outline: 2px dotted var(--growth); outline-offset: 3px; }
  .p-link { outline: 1.5px solid var(--growth); outline-offset: 3px; }
  .p-used { outline: 1.5px solid var(--growth); outline-offset: 3px; background: var(--growth-soft); color: var(--text); }
  .at, .req, .bld { color: var(--text); outline: 2px solid var(--text); outline-offset: 2px; }
  .req { outline-color: color-mix(in srgb, var(--requires) var(--lit, 100%), transparent); }
  .req.far { outline-width: 1px; color: var(--text-soft); }
  .use { color: var(--text); outline: 1px solid var(--text-soft); outline-offset: 2px; }
  .also { color: var(--text-soft); outline: 1px dotted var(--text-faint); outline-offset: 2px; }
  .bld { outline-color: var(--builds); }
  /* Picked (Mobile-Pick): a blue outline and its number at the corner. The number stands outside the block. */
  .pick { outline: 2px solid var(--lattice); outline-offset: 3px; color: var(--text); overflow: visible; }
  .num { position: absolute; top: -10px; right: -10px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; background: var(--lattice); color: var(--ground-0); font-size: 11px; font-weight: 700; z-index: 1; }
  .n:focus-visible { outline: 2px solid var(--lattice); outline-offset: 2px; }
</style>
