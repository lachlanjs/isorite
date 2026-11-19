<script lang="ts">
  // The Atlas's settings: its lenses (docs/lenses.md), changed here rather than in their files. A new lens; for the lens
  // chosen, its title, its file's name and deleting it; its islands in the file's order, nested as the file nests them, each
  // renamed, moved up or down, given an island inside it or removed, with its rules in one plain field; and what it hides,
  // its own list or the base's. Every change goes through the engine, journalled as yours, and the map follows by itself.
  import { FOLDERS_LENS } from "@isorite/core";
  import type { LensChange } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";
  import { islandRows, lensName, parseRules, rulesText, type IslandRow } from "$lib/lenses.ts";
  import { fadeIn, foldAway, growOpen } from "$lib/motion.ts";

  const lens = $derived(app.lens);
  const rows = $derived(lens ? islandRows(lens) : []);
  let problem = $state("");
  let busy = $state(false);

  /** One change, said if it fails. Changes go one after another, in the order made (a name typed, then a title, before the
   *  first is answered); a button stands down while any is under way, so nothing is done twice. */
  let queue: Promise<unknown> = Promise.resolve(), pending = 0;
  function change(name: string, c: LensChange): Promise<boolean> {
    pending++; busy = true; problem = "";
    const run = queue.then(async () => {
      try { await app.editLens(name, c); return true; } catch (e) { problem = (e as Error).message; return false; } finally { busy = --pending > 0; }
    });
    queue = run;
    return run;
  }

  // A new lens: its title typed, its file named from it, and it is the lens shown.
  let fresh = $state("");
  async function make(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const title = fresh.trim(), name = lensName(title);
    if (!name) { problem = "A lens needs a name with a letter or a digit in it."; return; }
    if (await change(name, { action: "create", title })) { fresh = ""; await app.setLens(name); }
  }

  // The lens's title and its file's name, each kept when the field is left or Enter pressed.
  let title = $state(""), file = $state("");
  // Set again only when the lens's own title or name changes, not whenever the lens is read again (what is being typed stays).
  let had = { title: "", file: "" };
  $effect(() => {
    const t = lens?.title ?? "", f = lens?.name ?? "";
    if (t !== had.title) title = t;
    if (f !== had.file) file = f;
    had = { title: t, file: f };
  });
  async function retitle(): Promise<void> { if (lens && title.trim() && title.trim() !== lens.title) await change(lens.name, { action: "title", title: title.trim() }); }
  async function rename(): Promise<void> { if (lens && file.trim() && file.trim() !== lens.name) { if (!(await change(lens.name, { action: "rename", to: file.trim() }))) file = lens.name; } }
  let sure = $state(false);
  async function remove(): Promise<void> { if (lens && (await change(lens.name, { action: "delete" }))) sure = false; }

  // An island: its name typed over, its rules, its place among its siblings, an island inside it, or gone.
  const siblings = (r: IslandRow): IslandRow[] => rows.filter((x) => x.depth === r.depth && parentOf(x) === parentOf(r));
  const parentOf = (r: IslandRow): string => r.path.split(" > ").slice(0, -1).join(" > ");
  async function renameIsland(r: IslandRow, to: string): Promise<void> {
    const name = to.trim();
    if (!lens || !name || name === r.title) return;
    // Renamed and shown by the new name: the file's key and what is shown are one again.
    if (name !== r.island.name && !(await change(lens.name, { action: "rename_island", island: r.path, name }))) return;
    const path = [parentOf(r), name].filter(Boolean).join(" > ");
    await change(lens.name, { action: "title", island: path, title: name });
  }
  async function setRules(r: IslandRow, text: string): Promise<void> {
    const match = parseRules(text);
    if (lens && match.join("\n") !== r.island.match.join("\n")) await change(lens.name, { action: "set_match", island: r.path, match });
  }
  async function shift(r: IslandRow, by: -1 | 1): Promise<void> {
    const at = siblings(r).findIndex((x) => x.ref === r.ref) + by;
    if (lens) await change(lens.name, { action: "move_island", island: r.path, at });
  }
  let inside = $state<string | null>(null), insideName = $state(""), topName = $state("");
  async function addIsland(e: SubmitEvent, under: string): Promise<void> {
    e.preventDefault();
    const name = (under ? insideName : topName).trim();
    if (!lens || !name) return;
    if (!(await change(lens.name, { action: "add_island", island: under ? `${under} > ${name}` : name }))) return;
    if (under) { insideName = ""; inside = null; } else topName = "";
  }
  /** Enter in a field that keeps itself when left: it is left, unless an input method is choosing a word. */
  const commit = (e: KeyboardEvent & { currentTarget: HTMLInputElement }): void => { if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.currentTarget.blur(); } };
  let removing = $state<string | null>(null);
  async function removeIsland(r: IslandRow): Promise<void> { if (lens && (await change(lens.name, { action: "remove_island", island: r.path }))) removing = null; }

  // What the lens hides: each entry, shown again here; and whether the list is its own or the base's.
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id;
  async function show(id: string): Promise<void> { if (lens) await change(lens.name, { action: "unhide", ids: [id] }); }
  async function useBase(): Promise<void> { if (lens) await change(lens.name, { action: "set_hidden", ids: null }); }

  const focus = (el: HTMLInputElement) => { el.focus(); };
  const count = (r: IslandRow): number => r.island.notes.length + r.island.ghosts.length;
