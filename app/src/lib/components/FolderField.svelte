<script lang="ts">
  // A folder, typed with suggestions as `[[` gives them for notes (K2): every folder of the base whose path holds
  // what is typed, closest first, with how many notes each holds. A folder that is not there yet can be typed too:
  // it is made when a note is put in it, and the list says so.
  import { app } from "$lib/app.svelte.ts";

  let {
    value = $bindable(""), placeholder = "", label, id = "folder", quiet = false,
    onpick, onkeydown,
  }: {
    value?: string; placeholder?: string; label: string; id?: string;
    /** As the details' fields are drawn: no box, a line under it when pointed at. */
    quiet?: boolean;
    /** A folder chosen from the list, or Enter on what is typed. */
    onpick?: (folder: string) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();

  let open = $state(false);
  let at = $state(0);
  const typed = $derived(value.trim().replace(/^\/+|\/+$/g, "").toLowerCase());
  const count = (dir: string) => app.listing.notes.filter((n) => n.dir === dir).length;
  const options = $derived.by(() => {
    const dirs = app.listing.dirs.filter((d) => d.toLowerCase().includes(typed));
    // Folders whose name starts with what is typed first, then those whose path does, then the rest.
    const rank = (d: string) => (d.split("/").at(-1)!.toLowerCase().startsWith(typed) ? 0 : d.toLowerCase().startsWith(typed) ? 1 : 2);
    const list = dirs.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((d) => ({ dir: d, made: false }));
    if (typed && !app.listing.dirs.some((d) => d.toLowerCase() === typed)) list.push({ dir: value.trim().replace(/^\/+|\/+$/g, ""), made: true });
    return list.slice(0, 8);
  });

  function pick(dir: string) { value = dir; open = false; onpick?.(dir); }
  function key(e: KeyboardEvent) {
    if (open && options.length) {
      if (e.key === "ArrowDown") { at = (at + 1) % options.length; e.preventDefault(); return; }
      if (e.key === "ArrowUp") { at = (at - 1 + options.length) % options.length; e.preventDefault(); return; }
      if ((e.key === "Enter" || e.key === "Tab") && options[at] && (e.key === "Enter" || typed)) { if (e.key === "Enter") e.preventDefault(); pick(options[at]!.dir); return; }
      if (e.key === "Escape") { open = false; e.stopPropagation(); return; }
    }
    onkeydown?.(e);
  }
</script>

<span class="field-wrap">
  <input {id} class="mono" class:field={!quiet} class:quiet bind:value {placeholder} aria-label={label} autocomplete="off" spellcheck="false"
    role="combobox" aria-expanded={open && options.length > 0} aria-controls="{id}-list" aria-autocomplete="list"
    aria-activedescendant={open && options[at] ? `${id}-opt-${at}` : undefined}
    onfocus={() => { open = true; at = 0; }} oninput={() => { open = true; at = 0; }}
    onblur={() => setTimeout(() => (open = false), 120)} onkeydown={key} />
  {#if open && options.length}
    <ul class="suggest" id="{id}-list" role="listbox" aria-label="folders">
      {#each options as o, k (o.dir + o.made)}
        <li id="{id}-opt-{k}" role="option" aria-selected={k === at} class:at={k === at}>
          <button type="button" tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(o.dir)} onmouseenter={() => (at = k)}>
            <span class="dir">{o.dir}</span><span class="detail">{o.made ? "new folder" : `${count(o.dir)} ${count(o.dir) === 1 ? "note" : "notes"}`}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</span>

<style>
  .field-wrap { position: relative; display: block; flex: 1 1 auto; min-width: 0; }
  .field-wrap input { width: 100%; box-sizing: border-box; }
  .mono { font-family: var(--font-mono); }
  .quiet { background: none; border: 0; border-bottom: 1px solid transparent; padding: 2px 0; color: var(--text-soft); font-size: 12px; }
  .quiet::placeholder { color: var(--text-faint); opacity: .7; }
  .quiet:hover { border-bottom-color: var(--line); }
  .quiet:focus-visible { outline: none; border-bottom-color: var(--lattice); color: var(--text); }
  /* As the editor's [[ suggestions are drawn (codemirror.ts's .cm-tooltip-autocomplete). */
  .suggest {
    position: absolute; left: 0; top: calc(100% + 4px); z-index: 60; min-width: 220px; max-width: min(420px, 90vw);
    margin: 0; padding: 4px 0; list-style: none; background: var(--ground-2); border: 1px solid var(--line); box-shadow: 0 6px 18px color-mix(in srgb, var(--ground-0) 60%, transparent);
  }
  .suggest button {
    display: flex; align-items: baseline; gap: 12px; width: 100%; padding: 5px 12px; border: 0; background: none; text-align: left;
    font: 13px/1.4 var(--font-mono); color: var(--text-soft); cursor: pointer;
  }
  .suggest .at button { background: var(--ground-1); color: var(--text); }
  .dir { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { color: var(--text-faint); font-size: 11px; flex: none; }
</style>
