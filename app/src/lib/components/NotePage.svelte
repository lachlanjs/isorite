<script lang="ts">
  import { resolve } from "$app/paths";
  // A note, open for writing: its title, its details when they are wanted, and its text. Saving is the
  // session's business (note.svelte.ts); this shows how it stands and offers the choice when a save is refused.
  import { onMount } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { NoteSession } from "$lib/note.svelte.ts";
  import NoteDetails from "./NoteDetails.svelte";
  import NoteEditor from "./NoteEditor.svelte";

  let { id }: { id: string } = $props();

  // One session for the page's life: the route gives each note its own page ({#key}).
  // svelte-ignore state_referenced_locally
  const note = new NoteSession(id);

  const remembered = (key: string): boolean => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
  const remember = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* not kept */ } };
  let details = $state(remembered("isorite.details"));
  let source = $state(false);
  // Frontmatter that cannot be read is mended in the source, where all of the file shows.
  const asSource = $derived(source || note.meta === null);

  onMount(() => {
    void note.open();
    const leaving = () => { void note.save(); };
    addEventListener("pagehide", leaving);
    document.addEventListener("visibilitychange", leaving);
    return () => {
      removeEventListener("pagehide", leaving);
      document.removeEventListener("visibilitychange", leaving);
      void note.close();
      app.here = "";
      app.saving = null;
    };
  });

  const SAYS = { saved: "saved", unsaved: "not saved yet", saving: "saving", conflict: "changed elsewhere: choose below", failed: "not saved" } as const;
  $effect(() => {
    app.here = note.loaded === "ready" ? note.fields.title || id.split("/").at(-1)! : "";
    app.saving = note.loaded === "ready"
      ? { text: note.saving === "failed" ? `not saved: ${note.message}` : SAYS[note.saving], bad: note.saving === "failed" || note.saving === "conflict" }
      : null;
  });
</script>

<article class="note">
  {#if note.loaded === "loading"}
    <p class="faint">opening…</p>
  {:else if note.loaded === "missing"}
    <p class="soft">There is no note at <span class="faint">{id}</span>.</p>
    <p><a href={resolve("/notes")}>all notes</a></p>
  {:else if note.loaded === "error"}
    <p class="bad">{note.message}</p>
  {:else}
    {#if note.saving === "conflict"}
      <div class="frame choice" role="alert">
        <span class="frame-title">changed elsewhere</span>
        <p>{note.theirs === null ? "This note was deleted or moved while you were writing." : "This note was changed somewhere else while you were writing. Nothing here has been saved over it."}</p>
        <div class="row">
          <button class="btn primary" type="button" onclick={() => note.keepMine()}>keep mine</button>
          {#if note.theirs}<button class="btn" type="button" onclick={() => note.keepTheirs()}>take theirs</button>{/if}
        </div>
        <p class="faint">Whichever you keep, the other stays in the note's journal.</p>
      </div>
    {/if}

    <div class="head">
      {#if !asSource}
        <label class="hidden-label" for="title">Title</label>
        <!-- A textarea so a long title wraps instead of running out of sight; a title is still one line of text. -->
        <textarea id="title" class="serif title" rows="1" value={note.fields.title} placeholder={id.split("/").at(-1)} autocomplete="off"
          oninput={(e) => note.setFields({ title: e.currentTarget.value.replace(/\s*\n\s*/g, " ") })}
          onkeydown={(e) => { if (e.key === "Enter") e.preventDefault(); }}></textarea>
      {:else}
        <span class="grow faint">{id}.md{note.meta === null ? ": the frontmatter cannot be read, so the file is shown as it is" : ""}</span>
      {/if}
      <div class="tools">
        {#if !asSource}<button class="btn quiet" type="button" aria-pressed={details} onclick={() => { details = !details; remember("isorite.details", details); }}>details</button>{/if}
        <button class="btn quiet" type="button" aria-pressed={asSource} disabled={note.meta === null} onclick={() => (source = !source)}>source</button>
      </div>
    </div>
    {#if details && !asSource}<NoteDetails {note} />{/if}

    {#key asSource}<NoteEditor {note} source={asSource} />{/key}
  {/if}
</article>

<style>
  .note { max-width: calc(var(--measure) + 2 * var(--space-4)); margin: 0 auto; padding: var(--space-12) var(--space-4) 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .head { display: flex; align-items: flex-start; gap: var(--space-3); }
  .title { flex: 1 1 auto; min-width: 0; font-size: 34px; line-height: 1.2; font-weight: 700; background: none; border: 0; padding: 0; color: var(--text); resize: none; field-sizing: content; overflow: hidden; }
  .title::placeholder { color: var(--text-faint); }
  .title:focus-visible { outline: none; }
  .tools { display: flex; flex: none; padding-top: 6px; }
  .tools .btn { height: 28px; font-size: 12px; }
  .tools .btn[aria-pressed="true"] { color: var(--text); --fill: var(--ground-3); }
  .choice { padding: var(--space-6) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); --edge: var(--rose); }
  .row { display: flex; gap: var(--space-2); }
  .bad { color: var(--rose); }
  @media (max-width: 600px) {
    .note { padding-top: var(--space-6); }
    .head { flex-direction: column-reverse; gap: var(--space-1); }
    .tools { align-self: flex-end; padding-top: 0; }
    .title { font-size: 26px; width: 100%; }
  }
</style>
