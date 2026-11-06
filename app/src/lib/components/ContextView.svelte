<script lang="ts">
  // What the agent has in hand (M15; an agent's session since M25), as far as isorite can see into it: a layer for
  // isorite's MCP (its instructions and tools, estimated), one for the notes given and read in the session, one for
  // the rest (the harness's own and the conversation), sized from what the agent says it fills, and the room left;
  // the notes listed; and the tray, what goes before the next prompt. What the agent dropped when it compacted can't
  // be seen, and the view says so.
  import { app } from "$lib/app.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  let layer = $state<string | null>(null);

  let sizes = $state.raw<Record<string, number>>({});
  $effect(() => { if (terminal.session) void app.api.map().then((m) => (sizes = Object.fromEntries(Object.entries(m.notes).map(([id, n]) => [id, n.tokens]))), () => undefined); });
  const agentNotes = $derived.by(() => {
    const given = new Set<string>(), read = new Set<string>();
    for (const t of terminal.session?.turns ?? []) {
      for (const g of t.given ?? []) if (g.kind === "note") given.add(g.id);
      for (const i of t.items) if (i.kind === "tool" && i.note && !i.base && i.status === "done") read.add(i.note);
    }
    const title = (id: string) => app.listing.notes.find((n) => n.id === id)?.title ?? id;
    return [...[...given].map((id) => ({ id, how: "given" as const })), ...[...read].filter((id) => !given.has(id)).map((id) => ({ id, how: "read" as const }))].map((n) => ({ ...n, title: title(n.id), tokens: sizes[n.id] ?? 0 }));
  });
  const agentStrata = $derived.by(() => {
    const v = terminal.session;
    if (!v?.size || !v.tokens.input) return [];
    const ours = Math.min(v.ours ?? 0, v.tokens.input), notes = Math.min(agentNotes.reduce((n, x) => n + x.tokens, 0), v.tokens.input - ours);
    const layers = [{ k: "instructions", name: "isorite's", tokens: ours }, { k: "notes", name: "notes", tokens: notes }, { k: "conversation", name: "the rest", tokens: v.tokens.input - ours - notes }, { k: "room", name: "room", tokens: Math.max(0, v.size - v.tokens.input) }].filter((l) => l.tokens > 0);
    return layers.map((l) => ({ ...l, w: (100 * l.tokens) / v.size! }));
  });
  const agentShown = $derived(agentStrata.find((l) => l.k === layer));
</script>

<div class="context" role="region" aria-label="What the agent has in hand">
  {#if terminal.session}
    {@const v = terminal.session}
    <div class="column">
      {#if agentStrata.length}
        <div class="strata" role="img" aria-label={agentStrata.map((l) => `${l.name} ${short(l.tokens)}`).join(", ")} onpointerover={(e) => (layer = (e.target as HTMLElement).dataset.k ?? null)} onpointerleave={() => (layer = null)}>
          {#each agentStrata as l (l.k)}<i class="s {l.k}" data-k={l.k} style:width="{l.w.toFixed(2)}%"></i>{/each}
        </div>
        <p class="total" title="As {v.agent} counts it">{#if agentShown}<span>{agentShown.name} · {short(agentShown.tokens)}</span>{:else}<span>{short(v.tokens.input)}</span><span class="faint">of {short(v.size ?? 0)}</span>{/if}{#if v.cost}<span class="faint">· ${v.cost.toFixed(2)}</span>{/if}</p>
      {:else}
        <p class="faint">{v.agent || "The agent"} hasn't said how full its context is{v.turns.length ? "" : " yet"}.</p>
      {/if}
      <p class="faint">What {v.agent || "the agent"} dropped when it compacted can't be seen from here.</p>
    </div>
    <h2 class="label">notes</h2>
    <ul class="rows" aria-label="The notes in the session">
      {#each agentNotes as n (n.id)}
        <li class="row"><span class="r" title={n.how === "given" ? "Given from here" : `Read by ${v.agent}`}><span class="mk" class:iso={n.how === "read"} aria-hidden="true">{n.how === "given" ? "◆" : "◇"}</span><span class="t">{n.title}</span><span class="d">{n.how}</span>{#if n.tokens}<span class="num">{short(n.tokens)}</span>{/if}</span></li>
      {/each}
    </ul>
  {:else}
    <p class="faint">With an agent attached, what it has in hand shows here: isorite's part, the notes it was given and read, and the room left.</p>
  {/if}
  <h2 class="label">in the tray</h2>
  <ul class="rows" aria-label="What you gave the agent" title="Given to the session before its next prompt, asked here or in its front end, unless given already">
    {#each tray.sent as p (tray.keyOf(p))}
      <li class="row"><span class="r"><span class="mk" aria-hidden="true">◆</span><span class="t">{p.kind === "passage" ? `“${p.text}”` : p.title}</span></span>
        <button type="button" class="x" aria-label="Take {p.title} out of the agent's context" onclick={() => tray.remove(p)}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8" /></svg></button></li>
    {/each}
  </ul>
</div>

<style>
  .context { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  /* The column (O): hatched, isorite's instructions and tools; blue, the notes; ruled, the rest; empty, the room left. */
  /* The figure under the column, so that a layer's name standing in it never moves the layers. */
  .column { display: flex; flex-direction: column; gap: 6px; }
  .strata { min-width: 0; height: 14px; display: flex; border: 1px solid var(--line-strong); background: var(--ground-0); }
  .s { height: 100%; min-width: 2px; flex: none; transition: filter var(--t-ack) var(--ease-out); }
  .s + .s { box-shadow: inset 1px 0 0 var(--ground-0); }
  .s:hover { filter: brightness(1.25); }
  .instructions { background: repeating-linear-gradient(135deg, var(--text-faint) 0 1px, transparent 1px 4px); }
  .notes { background: var(--lattice); }
  .conversation { background: repeating-linear-gradient(90deg, var(--text-soft) 0 1px, transparent 1px 3px); }
  .room { flex: 1 1 auto; background: none; }
  .total { display: flex; gap: 6px; align-items: baseline; font-variant-numeric: tabular-nums; color: var(--text); }
  .label { display: flex; align-items: center; gap: 6px; font-weight: 400; margin-top: 8px; min-height: 22px; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .row { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
  /* As the board: the name, a faint detail, the size on the right, and a thin bar of its share under it. */
  .r { flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: 14px minmax(0, auto) minmax(0, 1fr) auto; column-gap: 8px; row-gap: 3px; align-items: baseline; background: none; border: 0; padding: 0; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
  .r:disabled { cursor: default; }
  .mk { color: var(--growth); text-align: center; }
  .mk.iso { color: var(--lattice); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); }
  .num { grid-column: 4; color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .x { width: 22px; height: 18px; flex: none; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .x:hover { color: var(--rose); }
  .bad { color: var(--rose); }
</style>
