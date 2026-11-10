<script lang="ts">
  // How full the agent's context is, in the composer's footer (design audit (f) 10): a short bar and the share used, in
  // figures, faint, gold, then the warning colour past 100k tokens or half the window if that is less (long contexts
  // drift), rose past 85% and over. The tokens and the cost are in the tooltip; a click opens the Context view.
  import { terminal } from "$lib/terminal.svelte.ts";

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;

  const view = $derived(terminal.session);
  const used = $derived(view?.size ? { tokens: view.tokens.input, limit: view.size } : null);
  const fill = $derived(used ? Math.min(1, used.tokens / used.limit) : 0);
  const pct = $derived(used ? Math.round((used.tokens / used.limit) * 100) : 0);
  const long = $derived(!!used && used.tokens >= Math.min(100_000, used.limit / 2));
  const full = $derived(!!used && (used.tokens > used.limit || fill >= 0.85));
  const context = $derived(!view?.size ? "" : `Context: ${short(view.tokens.input)} of ${short(view.size)} tokens${view.cost ? `, ${money(view.cost)}` : ""}${long ? ", long enough to drift" : ""}`);
</script>

{#if used && used.tokens > 0}
<button type="button" class="gauge" class:long class:full aria-label="{context}: open the context" title={context} aria-pressed={terminal.shown === "context"} onclick={() => (terminal.shown = terminal.shown === "context" ? "session" : "context")}>
  <i class="bar" style:--fill={fill}></i><span class="pct">{pct < 1 && used.tokens > 0 ? "<1" : pct}%</span>
</button>
{/if}

<style>
  .gauge { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 6px; background: none; border: 0; border-radius: var(--round); cursor: pointer; color: var(--text-faint); font: var(--fs-meta)/1 var(--font-ui); font-variant-numeric: tabular-nums; transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
  .gauge:hover, .gauge:focus-visible, .gauge[aria-pressed="true"] { color: var(--text-soft); background: var(--fill-hover); }
  .bar { display: block; width: 22px; height: 3px; background: var(--fill-chosen); position: relative; }
  .bar::after { content: ""; position: absolute; inset: 0; transform-origin: left; transform: scaleX(var(--fill)); background: var(--growth); transition: transform var(--dur-3) var(--ease-out), background-color var(--dur-2) var(--ease-out); }
  .long .bar::after { background: var(--builds); }
  .full .bar::after { background: var(--rose); }
  .full .pct { color: var(--rose); }
</style>
