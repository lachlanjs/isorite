<script lang="ts">
  // Iso's pane (M10; since M25 the session of the agent you attach, Iso's own loop retired): the agent's session, or
  // what it has in hand (the Context view, M10b), or the drawer of sessions; and the box, which asks in the session
  // shown. Notes named in it open in the Note pane. Enter sends; Shift+Enter is a new line; Escape stops. With no
  // agent attached, the pane says how to attach one.
  import { onMount } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import { handoffText } from "$lib/handoff.ts";
  import AgentSessions from "./AgentSessions.svelte";
  import AttachAgent from "./AttachAgent.svelte";
  import ContextView from "./ContextView.svelte";
  import TerminalTurns from "./TerminalTurns.svelte";

  let text = $state("");
  /** The tray's parts already given to the session shown: faint, as they go before a message once. */
  let given = $state<Set<string>>(new Set());
  const sessionId = $derived(terminal.view?.session ?? null);
  $effect(() => { void sessionId; given = new Set(); });
  // With no agent attached the tray is still shown, so what was chosen can be copied for an agent isorite does not run.
  const chips = $derived(!terminal.old ? tray.sent : []);
  let copied = $state(false);
  let copyProblem = $state("");
  async function copyForAgent(): Promise<void> {
    copyProblem = "";
    try {
      await navigator.clipboard.writeText(handoffText(tray.sent, text));
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    } catch { copyProblem = "The browser would not copy."; }
  }
  const words = (t: string, n = 44): string => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);
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
  /** While the agent works: Enter queues what is typed for when it would stop; this puts it in after the step running now. */
  async function steer(): Promise<void> {
    const keys = tray.sent.map(tray.keyOf);
    if (await terminal.steer(text)) { text = ""; given = new Set([...given, ...keys]); }
  }
  async function send(): Promise<void> {
    const keys = tray.sent.map(tray.keyOf);
    if (await terminal.send(text)) { text = ""; given = new Set([...given, ...keys]); }
  }
  function keys(e: KeyboardEvent): void {
    if (matches.length && !e.isComposing) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); at = (at + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length; return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && text !== `/${matches[at]?.name}`)) { e.preventDefault(); complete(); return; }
      if (e.key === "Escape") { e.preventDefault(); text = ""; return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && terminal.canSteer && !e.isComposing) { e.preventDefault(); void steer(); }
    else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
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
    {#if chips.length}
      <ul class="chips" aria-label="Going with your message">
        {#each chips as p (tray.keyOf(p))}
          <li class="chip" class:given={given.has(tray.keyOf(p))} data-kind={p.kind} title={given.has(tray.keyOf(p)) ? "Already given to this session" : "Goes before your next message"}>
            <span class="g" aria-hidden="true">{p.kind === "passage" ? "❝" : p.kind === "folder" ? "▤" : "◆"}</span>
            <span class="t">{p.kind === "passage" ? `${p.title}: “${words(p.text)}”` : p.title}</span>
            <button type="button" class="x" aria-label="Remove {p.kind === 'passage' ? `the passage from ${p.title}` : p.title} from the message" onclick={() => tray.remove(p)}><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
          </li>
        {/each}
      </ul>
      <p class="handoff">
        <button type="button" class="more" onclick={() => void copyForAgent()} title="Text that names these for an agent running in your own terminal, to paste there. It reads them through isorite's tools.">{copied ? "Copied" : "Copy for your agent"}</button>
        {#if copyProblem}<span class="bad" role="alert">{copyProblem}</span>{/if}
      </p>
    {/if}
    <div class="box">
      <label class="hidden-label" for="iso-box">Message the agent</label>
      <textarea id="iso-box" bind:value={text} aria-busy={terminal.sending} readonly={terminal.sending} rows="2" placeholder={terminal.connected ? `Ask ${terminal.view?.agent || "the agent"}` : "Attach an agent to ask it here"} onkeydown={keys}></textarea>
      {#if busy}
        <button class="corner stop" type="button" aria-label="Stop the agent" title="Stop  (Escape)" onclick={() => void terminal.stop()}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="4" y="4" width="8" height="8" fill="currentColor" /></svg></button>
      {:else if terminal.sending}
        <span class="corner sending" role="status" aria-label="Sending"><span class="dot"></span></span>
      {:else if text.trim()}
        <!-- Enter sends; a phone's return makes a new line, so a phone has this (Q17). -->
        <button class="corner send" type="button" aria-label="Send" title="Send  (Enter)" onclick={() => void send()}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button>
      {/if}
    </div>
    {#if busy && text.trim()}
      <p class="mid">Enter adds it for when the agent stops.{#if terminal.canSteer} <button type="button" class="more" onclick={() => void steer()} title="Put it in after the step running now (Ctrl+Enter)">Steer now</button>{/if}</p>
    {/if}
    {#if app.offline}<p class="offline" role="status"><span class="dot"></span>Lost touch with isorite; reconnecting…</p>{/if}
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
  .corner.sending, .offline .dot { pointer-events: none; }
  .dot { display: block; width: 6px; height: 6px; border-radius: 50%; background: var(--growth); animation: breathe 1s ease-in-out infinite alternate; }
  @keyframes breathe { from { opacity: .25; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  .offline { margin: 0; display: flex; align-items: center; gap: 8px; font: 12px/1.4 var(--font-ui); color: var(--text-soft); }
  .offline .dot { background: var(--rose); }
  textarea[readonly] { color: var(--text-soft); }
  /* On a desktop Enter sends, so the arrow is for a touch screen only; stop is for both. */
  @media (pointer: fine) { .corner.send { display: none; } }
  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; max-height: 84px; overflow: auto; }
  .chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-width: 0; padding: 2px 4px 2px 8px; border: 1px solid var(--line-strong); background: var(--ground-1); font: 12px/1.4 var(--font-ui); color: var(--text); }
  .chip .g { color: var(--growth); flex: none; }
  .chip .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mid { margin: 0; font: 12px/1.4 var(--font-ui); color: var(--text-soft); }
  .mid .more { background: none; border: 0; padding: 0; color: var(--growth); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .handoff { margin: 0; display: flex; align-items: center; gap: 8px; }
  .handoff .more { background: none; border: 0; padding: 0; color: var(--growth); font: 12px/1.4 var(--font-ui); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .chip.given { border-color: var(--line); color: var(--text-faint); }
  .chip.given .g { color: var(--text-faint); }
  .chip .x { flex: none; width: 18px; height: 18px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: inherit; cursor: pointer; }
  .chip .x:hover { color: var(--rose); }
  .settings { display: flex; flex-wrap: wrap; gap: 6px; }
  .set .field { font: 11.5px var(--font-ui); padding: 2px 6px; max-width: 14em; }
  .slash { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); background: var(--ground-1); max-height: 160px; overflow: auto; }
  .slash button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 6px 10px; font: 12.5px var(--font-ui); color: var(--text-soft); cursor: pointer; }
  .slash button.on, .slash button:hover { background: var(--ground-2, var(--ground-0)); color: var(--text); }
  .slash b { font: 500 12px var(--font-mono); color: var(--text); }
  .slash .d { color: var(--text-faint); }
  textarea:focus { border-color: var(--line-strong); outline: none; }
</style>
