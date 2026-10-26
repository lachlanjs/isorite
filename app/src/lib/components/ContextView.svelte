<script lang="ts">
  // What the next turn is sent (M15), after the Header-Context board: a row for each part, its size on the right
  // and a bar of its share of the model's limit under it, in three groups. A click switches a row on or off; ✕ takes
  // a part you gave out of what you give. What each does is in its tooltip, not beside it.
  import type { HandRow } from "@isorite/engine";
  import { converse } from "$lib/converse.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const GROUPS = ["notes", "conversation", "fixed"] as const;
  const MARK: Record<HandRow["kind"], string> = { note: "◆", folder: "▭", passage: "“", understanding: "◇", read: "◇", question: "?", turn: "›", briefing: "≡", instructions: "", agents: "", message: "" };

  const report = $derived(converse.report);
  const build = $derived(panes.mode === "build");
  /** The turns a briefing stands for, shown under it when it is opened. */
  let unfolded = $state<string[]>([]);
  const fixed = (r: HandRow): boolean => r.kind === "instructions" || r.kind === "message";
  const tip = (r: HandRow): string =>
    r.kind === "read" ? (r.aged ? "Read by Iso, and set aside: not used for 3 turns. Iso is told it can read it again. Click to send it again." : r.on ? "Read by Iso, and kept in hand so it is not read again. Click to set it aside." : "Read by Iso, and set aside. Click to send it again.")
    : r.kind === "turn" ? (r.on ? "An earlier turn, sent whole. Click to leave it out." : r.under ? "Summed up in the briefing above. Click to send it whole as well." : "Left out. Click to send it again.")
    : r.kind === "briefing" ? (r.on ? "Earlier turns, summed up: sent instead of them. Click to send the turns instead." : "Not sent: the turns it sums up are sent instead. Click to send it again.")
    : r.kind === "agents" ? "AGENTS.md: your instructions for this base, sent with every turn. Click to leave it out."
    : r.kind === "question" ? "An open question about a note you gave. Click to leave it out."
    : fixed(r) ? (r.kind === "instructions" ? "What Iso is told, and its tools" : "What you are writing")
    : r.on ? "You gave it. Click to leave it out for now; ✕ takes it out." : "Left out for now. Click to send it again.";
</script>

