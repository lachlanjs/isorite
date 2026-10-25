<script lang="ts">
  // The dock at the foot of the Atlas while notes are picked for a note for Iso (the Mobile-Pick board): the
  // note they are for, what is linked and how large each is, and the way back to it. What is picked is what
  // Iso is sent, so the sizes are said here.
  import { short } from "$lib/atlas/picks.ts";

  let { title, picked, budget, href, notice = "" }: {
    title: string;
    /** The notes linked, in the order they are sent. */
    picked: { id: string; title: string; tokens: number }[];
    /** The most of the linked notes that is sent with the note, in tokens. */
    budget: number;
    href: string;
    notice?: string;
  } = $props();

  const total = $derived(picked.reduce((n, p) => n + p.tokens, 0));
  const over = $derived(total > budget);
  const says = $derived([`${picked.length} linked`, picked.length ? `${short(total)} tokens` : "", over ? `over ${short(budget)}` : "", notice].filter(Boolean).join(" · "));
</script>

<div class="dock" role="region" aria-label="Notes linked to the note for Iso">
  <i class="dia open" aria-hidden="true"></i>
  <div class="what">
    <span class="name">{title || "a new note"}</span>
    <span class="label" role="status">{says}</span>
  </div>
  <ol class="grow">
    {#each picked as p, k (p.id)}<li><b class="num">{k + 1}</b><span class="t">{p.title}</span><span class="faint">{short(p.tokens)}</span></li>{/each}
  </ol>
  {#if over}<span class="label over">over {short(budget)}: the last are cut short, or left for Iso to read itself</span>{/if}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the address given is resolved -->
  <a class="btn primary tall" {href}>back to it</a>
</div>

<style>
  .dock { position: absolute; left: 12px; right: 12px; bottom: 12px; min-height: 60px; padding: 8px 14px; display: flex; align-items: center; gap: 12px; background: var(--ground-1); border: 1px dotted var(--growth); z-index: 2; cursor: default; }
  .what { display: flex; flex-direction: column; min-width: 0; max-width: 260px; flex: 0 1 auto; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; min-width: 0; max-height: 44px; overflow: hidden; font-size: 12px; }
  li { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .t { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { width: 18px; height: 18px; flex: none; display: flex; align-items: center; justify-content: center; background: var(--lattice); color: var(--ground-0); font-size: 11px; font-weight: 700; }
  .over { color: var(--growth); max-width: 220px; white-space: normal; line-height: 1.3; }
  .btn { flex: none; }
  @media (max-width: 600px) {
    .what { flex: 1 1 0; max-width: none; }
    ol, .over { display: none; }
  }
</style>
