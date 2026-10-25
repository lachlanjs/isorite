<script lang="ts">
  // Iso's usage in two 3px bars in its header: how full the context is for the model's window, and how much of what
  // may be spent has been. The figures are in the tooltip.
  import { converse } from "$lib/converse.svelte.ts";
  import { spend } from "$lib/spend.svelte.ts";

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;
  const PER = { day: "today", week: "this week", month: "this month", total: "in all" } as const;

  const report = $derived(converse.report);
  const fill = $derived(report ? Math.min(1, report.tokens / report.limit) : 0);
  const s = $derived(spend.value);
  const spent = $derived(s && s.cap ? Math.min(1, s.usd / s.cap) : 0);
  const over = $derived(spent > 0.8);
  const context = $derived(report ? `Context: ${short(report.tokens)} of ${short(report.limit)} tokens` : "Context: not measured yet");
  const money_ = $derived(!s ? "Spend: not known yet"
    : s.source === "key" ? `Spend: ${money(s.usd)} of the key's ${money(s.cap!)} limit, ${PER[s.per]}`
    : s.source === "setting" ? `Spend: ${money(s.usd)} of ${money(s.cap!)} this month (the cap set in settings)`
    : s.cap ? `Spend: ${money(s.usd)} this month; the most in any month is ${money(s.cap)}`
    : `Spend: ${money(s.usd)} this month; no cap is set`);
</script>

<span class="gauge" role="img" aria-label="{context}. {money_}" title="{context}&#10;{money_}">
  <i class="bar ctx" style:--fill={fill}></i>
  <i class="bar usd" class:over style:--fill={spent}></i>
</span>

<style>
  .gauge { display: inline-flex; flex-direction: column; gap: 3px; width: 32px; align-self: center; margin-right: 4px; }
  .bar { display: block; height: 3px; background: var(--ground-2); position: relative; }
  .bar::after { content: ""; position: absolute; inset: 0; transform-origin: left; transform: scaleX(var(--fill)); background: var(--growth); transition: transform 0.3s; }
  .bar.usd::after { background: var(--text-faint); }
  .bar.usd.over::after { background: var(--rose); }
  @media (prefers-reduced-motion: reduce) { .bar::after { transition: none; } }
</style>
