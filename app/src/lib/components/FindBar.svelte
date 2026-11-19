<script lang="ts">
  // Ctrl+K on the Atlas: a few words, and the notes that match are lit on the map as you type, by the words in them
  // (dashed), by their meaning (dotted), or both (solid). The list below is the same, with those hidden last. The
  // arrows choose one (it is outlined on the map); Enter opens it in the Note pane; Escape lets the map go. With a lens
  // chosen, it looks in the lens, one island of it, or every note; each row says, quietly, the island it is at home in.
  import { onMount } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { finder } from "$lib/finder.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointing } from "$lib/pointing.svelte.ts";
  import { islandRows } from "$lib/lenses.ts";
  import type { LensPlace } from "@isorite/engine";

  let input: HTMLInputElement | undefined = $state();
  const rows = $derived(finder.results.slice(0, 12));
  const chosen = $derived(rows[finder.at]);

  onMount(() => { input?.focus(); input?.select(); return () => pointing.set("finder", null); });
  // The one the arrows are on is outlined on the map.
  $effect(() => { const c = chosen; pointing.set("finder", c && !c.hidden ? { id: c.id, folder: false, who: "you" } : null); });

  async function open(id: string): Promise<void> { finder.hide(); await panes.open(id, true); }
  function key(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finder.hide(); }
    else if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) { e.preventDefault(); finder.at = Math.min(rows.length - 1, finder.at + 1); }
    else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) { e.preventDefault(); finder.at = Math.max(0, finder.at - 1); }
    else if (e.key === "Enter" && chosen) { e.preventDefault(); void open(chosen.id); }
  }
  const BY = { words: "words", meaning: "meaning", both: "words and meaning" } as const;
  async function show(id: string): Promise<void> { try { await app.unhide(id); finder.ask(finder.query); } catch { /* put back */ } }
  const islands = $derived(app.lens ? islandRows(app.lens) : []);
  const titles = $derived(new Map(app.lenses.map((l) => [l.name, l.title])));
  /** Where a note is at home: in the lens shown, its island alone; else each lens it is in, with its island. */
  function where(places: LensPlace[] | undefined): string {
    if (!places?.length) return "";
    const here = app.lens ? places.find((p) => p.lens === app.lensName) : null;
    if (here) return here.island.split(" > ").at(-1) ?? here.island;
    return places.slice(0, 2).map((p) => `${titles.get(p.lens) ?? p.lens}: ${p.island.split(" > ").at(-1)}`).join(", ") + (places.length > 2 ? ", …" : "");
  }
  /** The scope as the picker's value: "" the lens, ":all" every note, else an island's path. */
  const within = $derived(finder.within.all ? ":all" : finder.within.island);
  function narrow(value: string): void { finder.narrow(value === ":all" ? "" : value, value === ":all"); input?.focus(); }
</script>

<div class="find frame" role="search" aria-label="Find a note">
  <input bind:this={input} type="search" class="field" placeholder="Find a note" autocomplete="off" aria-label="Find a note on the map" value={finder.query} oninput={(e) => finder.ask(e.currentTarget.value)} onkeydown={key} />
  {#if app.lens}
    <select class="within" class:wide={finder.within.all} aria-label="Look in" data-find-within value={within} onchange={(e) => narrow(e.currentTarget.value)}>
      <option value="">{app.lens.title}</option>
      {#each islands as r (r.ref)}<option value={r.path}>{"\u00a0\u00a0".repeat(r.depth + 1)}{r.title}</option>{/each}
      <option value=":all">every note</option>
    </select>
  {/if}
  {#if rows.length}
    <ul role="listbox" aria-label="Notes found">
      {#each rows as r, i (r.id)}
        <li role="option" aria-selected={i === finder.at} class:hidden={r.hidden}>
          <button type="button" class="row" class:on={i === finder.at} data-found={r.id} onpointerenter={() => (finder.at = i)} onclick={() => void open(r.id)}>
            <span class="by {r.by}" title={BY[r.by]} aria-label={BY[r.by]}></span>
            <span class="t">{r.title}</span>
            {#if where(r.lenses)}<span class="in" data-in>{where(r.lenses)}</span>{/if}
            {#if r.snippet}<span class="s">{r.snippet.replace(/\s+/g, " ")}</span>{/if}
          </button>
          {#if r.hidden}<button type="button" class="show" aria-label="Show {r.title} again" title="Hidden: show it again" onclick={() => void show(r.id)}>hidden · show</button>{/if}
        </li>
      {/each}
    </ul>
  {:else if finder.query.trim()}
    <p class="none">Nothing found.</p>
  {/if}
  {#if finder.query.trim() && finder.meaning === "pending"}<p class="none">Words only for now: meaning is still being indexed.</p>{/if}
</div>

<style>
  .find { position: absolute; z-index: 8; top: 12px; left: 50%; translate: -50% 0; width: min(440px, calc(100% - 24px)); box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--ground-1); max-height: min(70%, 420px); }
  .find input { width: 100%; box-sizing: border-box; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; gap: 1px; }
  li { display: flex; align-items: center; }
  .row { all: unset; box-sizing: border-box; flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; padding: 5px 6px; cursor: pointer; font: 0.8125rem var(--font-ui); color: var(--text); }
  .row.on { background: var(--fill-chosen); }
  li.hidden .row { color: var(--text-faint); }
  .t { flex: none; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Where it is at home in a lens: quieter than the title, a label's voice. */
  .in { flex: none; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.6875rem; color: var(--text-soft); letter-spacing: .02em; }
  /* Where it looks: quiet while it is the lens; widened to every note, a tint and a 2px bar. */
  .within { align-self: flex-start; max-width: 100%; height: 26px; padding: 0 6px; font: 0.75rem var(--font-ui); color: var(--text-soft); background: transparent; border: 0; box-shadow: inset 2px 0 0 var(--lattice); cursor: pointer; }
  .within:hover, .within:focus-visible { color: var(--text); }
  .within.wide { background: color-mix(in srgb, var(--lattice) var(--tint), transparent); }
  .s { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.6875rem; color: var(--text-faint); }
  /* How it was found, in the outline the map gives it: dashed, dotted, solid. */
  .by { flex: none; align-self: center; width: 9px; height: 9px; border: 1.5px solid var(--lattice); }
  .by.words { border-style: dashed; } .by.meaning { border-style: dotted; border-width: 2px; } .by.both { border-style: solid; }
  li.hidden .by { border-color: var(--text-faint); }
  .show { all: unset; cursor: pointer; flex: none; padding: 3px 6px; font: 0.6875rem var(--font-ui); color: var(--text-faint); }
  .show:hover, .show:focus-visible { color: var(--text); }
  .none { margin: 2px 6px; font: 0.75rem var(--font-ui); color: var(--text-faint); }
</style>
