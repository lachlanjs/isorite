<script lang="ts">
  // Iso's pane (M10): the conversation, or what the next turn is sent (its Context, M10b), and Iso's box. Each turn
  // shows what you asked and gave, what Iso looked up, what it pointed you to, and what it said. Notes named in it
  // open in the Note pane. Enter sends; Shift+Enter is a new line; Shift+Tab is the next mode, as in OpenCode;
  // Escape stops. Iso always reads the knowledge base as it needs. In Build mode (M11) the pane is the terminal's
  // session instead: what is asked goes to OpenCode there, with what you gave.
  import type { Step, Tier, Turn, TurnItem } from "@isorite/engine";
  import { onMount, tick } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { context } from "$lib/context.svelte.ts";
  import { converse } from "$lib/converse.svelte.ts";
  import { render } from "$lib/markdown.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { tray, type Part } from "$lib/tray.svelte.ts";
  import TerminalTurns from "./TerminalTurns.svelte";

  const SYM: Record<Part["kind"], string> = { note: "▣", folder: "▭", passage: "“", understanding: "◇" };
  const said = (p: Part): string => (p.kind === "passage" ? `“${p.text}” from ${p.title}` : p.kind === "folder" ? `the folder ${p.title}` : p.kind === "understanding" ? `your understanding of ${p.title}` : p.title);
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id;
  const HOW: Record<Step["how"], string> = { keyword: "searched", meaning: "by meaning", link: "followed", read: "read" };
  const TIERS: Tier[] = ["low", "mid", "max"];
  const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const money = (usd: number): string => `$${usd.toFixed(usd > 0 && usd < 0.1 ? 3 : 2)}`;

  let text = $state("");
  let list = $state<HTMLElement>();
  const build = $derived(panes.mode === "build");
  const running = $derived(converse.running);
  /** Whether what the box sends to is at work: Iso's turn, or the terminal's. */
  const busy = $derived(build ? terminal.running : !!running);
  /** Where Iso is in the turn running: what it reads now, or that it is writing. */
  const doing = $derived.by(() => {
    if (!running) return "";
    if (converse.streaming) return "Iso is writing";
    const last = running.items.findLast((i): i is Extract<TurnItem, { kind: "look" }> => i.kind === "look");
    return last?.step.opened ? `Iso is reading ${titleOf(last.step.opened)}` : "Iso is thinking";
  });

  onMount(() => { converse.start(); terminal.start(); });
  // What is sent is measured again when what you give, the mode, the tier or the switch changes.
  $effect(() => { void tray.sent; void panes.mode; void context.tier; converse.measure(); });
  // Kept at the newest as the conversation grows.
  $effect(() => { void converse.turns; void converse.streaming; void tick().then(() => { if (list) list.scrollTop = list.scrollHeight; }); });

  async function send(): Promise<void> {
    const asked = text;
    if (await (build ? terminal.send(asked) : converse.send(asked))) text = "";
  }
  const stop = (): Promise<void> => (build ? terminal.stop() : converse.stop());
  function keys(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
    else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); panes.stepMode(1); }
    else if (e.key === "Escape" && busy) { e.preventDefault(); void stop(); }
  }
  function open(id: string): void { void panes.open(id, true); }
  /** A note Iso changed opens in the note's Iso lens, where its words are marked; an Understanding note in the
   *  note's Understand lens. */
  function openChanged(id: string): void {
    if (id.startsWith("@understanding/")) { openUnderstanding(id.slice("@understanding/".length)); return; }
    panes.setLens("note", "iso"); void panes.open(id, true);
  }
  function openUnderstanding(id: string): void { panes.setLens("note", "understand"); void panes.open(id, true); }
  const changes = (t: Turn): boolean => t.items.some((i) => i.kind === "change") && !t.items.some((i) => i.kind === "undone");
</script>

