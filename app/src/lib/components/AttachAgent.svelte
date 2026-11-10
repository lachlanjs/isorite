<script lang="ts">
  // First run of the Agent pane, shown while no agent is set up: one action, isorite's own agent (a provider and a key,
  // or your company's gateway: set in the pane's settings, from this machine only), and one quiet line saying an agent
  // of your own connects over MCP, with the command to copy.
  import { terminal } from "$lib/terminal.svelte.ts";
  import Crystal from "./Crystal.svelte";
  import OwnFiles from "./OwnFiles.svelte";

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const SETUP = "isorite setup";
  let copied = $state(false);
  let problem = $state("");

  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(SETUP); copied = true; setTimeout(() => { copied = false; }, 1500); } catch { problem = "The browser would not copy: select the line and copy it."; }
  }
</script>

<section class="attach" aria-label="Set up an agent">
  {#if local}
    <div class="own">
      <Crystal id="isorite" size={44} />
      <p class="lead">Ask about your notes</p>
      <p class="soft">isorite's agent: any model, with an API key or your gateway.</p>
      <button type="button" class="btn primary" data-testid="own-agent" onclick={() => void terminal.settings()}>Use isorite's agent</button>
    </div>
  {/if}
  <p class="quiet">Your own agent (Claude Code, Codex, OpenCode) connects over MCP: <code>{SETUP}</code>{#if local}<button type="button" class="copy" aria-label={copied ? "Copied" : "Copy the command"} title={copied ? "Copied" : "Copy"} onclick={() => void copy()}>{#if copied}<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>{:else}<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5" y="5" width="8" height="8.5" /><path d="M3 10.5V3h7.5" /></svg>{/if}</button>{/if}</p>
  {#if local}<OwnFiles />{/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  .attach { margin: auto 0 0; display: grid; gap: 18px; font: var(--fs-small)/1.5 var(--font-ui); color: var(--text-soft); }
  p { margin: 0; }
  .own { display: grid; justify-items: center; gap: 8px; padding: 24px 0 8px; text-align: center; color: var(--growth); }
  .own .lead { margin-top: 6px; font: var(--fw-medium) var(--fs-lead)/1.3 var(--font-ui); color: var(--text); }
  .own .soft { color: var(--text-soft); max-width: 30ch; }
  .own .btn { margin-top: 8px; }
  .quiet { color: var(--text-faint); text-align: center; }
  code { font: var(--fs-meta) var(--font-mono); color: var(--text-soft); padding: 1px 5px; background: var(--fill-hover); border-radius: var(--round); white-space: nowrap; }
  .copy { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-left: 2px; vertical-align: middle; background: none; border: 0; border-radius: var(--round); color: var(--text-faint); cursor: pointer; }
  .copy:hover, .copy:focus-visible { color: var(--text); background: var(--fill-hover); }
  .bad { color: var(--rose); overflow-wrap: anywhere; }
</style>
