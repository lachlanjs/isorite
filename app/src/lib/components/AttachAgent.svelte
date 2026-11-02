<script lang="ts">
  // Choosing the agent (M25; as cards since M27). Each agent isorite knows by name is a card, found on this machine or
  // not, with the two ways to use it: in this pane (isorite starts it for the base, asked only from here), or in its own
  // terminal (isorite's MCP in its config; and, to share the session live with the pane, run behind `isorite acp` in
  // an ACP front end). An agent of the ACP registry, or a command of your own, is under "another agent". Choosing is
  // from this machine only, since it runs a program. With `compact` it is the drawer's "change agent": no heading.
  import type { AgentChoice, ChosenAgent, KnownAgent, ProjectConfig, RegistryAgent, TerminalApi } from "$lib/api.ts";
  import { app } from "$lib/app.svelte.ts";
  import { baseHere } from "$lib/here.ts";
  import OwnFiles from "./OwnFiles.svelte";

  let { compact = false }: { compact?: boolean } = $props();
  const api = (app.api as { terminal?: TerminalApi } | undefined)?.terminal ?? null;
  const mcpUrl = new URL(baseHere() ? `b/${encodeURIComponent(baseHere())}/mcp` : "mcp", document.baseURI).href;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

  let problem = $state("");
  let chosen = $state.raw<ChosenAgent | null>(null);
  let known = $state.raw<KnownAgent[] | null>(null);
  let starting = $state("");
  /** The card whose terminal steps are open, and whether another agent's form is. */
  let terminalOf = $state("");
  let other = $state(false);
  let copied = $state("");

  $effect(() => {
    if (!api || !local) return;
    void api.chosen().then((c) => (chosen = c), () => undefined);
    void api.known().then((k) => (known = k), () => (known = []));
  });
  const same = (a: AgentChoice | null | undefined, b: AgentChoice): boolean => !!a && ("id" in a ? "id" in b && a.id === b.id : "command" in b && a.command === b.command);
  const on = (a: KnownAgent): boolean => same(chosen?.choice, a.choice) || same(chosen?.choice, { command: a.command });
  const nameOf = (c: AgentChoice | null | undefined): string => (!c ? "" : known?.find((a) => same(c, a.choice) || ("command" in c && c.command === a.command))?.name ?? ("command" in c ? c.command : c.id));
  const line = (a: KnownAgent): string => `isorite acp ${a.key}`;

  async function choose(choice: AgentChoice | null, key = ""): Promise<void> {
    problem = "";
    if (!api) return;
    starting = key || "none";
    try { chosen = await api.choose(choice); } catch (e) { problem = (e as Error).message; } finally { starting = ""; }
  }
  async function copy(text: string, key: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); copied = key; setTimeout(() => { if (copied === key) copied = ""; }, 1500); } catch { problem = "The browser would not copy: select the line and copy it."; }
  }

  /** Another agent: one of the ACP registry, or a command of your own. */
  let agents = $state.raw<RegistryAgent[] | null>(null);
  let pick = $state("");
  let command = $state("");
  async function lookAt(): Promise<void> {
    other = !other;
    if (!other || agents || !api) return;
    try { agents = (await api.registry()).filter((a) => a.how); } catch (e) { problem = (e as Error).message; agents = []; }
  }
  function attach(e: SubmitEvent): void {
    e.preventDefault();
    if (command.trim()) void choose({ command: command.trim() }, "other");
    else if (pick) void choose({ id: pick }, "other");
  }

  /** The project's MCP config, shown as isorite would write it, and written only when asked. */
  let proposal = $state.raw<ProjectConfig | null>(null);
  let written = $state<string[]>([]);
  let showConfig = $state(false);
  async function look(): Promise<void> {
    showConfig = !showConfig;
    if (!showConfig || proposal || !api) return;
    try { proposal = await api.project(); } catch (e) { problem = (e as Error).message; }
  }
  async function write(): Promise<void> {
    problem = "";
    if (!api) return;
    try {
      written = await api.writeProject();
      proposal = proposal && { ...proposal, files: proposal.files.map((f) => ({ ...f, current: true })) };
    } catch (e) { problem = (e as Error).message; }
  }
  const missing = $derived(proposal?.files.filter((f) => !f.current) ?? []);
</script>

