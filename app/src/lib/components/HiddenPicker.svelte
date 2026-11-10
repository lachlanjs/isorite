<script lang="ts">
  // What is hidden, found by typing: the notes and folders kept off the Atlas and the list, narrowed as words are typed
  // (by title, path and description; and, for notes, by what search finds in them). Choose one (Enter, or a click) and
  // it is shown again. The Atlas offers it from a hold on open ground; it is a finder in its own right, so a quick
  // jump to any note can be made of it later.
  import { onMount } from "svelte";
  import { app } from "$lib/app.svelte.ts";

  let { x, y, w, h, onclose, onshow }: { x: number; y: number; w: number; h: number; onclose: () => void; onshow?: (id: string) => void } = $props();

  type Row = { id: string; title: string; folder: boolean; note?: string };
  let query = $state("");
  let more = $state.raw<string[]>([]);
  let at = $state(0);
  let input: HTMLInputElement | undefined;

  const all = $derived.by((): Row[] => {
    const notes = app.listing.notes.filter((n) => app.isHidden(n.id)).map((n): Row => ({ id: n.id, title: n.title, folder: false, note: n.description }));
    // A hidden folder is listed once, as itself; what is in it is shown with it.
    const dirs = app.hidden.filter((id) => app.listing.dirs.includes(id) || app.listing.notes.some((n) => n.dir === id || n.dir.startsWith(`${id}/`))).map((id): Row => ({ id, title: id.split("/").at(-1)!, folder: true, note: id }));
    return [...dirs, ...notes.filter((n) => !app.hidden.some((d) => n.id.startsWith(`${d}/`)))];
  });
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const rows = $derived.by((): Row[] => {
    if (!words.length) return all.slice(0, 40);
    const direct = all.filter((r) => words.every((q) => `${r.title}\n${r.id}\n${r.note ?? ""}`.toLowerCase().includes(q)));
    const found = all.filter((r) => !r.folder && more.includes(r.id) && !direct.includes(r));
    return [...direct, ...found].slice(0, 40);
  });
  $effect(() => { void rows.length; if (at >= rows.length) at = Math.max(0, rows.length - 1); });
  $effect(() => {
    const q = query.trim();
    if (q.length < 2) { more = []; return; }
    const timer = setTimeout(() => { void app.api.search(q).then((found) => { if (query.trim() === q) more = found.map((f) => f.id); }, () => undefined); }, 200);
    return () => clearTimeout(timer);
  });
  async function show(r: Row): Promise<void> {
    try { await app.unhide(r.id); onshow?.(r.id); } catch { /* the list is put back */ }
    if (!app.hidden.length) onclose();
  }
  function key(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onclose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(rows.length - 1, at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); }
    else if (e.key === "Enter" && rows[at]) { e.preventDefault(); void show(rows[at]!); }
  }
  onMount(() => { input?.focus(); });
  const left = $derived(Math.min(Math.max(x - 130, 8), Math.max(8, w - 268))), top = $derived(Math.min(Math.max(y - 20, 8), Math.max(8, h - 300)));
</script>

<svelte:window onpointerdown={(e) => { if (!(e.target instanceof Element && e.target.closest(".hidden-picker"))) onclose(); }} />

<div class="hidden-picker frame" role="dialog" aria-label="Hidden notes and folders" style="left:{left}px;top:{top}px" onkeydown={key} tabindex="-1">
  <input bind:this={input} bind:value={query} type="search" class="field" placeholder="find something hidden" autocomplete="off" aria-label="Find something hidden" />
  {#if rows.length}
    <ul role="listbox" aria-label="Hidden">
      {#each rows as r, i (r.id)}
        <li role="option" aria-selected={i === at}>
          <button type="button" class:on={i === at} data-hidden={r.id} onpointerenter={() => (at = i)} onclick={() => void show(r)}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">{#if r.folder}<path d="M1.5 4.5h5l1.5 2h6.5v6.5h-13z" />{:else}<path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" />{/if}</svg>
            <span class="t">{r.title}</span>
            {#if r.id !== r.title}<span class="p">{r.id}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="none">{words.length ? "Nothing hidden matches." : "Nothing is hidden."}</p>
  {/if}
</div>

<style>
  .hidden-picker { position: absolute; z-index: 20; width: 260px; max-height: 290px; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--ground-1); }
  .hidden-picker input { width: 100%; box-sizing: border-box; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; gap: 1px; }
  li button { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: baseline; gap: 6px; padding: 5px 6px; cursor: pointer; font: 0.8125rem var(--font-ui); color: var(--text); }
  li button svg { flex: none; align-self: center; color: var(--text-faint); }
  li button.on { background: var(--fill-chosen); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .p { margin-left: auto; font-size: 0.6875rem; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }
  .none { margin: 4px 6px; font: 0.75rem var(--font-ui); color: var(--text-faint); }
</style>
