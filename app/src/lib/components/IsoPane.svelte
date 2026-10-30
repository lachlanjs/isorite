<script lang="ts">
  // Iso's pane (M10; since M25 the session of the agent you attach, Iso's own loop retired): the agent's session, or
  // what it has in hand (the Context view, M10b), or the drawer of sessions; and the box, which asks in the session
  // shown. Notes named in it open in the Note pane. Enter sends; Shift+Enter is a new line; Escape stops. With no
  // agent attached, the pane says how to attach one.
  import { onMount } from "svelte";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import AgentSessions from "./AgentSessions.svelte";
  import AttachAgent from "./AttachAgent.svelte";
  import ContextView from "./ContextView.svelte";
  import TerminalTurns from "./TerminalTurns.svelte";

  let text = $state("");
  const busy = $derived(terminal.running);
  /** A session to show: the agent's, or one kept, or Iso's from before, being read. */
  const shown = $derived(!!terminal.old || terminal.acp);

  onMount(() => { terminal.start(); });
  // What is in the tray is told to the session shown, to go before its next prompt.
  $effect(() => { void tray.sent; void terminal.view?.session; if (terminal.acp) void terminal.give(); });

  async function send(): Promise<void> {
    if (await terminal.send(text)) text = "";
  }
  function keys(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
    else if (e.key === "Escape" && busy) { e.preventDefault(); void terminal.stop(); }
  }
</script>

<div class="iso" class:drop={tray.carrying?.over}>
  {#if terminal.shown === "context"}
    <ContextView />
  {:else if terminal.shown === "past"}
    <AgentSessions />
  {:else if shown}
    <TerminalTurns />
  {:else}
    <div class="chat"><AttachAgent /></div>
  {/if}
  <div class="composer">
    <div class="box">
      <label class="hidden-label" for="iso-box">Message the agent</label>
      <textarea id="iso-box" bind:value={text} rows="2" placeholder={terminal.connected ? `Ask ${terminal.view?.agent || "the agent"}` : "Attach an agent to ask it here"} onkeydown={keys}></textarea>
      {#if busy}
        <button class="corner stop" type="button" aria-label="Stop the agent" title="Stop  (Escape)" onclick={() => void terminal.stop()}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="4" y="4" width="8" height="8" fill="currentColor" /></svg></button>
      {:else if text.trim()}
        <!-- Enter sends; a phone's return makes a new line, so a phone has this (Q17). -->
        <button class="corner send" type="button" aria-label="Send" title="Send  (Enter)" onclick={() => void send()}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button>
      {/if}
    </div>
    {#if terminal.problem || terminal.view?.problem}<p class="bad" role="alert">{terminal.problem || terminal.view?.problem}</p>{/if}
  </div>
</div>

<style>
  .iso { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .iso.drop { outline: 2px dashed var(--growth); outline-offset: -4px; }
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .bad { color: var(--rose); font-size: 12px; padding-left: 16px; }
  .composer { flex: none; border-top: 1px solid var(--line); padding: 10px 12px 10px; display: grid; gap: 8px; }
  .box { position: relative; display: flex; }
  textarea { flex: 1 1 auto; min-width: 0; min-height: 42px; max-height: 160px; resize: none; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 9px 34px 9px 10px; font: 13px/1.5 var(--font-ui); color: var(--text); }
  .corner { position: absolute; right: 5px; bottom: 5px; width: 26px; height: 26px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--growth); cursor: pointer; }
  .corner.stop { color: var(--rose); }
  /* On a desktop Enter sends, so the arrow is for a touch screen only; stop is for both. */
  @media (pointer: fine) { .corner.send { display: none; } }
  textarea:focus { border-color: var(--line-strong); outline: none; }
</style>
