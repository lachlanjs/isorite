<script lang="ts">
  // The base this page is for, before the first pane's name (M20), as the board's header path begins with it
  // (Header-Context: `dmft / …`). Pressed, the bases the server holds: each a link to its own page (a new tab with
  // Ctrl or the middle button), the one here ticked, and a switch for whether it is lent to every session's agent and
  // The agent. Only where the server holds bases: not on the guide's site.
  import { app } from "$lib/app.svelte.ts";
  import type { BaseRow, BasesApi } from "$lib/api.ts";
  import { basePage } from "$lib/here.ts";
  import { flyOut } from "$lib/motion.ts";

  const api = (app.api as { bases?: BasesApi } | undefined)?.bases ?? null;
  let open = $state(false);
  let rows = $state.raw<BaseRow[]>([]);
  let here = $state("");
  let local = $state(false);
  let failed = $state("");
  let menu = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  // Placed under the button, over the pane: the header clips what it holds.
  let at = $state({ top: 0, left: 0 });

  async function load(): Promise<void> {
    if (!api) return;
    try { ({ bases: rows, here, local } = await api.list()); failed = ""; } catch (e) { failed = (e as Error).message; }
  }
  void load();
  async function toggle(): Promise<void> {
    open = !open;
    if (open && button) { const r = button.getBoundingClientRect(); at = { top: r.bottom + 14, left: Math.max(8, r.left - 8) }; }
    if (open) { await load(); menu?.querySelector<HTMLElement>("a")?.focus(); }
  }
  let renaming = $state("");
  let draft = $state("");
  async function retitle(row: BaseRow): Promise<void> {
    const name = row.name;
    renaming = "";
    try { rows = await api!.title(name, draft); failed = ""; } catch (e) { failed = (e as Error).message; }
  }
  const shownAs = $derived(rows.find((r) => r.name === (here || app.session?.name))?.title || app.session?.name || "");
  async function lend(row: BaseRow): Promise<void> {
    try { rows = await api!.lend(row.name, !row.lend); failed = ""; } catch (e) { failed = (e as Error).message; }
  }
  function outside(e: PointerEvent): void {
    if (open && e.target instanceof Node && !menu?.contains(e.target) && !button?.contains(e.target)) open = false;
  }
  function keys(e: KeyboardEvent): void {
    if (open && e.key === "Escape") { open = false; button?.focus(); }
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={keys} />

{#if api && app.session}
  <button class="base" type="button" bind:this={button} aria-expanded={open} aria-haspopup="true" title="Switch base" onclick={toggle}>{shownAs}</button>
  <span class="slash" aria-hidden="true">/</span>
  {#if open}
    <div class="frame bases" out:flyOut role="dialog" aria-label="Knowledge bases" tabindex="-1" bind:this={menu} style:top="{at.top}px" style:left="{at.left}px">
      <span class="frame-title">bases</span>
      <ul>
        {#each rows as row (row.name)}
          {@const isHere = row.name === (here || app.session.name)}
          <li class:here={isHere}>
            <i class="tick" aria-hidden="true">{isHere ? "✓" : ""}</i>
            {#if renaming === row.name}
              <input class="field name" aria-label="A title for {row.name}" bind:value={draft} placeholder={row.name} maxlength="60" onkeydown={(e) => { if (e.key === "Enter") void retitle(row); else if (e.key === "Escape") { e.stopPropagation(); renaming = ""; } }} />
            {:else}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
              <a href={basePage(row.name)} data-sveltekit-reload title={row.title === row.name ? row.path : `${row.name}: ${row.path}`} aria-current={isHere ? "page" : undefined}>{row.title}</a>
            {/if}
            <button class="lend rename" type="button" disabled={!local} aria-label="Rename {row.title}" title={local ? "Rename (its address stays)" : "Renamed only from this machine"} onclick={() => { if (renaming === row.name) void retitle(row); else { draft = row.title === row.name ? "" : row.title; renaming = row.name; } }}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 13l.6-2.8L11 2.8l2.2 2.2-7.4 7.4z" /></svg>
            </button>
            <button class="lend" type="button" aria-pressed={row.lend} disabled={!local}
              aria-label="Lent to every session"
              title={local ? (row.lend ? "Lent to every session" : "Lend to every session") : "Changed only from this machine"}
              onclick={() => lend(row)}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2.5" y="5.5" width="7" height="8" /><path d="M6.5 5.5V2.5h7v8h-4" /></svg>
            </button>
          </li>
        {/each}
      </ul>
      {#if failed}<p class="bad" role="alert">{failed}</p>{/if}
    </div>
  {/if}
{/if}

<style>
  .base { font: inherit; font-size: 0.75rem; color: var(--text-faint); background: none; border: 0; padding: 4px 0; cursor: pointer; max-width: 12em; overflow: hidden; text-overflow: ellipsis; }
  .base:hover, .base:focus-visible, .base[aria-expanded="true"] { color: var(--text); }
  .slash { color: var(--text-faint); font-size: 0.75rem; margin: 0 -4px; }
  .bases { --inside: var(--ground-2); filter: var(--lift-drop); animation: appear var(--dur-1) var(--ease-out); position: fixed; z-index: 22; width: min(320px, calc(100vw - 16px)); padding: 22px 12px 12px; white-space: nowrap; user-select: none; }
  .bases:focus-visible { outline: none; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  li { display: grid; grid-template-columns: 16px 1fr 28px 28px; align-items: center; gap: 6px; font-size: 0.8125rem; }
  .tick { font-style: normal; color: var(--lattice); font-size: 0.75rem; text-align: center; }
  a { color: var(--text-soft); text-decoration: none; padding: 5px 0; overflow: hidden; text-overflow: ellipsis; }
  a:hover, a:focus-visible { color: var(--text); text-decoration: underline; }
  li.here a { color: var(--text); }
  .lend { position: relative; width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .lend:hover:not(:disabled), .lend:focus-visible { color: var(--text); }
  .lend { clip-path: var(--chosen-cut); transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
  .lend[aria-pressed="true"] { background: color-mix(in srgb, var(--growth) var(--tint), transparent); color: var(--growth); box-shadow: inset 0 -2px 0 var(--growth); }
  .lend:disabled { cursor: default; }
  .field.name { min-width: 0; font-size: 0.8125rem; padding: 3px 6px; }
  .bad { color: var(--rose); font-size: 0.75rem; margin: 8px 0 0; white-space: normal; }
</style>
