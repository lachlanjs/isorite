<script lang="ts">
  // What Iso would be sent if asked now, and what the session has cost, kept small in the header. The count opens
  // the panel (the Header-Context board, and I3): every part with its share; the earlier exchanges and the notes
  // this note links to each with a switch; whether Iso may look up more; how able a model it is asked with (Q8);
  // and the way to clear the conversation. The count follows what you switch.
  import type { ContextReport, Settings, Tier } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";
  import { context } from "$lib/context.svelte.ts";

  let report = $state.raw<ContextReport | null>(null);
  let settings = $state.raw<Settings | null>(null);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;
  const note = $derived(app.open && !app.open.startsWith("@") ? app.open : "");
  const choice = $derived(note ? context.of(note) : {});
  const exchanges = $derived(report?.items.filter((i) => i.kind === "exchange") ?? []);
  const linked = $derived(report?.items.filter((i) => i.kind === "linked") ?? []);
  // The parts that are always sent, shown with their share; the two that are made of switchable pieces are listed
  // piece by piece below them.
  const fixed = $derived(report?.parts.filter((p) => p.name !== "your prompts and Iso's answers" && (p.name !== "linked notes" || !note)) ?? []);
  // What each switchable group comes to as sent: a long conversation is shortened to fit, so its pieces, each
  // counted whole, can add up to more.
  const sent = (name: string): number => report?.parts.find((p) => p.name === name)?.tokens ?? 0;

  function refresh(soon = false) {
    clearTimeout(timer);
    const at = app.open || undefined, chosen = note ? context.of(note) : undefined;
    timer = setTimeout(() => { void app.api.context(at, chosen).then((r) => (report = r), () => undefined); }, soon ? 0 : 600);
  }

  // Asked again when another note is opened, when you switch a part, and when anything that changes it happens.
  $effect(() => { void app.open; void JSON.stringify(choice); refresh(true); });
  $effect(() => app.on((e) => { if (e.type === "note-changed" || e.type === "journal" || e.type === "record") refresh(); }));
  $effect(() => () => clearTimeout(timer));
  $effect(() => { if (open && !settings) void app.api.settings().then((s) => (settings = s), () => undefined); });
  // Closed on going to another note or view: what it shows was for where you were.
  $effect(() => { void app.open; open = false; });

  async function clear() {
    await app.api.clearConversation();
    refresh(true);
  }
  const TIERS: Tier[] = ["low", "mid", "max"];
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") open = false; }} />