{#if api}
  <section class="attach" class:compact aria-label="Choose your agent">
    {#if !compact}
      <h2 class="label">choose your agent</h2>
      <p class="soft">The agent you already use. In this pane its conversations show here, with the notes it reads lit on the Atlas. In its own terminal it has the same tools, and the pane isn't its conversation.</p>
    {/if}
    {#if local}
      {#if known === null}<p class="faint">Looking for agents on this machine…</p>{/if}
      <ul class="cards">
        {#each known ?? [] as a (a.key)}
          <li class="card frame" class:on={on(a)} class:absent={!a.found} data-lustre>
            <div class="head"><b>{a.name}</b><span class="state">{on(a) ? (chosen?.running ? "in this pane · running" : "in this pane") : a.found ? "found" : "not found"}</span></div>
            <div class="acts">
              {#if on(a)}
                <button type="button" class="more" disabled={!!starting} onclick={() => void choose(a.choice, a.key)}>start it again</button> · <button type="button" class="more" disabled={!!starting} onclick={() => void choose(null)}>stop</button>
              {:else}
                <button type="button" class="btn" disabled={!!starting || !a.found} title={a.found ? undefined : `${a.bin} isn't on this machine's PATH`} onclick={() => void choose(a.choice, a.key)}>{starting === a.key ? "starting…" : "use in this pane"}</button>
              {/if}
              <button type="button" class="more" aria-expanded={terminalOf === a.key} onclick={() => (terminalOf = terminalOf === a.key ? "" : a.key)}>in my terminal</button>
            </div>
            {#if terminalOf === a.key}
              <div class="steps">
                <p><b>1.</b> Give {a.name} isorite's tools. Add this MCP address to its config, or write the project's config:</p>
                <p class="line"><code>{mcpUrl}</code> <button type="button" class="more" onclick={() => void copy(mcpUrl, `${a.key}-mcp`)}>{copied === `${a.key}-mcp` ? "copied" : "copy"}</button></p>
                <p><b>2.</b> Then run {a.name} as you do. It reads and cites the notes, and the Atlas shows what it read. <span class="faint">The pane won't show that conversation.</span></p>
                <p><b>Live in both places?</b> Run it from an ACP front end such as Toad or Zed with this as its agent, and the same session shows here as it happens:</p>
                <p class="line"><code>{line(a)}</code> <button type="button" class="more" onclick={() => void copy(line(a), `${a.key}-acp`)}>{copied === `${a.key}-acp` ? "copied" : "copy"}</button></p>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="more-row">
        <button type="button" class="more" aria-expanded={other} onclick={() => void lookAt()}>another agent</button> ·
        <button type="button" class="more" aria-expanded={showConfig} onclick={() => void look()}>the project's config</button>
        {#if chosen?.choice && !known?.some(on)} · <span class="faint">in this pane: <span class="chosen">{nameOf(chosen.choice)}</span> <button type="button" class="more" onclick={() => void choose(null)}>stop</button></span>{/if}
      </p>
      {#if chosen?.problem}<p class="bad" role="alert">{chosen.problem}{chosen.said ? `: ${chosen.said.trim().split("\n").at(-1)}` : ""}</p>{/if}
      {#if other}
        <form class="pick" onsubmit={attach}>
          {#if agents === null}<p class="faint">Reading the ACP registry…</p>
          {:else if agents.length}
            <label class="hidden-label" for="agent-pick">An agent of the ACP registry</label>
            <select id="agent-pick" class="field" bind:value={pick} onchange={() => (command = "")}>
              <option value="">An agent of the ACP registry…</option>
              {#each agents as a (a.id)}<option value={a.id} title={a.description}>{a.name} {a.version}</option>{/each}
            </select>
          {/if}
          <label class="hidden-label" for="agent-command">Or the command of an ACP agent</label>
          <input id="agent-command" class="field" bind:value={command} oninput={() => (pick = "")} placeholder="or its command: hermes acp" autocomplete="off" spellcheck="false" />
          <p class="faint">It runs on this machine, in the base's repository, with the server's environment: its key and model are set up as for its own terminal.</p>
          <p><button type="submit" class="btn" disabled={!!starting || (!pick && !command.trim())}>{starting === "other" ? "starting…" : "use in this pane"}</button></p>
        </form>
      {/if}
      {#if showConfig && proposal}
        {#each proposal.files as f (f.file)}
          <p class="faint">{f.file} ({f.harness}){f.current ? ": has it" : ""}</p>
          {#if !f.current}<pre>{f.after}</pre>{/if}
        {/each}
        {#if missing.length}<p><button type="button" class="btn" onclick={() => void write()}>write {missing.map((f) => f.file).join(" and ")}</button></p>{/if}
        {#if written.length}<p class="faint">Written: {written.join(", ")}. Commit them with the project.</p>{/if}
      {/if}
      {#if !compact}<OwnFiles />{/if}
      {#if !compact}<p class="faint">With no agent, the notes, the Atlas and search by meaning work as they are. Nothing to set up.</p>{/if}
    {:else}
      <p class="faint">An agent is chosen from the machine isorite runs on. In the agent's own terminal, give it isorite's MCP: <code>{mcpUrl}</code>.</p>
    {/if}
    {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  </section>
{/if}

<style>
  .attach { margin: auto 0 0; padding: 12px 0 0; border-top: 1px dashed var(--line); display: grid; gap: 10px; font-size: 12.5px; color: var(--text-soft); }
  .attach.compact { margin: 0; padding: 0; border: 0; }
  .label { font-weight: 400; }
  p { margin: 0; }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .card { --cut: 8px; --inside: var(--ground-1); --edge: var(--line); padding: 12px; display: grid; gap: 8px; align-content: start; }
  .card.on { --edge: var(--lattice); }
  .card.absent { opacity: .7; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .state { font: 11px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); text-align: right; }
  .card.on .state { color: var(--growth); }
  .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .steps { display: grid; gap: 6px; padding-top: 6px; border-top: 1px dashed var(--line); }
  .line { display: flex; gap: 8px; align-items: baseline; }
  .more-row { display: flex; flex-wrap: wrap; gap: 4px; }
  b { font-weight: 500; color: var(--text); }
  .chosen { font: 11.5px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  code { font: 11.5px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  pre { margin: 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); overflow: auto; max-height: 200px; }
  .pick { display: grid; gap: 6px; }
  .pick .field { width: 100%; min-width: 0; }
  .more { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .more:disabled { opacity: .5; cursor: default; }
  .btn:disabled { opacity: .5; cursor: default; }
  .bad { display: block; color: var(--rose); overflow-wrap: anywhere; }
</style>
