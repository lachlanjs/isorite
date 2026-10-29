<script lang="ts">
  // Past conversations, as specimens in a drawer (M24, K): each with the crystal it grew, when it was last added to,
  // what was first asked, and how many turns and notes it has. One opened is carried on; the one shown is chosen.
  // Built so that other threads (issues, discussions) can stand in it later as specimens of the same kind.
  import { converse } from "$lib/converse.svelte.ts";
  import Crystal from "./Crystal.svelte";

  const DAY = 86_400_000;
  /** When, as a person says it: today with the time, yesterday, the weekday within a week, else the date. */
  function when(at: string): string {
    const d = new Date(at), now = new Date(), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (d.getTime() >= midnight) return `today · ${d.toTimeString().slice(0, 5)}`;
    if (d.getTime() >= midnight - DAY) return "yesterday";
    if (d.getTime() >= midnight - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  }
  const many = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
</script>

<div class="drawer" role="list" aria-label="Past conversations">
  {#if converse.past === null}
    <p class="faint none">…</p>
  {:else if !converse.past.length}
    <p class="faint none">No conversations yet.</p>
  {/if}
  {#each converse.past ?? [] as c (c.id)}
    <div role="listitem">
      <button type="button" class="spec frame" class:on={c.id === converse.id} data-lustre aria-current={c.id === converse.id ? "true" : undefined} disabled={!!converse.running} onclick={() => void converse.resume(c.id)}>
        <Crystal id={c.id} size={44} />
        <span class="m">{when(c.last)}</span>
        <span class="q">{c.asked}</span>
        <span class="m">{many(c.notes, "note")} · {many(c.turns, "turn")}</span>
      </button>
    </div>
  {/each}
</div>

<style>
  .drawer { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); align-content: start; gap: 11px; }
  .none { grid-column: 1 / -1; font-size: 12px; }
  .spec { --cut: 8px; --inside: var(--ground-1); --edge: var(--line); width: 100%; padding: 14px; display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 4px 14px; align-content: start; text-align: left; color: var(--text-faint); cursor: pointer; --glint: .25; transition: color var(--t-ack) var(--ease-out); }
  .spec :global(.crystal) { grid-row: span 3; }
  .spec:hover:not(:disabled) { --edge: var(--line-strong); color: var(--growth); }
  .spec:disabled { cursor: default; }
  /* The one shown (P: chosen): its edge in the lattice and its crystal in gold. */
  .spec.on { --edge: var(--lattice); color: var(--growth); }
  .q { font: 15px/22px var(--font-text); color: var(--text); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .m { font: 11px/16px var(--font-ui); color: var(--text-faint); text-transform: uppercase; letter-spacing: .06em; }
</style>
