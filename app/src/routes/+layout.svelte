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
      <span class="grow"></span>
      <span>{app.listing.notes.length} {app.listing.notes.length === 1 ? "note" : "notes"}</span>
    {/if}
  </footer>
</div>

<style>
  .stopped { padding: var(--space-12) var(--space-4); text-align: center; color: var(--rose); }
</style>
