<script lang="ts">
  // The Agent pane: the session of isorite's own agent, or what it has in hand (the Context view, M10b), or the drawer
  // of sessions; and the box, which asks in the session shown. Under the box, in its footer, what the box talks to and
  // what it may do: the agent (its model, with a menu: settings, a new session, the sessions), what it may reach (notes,
  // the project's files, commands), how full its context is, and the button that sends or stops. Enter sends;
  // Shift+Enter is a new line; Escape stops; Up in an empty box brings back what was last sent. With no agent set up,
  // the pane says how to set one up.
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { app } from "$lib/app.svelte.ts";
  import { flyOut, reduced, DUR_1 } from "$lib/motion.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import { pointers } from "$lib/pointers.svelte.ts";
  import PromptBox from "./PromptBox.svelte";
  import AgentSessions from "./AgentSessions.svelte";
  import AttachAgent from "./AttachAgent.svelte";
  import ContextView from "./ContextView.svelte";
  import AgentGauge from "./AgentGauge.svelte";
  import TerminalTurns from "./TerminalTurns.svelte";

  let text = $state("");
  let copied = $state(false);
  let copyProblem = $state("");
  async function copyForAgent(): Promise<void> {
    copyProblem = "";
    try {
      await navigator.clipboard.writeText(`${HANDOFF}\n\n${await pointers.expand(text)}`);
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    } catch { copyProblem = "The browser would not copy."; }
  }
  const HANDOFF = "From my isorite knowledge base. Read what I point to with the isorite tools (read_note, outline_note, search_notes), not from this message alone: the notes may have changed since I chose them.";
  const busy = $derived(terminal.running);
  /** A session to show: the agent's, or one kept, or the agent's from before, being read. */
  const shown = $derived(!!terminal.old || terminal.inPane);
  /** The agent as the footer names it: its model, without the provider's prefix. */
  const name = $derived(terminal.view?.model ? terminal.view.model.split("/").at(-1)! : terminal.view?.agent || "Agent");

  onMount(() => { terminal.start(); });

  /** While the agent works: Enter queues what is typed for when it would stop; this puts it in after the step running now. */
  async function steer(): Promise<void> {
    if (await terminal.steer(await pointers.expand(text))) text = "";
  }
  async function send(): Promise<void> {
    const raw = text;
    if (await terminal.send(await pointers.expand(raw), raw)) text = "";
  }
  /** Up in an empty box: what was last sent from it (or, after a reload, the last thing asked in the session). */
  function recall(): boolean {
    const last = terminal.history.at(-1) ?? terminal.view?.turns.findLast((t) => t.from === "here")?.asked.replace(/\n\n\[\^\d+\]: [^]*$/, "").replace(/\s*\(isorite: [^]*$/, "");
    if (!last) return false;
    text = last;
    return true;
  }
  function keys(e: KeyboardEvent): void {
    if (e.isComposing) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && terminal.canSteer) { e.preventDefault(); void steer(); }
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
    else if (e.key === "Escape" && menu) { e.preventDefault(); menu = false; }
    else if (e.key === "Escape" && busy) { e.preventDefault(); void terminal.stop(); }
    else if (e.key === "ArrowUp" && !text && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) { if (recall()) e.preventDefault(); }
  }

  // ------------------------------------------------------------ the agent's menu

  let menu = $state(false);
  let menuEl = $state<HTMLElement>();
  $effect(() => { if (menu) menuEl?.querySelector<HTMLElement>("[role=menuitem]")?.focus(); });
  function outside(e: PointerEvent): void {
    if (menu && e.target instanceof Element && !e.target.closest(".agent-wrap")) menu = false;
  }
  function act(what: () => void): void { menu = false; what(); }
  function menuKeys(e: KeyboardEvent): void {
    const items = [...(menuEl?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])], at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); menu = false; document.getElementById("agent-box")?.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
  }

  // ------------------------------------------------------------ what it may reach

  /** The switches the agent's reach is: notes for any agent; the project's files and commands for isorite's own, while one is set up. */
  const REACH = [
    { k: "notes", word: "notes", says: "Agent edits notes", key: "Alt+N" },
    { k: "files", word: "files", says: "Agent edits files", key: "Alt+F" },
    { k: "run", word: "run", says: "Agent runs commands", key: "Alt+R" },
  ] as const;
  const reach = $derived(REACH.filter((r) => r.k === "notes" || panes.attached));

  /** What went wrong, short, with the one thing to do about it. */
  const problem = $derived(terminal.problem || terminal.view?.problem || copyProblem);
  const noAgent = $derived(/no agent is set up/i.test(problem));
</script>

<svelte:window onpointerdown={outside} />

