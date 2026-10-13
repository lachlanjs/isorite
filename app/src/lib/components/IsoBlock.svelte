<script lang="ts">
  // One block Iso has in a note: the line a prompt is written on, its reply as it arrives, a reply waiting to
  // be kept, or why a request came to nothing. Its text sits between two dotted rules, never in a box
  // (the Desktop-Editor board). The block is laid over the note; it is not in the note's file.
  import { tick } from "svelte";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import { render } from "$lib/markdown.ts";

  let { iso, key }: { iso: NoteIso; key: string } = $props();

  const proposal = $derived(key.startsWith("p:") ? iso.proposals.find((p) => p.id === key.slice(2)) : undefined);
  const said = $derived(proposal?.form === "insert" ? proposal.text : "");

  let asked = $state("");
  let face = $state<"answer" | "prompt">("answer");
  let editing = $state<string | null>(null);
  let field = $state<HTMLTextAreaElement>();
  let box = $state<HTMLTextAreaElement>();

  $effect(() => { if (key === "prompt") void tick().then(() => field?.focus()); });
  $effect(() => { if (editing !== null) void tick().then(() => box?.focus()); });

  const lastStep = $derived(iso.asking?.steps.at(-1)?.said ?? "");

  function promptKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void iso.ask(asked); }
    else if (e.key === "Escape") { e.preventDefault(); iso.prompt = null; }
  }
  async function done() {
    if (proposal && editing !== null) await iso.revise(proposal, editing);
    editing = null;
  }
</script>

{#if key === "prompt"}
  <div class="between">
    <div class="ask">
      <i class="dia open" aria-hidden="true"></i>
      <textarea bind:this={field} bind:value={asked} rows="1" placeholder="ask Iso for text here" aria-label="Ask Iso" onkeydown={promptKey}></textarea>
    </div>
    <div class="foot">
      <span class="tiers" role="radiogroup" aria-label="Tier">
        {#each ["low", "mid", "max"] as const as t (t)}
          <button type="button" role="radio" aria-checked={iso.tier === t} onclick={() => iso.setTier(t)}>{t}</button>
        {/each}
      </span>
      <span class="grow"></span>
      <button class="link faint" type="button" onclick={() => (iso.prompt = null)}>[ cancel ]</button>
      <button class="btn primary" type="button" disabled={!asked.trim()} onclick={() => iso.ask(asked)}>send to Iso</button>
    </div>
  </div>
{:else if key === "asking" && iso.asking}
  <div class="between working" aria-live="polite">
    {#if iso.asking.text}<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      <div class="prose said">{@html render(iso.asking.text)}</div>{/if}
    <div class="foot">
      <i class="dia" aria-hidden="true"></i>
      <span class="soft doing">{iso.asking.text ? "Iso is writing" : "Iso is thinking"}{#if lastStep}<span class="faint"> · {lastStep}</span>{/if}</span>
      <span class="grow"></span>
      <button class="link" type="button" onclick={() => iso.halt()}>[ stop ]</button>
    </div>
  </div>
{:else if key === "failed" && iso.failed}
  <div class="between stopped" role="alert">
    <p class="bad">{iso.failed.message}</p>
    <div class="foot"><span class="grow"></span><button class="link" type="button" onclick={() => (iso.failed = null)}>[ dismiss ]</button></div>
  </div>
{:else if proposal}
  <div class="between" data-proposal={proposal.id}>
    {#if !iso.placed(proposal)}<p class="label">The place this was written for is no longer in the note, so it is shown here. Keeping it adds it at the end.</p>{/if}
    {#if editing !== null}
      <textarea bind:this={box} class="revision" bind:value={editing} aria-label="Iso's text, to edit" rows={Math.max(3, editing.split("\n").length + 1)}></textarea>
    {:else if face === "answer"}<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      <div class="prose said">{@html render(said)}</div>
    {:else}
      <p class="soft asked">{proposal.asked}</p>
    {/if}
    <div class="foot">
      <i class="dia" aria-hidden="true"></i>
      <span class="faces" role="radiogroup" aria-label="Show">
        <button type="button" role="radio" aria-checked={face === "answer"} onclick={() => (face = "answer")}>answer</button>
        <button type="button" role="radio" aria-checked={face === "prompt"} onclick={() => (face = "prompt")}>prompt</button>
      </span>
      <span class="grow"></span>
      <button class="btn keep" type="button" disabled={iso.busy === proposal.id} onclick={() => iso.keep(proposal, editing ?? undefined)}>keep</button>
      {#if editing === null}
        <button class="btn edit" type="button" disabled={iso.busy === proposal.id} onclick={() => { editing = said; face = "answer"; }}>edit</button>
      {:else}
        <button class="btn edit" type="button" onclick={done}>done</button>
      {/if}
      <button class="btn remove" type="button" disabled={iso.busy === proposal.id} onclick={() => iso.discard(proposal)}>remove</button>
    </div>
  </div>
{/if}

<style>
  /* Iso's text in a note: no box, a dotted rule above and below that drifts while the text is not yours. */
  .between { position: relative; padding: 16px 2px; margin: 10px 0; display: flex; flex-direction: column; gap: 12px; font: 13px/1.5 var(--font-ui); }
  .between::before, .between::after { content: ""; position: absolute; left: 0; right: 0; height: 2px; background: radial-gradient(circle at 1px 1px, var(--growth) 1px, transparent 1.2px) 0 0 / 8px 2px repeat-x; animation: drift 1.6s linear infinite; }
  .between::before { top: 0; }
  .between::after { bottom: 0; animation-direction: reverse; }
  .stopped::before, .stopped::after { background-image: radial-gradient(circle at 1px 1px, var(--rose) 1px, transparent 1.2px); animation: none; }
  @keyframes drift { to { background-position: 8px 0; } }
  @media (prefers-reduced-motion: reduce) { .between::before, .between::after { animation: none; } }

  .said { font-size: var(--text-size); line-height: 1.55; }
  .said :global(> :last-child) { margin-bottom: 0; }
  .said :global(p), .said :global(section), .said :global(.table-wrap), .said :global(ul), .said :global(ol), .said :global(pre) { margin: 0 0 20px; }
  .said :global(.katex-display) { margin: 0; }
  .said :global(.katex-display > .katex) { font-size: 1.17em; }
  .asked { line-height: 1.6; white-space: pre-wrap; }
  .foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .foot .dia { margin: 0 8px 0 3px; }
  .doing { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; }
  .bad { color: var(--rose); }

  .faces, .tiers { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; }
  .faces button, .tiers button { background: none; border: 0; border-bottom: 1px solid transparent; padding: 6px 0; color: var(--text-faint); }
  .faces button[aria-checked="true"], .tiers button[aria-checked="true"] { color: var(--text); border-bottom-color: var(--growth); }
  .link { background: none; border: 0; padding: 6px 4px; color: var(--lattice); white-space: nowrap; }
  .link.faint { color: var(--text-faint); }

  .ask { display: flex; align-items: flex-start; gap: 11px; }
  .ask .dia { margin: 7px 0 0 3px; }
  .ask textarea { flex: 1 1 auto; min-width: 0; background: none; border: 0; padding: 0; resize: none; field-sizing: content; font: 13px/1.6 var(--font-ui); color: var(--text); }
  .ask textarea:focus-visible, .revision:focus-visible { outline: none; }
  .ask textarea::placeholder { color: var(--text-faint); }
  .revision { width: 100%; background: var(--ground-1); border: 0; border-left: 2px solid var(--growth); padding: 8px 12px; resize: vertical; font: 14px/1.6 var(--font-ui); color: var(--text); }
</style>
