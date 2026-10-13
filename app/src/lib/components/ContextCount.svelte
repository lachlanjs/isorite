<script lang="ts">
  // What Iso would be sent if asked now, and what the session has cost, kept small in the header. The count
  // opens the breakdown (the Header-Context board): five parts, each with its share, and the way to clear the
  // conversation.
  import type { ContextReport } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";

  let report = $state.raw<ContextReport | null>(null);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;

  function refresh(soon = false) {
    clearTimeout(timer);
    timer = setTimeout(() => { void app.api.context(app.open || undefined).then((r) => (report = r), () => undefined); }, soon ? 0 : 600);
  }

  // Asked again when another note is opened, and when anything that changes it happens: a save, an entry, an event of the record.
  $effect(() => { void app.open; refresh(true); });
  $effect(() => app.on((e) => { if (e.type === "note-changed" || e.type === "journal" || e.type === "record") refresh(); }));
  $effect(() => () => clearTimeout(timer));

  async function clear() {
    await app.api.clearConversation();
    refresh(true);
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") open = false; }} />

{#if report && app.session?.study}
  <span class="count">
    <button class="tokens" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`Context: ${short(report.tokens)} tokens`} onclick={() => (open = !open)}>{short(report.tokens)}</button>
    <span class="faint" aria-hidden="true">·</span>
    <span class="faint" aria-label={`This session has cost ${money(report.session.usd)}`}>{money(report.session.usd)}</span>
    {#if open}
      <button class="away" type="button" aria-label="Close the breakdown" onclick={() => (open = false)}></button>
      <div class="frame breakdown" role="dialog" aria-label="Context">
        <span class="frame-title">context · {short(report.tokens)} of {short(report.limit)} tokens</span>
        {#each report.parts as part (part.name)}
          <div class="part">
            <span>{part.name}</span><span class="faint detail">{part.detail}</span><span class="n">{short(part.tokens)}</span>
            <i style:--w={`${report.tokens ? Math.round((100 * part.tokens) / report.tokens) : 0}%`}></i>
          </div>
        {/each}
        <div class="foot">
          <span class="label">this session · {money(report.session.usd)} · {report.session.requests} {report.session.requests === 1 ? "request" : "requests"}</span>
          <button class="link" type="button" onclick={clear}>[ clear the conversation ]</button>
        </div>
        <p class="label">Sizes are estimates until Iso is asked. A long note or a long conversation is cut to fit, and Iso is told what was left out.</p>
      </div>
    {/if}
  </span>
{/if}

<style>
  .count { position: relative; display: inline-flex; align-items: center; gap: 8px; font-size: 12px; }
  .tokens { color: var(--text); background: var(--ground-3); border: 0; padding: 2px 6px; }
  .away { position: fixed; inset: 0; z-index: 14; background: none; border: 0; cursor: default; }
  .breakdown { --inside: var(--ground-2); position: absolute; z-index: 15; right: 0; top: 32px; width: min(400px, calc(100vw - 24px)); padding: 22px 18px 14px; display: flex; flex-direction: column; gap: 10px; white-space: normal; }
  .part { display: grid; grid-template-columns: 1fr auto 48px; gap: 2px 12px; color: var(--text); }
  .part .detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
  .part .n { text-align: right; }
  .part i { grid-column: 1 / -1; height: 3px; background: linear-gradient(to right, var(--lattice) var(--w), var(--line) var(--w)); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; }
  @media (max-width: 600px) { .breakdown { position: fixed; right: 12px; top: 52px; } }
</style>