{#snippet onOff(on: boolean, label: string, flip: () => void)}
  <button class="sw" type="button" role="switch" aria-checked={on} aria-label={label} onclick={flip}><i></i></button>
{/snippet}

{#if report && app.session?.study}
  <span class="count">
    <button class="tokens" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`Context: ${short(report.tokens)} tokens`} onclick={() => (open = !open)}>{short(report.tokens)}</button>
    <span class="faint" aria-hidden="true">·</span>
    <span class="faint" aria-label={`This session has cost ${money(report.session.usd)}`}>{money(report.session.usd)}</span>
    {#if open}
      <button class="away" type="button" aria-label="Close the breakdown" onclick={() => (open = false)}></button>
      <div class="frame breakdown" role="dialog" aria-label="Context">
        <span class="frame-title">context · {short(report.tokens)} of {short(report.limit)} tokens</span>
        <!-- What scrolls is inside the frame, so its title on the top edge is never cut off. -->
        <div class="scroll">
        <p class="lead">What Iso is sent when you ask it {note ? "in this note" : "now"}. Switch off what it does not need.</p>
        {#each fixed as part (part.name)}
          <div class="part">
            <span>{part.name}</span><span class="faint detail">{part.detail}</span><span class="n">{short(part.tokens)}</span>
            <i style:--w={`${report.tokens ? Math.round((100 * part.tokens) / report.tokens) : 0}%`}></i>
          </div>
        {/each}
        {#if note}
          <div class="group">
            <div class="head"><span class="label">notes this one links to</span><span class="n total">{short(sent("linked notes"))}</span></div>
            {#each linked as item (item.id)}
              <div class="item" class:off={!item.on}><span class="t">{item.title}</span><span class="n">{short(item.tokens)}</span>{@render onOff(item.on, `${item.title}: ${item.on ? "sent" : "not sent"}`, () => context.toggle(note, item.id))}</div>
            {:else}<p class="faint none">none: it links to no other note</p>{/each}
          </div>
          <div class="group">
            <div class="head"><span class="label">earlier in this session</span><span class="n total">{short(sent("your prompts and Iso's answers"))}</span></div>
            {#each exchanges as item (item.id)}
              <div class="item" class:off={!item.on}><span class="t">{item.title}</span><span class="n">{short(item.tokens)}</span>{@render onOff(item.on, `${item.title}: ${item.on ? "sent" : "not sent"}`, () => context.toggle(note, item.id))}</div>
            {:else}<p class="faint none">nothing asked yet</p>{/each}
          </div>
          <div class="group">
            <div class="item"><span class="t">Iso may look up more notes while it works</span>{@render onOff(report.lookup, `look up more notes: ${report.lookup ? "on" : "off"}`, () => context.setLookup(note, !report!.lookup))}</div>
            <p class="faint none">{report.lookup ? "What it looks up is drawn on the Atlas, and sent too." : "It answers from what is above, and says what it would need."}</p>
          </div>
        {/if}
        <div class="group">
          <span class="label">how able a model</span>
          <span class="tiers" role="radiogroup" aria-label="Tier">
            {#each TIERS as t (t)}
              <button type="button" role="radio" aria-checked={context.tier === t} onclick={() => context.setTier(t)}>{t}</button>
            {/each}
          </span>
          {#if settings}<p class="faint none">{settings.tiers[context.tier]}: {context.tier === "low" ? "quick and cheap" : context.tier === "mid" ? "the usual" : "the most able, and the dearest"}</p>{/if}
        </div>
        <div class="foot">
          <span class="label">this session · {money(report.session.usd)} · {report.session.requests} {report.session.requests === 1 ? "request" : "requests"}</span>
          <button class="link" type="button" onclick={clear}>clear the conversation</button>
        </div>
        <p class="label">Sizes are estimates until Iso is asked. A long note or a long conversation is cut to fit, and Iso is told what was left out.</p>
        </div>
      </div>
    {/if}
  </span>
{/if}

<style>
  .count { position: relative; display: inline-flex; align-items: center; gap: 8px; font-size: 12px; }
  .tokens { color: var(--text); background: var(--ground-3); border: 0; padding: 2px 6px; }
  .away { position: fixed; inset: 0; z-index: 14; background: none; border: 0; cursor: default; }
  .breakdown { --inside: var(--ground-2); position: absolute; z-index: 15; right: 0; top: 40px; width: min(420px, calc(100vw - 24px)); padding: 22px 8px 14px 18px; white-space: normal; }
  .scroll { max-height: calc(100dvh - 140px); overflow-y: auto; padding-right: 10px; display: flex; flex-direction: column; gap: 10px; }
  .lead { margin: 0; color: var(--text-soft); }
  .part { display: grid; grid-template-columns: 1fr auto 48px; gap: 2px 12px; color: var(--text); }
  .part .detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
  .part .n, .item .n { text-align: right; font-variant-numeric: tabular-nums; }
  .part i { grid-column: 1 / -1; height: 3px; background: linear-gradient(to right, var(--lattice) var(--w), var(--line) var(--w)); }
  .group { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line); padding-top: 10px; }
  .head { display: flex; justify-content: space-between; gap: 12px; }
  .head .total { color: var(--text); font-variant-numeric: tabular-nums; }
  .item { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; color: var(--text); }
  .item .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .item.off .t, .item.off .n { color: var(--text-faint); text-decoration: line-through; }
  .none { margin: 0; font-size: 11px; }
  /* A switch: a short track, its knob at the right and lit when on. */
  .sw { position: relative; width: 26px; height: 14px; border: 1px solid var(--line-strong); background: var(--ground-1); padding: 0; cursor: pointer; flex: none; }
  .sw i { position: absolute; top: 2px; left: 2px; width: 8px; height: 8px; background: var(--text-faint); transition: left 0.15s, background 0.15s; }
  .sw[aria-checked="true"] { border-color: var(--lattice); }
  .sw[aria-checked="true"] i { left: 14px; background: var(--lattice); }
  .sw:focus-visible { outline: 1px solid var(--lattice); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .sw i { transition: none; } }
  .tiers { display: inline-flex; gap: 14px; }
  .tiers button { background: none; border: 0; border-bottom: 1px solid transparent; padding: 4px 0; color: var(--text-faint); font: inherit; cursor: pointer; }
  .tiers button[aria-checked="true"] { color: var(--text); border-bottom-color: var(--growth); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; cursor: pointer; }
  @media (max-width: 600px) { .breakdown { position: fixed; right: 12px; top: 52px; } }
</style>
