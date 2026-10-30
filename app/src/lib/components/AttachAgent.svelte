<script lang="ts">
  // With no agent attached (M25): how to attach yours to this base, in the three ways in. The project's MCP config is
  // shown as isorite would write it, and written only when asked, from this machine.
  import type { ProjectConfig, TerminalApi } from "$lib/api.ts";
  import { app } from "$lib/app.svelte.ts";
  import { baseHere } from "$lib/here.ts";

  const api = (app.api as { terminal?: TerminalApi } | undefined)?.terminal ?? null;
  let proposal = $state.raw<ProjectConfig | null>(null);
  let problem = $state("");
  let written = $state<string[]>([]);
  let open = $state(false);
  const mcpUrl = new URL(baseHere() ? `b/${encodeURIComponent(baseHere())}/mcp` : "mcp", document.baseURI).href;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

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
      <li><b>From an ACP front end</b> (Toad, Zed): run it with <code>isorite acp --agent "opencode acp"</code> as its agent (or <code>omp acp</code>, or any ACP agent's command). Asked there or here.</li>
      <li><b>In its own terminal</b>: give it isorite's MCP, <code>{mcpUrl}</code>, or <code>isorite mcp</code> in the project's config.
        {#if local}<button type="button" class="more" aria-expanded={open} onclick={() => void look()}>the project's config</button>{/if}</li>
    </ul>
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
  code { font: 11.5px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  pre { margin: 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); overflow: auto; max-height: 200px; }
  .more { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .bad { color: var(--rose); }
</style>
