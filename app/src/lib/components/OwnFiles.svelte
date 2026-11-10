<script lang="ts">
  // Where isorite's own files (.isorite/) are kept (M27). In a project shared with people who may not use isorite,
  // they can stay with the project, or be kept apart in a repository of their own. isorite asks once, for this
  // machine, and gives the commands to copy and run: it runs no git itself.
  import type { OwnRepoInfo } from "$lib/api.ts";
  import { app } from "$lib/app.svelte.ts";

  type OwnApi = { repo(): Promise<OwnRepoInfo | null>; choose(choice: "project" | "separate"): Promise<OwnRepoInfo> };
  const api = (app.api as { own?: OwnApi } | undefined)?.own ?? null;
  let info = $state.raw<OwnRepoInfo | null>(null);
  let copied = $state(false);
  let problem = $state("");
  $effect(() => { if (api) void api.repo().then((i) => (info = i), () => undefined); });
  const text = $derived(info?.commands.join("\n") ?? "");
  /** Whether the commands to keep them apart are what to show: asked and answered "apart", or looked at. */
  let looking = $state(false);
  const apart = $derived(info?.choice === "separate" || looking);
  async function choose(choice: "project" | "separate"): Promise<void> {
    problem = "";
    try { info = (await api?.choose(choice)) ?? info; } catch (e) { problem = (e as Error).message; }
  }
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { problem = "The browser would not copy: select the lines and copy them."; }
  }
</script>

{#if info && info.state !== "none"}
  <details class="own" open={info.ask}>
    <summary class="label">where isorite's files are kept</summary>
    <div class="body">
      {#if info.state === "own"}
        <p>In a repository of their own, <code>{info.path}</code>. {info.remotes.length ? `Remote: ${info.remotes.join(", ")}. To push:` : "To keep them elsewhere, add a remote and push:"}</p>
        <pre>{text}</pre>
        <p><button type="button" class="more" onclick={() => void copy()}>{copied ? "copied" : "copy"}</button> <span class="faint">isorite runs none of this itself.</span></p>
      {:else if info.state === "unavailable"}
        <p>Git didn't answer: {info.problem}. isorite's files are plain files in <code>{info.path}</code>.</p>
      {:else}
        <p>
          {#if info.state === "tracked"}The project's repository tracks them, so everyone sharing the project has your journals and kept sessions.
          {:else}They are in the project's folder, to be committed with it.{/if}
          {#if info.ask} Keep them with the project, or apart from it, in a repository of their own?{/if}
        </p>
        {#if info.ask}
          <p class="choices"><button type="button" class="btn" onclick={() => void choose("project")}>with the project</button> <button type="button" class="btn" onclick={() => void choose("separate")}>apart</button></p>
        {:else if info.choice === "project" && !looking}
          <p class="faint">Kept with the project. <button type="button" class="more" onclick={() => (looking = true)}>show how to keep them apart</button></p>
        {/if}
        {#if apart}
          <p>To keep them apart, run these in a terminal (isorite runs none of it):</p>
          <pre>{text}</pre>
          <p><button type="button" class="more" onclick={() => void copy()}>{copied ? "copied" : "copy"}</button></p>
        {/if}
      {/if}
      {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
    </div>
  </details>
{/if}

<style>
  .own { grid-column: 1 / -1; padding-top: 10px; border-top: 1px solid var(--line-faint); font-size: 0.7812rem; color: var(--text-soft); }
  .own summary { cursor: pointer; margin-bottom: 8px; }
  .body { display: grid; gap: 8px; }
  p { margin: 0; }
  .choices { display: flex; gap: 8px; flex-wrap: wrap; }
  code { font: 0.7188rem var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  pre { margin: 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 0.7188rem/1.45 var(--font-mono); overflow: auto; max-height: 200px; }
  .more { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .bad { color: var(--rose); }
</style>
