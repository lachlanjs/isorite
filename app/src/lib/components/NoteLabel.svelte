<script lang="ts">
  // A note's label (plan-m23 §5.2, sketch U), in place of M10's details: always there, one strip under the title,
  // with no field names. The description is the italic line under the title, written in place. The kind is three
  // slots. The path is where the note lives: a folder or the name, pressed, moves or renames it. Tags are parts in
  // corner brackets. A question adds what it's about and its mark; a problem, what it uses and its. Other frontmatter
  // fields are not shown here and are never touched. Deleting is in the pane's menu, away from the name.
  import { goto } from "$app/navigation";
  import { tick } from "svelte";
  import { ABOUT, idsOf, type Kind } from "@isorite/core";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { lustre } from "$lib/lustre.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";
  import FolderField from "./FolderField.svelte";
  import Glyph from "./Glyph.svelte";

  let { note, kind, done, marking, onmark }: { note: NoteSession; kind: Kind; done: string | null; marking: boolean; onmark: () => void } = $props();

  const inBase = $derived(!note.id.startsWith("@"));
  let problem = $state("");

  // The kind: a note's own type ("Theorem") stays while it stays a note. Choosing one fills its slot, and one band
  // of light crosses it (M24, J).
  const KINDS = [["note", "concept", "Concept"], ["question", "question", "Question"], ["problem", "problem", "Problem"]] as const;
  function setKind(k: Kind, type: string, slot: HTMLElement): void {
    if (k === kind) return;
    note.setFields({ type });
    void tick().then(() => lustre(slot, true));
  }

  // Where it is: its folder and its name, pressed to change; a change moves it.
  const dirOf = (id: string) => id.split("/").slice(0, -1).join("/");
  const nameOf = (id: string) => id.split("/").at(-1)!;
  let editing = $state<"folder" | "name" | null>(null);
  let folder = $state("");
  async function move(dir: string, name: string): Promise<void> {
    const clean = (s: string) => s.trim().replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
    const to = [clean(dir), clean(name)].filter(Boolean).join("/");
    editing = null;
    if (!clean(name) || to === note.id) return;
    problem = "";
    try {
      const id = await note.move(to);
      await app.refresh();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      await goto(noteHref(id), { replaceState: true });
    } catch (e) { problem = (e as Error).message; }
  }
  const focus = (el: HTMLElement) => { const input = el instanceof HTMLInputElement ? el : el.querySelector("input"); input?.focus(); input?.select(); };

  // Tags, as parts.
  const tags = $derived(note.fields.tags.split(",").map((t) => t.trim()).filter(Boolean));
  let addingTag = $state(false);
  function addTag(t: string): void {
    const tag = t.trim();
    addingTag = false;
    if (tag && !tags.includes(tag)) note.setMeta({ tags: [...tags, tag] });
  }
  const dropTag = (t: string) => note.setMeta({ tags: tags.filter((x) => x !== t).length ? tags.filter((x) => x !== t) : null });

  // What a question is about, or what a problem uses: notes, as parts.
  // Its own (frontmatter), and those that embed it, which it is about as well (M12); only its own can be taken away.
  const field = $derived(kind === "note" ? null : ABOUT[kind]);
  const linked = $derived(field ? idsOf(note.meta?.[field]) : []);
  const shown = $derived(field ? [...new Set([...linked, ...(app.listing.notes.find((n) => n.id === note.id)?.attached ?? [])])] : []);
  const titleOf = (id: string) => app.listing.notes.find((n) => n.id === id)?.title ?? nameOf(id);
  let addingNote = $state(false);
  function addNote(raw: string): void {
    addingNote = false;
    const id = raw.trim().replace(/^\/+/, "").replace(/\.md$/, "");
    const found = app.listing.notes.find((n) => n.id === id || n.title.toLowerCase() === id.toLowerCase());
    if (field && found && !linked.includes(found.id) && found.id !== note.id) note.setMeta({ [field]: [...linked, found.id] });
  }
  const dropNote = (id: string) => { if (field) note.setMeta({ [field]: linked.filter((x) => x !== id).length ? linked.filter((x) => x !== id) : null }); };
