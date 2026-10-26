<script lang="ts">
  // One block Iso has in a note: the line a prompt is written on, its reply as it arrives, text of its waiting
  // to be kept, or why a request came to nothing. Its text sits between two dotted rules, never in a box
  // (the Desktop-Editor board). The block is laid over the note; it is not in the note's file.
  //
  // A rewrite's changes are not here: each is set in the text beside the passage it would replace
  // (IsoChange.svelte). What Iso says of them is text of its like any other, and has a block.
  import { tick } from "svelte";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";

  let { iso, key }: { iso: NoteIso; key: string } = $props();

  const proposal = $derived(key.startsWith("p:") ? iso.proposals.find((p) => p.id === key.slice(2)) : undefined);
  const editing = $derived(proposal && iso.editing?.id === proposal.id ? iso.editing : null);
  const waiting = $derived(Boolean(proposal) && iso.busy === proposal?.id);
  const lost = $derived(iso.changes.filter((c) => !c.at));

  let asked = $state("");
  let field = $state<HTMLTextAreaElement>();

  $effect(() => { if (key === "prompt") void tick().then(() => field?.focus()); });

  const lastStep = $derived(iso.asking?.steps.at(-1)?.said ?? "");
  const rewriting = $derived((iso.asking?.regions.length ?? 0) > 0);
  const rewrite = $derived(iso.prompt?.mode === "rewrite");
  const picked = $derived(iso.prompt?.regions.length ?? 0);
  const ready = $derived(Boolean(asked.trim()) && (!rewrite || picked > 0));

  function promptKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void iso.ask(asked); }
    else if (e.key === "Escape") { e.preventDefault(); iso.prompt = null; }
  }
</script>