<div class="context" role="region" aria-label="What Iso is sent">
  {#if build}
    <!-- In Build the parts go to the terminal's agent by name; the rest is OpenCode's. -->
    <h2 class="label">notes</h2>
    <ul class="rows" aria-label="What you gave Iso" title="Sent with your next message to the terminal's agent: notes and folders by name, passages as they are">
      {#each tray.sent as p (tray.keyOf(p))}
        <li class="row"><span class="r"><span class="mk" aria-hidden="true">◆</span><span class="t">{p.kind === "passage" ? `“${p.text}”` : p.title}</span></span>
          <button type="button" class="x" aria-label="Take {p.title} out of Iso's context" onclick={() => tray.remove(p)}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8" /></svg></button></li>
      {/each}
    </ul>
  {:else if report?.rows}
    <p class="total" title={report.counted ? "As the provider counted the last turn" : "Estimated: counted after the first turn"}><span>{short(report.tokens)}</span><span class="faint">of {short(report.limit)}{report.counted ? "" : " ~"}</span></p>
    {#each GROUPS as g (g)}
      {@const rows = report.rows.filter((r) => r.group === g && !r.under)}
      {#if rows.length || g === "notes"}
        <h2 class="label">
          <span>{g}</span>
          {#if g === "conversation"}
            <span class="acts">
              <button class="icon" type="button" aria-label="Sum up the earlier turns" title="Sum up the earlier turns, all but the last, into a briefing sent instead of them" disabled={converse.summing || !!converse.running || report.rows.filter((r) => r.kind === "turn" && r.on).length < 2} onclick={() => void converse.compact()}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3.5h10M3 6.5h10M5 10l3 3 3-3" /></svg>
              </button>
              <button class="icon" type="button" aria-label="A new conversation from here" title="A new conversation that starts from a briefing of this one" disabled={converse.summing || !!converse.running || !converse.turns.length} onclick={() => void converse.branch()}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2.5v6a3 3 0 0 0 3 3h5" /><path d="M9.5 9l2.5 2.5L9.5 14" /></svg>
              </button>
            </span>
          {/if}
        </h2>
        <ul class="rows" aria-label={g === "notes" ? "The notes Iso has" : g === "conversation" ? "The conversation" : "Always sent"}>
          {#each rows as r (r.key)}
            {@render row(r)}
            {#if r.kind === "briefing" && unfolded.includes(r.key)}
              {#each report.rows.filter((x) => x.under === r.key) as u (u.key)}{@render row(u, true)}{/each}
            {/if}
          {/each}
        </ul>
      {/if}
    {/each}
  {/if}
  {#if converse.problem}<p class="bad" role="alert">{converse.problem}</p>{/if}
</div>

{#snippet row(r: HandRow, under = false)}
  {@const share = report ? Math.min(1, r.tokens / report.limit) : 0}
  <li class="row" class:off={!r.on} class:under data-key={r.key}>
    <button type="button" class="r" role="switch" aria-checked={r.on} aria-label="Send: {r.title}" title={tip(r)} disabled={fixed(r)} onclick={() => void converse.toggle(r)}>
      <span class="mk" class:iso={r.by === "iso"} class:q={r.kind === "question"} aria-hidden="true">{MARK[r.kind]}</span>
      <span class="t">{r.kind === "passage" ? `“${r.given?.kind === "passage" ? r.given.text : r.title}”` : r.title}</span>
      {#if r.detail}<span class="d">{r.detail}</span>{/if}
      <span class="num">{short(r.tokens)}</span>
      <i class="bar" style:--w="{(share * 100).toFixed(2)}%"></i>
    </button>
    {#if r.kind === "briefing"}
      <button type="button" class="x" aria-label="The turns it sums up" aria-expanded={unfolded.includes(r.key)} title="The turns it sums up" onclick={() => (unfolded = unfolded.includes(r.key) ? unfolded.filter((k) => k !== r.key) : [...unfolded, r.key])}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d={unfolded.includes(r.key) ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} /></svg>
      </button>
    {:else if r.given}
      <button type="button" class="x" aria-label="Take {r.title} out of Iso's context" title="Take it out" onclick={() => converse.takeOut(r)}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    {/if}
  </li>
{/snippet}

<style>
  .context { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  .total { display: flex; gap: 6px; align-items: baseline; font-variant-numeric: tabular-nums; color: var(--text); }
  .label { display: flex; align-items: center; gap: 6px; font-weight: 400; margin-top: 8px; min-height: 22px; }
  .acts { margin-left: auto; display: inline-flex; gap: 2px; }
  .acts .icon { width: 24px; height: 22px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .acts .icon:hover:not(:disabled) { color: var(--text); }
  .acts .icon:disabled { opacity: 0.4; cursor: default; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .row { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
  .row.under { padding-left: 16px; }
  /* As the board: the name, a faint detail, the size on the right, and a thin bar of its share under it. */
  .r { flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: 14px minmax(0, auto) minmax(0, 1fr) auto; column-gap: 8px; row-gap: 3px; align-items: baseline; background: none; border: 0; padding: 0; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
  .r:disabled { cursor: default; }
  .mk { color: var(--growth); text-align: center; }
  .mk.iso { color: var(--lattice); }
  .mk.q { color: var(--rose); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); }
  .num { grid-column: 4; color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .bar { grid-column: 1 / -1; height: 3px; background: linear-gradient(to right, var(--lattice) var(--w), var(--line) var(--w)); }
  .off .t, .off .mk { color: var(--text-faint); }
  .off .bar { background: var(--line); }
  .r:not(:disabled):hover .t { color: var(--text); text-decoration: underline; text-decoration-color: var(--line-strong); }
  .x { width: 22px; height: 18px; flex: none; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .x:hover { color: var(--rose); }
  .bad { color: var(--rose); }
</style>
