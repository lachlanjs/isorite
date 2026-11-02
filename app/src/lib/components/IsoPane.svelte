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

  /** The agent's slash commands, offered while one is being typed, and what it lets you set (its mode, its model). */
  const commands = $derived(terminal.view?.commands ?? []);
  const settings = $derived(terminal.view?.settings ?? []);
  const typing = $derived(/^\/(\S*)$/.exec(text));
  const matches = $derived(typing && !terminal.old ? commands.filter((c) => c.name.startsWith(typing[1] ?? "")) : []);
  let at = $state(0);
  $effect(() => { void matches.length; at = 0; });
  function complete(i = at): void {
    const c = matches[i];
    if (c) text = `/${c.name} `;
  }
  async function send(): Promise<void> {
    if (await terminal.send(text)) text = "";
  }
  function keys(e: KeyboardEvent): void {
    if (matches.length && !e.isComposing) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); at = (at + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length; return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && text !== `/${matches[at]?.name}`)) { e.preventDefault(); complete(); return; }
      if (e.key === "Escape") { e.preventDefault(); text = ""; return; }
    }
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
    {#if settings.length && terminal.connected && !terminal.old}
      <div class="settings">
        {#each settings as s (`${s.kind}:${s.id}`)}
          <label class="set"><span class="hidden-label">{s.name}</span>
            <select class="field" aria-label={s.name} title={s.name} value={s.current} onchange={(e) => void terminal.set(s.kind, s.id, e.currentTarget.value)}>
              {#each s.options as o (o.value)}<option value={o.value} title={o.description}>{s.kind === "mode" ? "" : `${s.name}: `}{o.name}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
    {/if}
    {#if matches.length}
      <ul class="slash" role="listbox" aria-label="Slash commands">
        {#each matches as c, i (c.name)}
          <li role="option" aria-selected={i === at}><button type="button" tabindex="-1" class:on={i === at} onmousedown={(e) => { e.preventDefault(); complete(i); }}><b>/{c.name}</b>{#if c.hint} <span class="faint">{c.hint}</span>{/if} <span class="d">{c.description}</span></button></li>
        {/each}
      </ul>
    {/if}
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
  .settings { display: flex; flex-wrap: wrap; gap: 6px; }
  .set .field { font: 11.5px var(--font-ui); padding: 2px 6px; max-width: 14em; }
  .slash { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); background: var(--ground-1); max-height: 160px; overflow: auto; }
  .slash button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 6px 10px; font: 12.5px var(--font-ui); color: var(--text-soft); cursor: pointer; }
  .slash button.on, .slash button:hover { background: var(--ground-2, var(--ground-0)); color: var(--text); }
  .slash b { font: 500 12px var(--font-mono); color: var(--text); }
  .slash .d { color: var(--text-faint); }
  textarea:focus { border-color: var(--line-strong); outline: none; }
</style>