{#if key === "prompt"}
  <!-- The prompt line (Q6): for a rewrite of what is selected, how; on an empty line, what to write there. A question
       written in the note is asked as it stands, and needs no prompt. -->
  <div class="between">
    {#if rewrite}<span class="soft picked" role="status">{picked === 0 ? "select text in the note to rewrite" : `rewriting ${picked} ${picked === 1 ? "passage" : "passages"} · select more, or click one to drop it`}</span>{/if}
    <div class="ask">
      <i class="dia open" aria-hidden="true"></i>
      <textarea bind:this={field} bind:value={asked} rows="1" aria-label="Ask Iso" onkeydown={promptKey}
        placeholder={rewrite ? "how should Iso rewrite it?" : "what should Iso write here?"}></textarea>
    </div>
    <div class="foot">
      <span class="grow"></span>
      <button class="link faint" type="button" onclick={() => (iso.prompt = null)}>cancel</button>
      <button class="btn primary" type="button" disabled={!ready} onclick={() => iso.ask(asked)}>ask Iso</button>
    </div>
  </div>
{:else if key === "asking" && iso.asking}
  <div class="between working" aria-live="polite">
    <!-- A rewrite's reply is marks and passages until it is taken apart: it is shown when it is whole. -->
    {#if iso.asking.text && !rewriting}<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      <div class="prose said" use:drawn={iso.asking.text}>{@html render(iso.asking.text)}</div>{/if}
    <div class="foot">
      <i class="dia" aria-hidden="true"></i>
      <span class="soft doing">{iso.asking.text ? (rewriting ? "Iso is rewriting" : "Iso is writing") : "Iso is thinking"}{#if lastStep}<span class="faint"> · {lastStep}</span>{/if}</span>
      <span class="grow"></span>
      <button class="link" type="button" onclick={() => iso.halt()}>stop</button>
    </div>
  </div>
{:else if key === "failed" && iso.failed}
  <div class="between stopped" role="alert">
    <p class="bad">{iso.failed.message}</p>
    <div class="foot"><span class="grow"></span><button class="link" type="button" onclick={() => (iso.failed = null)}>dismiss</button></div>
  </div>
{:else if key === "lost" && lost.length}
  <!-- Changes whose passages you have since edited: there is nowhere to set them, so they are told of here. -->
  <div class="between stopped">
    <p class="label">{lost.length === 1 ? "One change Iso offered is" : `${lost.length} changes Iso offered are`} for text that is no longer in the note as it was, so {lost.length === 1 ? "it" : "they"} cannot be kept.</p>
    {#each lost as c (c.key)}
      <p class="soft lost"><span class="strike">{c.proposal.regions[c.k]!.old.text.trim()}</span> → {c.proposal.regions[c.k]!.new.trim() || "(taken out)"}</p>
    {/each}
    <div class="foot"><span class="grow"></span><button class="btn remove" type="button" onclick={() => { for (const c of lost) void iso.discardChange(c); }}>remove</button></div>
  </div>
{:else if proposal}
  <div class="between" data-proposal={proposal.id}>
    {#if !iso.placed(proposal)}<p class="label">The place this was written for is no longer in the note, so it is shown here. Keeping it adds it at the end.</p>{/if}
    {#if editing}
      <textarea class="revision" bind:value={editing.text} aria-label="Iso's text, to edit" rows={Math.max(3, editing.text.split("\n").length + 1)}></textarea>
    {:else}<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      <div class="prose said" use:drawn={{ given: proposal.text, copy: true }}>{@html render(proposal.text)}</div>
    {/if}
    {#if proposal.notice}<p class="label">{proposal.notice}</p>{/if}
    <div class="foot">
      <i class="dia" aria-hidden="true"></i>
      <span class="grow"></span>
      <button class="btn keep" type="button" disabled={waiting} onclick={() => iso.keep(proposal)}>keep</button>
      {#if editing}
        <button class="btn edit" type="button" onclick={() => iso.done(proposal)}>done</button>
      {:else}
        <button class="btn edit" type="button" disabled={waiting} onclick={() => iso.edit(proposal)}>edit</button>
      {/if}
      <button class="btn remove" type="button" disabled={waiting} onclick={() => iso.discard(proposal)}>remove</button>
    </div>
  </div>
{/if}

<style>
  /* Iso's text in a note: no box, a dotted rule above and below that drifts while the text is not yours. */
  /* No margin of its own: the editor measures the block it sits in, and a margin would fall outside that. The space
     round it is the block's padding (overlays.ts). */
  .between { position: relative; padding: 16px 2px; display: flex; flex-direction: column; gap: 12px; font: 13px/1.5 var(--font-ui); }
  .between::before, .between::after { content: ""; position: absolute; left: 0; right: 0; height: 2px; background: radial-gradient(circle at 1px 1px, var(--growth) 1px, transparent 1.2px) 0 0 / 8px 2px repeat-x; animation: drift 1.6s linear infinite; }
  .between::before { top: 0; }
  .between::after { bottom: 0; animation-direction: reverse; }
  .stopped::before, .stopped::after { background-image: radial-gradient(circle at 1px 1px, var(--rose) 1px, transparent 1.2px); animation: none; }
  @keyframes drift { to { background-position: 8px 0; } }
  @media (prefers-reduced-motion: reduce) { .between::before, .between::after { animation: none; } }

  .said { font-size: var(--text-size); line-height: 1.55; }
  .said :global(p), .said :global(section), .said :global(.table-wrap), .said :global(ul), .said :global(ol), .said :global(pre) { margin: 0 0 20px; }
  .said :global(h1), .said :global(h2), .said :global(h3), .said :global(h4) { font-size: 22px; line-height: 1.3; margin: 0 0 12px; }
  .said :global(h1) { font-size: 26px; } .said :global(h3) { font-size: 19px; } .said :global(h4) { font-size: 17px; }
  .said :global(pre) { font: 13px/20px var(--font-mono); background: var(--ground-1); border-left: 2px solid var(--line-strong); padding: 12px 16px; overflow-x: auto; }
  .said :global(:not(pre) > code) { font-family: var(--font-mono); font-size: .86em; }
  .said :global(> :last-child) { margin-bottom: 0; }
  .said :global(.katex-display) { margin: 0; }
  .said :global(.katex-display > .katex) { font-size: 1.17em; }
  .foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .foot .dia { margin: 0 8px 0 3px; }
  .doing { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; }
  .bad { color: var(--rose); }
  .picked { font-size: 12px; }
  .lost { font: var(--text-size)/1.55 var(--font-text); }
  .strike { text-decoration: line-through; color: var(--text-faint); }

  .link { background: none; border: 0; padding: 6px 4px; color: var(--lattice); white-space: nowrap; }
  .link.faint { color: var(--text-faint); }

  .ask { display: flex; align-items: flex-start; gap: 11px; }
  .ask .dia { margin: 7px 0 0 3px; }
  /* What you ask is written in the note's own type, not the interface's (I2). */
  .ask textarea { flex: 1 1 auto; min-width: 0; background: none; border: 0; padding: 0; resize: none; field-sizing: content; font: var(--text-size)/1.55 var(--font-text); color: var(--text); }
  .ask textarea:focus-visible, .revision:focus-visible { outline: none; }
  .ask textarea::placeholder { color: var(--text-faint); }
  .revision { width: 100%; background: var(--ground-1); border: 0; border-left: 2px solid var(--growth); padding: 8px 12px; resize: vertical; font: 14px/1.6 var(--font-ui); color: var(--text); }
</style>