<div class="apane" class:drop={tray.carrying?.over}>
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
    {#if busy && text.trim()}
      <p class="mid" transition:fade={{ duration: reduced() ? 0 : DUR_1 }}>Enter queues it for when it stops.{#if terminal.canSteer} <button type="button" class="link" onclick={() => void steer()} title="Put it in after the step running now (Ctrl+Enter)">Steer now</button>{/if}</p>
    {/if}
    <div class="box" class:busy>
      <PromptBox bind:value={text} readonly={terminal.sending} placeholder={terminal.connected ? `Ask ${name}` : "Set up an agent to ask it here"} onkeydown={keys} />
      <div class="foot">
        {#if terminal.connected}
          <div class="agent-wrap">
            <button type="button" class="agent" aria-haspopup="menu" aria-expanded={menu} aria-label="Agent: {terminal.view?.agent}" title={terminal.view?.agent} onclick={() => (menu = !menu)}>
              <i class="dot" class:at-work={busy} aria-hidden="true"></i><span class="nm">{name}</span>
              <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3.5l3 3 3-3" /></svg>
            </button>
            {#if menu}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div class="menu" role="menu" tabindex="-1" aria-label="Agent" bind:this={menuEl} onkeydown={menuKeys} out:flyOut>
                <p class="who">{terminal.view?.agent}</p>
                <button type="button" role="menuitem" onclick={() => act(() => void terminal.settings())}>Model and key…</button>
                <button type="button" role="menuitem" disabled={busy} onclick={() => act(() => { void terminal.fresh(terminal.view?.agentId ?? ""); terminal.shown = "session"; })}>New session</button>
                <button type="button" role="menuitem" onclick={() => act(() => { if (terminal.shown !== "past") void terminal.drawer(); })}>Sessions</button>
              </div>
            {/if}
          </div>
        {/if}
        <div class="reach" role="group" aria-label="What the agent may do">
          {#each reach as r (r.k)}
            <button type="button" class="sw" data-reach={r.k} aria-pressed={panes.on[r.k]} aria-label={r.says} title="{r.says}  {r.key}" onclick={() => panes.flip(r.k)}>{r.word}</button>
          {/each}
        </div>
        <span class="grow"></span>
        <AgentGauge />
        {#if text.trim() && !terminal.connected && !terminal.old}
          <button type="button" class="copy" aria-label={copied ? "Copied" : "Copy for your agent"} title={copied ? "Copied" : "Copy with pointers, for an agent in your terminal"} onclick={() => void copyForAgent()}>
            {#if copied}<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
            {:else}<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3" width="9" height="11" /><path d="M6 3V1.8h4V3M5.8 7h4.4M5.8 9.5h4.4" /></svg>{/if}
          </button>
        {/if}
        {#if terminal.connected || busy}
          <!-- One place for both: the send arrow and the stop square cross-fade in it, so the button never moves. -->
          <span class="corner-cell">
            {#if busy}
              <button class="corner stop" type="button" aria-label="Stop the agent" title="Stop  Esc" onclick={() => void terminal.stop()} transition:fade={{ duration: reduced() ? 0 : DUR_1 }}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="4" y="4" width="8" height="8" fill="currentColor" /></svg></button>
            {:else if terminal.sending}
              <span class="corner sending" role="status" aria-label="Sending"><span class="dot"></span></span>
            {:else}
              <!-- Always there, so the bar does not move as you start to type; ready once there is something to send. -->
              <button class="corner send" type="button" aria-label="Send" title="Send  ↵" disabled={!text.trim()} onclick={() => void send()} transition:fade={{ duration: reduced() ? 0 : DUR_1 }}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button>
            {/if}
          </span>
        {/if}
      </div>
    </div>
    {#if app.offline}<p class="offline" role="status"><span class="dot"></span>Reconnecting…</p>{/if}
    {#if problem}
      <p class="bad" role="alert">{#if noAgent}No agent yet. <button type="button" class="link" onclick={() => void terminal.settings()}>Set up</button>{:else}{problem}{/if}</p>
    {/if}
  </div>
</div>

<style>
  /* The session, the drawer and the context take each other's place by fading in (--dur-1), not between one frame and
     the next: the drawer's list, which fills a frame after it opens, is in by the time it is seen. */
  .apane > :global(:first-child) { animation: swap var(--dur-1) var(--ease-out); }
  @keyframes swap { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .apane > :global(:first-child) { animation: none; } }
  .apane { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .apane.drop { outline: 2px dashed var(--growth); outline-offset: -4px; }
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .composer { flex: none; padding: 8px 12px 12px; display: grid; gap: 6px; }
  .bad { margin: 0; color: var(--rose); font: var(--fs-small)/1.4 var(--font-ui); padding-left: 2px; overflow-wrap: anywhere; }
  .offline { margin: 0; display: flex; align-items: center; gap: 6px; font: var(--fs-small) var(--font-ui); color: var(--text-faint); }
  .offline .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rose); }
  .mid { margin: 0; padding-left: 2px; font: var(--fs-small)/1.4 var(--font-ui); color: var(--text-faint); }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .link:hover { color: var(--text); }
  /* One framed unit: what you write, and under it a footer with what it talks to, what it may do, and the button. */
  .box { display: flex; flex-direction: column; background: var(--surface-raised); border: 1px solid var(--line-faint); border-radius: calc(var(--round) + 1px); transition: border-color var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out); }
  .box:focus-within { border-color: color-mix(in srgb, var(--lattice) 55%, var(--line-strong)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--lattice) 12%, transparent); }
  /* While the agent works, its edge is gold and breathes, slowly: the box is still yours to write in. */
  .box.busy:not(:focus-within) { border-color: color-mix(in srgb, var(--growth) 45%, var(--line)); animation: working 2.4s ease-in-out infinite alternate; }
  @keyframes working { to { box-shadow: 0 0 16px color-mix(in srgb, var(--growth) calc(var(--glow-a) * .6), transparent); border-color: color-mix(in srgb, var(--growth) 70%, var(--line)); } }
  @media (prefers-reduced-motion: reduce) { .box.busy { animation: none; } }
  .foot { display: flex; align-items: center; gap: 6px; min-height: 36px; padding: 2px 4px 4px 6px; min-width: 0; }
  .grow { flex: 1 1 auto; }

  /* The agent: a dot (gold while it works) and its model, quiet; its menu floats over the session. */
  .agent-wrap { position: relative; flex: 0 1 auto; min-width: 0; }
  .agent { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 24px; padding: 0 6px; background: none; border: 0; border-radius: var(--round); color: var(--text-faint); font: var(--fs-small)/1 var(--font-ui); cursor: pointer; transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
  .agent:hover, .agent:focus-visible, .agent[aria-expanded="true"] { color: var(--text); background: var(--fill-hover); }
  .agent .nm { min-width: 0; max-width: 11em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agent svg { flex: none; opacity: .7; }
  .dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--malachite); }
  .dot.at-work { background: var(--growth); box-shadow: 0 0 6px var(--growth); }
  .menu { position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 20; min-width: 190px; padding: 4px; display: grid; background: var(--surface-float); border: 1px solid var(--line); border-radius: var(--round); box-shadow: var(--lift); animation: appear var(--dur-1) var(--ease-out); }
  .menu .who { margin: 0; padding: 6px 10px 6px; font: var(--fs-meta)/1.3 var(--font-ui); color: var(--text-faint); overflow-wrap: anywhere; }
  .menu button { text-align: left; height: var(--control); padding: 0 10px; background: none; border: 0; border-radius: var(--round); color: var(--text-soft); font: var(--fs-small) var(--font-ui); cursor: pointer; }
  .menu button:hover:not(:disabled), .menu button:focus-visible { background: var(--fill-hover); color: var(--text); outline: none; }
  .menu button:disabled { color: var(--text-mute); cursor: default; }

  /* What it may reach: three words, each a switch; on, its gold as a tint with a bar under it (as the shell's switches). */
  .reach { display: inline-flex; align-items: center; gap: 2px; flex: none; }
  .sw { --c: var(--growth); position: relative; height: 24px; padding: 0 7px; background: none; border: 0; border-radius: var(--round); color: var(--text-faint); font: var(--fs-meta)/1 var(--font-ui); letter-spacing: .02em; cursor: pointer; transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
  .sw::after { content: ""; position: absolute; left: 6px; right: 6px; bottom: 0; height: 2px; background: var(--c); transform: scaleX(0); transition: transform var(--dur-2) var(--ease-out); pointer-events: none; }
  .sw:hover { color: var(--text-soft); background: var(--fill-hover); }
  .sw[aria-pressed="true"] { background: color-mix(in srgb, var(--c) var(--tint), transparent); color: var(--c); clip-path: var(--chosen-cut); }
  .sw[aria-pressed="true"]::after { transform: scaleX(1); }

  .corner-cell { display: grid; flex: none; }
  .corner-cell > * { grid-area: 1 / 1; }
  .corner { flex: none; width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--growth); cursor: pointer; transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out), opacity var(--dur-1) var(--ease-out); }
  .corner.send:not(:disabled) { background: var(--growth); color: var(--ground-0); clip-path: var(--chosen-cut); }
  .corner.send:not(:disabled):hover { background: color-mix(in srgb, var(--growth) 85%, var(--text)); }
  .corner.send:disabled { color: var(--text-mute); cursor: default; }
  .corner.stop { color: var(--rose); background: color-mix(in srgb, var(--rose) var(--tint), transparent); clip-path: var(--chosen-cut); }
  .corner.stop:hover { background: var(--rose-soft); }
  .corner.sending .dot { background: var(--growth); animation: pulse 900ms ease-in-out infinite alternate; }
  @keyframes pulse { from { opacity: .3; } }
  .copy { flex: none; width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; border-radius: var(--round); }
  .copy:hover, .copy:focus-visible { color: var(--text); background: var(--fill-hover); }
  @media (max-width: 420px) { .agent .nm { max-width: 6.5em; } .sw { padding: 0 5px; } }
</style>
