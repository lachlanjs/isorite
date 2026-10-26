<script lang="ts">
  // Iso's usage in two 3px bars in its header: how full the context is for the model's window, and how much of what
  // may be spent has been. The figures are in the tooltip; a click opens the Context view (M15). Past 100k tokens,
  // or half the window if that is less, the context bar takes the warning colour: long contexts drift, and summing
  // up the earlier turns is suggested.
  import { panes } from "$lib/panes.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { converse } from "$lib/converse.svelte.ts";
  import { spend } from "$lib/spend.svelte.ts";

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;
  const PER = { day: "today", week: "this week", month: "this month", total: "in all" } as const;

  const report = $derived(converse.report);
  const build = $derived(panes.mode === "build");
  const view = $derived(terminal.view);
  const fill = $derived(!build && report ? Math.min(1, report.tokens / report.limit) : 0);
  const long = $derived(!build && !!report && report.tokens >= Math.min(100_000, report.limit / 2));
  const full = $derived(!build && !!report && report.tokens > report.limit);
  const s = $derived(spend.value);
  const spent = $derived(s && s.cap ? Math.min(1, s.usd / s.cap) : 0);
  const over = $derived(spent > 0.8);
  // In Build the session is the terminal's: its model, its tokens and what OpenCode says they cost (0 for a gateway's model it has no price for).
  const context = $derived(build ? `${view?.model || "OpenCode"}${view ? `, ${short(view.tokens.input + view.tokens.output)} tokens` : ""}${view?.cost ? `, ${money(view.cost)}` : ""}` : report ? `Context: ${short(report.tokens)} of ${short(report.limit)} tokens${full ? ": more than the model takes; switch parts off in the Context view" : long ? ": long enough to drift; summing up the earlier turns may help" : ""}` : "Context: not measured yet");
  const money_ = $derived(!s ? "Spend: not known yet"
    : s.source === "key" ? `Spend: ${money(s.usd)} of the key's ${money(s.cap!)} limit, ${PER[s.per]}`
    : s.source === "setting" ? `Spend: ${money(s.usd)} of ${money(s.cap!)} this month (the cap set in settings)`
    : s.cap ? `Spend: ${money(s.usd)} this month; the most in any month is ${money(s.cap)}`
    : `Spend: ${money(s.usd)} this month; no cap is set`);
</script>

<button type="button" class="gauge" aria-label="{context}. {money_}" title="{context}&#10;{money_}" onclick={() => (converse.view = converse.view === "context" ? "chat" : "context")}>
  <i class="bar ctx" class:long class:full style:--fill={fill}></i>
  <i class="bar usd" class:over style:--fill={spent}></i>
</button>

<style>
  .gauge { display: inline-flex; flex-direction: column; gap: 3px; width: 32px; align-self: center; margin-right: 4px; background: none; border: 0; padding: 6px 0; cursor: pointer; }
  .bar { display: block; height: 3px; background: var(--ground-2); position: relative; }
  .bar::after { content: ""; position: absolute; inset: 0; transform-origin: left; transform: scaleX(var(--fill)); background: var(--growth); transition: transform 0.3s; }
  .bar.usd::after { background: var(--text-faint); }
  .bar.ctx.long::after { background: var(--builds); }
  .bar.ctx.full::after { background: var(--rose); }
  .bar.usd.over::after { background: var(--rose); }
  @media (prefers-reduced-motion: reduce) { .bar::after { transition: none; } }
</style>
