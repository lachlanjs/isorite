<script lang="ts">
  // A note's timeline (Desktop-Editor, Mobile-Timeline). In the Note pane it is the note's history as strata (M24,
  // T): a layer for each moment, the newest on top, as thick as the change was large; yours blue, Iso's gold, what was
  // changed outside isorite hatched, Iso's text not kept an empty layer. The session's timeline on the Atlas keeps its
  // marks, evenly spaced, oldest at the top. Pointing at a moment marks what it changed in the note, and says beside it
  // what was asked of Iso, or whose it was, when and how large. Choosing one shows the note as it was.
  import type { Moment } from "@isorite/core";
  import { describe, ago, momentKey } from "@isorite/core";
  import MomentMark from "./MomentMark.svelte";

  const said = (m: Moment): string => (m.asked !== undefined ? `“${m.asked}”` : `${describe(m)} · ${ago(m.at)}${m.added || m.removed ? ` · +${m.added} −${m.removed}` : ""}`);
  let { moments, at, pointed, point, pick, strata = false, label = (m) => (strata ? said(m) : m.asked === undefined ? undefined : `“${m.asked}”`), name = "The note's timeline", leftward = false }: {
    moments: Moment[];
    /** As a column of layers, the newest on top (T), not as marks. */
    strata?: boolean;
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

  const shown = $derived(strata ? [...moments].reverse() : moments);
  /** A layer's thickness: a line or two for a small change, growing with the root of its size, at most 40 px. */
  const thick = (m: Moment): number => Math.min(40, Math.round(4 + 2.5 * Math.sqrt(m.added + m.removed)));
  const whose = (m: Moment): string => (m.who.startsWith("iso:") ? "iso" : m.who.startsWith("agent:") ? "agent" : m.who === "external" ? "external" : "you");
</script>

<ol class="timeline" class:leftward class:strata aria-label={name}>
  {#each shown as m (m.ids[0])}
    <li>
      <button class="moment {strata ? `layer ${whose(m)} ${m.what}` : ''}" class:at={at === momentKey(m)} type="button" aria-current={at === momentKey(m) ? "step" : undefined}
        style:height={strata ? `${thick(m)}px` : undefined}
        aria-label="{describe(m)}, {ago(m.at)}"
        onpointerenter={() => point(m)} onpointerleave={() => point(null)} onfocus={() => point(m)} onblur={() => point(null)}
        onclick={() => pick(m)}>
        {#if !strata}<MomentMark moment={m} />{/if}
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
  /* The strata (T): a column 11 px wide in a strong edge, the layers parted by a line of the ground. */
  .strata { width: 13px; border: 1px solid var(--line-strong); align-items: stretch; }
  .strata li + li { border-top: 1px solid var(--ground-1); }
  .layer { display: block; width: 100%; background: var(--lattice-soft); transition: filter var(--t-ack) var(--ease-out); }
  .layer.iso { background: var(--growth); }
  .layer.agent { background: var(--text-faint); }
  .layer.external { background: repeating-linear-gradient(135deg, var(--text-faint) 0 1px, transparent 1px 3px); }
  /* Iso's text offered and not kept, or removed: a layer that never set, its place kept. */
  .layer.iso.offered, .layer.iso.discarded { background: none; box-shadow: inset 0 0 0 1px var(--growth); }
  .layer.discarded { opacity: .5; }
  .layer:hover, .layer:focus-visible { filter: brightness(1.3); }
  .layer.at { outline: 1px solid var(--text); outline-offset: -1px; }
  /* What was asked, beside the mark while it is pointed at: to its left in the page's margin, over the text on a phone. */
  .asked {
    position: absolute; right: calc(100% + 6px); top: 2px; width: max-content; max-width: 200px; z-index: 3;
    font-size: 12px; line-height: 1.4; color: var(--text); background: var(--ground-1); border: 1px solid var(--line);
    padding: 3px 7px; text-align: right; pointer-events: none;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .strata .asked { top: -3px; right: calc(100% + 8px); }
  @container page (max-width: 1099px) { .timeline:not(.leftward) .asked { right: auto; left: calc(100% + 4px); text-align: left; max-width: 220px; } }
  @container page (max-width: 1099px) { .strata .asked { left: calc(100% + 8px); } }
</style>
