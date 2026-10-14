<script lang="ts">
  import { resolve } from "$app/paths";
  // The shell: the header (the name, where you are, the atlas / notes / study switch), the page, and the
  // status line.
  import "../app.css";
  import "katex/dist/katex.min.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { app } from "$lib/app.svelte.ts";
  import ContextCount from "$lib/components/ContextCount.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import Menu from "$lib/components/Menu.svelte";

  let { children }: { children: Snippet } = $props();
  let menu = $state(false);

  const VIEWS = [["atlas", resolve("/atlas")], ["notes", resolve("/notes")], ["study", resolve("/study")]] as const;
  // A note belongs to notes; the parts page to nothing.
  const view = $derived(page.route.id === "/atlas" ? "atlas" : page.route.id === "/study" ? "study" : page.route.id === "/parts" ? "" : "notes");
  const inNote = $derived(page.route.id === "/n/[...id]" || page.route.id === "/draft/[id]");
  // Iso's request as the map shows it: running, or how it ended until the map lets it go.
  const run = $derived(app.atlas && !app.atlas.pick ? app.iso : null);
  const running = $derived(run?.state === "reading" || run?.state === "writing");
  const runTitle = $derived(run ? (app.listing.notes.find((n) => n.id === run.note)?.title ?? "your note") : "");
  const stop = (): void => { if (run) void app.api.stop(run.request); };
</script>

<svelte:head><title>{inNote && app.here ? `${app.here} · isorite` : "isorite"}</title></svelte:head>

<div class="shell">
  <header class="bar">
    <button class="home" class:in-note={inNote} type="button" aria-label="isorite: settings" aria-haspopup="dialog" aria-expanded={menu} onclick={() => (menu = !menu)}><Logo /></button>
    {#if inNote && app.session}<a class="back" href={resolve("/notes")}>‹ {app.session.name}</a>{/if}
    <span class="path" class:in-note={inNote}>
      {#if app.session}
        <a href={resolve("/notes")}>{app.session.name}</a>{#if inNote && app.here}<span class="faint sep">/</span>{app.here}{/if}
      {/if}
    </span>
    <span class="grow"></span>
    {#if app.atlas?.here}<span class="where soft">{app.atlas.here}</span><button class="btn out" type="button" onclick={app.atlas.out}>↑ out</button>{/if}
    {#if running}<button class="btn stop" type="button" onclick={stop}>stop</button>{/if}
    {#if !app.error}<ContextCount />{/if}
    <nav class="switch" aria-label="Views">
      {#each VIEWS as [name, href] (name)}
        <a {href} aria-current={view === name ? "page" : undefined}><span>{name}</span></a>
      {/each}
    </nav>
  </header>

  {#if menu}<Menu close={() => (menu = false)} />{/if}

  <main class="page">
    {#if app.error}
      <p class="stopped">isorite could not open the base: {app.error}</p>
    {:else}
      {@render children()}
    {/if}
  </main>

  <footer class="status">
    {#if app.session}
      <span>{app.session.study ? "study" : "project: no journal is kept"}</span>
      {#if inNote && app.saving}<span class:bad={app.saving.bad} role="status">{app.saving.text}</span>{/if}
      {#if run && (running || !app.atlas?.chosen)}
        <span class="grow"></span>
        {#if running}
          <span class="hint">{run.note.startsWith("@draft/") ? "your note opens when Iso is done" : `Iso is answering in ${runTitle}`}</span>
          <button class="link" type="button" onclick={stop}>[ stop ]</button>
        {:else}
          <span class="hint" class:bad={run.state === "failed"}>{run.state === "done" ? `Iso is done in ${runTitle}` : run.state === "stopped" ? "Iso was stopped" : `Iso could not answer: ${run.message}`} · click open ground to let its path go</span>
        {/if}
      {:else if app.atlas?.pick}
        <span class="grow"></span>
        <span class="hint">click a note to link it, again to take it away</span>
      {:else if app.atlas?.chosen}
        {#if app.atlas.steps}<span>{app.atlas.steps} {app.atlas.steps === 1 ? "step" : "steps"} back</span>{/if}
        <span class="grow"></span>
        <span class="hint">click a note it requires to step back to it, the note again to open it</span>
        <button class="link" type="button" aria-pressed={app.atlas.chain} onclick={app.atlas.whole}>{app.atlas.chain ? "[ one step ]" : "[ whole chain ]"}</button>
      {:else if app.atlas}
        <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
        {#if app.atlas.items}<span>{app.atlas.items} study {app.atlas.items === 1 ? "item" : "items"}</span>{/if}
        <span class="grow"></span>
        <span class="hint">click a note to see what it rests on · hold on open ground to start a note for Iso, on a note to start from it</span>
      {:else}
        <span class="grow"></span>
        <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
      {/if}
    {/if}
  </footer>
</div>

<style>
  .hint { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; font-size: 12px; flex: none; }
  .bar .out, .bar .stop { height: 28px; padding: 0 10px; font-size: 12px; }
  .bar .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* Out of a folder, and stopping Iso from the header, are the phone's (Mobile-Atlas, Mobile-Think): on a desktop
     a click on open ground steps out, and the status line has [ stop ]. */
  @media (min-width: 601px) { .bar .out, .bar .where, .bar .stop { display: none; } }
  .bad { color: var(--rose); }
  .stopped { padding: var(--space-12) var(--space-4); text-align: center; color: var(--rose); }
</style>