</script>

<textarea class="stand serif" rows="1" aria-label="description" value={note.fields.description} class:empty={!note.fields.description}
  oninput={(e) => note.setFields({ description: e.currentTarget.value.replace(/\s*\n\s*/g, " ") })}
  onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}></textarea>

<div class="label">
  <span class="kinds" role="radiogroup" aria-label="kind">
    {#each KINDS as [k, name, type] (k)}
      <button type="button" role="radio" class="slot {k}" aria-checked={kind === k} data-lustre onclick={(e) => setKind(k, type, e.currentTarget)}><Glyph kind={k === "note" ? "concept" : k} />{name}</button>
    {/each}
  </span>
  {#if inBase}
    <span class="path">
      {#if editing === "folder"}
        <span class="field" use:focus><FolderField id="note-folder" quiet label="folder" bind:value={folder} placeholder="the top of the base"
          onpick={(d) => void move(d, nameOf(note.id))} onkeydown={(e) => { if (e.key === "Escape") editing = null; }} /></span>
      {:else}
        <button type="button" class="seg" aria-label={dirOf(note.id) ? undefined : "the top of the base"} onclick={() => { folder = dirOf(note.id); editing = "folder"; }}>{dirOf(note.id).replaceAll("/", " / ") || "·"}</button>
      {/if}
      <span class="sep">/</span>
      {#if editing === "name"}
        <input class="name" value={nameOf(note.id)} spellcheck="false" autocomplete="off" aria-label="name" size={Math.max(8, nameOf(note.id).length)} use:focus
          onblur={(e) => void move(dirOf(note.id), e.currentTarget.value)}
          onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") editing = null; }} />
      {:else}
        <button type="button" class="seg name" onclick={() => (editing = "name")}>{nameOf(note.id)}</button>
      {/if}
    </span>
  {/if}
  <span class="parts">
    {#each tags as t (t)}<button type="button" class="br" aria-label="tag {t}: remove" onclick={() => dropTag(t)}>{t}</button>{/each}
    {#if addingTag}
      <input class="adding" size="10" aria-label="new tag" use:focus onblur={(e) => addTag(e.currentTarget.value)}
        onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") addingTag = false; }} />
    {:else}
      <button type="button" class="add" aria-label="add a tag" onclick={() => (addingTag = true)}>+</button>
    {/if}
  </span>
</div>

{#if field}
  <div class="extra {kind}">
    <span class="word">{field}</span>
    {#each shown as id (id)}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
      <a class="br" href={noteHref(id)}>{titleOf(id)}</a>{#if linked.includes(id)}<button type="button" class="x" aria-label="{titleOf(id)}: take away" onclick={() => dropNote(id)}>×</button>{/if}
    {/each}
    {#if addingNote}
      <input class="adding" list="label-notes" size="18" aria-label="a note it's {field === 'about' ? 'about' : 'using'}" use:focus onblur={(e) => addNote(e.currentTarget.value)}
        onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") addingNote = false; }} />
      <datalist id="label-notes">{#each app.listing.notes.filter((n) => n.id !== note.id && !n.id.startsWith("@")) as n (n.id)}<option value={n.id}>{n.title}</option>{/each}</datalist>
    {:else}
      <button type="button" class="add" aria-label="add a note it's {field === 'about' ? 'about' : 'using'}" onclick={() => (addingNote = true)}>+</button>
    {/if}
    <span class="grow"></span>
    <button type="button" class="mark" class:done={!!done} aria-pressed={!!done} disabled={marking} onclick={onmark} title={done ? `since ${done}` : undefined}>
      {kind === "question" ? (done ? "◆ resolved" : "◇ open") : done ? "◆ solved" : "◇ unsolved"}
    </button>
  </div>
{/if}
{#if problem}<p class="problem" role="alert">{problem}</p>{/if}

<style>
  /* The description: the italic line under the title, written in place; a faint rule holds its place while empty. */
  .stand { display: block; width: 100%; margin: -2px 0 0; padding: 0 2px 2px; border: 0; border-bottom: 1px solid transparent; background: none; resize: none; field-sizing: content; overflow: hidden;
    font: italic 17px/1.5 var(--font-text); color: var(--text-soft); }
  .stand.empty { border-bottom-color: var(--line); min-height: 26px; }
  .stand:hover { border-bottom-color: var(--line); }
  .stand:focus-visible { outline: none; border-bottom-color: var(--lattice); color: var(--text); }
  .label { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); margin-top: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); font-size: 11px; color: var(--text-faint); }
  .kinds { display: inline-flex; gap: 4px; }
  .slot { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; background: none; border: 1px solid var(--line); color: var(--text-faint); font: 11px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; cursor: pointer; }
  .slot:hover { border-color: var(--text-soft); color: var(--text); }
  .slot[aria-checked="true"] { border-color: var(--lattice); background: var(--lattice); color: var(--ground-0); cursor: default; }
  .slot.question[aria-checked="true"] { border-color: var(--rose); background: var(--rose); }
  .slot.problem[aria-checked="true"] { border-color: var(--text-soft); background: var(--text-soft); }
  .path { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
  .seg { background: none; border: 0; border-bottom: 1px solid transparent; padding: 2px 0; color: var(--text-soft); font: inherit; cursor: pointer; }
  .seg.name { color: var(--text); }
  .seg:hover, .seg:focus-visible { border-bottom-color: var(--lattice); color: var(--text); outline: none; }
  .sep { color: var(--text-faint); }
  .field { display: inline-block; min-width: 160px; }
  input { background: none; border: 0; border-bottom: 1px solid var(--lattice); padding: 2px 0; color: var(--text); font: 12px var(--font-ui); }
  input:focus-visible { outline: none; }
  .parts, .extra { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  /* A part in corner brackets. */
  .br { font: 11px/16px var(--font-ui); color: var(--text-soft); padding: 3px 8px; background-color: transparent; border: 0; cursor: pointer; text-decoration: none; --b: var(--line-strong); background-image:
    linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b));
    background-repeat: no-repeat; background-position: top left, top left, bottom right, bottom right; background-size: 5px 1px, 1px 5px, 5px 1px, 1px 5px; }
  .br:hover, .br:focus-visible { color: var(--text); --b: var(--lattice); outline: none; }
  button.br:hover { text-decoration: line-through; text-decoration-color: var(--rose); }
  .add, .x { width: 22px; height: 22px; display: inline-grid; place-items: center; background: none; border: 1px solid transparent; color: var(--text-faint); font: 13px var(--font-ui); cursor: pointer; padding: 0; }
  .add:hover, .add:focus-visible { border-color: var(--line-strong); color: var(--text); outline: none; }
  .x { width: 16px; margin-left: -6px; opacity: 0; }
  .extra .br:hover + .x, .x:hover, .x:focus-visible { opacity: 1; color: var(--rose); outline: none; }
  .extra { display: flex; margin-top: var(--space-2); font-size: 11px; color: var(--text-faint); }
  .word { text-transform: uppercase; letter-spacing: .06em; margin-right: 4px; }
  .grow { flex: 1; }
  .mark { height: 26px; padding: 0 10px; background: none; border: 1px solid var(--rose); color: var(--rose); font: 11px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; cursor: pointer; }
  .problem .mark, .extra.problem .mark { border-color: var(--text-soft); color: var(--text-soft); }
  .mark.done, .extra.problem .mark.done { border-color: var(--malachite); background: var(--malachite); color: var(--ground-0); }
  .mark:disabled { opacity: .6; cursor: default; }
  p.problem { margin: var(--space-1) 0 0; color: var(--rose); font-size: 12px; }
</style>