</script>

<section class="lenses" aria-busy={busy}>
  <form class="setting" onsubmit={make}>
    <label class="label" for="new-lens">new lens</label>
    <div class="row">
      <input id="new-lens" class="field grow" bind:value={fresh} placeholder="By kind" autocomplete="off" />
      <button class="btn quiet" type="submit" disabled={!fresh.trim() || busy}>make</button>
    </div>
  </form>

  {#if lens && app.lensName !== FOLDERS_LENS}
    <div class="setting" data-lens-edit={lens.name}>
      <span class="label">lens</span>
      <form class="row" onsubmit={(e) => { e.preventDefault(); void retitle(); }}>
        <input class="field grow" aria-label="The lens's title" bind:value={title} onblur={() => void retitle()} autocomplete="off" />
      </form>
      <form class="row" onsubmit={(e) => { e.preventDefault(); void rename(); }}>
        <span class="faint mono">lenses/</span><input class="field grow mono" aria-label="The lens's file name" bind:value={file} onblur={() => void rename()} autocomplete="off" spellcheck="false" /><span class="faint mono">.toml</span>
      </form>
      <div class="row">
        {#if sure}
          <span class="ask" transition:fadeIn>Delete the lens {lens.title}? The notes stay.</span>
          <button class="btn danger" type="button" disabled={busy} onclick={() => void remove()}>delete</button>
          <button class="btn quiet" type="button" onclick={() => (sure = false)}>keep it</button>
        {:else}
          <button class="btn quiet danger-text" type="button" onclick={() => (sure = true)}>Delete this lens…</button>
        {/if}
      </div>
    </div>

    <div class="setting">
      <span class="label" id="islands-label">islands</span>
      <ul class="islands" aria-labelledby="islands-label">
        {#each rows as r (r.ref)}
          {@const sib = siblings(r)}
          {@const k = sib.findIndex((x) => x.ref === r.ref)}
          <li class="island" data-island-edit={r.path} style:--depth={r.depth} in:fadeIn out:foldAway>
            <div class="line">
              <input class="field name" aria-label="Island {r.title}" value={r.title} onchange={(e) => void renameIsland(r, e.currentTarget.value)} onkeydown={commit} autocomplete="off" />
              <span class="n faint" title="{count(r)} {count(r) === 1 ? 'note' : 'notes'}">{count(r)}</span>
              <button class="act" type="button" aria-label="Move {r.title} up" title="Up" disabled={k <= 0 || busy} onclick={() => void shift(r, -1)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 10l4-4 4 4" /></svg></button>
              <button class="act" type="button" aria-label="Move {r.title} down" title="Down" disabled={k >= sib.length - 1 || busy} onclick={() => void shift(r, 1)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 6l4 4 4-4" /></svg></button>
              <button class="act" type="button" aria-label="An island in {r.title}" title="An island in it" aria-expanded={inside === r.path} onclick={() => { inside = inside === r.path ? null : r.path; insideName = ""; }}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 3v10M3 8h10" /></svg></button>
              <button class="act danger-text" type="button" aria-label="Remove the island {r.title}" title="Remove" onclick={() => (removing = removing === r.path ? null : r.path)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
            </div>
            <input class="field rules mono" aria-label="Rules of {r.title}" value={rulesText(r.island.match)} placeholder="tag:x path:/a/**" onchange={(e) => void setRules(r, e.currentTarget.value)} onkeydown={commit} autocomplete="off" spellcheck="false" />
            {#if removing === r.path}
              <div class="row" transition:growOpen>
                <span class="ask">Remove {r.title}{r.island.islands.length ? " and the islands in it" : ""}? Its notes stay.</span>
                <button class="btn danger" type="button" disabled={busy} onclick={() => void removeIsland(r)}>remove</button>
                <button class="btn quiet" type="button" onclick={() => (removing = null)}>keep it</button>
              </div>
            {/if}
            {#if inside === r.path}
              <form class="row" onsubmit={(e) => void addIsland(e, r.path)} transition:growOpen>
                <input class="field grow" aria-label="A new island in {r.title}" bind:value={insideName} placeholder="Name" autocomplete="off" use:focus />
                <button class="btn quiet" type="submit" disabled={!insideName.trim() || busy}>add</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
      <form class="row" onsubmit={(e) => void addIsland(e, "")}>
        <input class="field grow" aria-label="A new island" bind:value={topName} placeholder="New island" autocomplete="off" />
        <button class="btn quiet" type="submit" disabled={!topName.trim() || busy}>add</button>
      </form>
    </div>

    <div class="setting">
      <span class="label">hidden</span>
      <div class="row">
        <span class="soft" data-hidden-own={lens.ownHidden}>{lens.ownHidden ? `its own: ${lens.hidden.length}` : `as the base: ${lens.hidden.length}`}</span>
        {#if lens.ownHidden}<button class="btn quiet" type="button" disabled={busy} onclick={() => void useBase()}>as the base</button>{/if}
      </div>
      {#if lens.hidden.length}
        <ul class="hidden">
          {#each lens.hidden as id (id)}
            <li><span class="t">{titleOf(id)}</span><span class="p faint">{id}</span><button class="btn quiet" type="button" aria-label="Show {titleOf(id)} in {lens.title}" disabled={busy} onclick={() => void show(id)}>show</button></li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: var(--space-6); }
  .setting { display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; }
  .grow { flex: 1 1 8em; min-width: 0; }
  .mono { font-family: var(--font-ui); font-size: 0.75rem; }
  .faint { color: var(--text-faint); }
  .soft { color: var(--text-soft); font-size: 0.8125rem; }
  .ask { flex: 1 1 100%; color: var(--text-soft); font-size: 0.8125rem; }
  .danger-text { color: var(--text-soft); }
  .danger-text:hover, .danger-text:focus-visible { color: var(--rose); }
  .problem { margin: 0; color: var(--rose); font-size: 0.75rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  /* An island, indented as the file nests it, with a thin line down its edge for the island it is in. */
  .island { display: flex; flex-direction: column; gap: 4px; margin-left: calc(var(--depth) * 14px); padding-left: calc(min(var(--depth), 1) * 8px); box-shadow: inset calc(min(var(--depth), 1) * 1px) 0 0 var(--line-faint); }
  .line { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .name { flex: 1 1 auto; min-width: 0; height: 28px; }
  .rules { height: 26px; color: var(--text-soft); }
  .n { min-width: 2ch; text-align: right; font-size: 0.75rem; margin: 0 4px; }
  .act { width: 26px; height: 26px; flex: none; display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--dur-1) var(--ease-out); }
  .act:hover:not(:disabled), .act:focus-visible { color: var(--text); }
  .act:disabled { opacity: 0.35; cursor: default; }
  .act[aria-expanded="true"] { color: var(--lattice); box-shadow: inset 0 -2px 0 var(--lattice); }
  .act.danger-text:hover, .act.danger-text:focus-visible { color: var(--rose); }
  .hidden li { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: 0.8125rem; }
  .hidden .t { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hidden .p { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.6875rem; }
  @media (prefers-reduced-motion: reduce) { .act { transition: none; } }
</style>
