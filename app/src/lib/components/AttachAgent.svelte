<script lang="ts">
  // With no agent attached (M25): how to attach yours to this base, in the three ways in. Here, in this pane: an agent
  // of the ACP registry, or a command of your own, started by the server for the pane alone (chosen from this
  // machine only, since it runs a program). The project's MCP config is shown as isorite would write it, and written
  // only when asked, from this machine.
  import type { AgentChoice, ChosenAgent, ProjectConfig, RegistryAgent, TerminalApi } from "$lib/api.ts";
  import { app } from "$lib/app.svelte.ts";
  import { baseHere } from "$lib/here.ts";

  const api = (app.api as { terminal?: TerminalApi } | undefined)?.terminal ?? null;
  let proposal = $state.raw<ProjectConfig | null>(null);
  let problem = $state("");
  let written = $state<string[]>([]);
  let open = $state(false);
  const mcpUrl = new URL(baseHere() ? `b/${encodeURIComponent(baseHere())}/mcp` : "mcp", document.baseURI).href;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

  /** The agent chosen for the pane, and the registry's, once looked at. */
  let chosen = $state.raw<ChosenAgent | null>(null);
  let agents = $state.raw<RegistryAgent[] | null>(null);
  let picking = $state(false);
  let pick = $state("");
  let command = $state("");
  let starting = $state(false);
  $effect(() => { if (api && local) void api.chosen().then((c) => (chosen = c), () => undefined); });
  const nameOf = (c: AgentChoice | null | undefined): string => (!c ? "" : "command" in c ? c.command : agents?.find((a) => a.id === c.id)?.name ?? c.id);

  async function lookAt(): Promise<void> {
    picking = !picking;
    if (!picking || agents || !api) return;
    try { agents = (await api.registry()).filter((a) => a.how); } catch (e) { problem = (e as Error).message; agents = []; }
  }
  async function choose(choice: AgentChoice | null): Promise<void> {
    problem = "";
    if (!api) return;
    starting = true;
    try { chosen = await api.choose(choice); if (choice) picking = false; } catch (e) { problem = (e as Error).message; } finally { starting = false; }
  }
  function attach(e: SubmitEvent): void {
    e.preventDefault();
    if (command.trim()) void choose({ command: command.trim() });
    else if (pick) void choose({ id: pick });
  }

  async function look(): Promise<void> {
    open = !open;
    if (!open || proposal || !api) return;
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
  <section class="attach" aria-label="Attach your agent">
    <h2 class="label">your own agent</h2>
    <p class="soft">Attach the agent you already use, and its conversations show here, with the notes it reads lit on the Atlas.</p>
    <ul>
      {#if local}
        <li><b>Here, in this pane</b>: {#if chosen?.choice}<span class="chosen">{nameOf(chosen.choice)}</span>, {chosen.running ? "started for this base" : "not running"}. <button type="button" class="more" disabled={starting} onclick={() => void choose(chosen?.choice ?? null)}>start it again</button> · <button type="button" class="more" disabled={starting} onclick={() => void choose(null)}>none</button>{:else}an agent isorite starts for this base, asked only from here.{/if}
          <button type="button" class="more" aria-expanded={picking} onclick={() => void lookAt()}>{chosen?.choice ? "another" : "choose one"}</button>
          {#if chosen?.problem}<span class="bad" role="alert">{chosen.problem}{chosen.said ? `: ${chosen.said.trim().split("\n").at(-1)}` : ""}</span>{/if}</li>
      {/if}
      <li><b>From an ACP front end</b> (Toad, Zed): run it with <code>isorite acp --agent "opencode acp"</code> as its agent (or <code>omp acp</code>, or any ACP agent's command). Asked there or here.</li>
      <li><b>In its own terminal</b>: give it isorite's MCP, <code>{mcpUrl}</code>, or <code>isorite mcp</code> in the project's config.
        {#if local}<button type="button" class="more" aria-expanded={open} onclick={() => void look()}>the project's config</button>{/if}</li>
    </ul>
    {#if picking}
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
        <p><button type="submit" class="btn" disabled={starting || (!pick && !command.trim())}>{starting ? "starting…" : "attach it"}</button></p>
      </form>
    {/if}
    {#if open && proposal}
      {#each proposal.files as f (f.file)}
        <p class="faint">{f.file} ({f.harness}){f.current ? ": has it" : ""}</p>
        {#if !f.current}<pre>{f.after}</pre>{/if}
      {/each}
      {#if missing.length}<p><button type="button" class="btn" onclick={() => void write()}>write {missing.map((f) => f.file).join(" and ")}</button></p>{/if}
      {#if written.length}<p class="faint">Written: {written.join(", ")}. Commit them with the project.</p>{/if}
    {/if}
    {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  </section>
{/if}

<style>
  .attach { margin: auto 0 0; padding: 12px 0 0; border-top: 1px dashed var(--line); display: grid; gap: 8px; font-size: 12.5px; color: var(--text-soft); }
  .label { font-weight: 400; }
  ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
  b { font-weight: 500; color: var(--text); }
  .chosen { font: 11.5px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  code { font: 11.5px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  pre { margin: 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); overflow: auto; max-height: 200px; }
  .pick { display: grid; gap: 6px; }
  .pick p { margin: 0; }
  .pick .field { width: 100%; min-width: 0; }
  .more { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .more:disabled { opacity: .5; cursor: default; }
  .bad { display: block; color: var(--rose); overflow-wrap: anywhere; }
</style>
