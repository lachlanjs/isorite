<script lang="ts">
  // A note's timeline (Desktop-Editor, Mobile-Timeline): its moments as marks alone, evenly spaced, oldest at the
  // top. Pointing at one marks what it changed in the note; for one of Iso's, what was asked shows beside it while
  // pointed at. Choosing one shows the note as it was.
  import type { Moment } from "@isorite/core";
  import { describe, ago, momentKey } from "@isorite/core";
  import MomentMark from "./MomentMark.svelte";

  let { moments, at, pointed, point, pick, label = (m) => (m.asked === undefined ? undefined : `“${m.asked}”`), name = "The note's timeline", leftward = false }: {
    moments: Moment[];
    /** What shows beside a moment while it is pointed at: by default, what was asked of Iso. */
    label?: (m: Moment) => string | undefined;
    name?: string;
    /** The label always to the left of the marks, as at the right edge of the Atlas. */
    leftward?: boolean;
    /** The chosen moment's key, or null for the note as it is. */
    at: string | null;
    pointed: Moment | null;
    point: (m: Moment | null) => void;
    pick: (m: Moment) => void;
  } = $props();
</script>

<ol class="timeline" class:leftward aria-label={name}>
  {#each moments as m (m.ids[0])}
    <li>
      <button class="moment" class:at={at === momentKey(m)} type="button" aria-current={at === momentKey(m) ? "step" : undefined}
        aria-label="{describe(m)}, {ago(m.at)}"
        onpointerenter={() => point(m)} onpointerleave={() => point(null)} onfocus={() => point(m)} onblur={() => point(null)}
        onclick={() => pick(m)}>
        <MomentMark moment={m} />
      </button>
      {#if pointed === m && label(m) !== undefined}<span class="asked" aria-hidden="true">{label(m)}</span>{/if}
    </li>
  {/each}
</ol>

<style>
  .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; }
  li { position: relative; }
  .moment { width: 28px; height: 24px; display: grid; place-items: center; background: none; border: 0; padding: 0; cursor: pointer; }
  .moment :global(i) { transition: transform 0.1s; }
  .moment:hover :global(i), .moment:focus-visible :global(i) { transform: scale(1.35); }
  .moment:hover :global(i.dia), .moment:focus-visible :global(i.dia) { transform: rotate(45deg) scale(1.35); }
  .moment.at { outline: 1.5px solid var(--text-soft); outline-offset: -4px; }
  /* What was asked, beside the mark while it is pointed at: to its left in the page's margin, over the text on a phone. */
  .asked {
    position: absolute; right: calc(100% + 6px); top: 2px; width: max-content; max-width: 200px; z-index: 3;
    font-size: 12px; line-height: 1.4; color: var(--text); background: var(--ground-1); border: 1px solid var(--line);
    padding: 3px 7px; text-align: right; pointer-events: none;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  @container page (max-width: 1099px) { .timeline:not(.leftward) .asked { right: auto; left: calc(100% + 4px); text-align: left; max-width: 220px; } }
</style>
