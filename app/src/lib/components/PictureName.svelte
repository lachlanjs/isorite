<script lang="ts">
  // A picture pasted or dropped into a note (M22), named before it's saved: its name (made safe as it's typed, the
  // file it will be shown), and what it shows (its alt text, which is what Iso reads of it). The same picture
  // already in the notes is offered instead of a copy. Enter saves, Esc saves nothing.
  import { onMount } from "svelte";
  import { describedAs } from "$lib/editor/links.ts";
  import { safeName } from "$lib/pictures.ts";

  let { file, src, folder, suggested, taken, same, at, onDone }: {
    file: File;
    /** The picture, for its thumbnail. */
    src: string;
    /** The folder it goes in: the note's own, named for it. */
    folder: string;
    /** The name offered, without its extension. */
    suggested: string;
    /** Whether a path is taken already. */
    taken: (path: string) => boolean;
    /** The path of the same picture (by its bytes) already in the notes, if there is one. */
    same: string | null;
    /** Where it opens: beside the cursor or where it was dropped. */
    at: { left: number; top: number };
    /** The path to save it at (`save`), or of the same picture to show instead, and what it shows; null: nothing. */
    onDone: (r: { path: string; alt: string; save: boolean } | null) => void;
  } = $props();

  const ext = $derived({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" }[file.type] ?? "png");
  // svelte-ignore state_referenced_locally -- the name offered is where typing starts
  let name = $state(suggested);
  let alt = $state("");
  let copy = $state(false);
  let input: HTMLInputElement | undefined = $state();
  let altInput: HTMLInputElement;

  const safe = $derived(safeName(name) || "picture");
  const path = $derived(`${folder ? folder + "/" : ""}${safe}.${ext}`);
  const isTaken = $derived(taken(path));
  /** The next free name: `-2`, `-3`, …. */
  const free = $derived.by(() => { for (let n = 2; ; n++) if (!taken(`${folder ? folder + "/" : ""}${safe}-${n}.${ext}`)) return `${safe}-${n}`; });
  const linking = $derived(same !== null && !copy);

  onMount(() => { if (input) { input.focus(); input.select(); } else altInput.focus(); });

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onDone(null); }
    else if (e.key === "Enter") { e.preventDefault(); save(); }
  }
  function save() {
    if (!linking && isTaken) { name = free; return; }
    const to = linking ? same! : path;
    onDone({ path: to, alt: alt.trim() || describedAs(to), save: !linking });
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="picture-name" role="dialog" aria-label="Name the picture" style:left="{at.left}px" style:top="{at.top}px" tabindex="-1" onkeydown={keydown}>
  <img {src} alt="" />
  <div class="fields">
    {#if linking}
      <p class="same">This picture is already in the notes as <code>{same}</code>.</p>
    {:else}
      <label><span>name</span>
        <span class="name"><input class="field mono" bind:this={input} bind:value={name} spellcheck="false" autocomplete="off" aria-label="Its name" /><span class="ext">.{ext}</span></span>
      </label>
      <p class="path" class:taken={isTaken}>{#if isTaken}<code>{path}</code> is taken: Enter makes it <code>{free}.{ext}</code>{:else}<code>{path}</code>{/if}</p>
    {/if}
    <label><span>what it shows</span>
      <input class="field" bind:value={alt} placeholder="Iso reads this, not the picture" aria-label="What it shows" autocomplete="off" bind:this={altInput} />
    </label>
    <div class="actions">
      {#if same !== null}<button class="btn" type="button" onclick={() => { copy = !copy; if (copy) requestAnimationFrame(() => { input?.focus(); input?.select(); }); }}>{copy ? "Use the one there" : "Save a copy"}</button>{/if}
      <button class="btn" type="button" onclick={() => onDone(null)}>Cancel</button>
      <button class="btn primary" type="button" onclick={save}>{linking ? "Show it" : "Save"}</button>
    </div>
  </div>
</div>

<style>
  .picture-name {
    position: fixed; z-index: 50; display: flex; gap: 12px; padding: 12px; width: min(460px, calc(100vw - 32px));
    background: var(--ground-1); border: 1px solid var(--line-strong); font-family: var(--font-ui); font-size: 13px;
    box-shadow: 0 6px 24px color-mix(in srgb, var(--ground-0) 40%, transparent);
  }
  img { width: 72px; height: 72px; object-fit: contain; background: var(--ground-2); flex: none; }
  .fields { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }
  label { display: flex; flex-direction: column; gap: 2px; }
  label > span:first-child { font-size: 12px; color: var(--text-faint); }
  .name { display: flex; align-items: baseline; gap: 4px; }
  .name input { flex: 1; }
  .ext { color: var(--text-faint); }
  .path, .same { margin: 0; font-size: 12px; color: var(--text-faint); overflow-wrap: anywhere; }
  .path.taken { color: var(--rose); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
</style>
