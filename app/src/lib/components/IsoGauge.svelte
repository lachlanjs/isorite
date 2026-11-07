<script lang="ts">
  // How full the agent's context is, in a 3px bar in Iso's header (M15; the agent's since M25, as it says in its
  // usage updates). The figures are in the tooltip; a click opens the Context view. Past 100k tokens, or half the
  // window if that is less, the bar takes the warning colour: long contexts drift.
  import { terminal } from "$lib/terminal.svelte.ts";

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;

  const view = $derived(terminal.session);
  const used = $derived(view?.size ? { tokens: view.tokens.input, limit: view.size } : null);
  const fill = $derived(used ? Math.min(1, used.tokens / used.limit) : 0);
  const long = $derived(!!used && used.tokens >= Math.min(100_000, used.limit / 2));
  const full = $derived(!!used && used.tokens > used.limit);
  const context = $derived(!view ? "Context: no agent attached" : view.size ? `${view.agent}: ${short(view.tokens.input)} of ${short(view.size)} tokens${view.cost ? `, ${money(view.cost)}` : ""}${long ? ": long enough to drift" : ""}` : `${view.agent || "The agent"} hasn't said how full its context is`);
</script>

<!-- Only where there is something to show: an empty bar is a gap in a crowded header that says nothing. -->
{#if used}
<button type="button" class="gauge" aria-label={context} title={context} onclick={() => (terminal.shown = terminal.shown === "context" ? "session" : "context")}>
  <i class="bar ctx" class:long class:full style:--fill={fill}></i>
</button>
{/if}

<style>
  .gauge { display: inline-flex; flex-direction: column; gap: 3px; width: 32px; align-self: center; margin-right: 4px; background: none; border: 0; padding: 6px 0; cursor: pointer; }
  .bar { display: block; height: 3px; background: var(--ground-2); position: relative; }
  .bar::after { content: ""; position: absolute; inset: 0; transform-origin: left; transform: scaleX(var(--fill)); background: var(--growth); transition: transform 0.3s; }
  .bar.ctx.long::after { background: var(--builds); }
  .bar.ctx.full::after { background: var(--rose); }
  @media (prefers-reduced-motion: reduce) { .bar::after { transition: none; } }
</style>