{#snippet given(t: Turn)}
  {#if t.given.length}
    <span class="gave">
      {#each t.given as g, k (k)}
        <span class="chip" class:u={g.kind === "understanding"}><span class="k" aria-hidden="true">{SYM[g.kind]}</span><span class="t">{g.kind === "passage" ? g.text : g.kind === "folder" ? g.id || "the base" : titleOf(g.id)}</span></span>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet item(i: TurnItem)}
  {#if i.kind === "text"}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
    <div class="said prose">{@html render(i.text)}</div>
  {:else if i.kind === "look"}
    <p class="look" class:failed={i.step.failed}>
      <span class="v">{HOW[i.step.how]}</span>
      {#if i.step.opened}<button type="button" class="note-link" onclick={() => open(i.step.opened!)}>{titleOf(i.step.opened)}{i.step.section ? ` · ${i.step.section}` : ""}</button>
      {:else}<span class="q">{i.step.query ? `“${i.step.query}”` : i.step.said}</span>{#if i.step.notes.length}<span class="n">{i.step.notes.length} found</span>{/if}{/if}
    </p>
  {:else if i.kind === "change"}
    <p class="change">
      <span class="v">{i.note.startsWith("@understanding/") ? "wrote" : i.why === "create" ? "made" : i.why === "delete" ? "deleted" : i.why === "move" ? "moved" : "changed"}</span>
      {#if i.why === "delete"}<span class="q">{i.title}</span>{:else}<button type="button" class="note-link" onclick={() => openChanged(i.why === "move" ? i.to! : i.note)}>{i.why === "move" ? `${i.title} → ${i.to}` : i.note.startsWith("@") ? i.title : titleOf(i.note)}</button>{/if}
      {#if i.added || i.removed}<span class="n"><span class="add">+{i.added}</span> <span class="del">−{i.removed}</span></span>{/if}
    </p>
  {:else if i.kind === "permission"}
    <div class="permit" role="group" aria-label="Iso asks before it does this">
      <p>Iso wants to {i.what}.</p>
      {#if i.answer}
        <p class="faint">{i.answer === "reject" ? "Not allowed." : i.answer === "always" ? "Allowed, and from now on in this conversation." : "Allowed once."}</p>
      {:else}
        <p class="acts"><button type="button" onclick={() => void converse.answer(i.id, "once")}>Allow once</button><button type="button" onclick={() => void converse.answer(i.id, "always")}>Always allow this</button><button type="button" class="no" onclick={() => void converse.answer(i.id, "reject")}>Don't allow</button></p>
      {/if}
    </div>
  {:else if i.kind === "understood"}
    <p class="understood"><span class="v">recorded</span><button type="button" class="note-link" onclick={() => openUnderstanding(i.note)}>{titleOf(i.note)}</button><span class="by" class:up={i.by > 0} class:down={i.by < 0}>{i.by > 0 ? `+${i.by}` : i.by < 0 ? `−${-i.by}` : "±0"}</span>{#if i.why}<span class="why">{i.why}</span>{/if}</p>
  {:else if i.kind === "undone"}
    <p class="faint undone">{i.notes.length ? `Undone: ${i.notes.map(titleOf).join(", ")} put back.` : "Nothing was put back."}{i.left.length ? ` Left as they are, changed since: ${i.left.map(titleOf).join(", ")}.` : ""}</p>
  {:else if i.kind === "point"}
    <p class="point"><span class="dia" aria-hidden="true">◆</span><span class="v">look at</span><button type="button" class="note-link" onclick={() => open(i.note)}>{titleOf(i.note)}</button>{#if i.why}<span class="why">{i.why}</span>{/if}</p>
  {/if}
{/snippet}

<div class="iso" class:drop={tray.carrying?.over}>
  {#if converse.view === "context"}
    <div class="context" role="region" aria-label="What Iso is sent">
      <h2 class="label">what you gave</h2>
      {#if tray.sent.length}
        <ul class="given" aria-label="What you gave Iso">
          {#each tray.sent as p (tray.keyOf(p))}
            {@const n = converse.sizeOf(p)}
            <li class:u={p.kind === "understanding"} class:fresh={tray.fresh === tray.keyOf(p)} title={said(p)}>
              <span class="k" aria-hidden="true">{SYM[p.kind]}</span>
              <span class="t">{p.kind === "passage" ? `“${p.text}”` : p.kind === "understanding" ? `Understanding · ${p.title}` : p.kind === "folder" ? `${p.title}/` : p.title}{#if p.kind === "passage"}<span class="from"> from {p.title}</span>{/if}</span>
              <span class="num">{n === null ? "" : short(n)}</span>
              <button type="button" class="x" aria-label="Take {said(p)} out of Iso's context" onclick={() => tray.remove(p)}>
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="faint">Nothing yet. Hold a note on the Atlas, or drag it here, or select a passage in a note and send it to Iso. Iso reads the rest of the base as it needs.</p>
      {/if}
      {#if build}
        <p class="faint">Sent with your next message to the terminal's agent: notes and folders by name, for it to read with isorite's tools, and passages as they are.</p>
      {:else if converse.report}
        <h2 class="label">all that is sent</h2>
        <div class="parts">
          {#each converse.report.parts as p (p.name)}
            <p class="part"><span>{p.name}</span><span class="faint">{p.detail}</span><span class="grow"></span><span class="num">{short(p.tokens)}</span></p>
          {/each}
          {#if converse.report.items.length}
            <p class="faint sub">earlier turns, each sent or left out</p>
            {#each converse.report.items as it (it.id)}
              <p class="part"><span class="t" class:off={!it.on}>{it.title}</span><span class="grow"></span><span class="num">{short(it.tokens)}</span>
                <button class="sw" type="button" role="switch" aria-checked={it.on} aria-label="Send: {it.title}" onclick={() => converse.toggleTurn(it.id)}><i></i></button></p>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {:else if build}
    <TerminalTurns />
  {:else}
    <div class="chat" bind:this={list} role="log" aria-label="The conversation with Iso" aria-live="polite">
      {#each converse.turns as t (t.id)}
        <article class="turn" data-state={t.state}>
          <div class="you"><p class="asked">{t.asked}</p>{@render given(t)}{#if t.mode !== "ask"}<span class="tmode" class:m={t.mode === "understand"}>{t.mode}</span>{/if}</div>
          {#each t.items as i, k (k)}{@render item(i)}{/each}
          {#if t.state === "running"}
            {#if converse.streaming}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
              <div class="said prose">{@html render(converse.streaming)}</div>
            {/if}
            <p class="doing" role="status"><i class="spin" aria-hidden="true"></i>{doing}</p>
          {:else if changes(t)}
            <p class="undo"><button class="icon" type="button" aria-label="Undo this turn's changes" title="Put back every note this turn changed" onclick={() => void converse.undo(t.id)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.2 9.5A5 5 0 1 0 4.6 4.3" /><path d="M3 1.8v3.4h3.4" /></svg></button></p>
          {/if}
          {#if t.state === "failed"}
            <p class="bad" role="alert">Iso could not answer: {t.message}</p>
          {:else if t.state === "stopped"}
            <p class="faint end">stopped</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
  <div class="composer">
    <div class="box">
      <label class="hidden-label" for="iso-box">Message Iso</label>
      <textarea id="iso-box" bind:value={text} rows="2" placeholder={build ? "Ask in the terminal's session" : `Ask Iso, in ${panes.mode} mode`} onkeydown={keys}></textarea>
      {#if busy}
        <button class="corner stop" type="button" aria-label={build ? "Stop the terminal's agent" : "Stop Iso"} title="Stop  (Escape)" onclick={() => void stop()}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="4" y="4" width="8" height="8" fill="currentColor" /></svg></button>
      {:else if text.trim()}
        <!-- Enter sends; a phone's return makes a new line, so a phone has this (Q17). -->
        <button class="corner send" type="button" aria-label="Send" title="Send  (Enter)" onclick={() => void send()}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button>
      {/if}
    </div>
    {#if (build ? terminal.problem : converse.problem)}<p class="bad" role="alert">{build ? terminal.problem : converse.problem}</p>{/if}
    {#if build}
      <!-- The terminal's own model, and what the session has cost so far. -->
      <div class="foot">
        <span>{terminal.view?.model || "OpenCode"}</span>
        {#if terminal.view}<span>{short(terminal.view.tokens.input + terminal.view.tokens.output)} tokens</span>{/if}
        <span class="grow"></span>
        {#if terminal.view}<span>{money(terminal.view.cost)}</span>{/if}
      </div>
    {:else}
    <div class="foot">
      {#if converse.report}<button class="count" type="button" aria-pressed={converse.view === "context"} title="What Iso is sent with your message, part by part" onclick={() => (converse.view = converse.view === "context" ? "chat" : "context")}>{short(converse.report.tokens)} tokens</button>{/if}
      <span class="tiers" role="radiogroup" aria-label="How able a model">
        {#each TIERS as t (t)}<button type="button" role="radio" aria-checked={context.tier === t} onclick={() => context.setTier(t)}>{t}</button>{/each}
      </span>
      <span class="grow"></span>
      {#if converse.report}<span>{money(converse.report.session.usd)}</span>{/if}
    </div>
    {/if}
  </div>
</div>

<style>
  .iso { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .iso.drop { outline: 2px dashed var(--growth); outline-offset: -4px; }
  .grow { flex: 1 1 auto; }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .icon:hover:not(:disabled) { color: var(--text); }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .turn { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .you { padding-left: 16px; position: relative; display: flex; flex-direction: column; gap: 6px; }
  .you::before { content: "›"; position: absolute; left: 0; top: 0; color: var(--lattice); }
  .asked { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); }
  .tmode { align-self: flex-start; font-size: 11px; color: var(--growth); }
  .tmode.m { color: var(--malachite); }
  .gave { display: flex; flex-wrap: wrap; gap: 4px; }
  .said { padding-left: 16px; position: relative; font: 15px/1.6 var(--font-text); overflow-wrap: anywhere; min-width: 0; }
  .said::before { content: "◆"; position: absolute; left: 0; top: 2px; font: 10px var(--font-ui); color: var(--growth); }
  .said :global(p + p), .said :global(p + ul), .said :global(ul + p) { margin-top: 8px; }
  .said :global(ul), .said :global(ol) { margin: 0; padding-left: 20px; }
  .said :global(.katex-display) { overflow-x: auto; overflow-y: hidden; }
  .look, .point, .doing { padding-left: 16px; font-size: 12px; color: var(--text-faint); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; position: relative; }
  .look::before { content: "·"; position: absolute; left: 4px; }
  .look .v { color: var(--text-soft); min-width: 5.5em; }
  .look.failed .q { color: var(--rose); }
  .look .n { color: var(--text-faint); }
  .note-link { background: none; border: 0; padding: 0; font: inherit; color: var(--text-soft); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
  .note-link:hover, .note-link:focus-visible { color: var(--lattice); }
  .point { color: var(--text-faint); }
  .point .v { color: var(--text-soft); min-width: 5.5em; }
  .point .why { flex-basis: 100%; padding-left: calc(5.5em + 8px); color: var(--text-soft); }
  .change { padding-left: 16px; font-size: 12px; color: var(--text-faint); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; position: relative; }
  .change::before { content: "✎"; position: absolute; left: 0; color: var(--growth); }
  .change .v { color: var(--text-soft); min-width: 5.5em; }
  .change .add { color: var(--malachite); }
  .change .del { color: var(--rose); }
  .permit { margin-left: 16px; border: 1px solid var(--growth); padding: 10px 12px; display: grid; gap: 8px; font-size: 12.5px; }
  .acts { display: flex; gap: 16px; flex-wrap: wrap; }
  .acts button { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .acts button:hover { color: var(--text); }
  .acts .no { color: var(--text-faint); }
  .understood { padding-left: 16px; font-size: 12px; color: var(--text-faint); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; position: relative; }
  .understood::before { content: "◇"; position: absolute; left: 0; color: var(--malachite); }
  .understood .v { color: var(--text-soft); min-width: 5.5em; }
  .understood .by.up { color: var(--malachite); }
  .understood .by.down { color: var(--rose); }
  .understood .why { flex-basis: 100%; padding-left: calc(5.5em + 8px); color: var(--text-soft); }
  .undo { padding-left: 10px; margin-top: -4px; }
  .undone { font-size: 12px; padding-left: 16px; }
  .point .dia { color: var(--growth); font-size: 10px; position: absolute; left: 0; }
  .doing .spin { position: absolute; left: 1px; top: 4px; width: 8px; height: 8px; border: 1px solid var(--growth); animation: spin 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .bad { color: var(--rose); font-size: 12px; padding-left: 16px; }
  .end { font-size: 12px; padding-left: 16px; }
  .composer { flex: none; border-top: 1px solid var(--line); padding: 10px 12px 10px; display: grid; gap: 8px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; border: 1px solid var(--line); font-size: 11px; color: var(--text-soft); max-width: 100%; }
  .chip.u { border-color: var(--malachite); }
  .chip .k { color: var(--growth); }
  .chip.u .k { color: var(--malachite); }
  .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }
  .box { position: relative; display: flex; }
  textarea { flex: 1 1 auto; min-width: 0; min-height: 42px; max-height: 160px; resize: none; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 9px 34px 9px 10px; font: 13px/1.5 var(--font-ui); color: var(--text); }
  .corner { position: absolute; right: 5px; bottom: 5px; width: 26px; height: 26px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--growth); cursor: pointer; }
  .corner.stop { color: var(--rose); }
  /* On a desktop Enter sends, so the arrow is for a touch screen only; stop is for both. */
  @media (pointer: fine) { .corner.send { display: none; } }
  .context { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; font-size: 12px; }
  .context h2 { font-weight: 400; }
  .context h2 + * { margin-top: -4px; }
  .context .label ~ .label { margin-top: 10px; }
  .given { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .given li { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 0 4px 2px; border-bottom: 1px solid var(--line); }
  .given .k { color: var(--growth); flex: none; width: 12px; }
  .given li.u .k { color: var(--malachite); }
  .given .t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-soft); }
  .given .from { color: var(--text-faint); }
  .given .num { color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .given .x { width: 22px; height: 22px; flex: none; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .given .x:hover { color: var(--rose); }
  .given li.fresh { animation: fresh 1.6s ease-out; }
  @keyframes fresh { 0% { background: color-mix(in srgb, var(--growth) 30%, var(--ground-0)); } }
  textarea:focus { border-color: var(--line-strong); outline: none; }
  .foot { display: flex; align-items: center; gap: 14px; font-size: 11px; color: var(--text-faint); flex-wrap: wrap; }
  .count { background: none; border: 0; padding: 2px 0; font: inherit; color: var(--text-soft); cursor: pointer; }
  .count[aria-pressed="true"] { color: var(--text); }
  .parts { display: grid; gap: 4px; font-size: 11.5px; }
  .part { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .part .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .part .t.off { color: var(--text-faint); text-decoration: line-through; }
  .part .num { font-variant-numeric: tabular-nums; color: var(--text-faint); }
  .sub { margin-top: 6px; }
  .sw { width: 26px; height: 14px; flex: none; background: var(--ground-2); border: 1px solid var(--line-strong); padding: 0; position: relative; cursor: pointer; }
  .sw i { position: absolute; top: 2px; left: 2px; width: 8px; height: 8px; background: var(--text-faint); transition: left 0.15s; }
  .sw[aria-checked="true"] i { left: 14px; background: var(--growth); }
  .tiers { display: inline-flex; gap: 8px; }
  .tiers button { background: none; border: 0; border-bottom: 1px solid transparent; padding: 2px 0; font: inherit; color: var(--text-faint); cursor: pointer; }
  .tiers button[aria-checked="true"] { color: var(--text); border-bottom-color: var(--growth); }
  .tiers button:hover { color: var(--text); }
  @media (prefers-reduced-motion: reduce) { .given li.fresh, .doing .spin { animation: none; } }
</style>
