<script lang="ts">
  // The base this page is for, before the first pane's name (M20), as the board's header path begins with it
  // (Header-Context: `dmft / …`). Pressed, the bases the server holds: each a link to its own page (a new tab with
  // Ctrl or the middle button), the one here ticked, and a switch for whether it is lent to every session's agent and
  // Iso. Only where the server holds bases: not on the guide's site.
  import { app } from "$lib/app.svelte.ts";
  import type { BaseRow, BasesApi } from "$lib/api.ts";
  import { basePage } from "$lib/here.ts";

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
  async function toggle(): Promise<void> {
    open = !open;
    if (open && button) { const r = button.getBoundingClientRect(); at = { top: r.bottom + 14, left: Math.max(8, r.left - 8) }; }
    if (open) { await load(); menu?.querySelector<HTMLElement>("a")?.focus(); }
  }
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
  <button class="base" type="button" bind:this={button} aria-expanded={open} aria-haspopup="true" title="The knowledge bases: switch to another" onclick={toggle}>{app.session.name}</button>
  <span class="slash" aria-hidden="true">/</span>
  {#if open}
    <div class="frame bases" role="dialog" aria-label="Knowledge bases" tabindex="-1" bind:this={menu} style:top="{at.top}px" style:left="{at.left}px">
      <span class="frame-title">bases</span>
      <ul>
        {#each rows as row (row.name)}
          {@const isHere = row.name === (here || app.session.name)}
          <li class:here={isHere}>
            <i class="tick" aria-hidden="true">{isHere ? "✓" : ""}</i>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
            <a href={basePage(row.name)} data-sveltekit-reload title={row.path} aria-current={isHere ? "page" : undefined}>{row.name}</a>
            <button class="lend" type="button" aria-pressed={row.lend} disabled={!local}
              aria-label="Lent to every session"
              title={local ? (row.lend ? "Lent to every session's agent and Iso: press to keep it to itself" : "Lend it to every session's agent and Iso, as the agent's memory is") : "Lent or not is changed only from this machine"}
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
  .base { font: inherit; font-size: 12px; color: var(--text-faint); background: none; border: 0; padding: 4px 0; cursor: pointer; max-width: 12em; overflow: hidden; text-overflow: ellipsis; }
  .base:hover, .base:focus-visible, .base[aria-expanded="true"] { color: var(--text); }
  .slash { color: var(--text-faint); font-size: 12px; margin: 0 -4px; }
  .bases { --inside: var(--ground-2); position: fixed; z-index: 22; width: min(320px, calc(100vw - 16px)); padding: 22px 12px 12px; white-space: nowrap; user-select: none; }
  .bases:focus-visible { outline: none; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  li { display: grid; grid-template-columns: 16px 1fr 28px; align-items: center; gap: 6px; font-size: 13px; }
  .tick { font-style: normal; color: var(--lattice); font-size: 12px; text-align: center; }
  a { color: var(--text-soft); text-decoration: none; padding: 5px 0; overflow: hidden; text-overflow: ellipsis; }
  a:hover, a:focus-visible { color: var(--text); text-decoration: underline; }
  li.here a { color: var(--text); }
  .lend { position: relative; width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .lend:hover:not(:disabled), .lend:focus-visible { color: var(--text); }
  .lend[aria-pressed="true"] { --c: var(--growth); background: var(--c, var(--lattice)); color: var(--ground-0); --cut: 4px; clip-path: var(--chosen-cut); }
  .lend:disabled { cursor: default; }
  .bad { color: var(--rose); font-size: 12px; margin: 8px 0 0; white-space: normal; }
</style>
