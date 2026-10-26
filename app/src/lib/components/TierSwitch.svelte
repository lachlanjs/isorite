<script lang="ts">
  // How able a model Iso is asked with (Q66, M15): low · mid · max in Iso's header. Where the header is narrow (a
  // phone), the one letter of the tier chosen, which steps to the next. The model's name is in the tooltip.
  import type { Tier } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";
  import { context } from "$lib/context.svelte.ts";

  const TIERS: Tier[] = ["low", "mid", "max"];
  const SAID: Record<Tier, string> = { low: "quick", mid: "Iso's default", max: "the most able" };
  /** The provider's model for each tier, for the tooltips: asked once. */
  let models = $state.raw<Record<Tier, string> | null>(null);
  $effect(() => { if (app.api && !models) void app.api.settings().then((s) => (models = s.tiers), () => undefined); });
  const model = (t: Tier): string => models?.[t] ?? "";
  const tip = (t: Tier): string => `${t}: ${SAID[t]}${model(t) ? `, ${model(t)}` : ""}`;
  const next = (): void => context.setTier(TIERS[(TIERS.indexOf(context.tier) + 1) % TIERS.length]!);
</script>

<span class="tiers wide" role="radiogroup" aria-label="How able a model">
  {#each TIERS as t (t)}<button type="button" role="radio" aria-checked={context.tier === t} title={tip(t)} onclick={() => context.setTier(t)}>{t}</button>{/each}
</span>
<button type="button" class="tiers narrow" aria-label="How able a model: {context.tier}" title="{tip(context.tier)}: click for the next" onclick={next}>{context.tier[0]}</button>

<style>
  .tiers { font: 11px var(--font-ui); color: var(--text-faint); align-self: center; }
  .wide { display: inline-flex; gap: 6px; margin-right: 6px; }
  .wide button, .narrow { background: none; border: 0; border-bottom: 1px solid transparent; padding: 1px 0; font: inherit; color: inherit; cursor: pointer; }
  .wide button[aria-checked="true"], .narrow { color: var(--text); border-bottom-color: var(--growth); }
  .wide button:hover { color: var(--text); }
  .narrow { display: none; width: 14px; margin-right: 6px; }
  @media (max-width: 760px) { .wide { display: none; } .narrow { display: inline-block; } }
</style>
