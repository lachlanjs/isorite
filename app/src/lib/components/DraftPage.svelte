<script lang="ts">
  // A note written for Iso (the Desktop-Ask and Desktop-Review boards). It is not in the base: you write what
  // you understand and what you want, link the notes it should rest on, and send it. Iso's reply arrives under
  // your prompt, between the dotted rules, and is kept as a note in a folder you choose, or discarded.
  import Drawing from "./Drawing.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { NoteIso } from "$lib/iso.svelte.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";
  import { NoteSession } from "$lib/note.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import NoteEditor from "./NoteEditor.svelte";

  let { id }: { id: string } = $props();

  // svelte-ignore state_referenced_locally
  const note = new NoteSession(id);
  const iso = new NoteIso(note);

  let folder = $state("");
  let all = $state(false);
  let problem = $state("");
  let busy = $state(false);

  /** Iso's reply, when there is one waiting: the page is then for reviewing it. */
  const reply = $derived(iso.proposals.at(-1));
  const said = $derived(reply?.text ?? "");
  const editing = $derived(reply && iso.editing?.id === reply.id ? iso.editing : null);
  const writing = $derived(!reply && !iso.asking);
  /** The notes the prompt links to: what Iso is sent with it. */
  const linked = $derived.by(() => {
    const ids = [...note.body.matchAll(/\]\(\/([^)\s#]+)\.md/g)].map((m) => decodeURIComponent(m[1]!));
    return [...new Set(ids)].flatMap((nid) => { const n = app.listing.notes.find((x) => x.id === nid); return n ? [n] : []; });
  });
  const lastStep = $derived(iso.asking?.steps.at(-1)?.said ?? "");

  onMount(() => {
    app.open = id;
    void note.open().then(() => iso.open());
    const leaving = () => { void note.save(); };
    addEventListener("pagehide", leaving);
    return () => {
      removeEventListener("pagehide", leaving);
      iso.close();
      void note.close();
      app.here = app.open = "";
      app.saving = null;
    };
  });

  $effect(() => {
    app.here = note.loaded === "ready" ? note.fields.title || "a new note" : "";
    app.saving = note.loaded === "ready" && writing ? { text: note.saving === "saved" ? "saved, outside your base" : note.saving === "failed" ? `not saved: ${note.message}` : "saving", bad: note.saving === "failed" } : null;
  });

  async function keep() {
    if (!reply) return;
    problem = "";
    busy = true;
    try {
      await note.save();
      if (editing) await iso.done(reply);
      const kept = await app.api.keepDraft(id, reply.id, folder);
      await app.refresh();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      await goto(noteHref(kept.id));
    } catch (e) { problem = (e as Error).message; } finally { busy = false; }
  }

  /** The Atlas's pane, to link notes there. What is written is saved first, so the map adds to it. */
  async function pickOnAtlas() {
    await note.save();
    const short = id.slice("@draft/".length);
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved, with what is picked for after it
    await goto(`${resolve("/draft/[id]", { id: short })}?pick=${encodeURIComponent(short)}`);
    panes.to("atlas");
  }

  /** Send it, and watch Iso read on the map (Desktop-Think). The note opens again when Iso is done. */
  async function send() {
    const request = await iso.send();
    if (!request) return;
    app.watching = request;
    panes.to("atlas");
  }

  async function discard() {
    busy = true;
    try {
      await app.api.discardDraft(id);
      await goto(resolve("/notes"));
    } catch (e) { problem = (e as Error).message; busy = false; }
  }
</script>

<article class="draft">
  {#if note.loaded === "loading"}
    <p class="faint col"><Drawing label="opening" /></p>
  {:else if note.loaded !== "ready"}
    <div class="col"><p class="soft">This note for Iso is not here any more. It was kept as a note, or discarded.</p><p><a href={resolve("/notes")}>all notes</a></p></div>
  {:else}
    <div class="col">
      <div class="mark"><i class="dia open" aria-hidden="true"></i><span class="label">for Iso · not in your base yet</span></div>
      <label class="hidden-label" for="title">Title</label>
      <textarea id="title" class="serif title" rows="1" value={note.fields.title} placeholder="a title for the note" autocomplete="off" readonly={!writing}
        oninput={(e) => note.setFields({ title: e.currentTarget.value.replace(/\s*\n\s*/g, " ") })}
        onkeydown={(e) => { if (e.key === "Enter") e.preventDefault(); }}></textarea>

      {#if writing}
        <NoteEditor {note} source={false} />
      {:else}
        <!-- What you wrote, folded while its answer is on the page. -->
        {#if note.body.trim()}
        <div class="prompt">
          <p class="serif soft" class:fold={!all}>{note.body.trim()}</p>
          <button class="link" type="button" onclick={() => (all = !all)}>{all ? "[ fold ]" : "[ show all ]"}</button>
        </div>
        {/if}
        <div class="between" class:working={Boolean(iso.asking)} aria-live="polite">
          {#if iso.asking}
            {#if iso.asking.text}<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
              <div class="prose said" use:drawn={iso.asking.text}>{@html render(iso.asking.text)}</div>{/if}
            <div class="foot">
              <i class="dia" aria-hidden="true"></i>
              <span class="soft">{iso.asking.text ? "Iso is writing" : "Iso is thinking"}{#if lastStep}<span class="faint"> · {lastStep}</span>{/if}</span>
              <span class="grow"></span>
              <button class="link" type="button" onclick={() => iso.halt()}>[ stop ]</button>
            </div>
          {:else if editing}
            <textarea class="revision" bind:value={editing.text} aria-label="Iso's text, to edit" rows={Math.max(6, editing.text.split("\n").length + 1)}></textarea>
          {:else}<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
            <div class="prose said" use:drawn={{ given: said, copy: true }}>{@html render(said)}</div>
          {/if}
        </div>
      {/if}
      {#if iso.failed}<p class="bad" role="alert">{iso.failed.message}</p>{/if}
      {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
    </div>

    <div class="deck">
      {#if writing}
        <div class="row">
          <span class="label">linked</span>
          {#each linked as n (n.id)}<span class="chip lattice">{n.title}</span>{:else}<span class="faint">no notes yet: type [[ in what you write, or</span>{/each}
          <button class="link" type="button" onclick={pickOnAtlas}>[ + pick on the atlas ]</button>
        </div>
        <div class="row">
          <button class="btn primary tall" type="button" disabled={!note.body.trim()} onclick={send}><i class="dia inverse" aria-hidden="true"></i>send to Iso</button>
          <span class="tiers" role="radiogroup" aria-label="Tier">
            {#each ["low", "mid", "max"] as const as t (t)}<button type="button" role="radio" aria-checked={iso.tier === t} onclick={() => iso.setTier(t)}>{t}</button>{/each}
          </span>
          <span class="grow"></span>
          <button class="link faint" type="button" disabled={busy} onclick={discard}>[ discard ]</button>
        </div>
      {:else if reply}
        <div class="row">
          <button class="btn primary tall" type="button" disabled={busy} onclick={keep}>keep as a note</button>
          <label class="in soft"><span>in</span><input class="field" bind:value={folder} placeholder="the top of the base" list="folders" autocomplete="off" aria-label="Folder" /><span class="faint">/</span></label>
          <datalist id="folders">{#each app.listing.dirs as dir (dir)}<option value={dir}></option>{/each}</datalist>
          <span class="grow"></span>
          {#if editing}<button class="btn edit" type="button" onclick={() => iso.done(reply)}>done</button>{:else}<button class="btn edit" type="button" onclick={() => iso.edit(reply)}>edit</button>{/if}
          <button class="btn danger tall" type="button" disabled={busy} onclick={discard}>discard</button>
        </div>
        <div class="row">
          <span class="label">{reply.cost ? `${reply.cost.tier} · $${reply.cost.usd.toFixed(3)}` : ""}{reply.notice ? ` · ${reply.notice}` : ""}</span>
          <span class="grow"></span>
          <button class="link" type="button" disabled={busy} onclick={() => iso.discard(reply)}>[ back to what I wrote ]</button>
        </div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .draft { display: flex; flex-direction: column; align-items: center; min-height: 100%; }
  .col { width: 100%; max-width: calc(var(--measure) + 2 * var(--space-4)); padding: 56px var(--space-4) 32px; display: flex; flex-direction: column; gap: 18px; flex: 1 1 auto; }
  .mark { display: flex; align-items: center; gap: 10px; }
  .mark .dia { margin-left: 3px; }
  .title { font-size: 34px; line-height: 1.25; font-weight: 400; background: none; border: 0; padding: 0 2px; color: var(--text); resize: none; field-sizing: content; overflow: hidden; }
  .title::placeholder { color: var(--text-faint); }
  .title:focus-visible { outline: none; }
  .prompt { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 0 2px; }
  .prompt p { font-size: var(--text-size); line-height: 1.55; white-space: pre-wrap; }
  .fold { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; font-size: 12px; }
  .link.faint { color: var(--text-faint); }
  .bad { color: var(--rose); }

  .between { position: relative; padding: 16px 2px; display: flex; flex-direction: column; gap: 14px; }
  .between::before, .between::after { content: ""; position: absolute; left: 0; right: 0; height: 2px; background: radial-gradient(circle at 1px 1px, var(--growth) 1px, transparent 1.2px) 0 0 / 8px 2px repeat-x; animation: drift 1.6s linear infinite; }
  .between::before { top: 0; }
  .between::after { bottom: 0; animation-direction: reverse; }
  @keyframes drift { to { background-position: 8px 0; } }
  @media (prefers-reduced-motion: reduce) { .between::before, .between::after { animation: none; } }
  .said { font-size: var(--text-size); line-height: 1.55; }
  .said :global(p), .said :global(section), .said :global(.table-wrap), .said :global(ul), .said :global(ol), .said :global(pre) { margin: 0 0 20px; }
  .said :global(h1), .said :global(h2), .said :global(h3), .said :global(h4) { font-size: 22px; line-height: 1.3; margin: 8px 0 12px; }
  .said :global(h3) { font-size: 19px; } .said :global(h4) { font-size: 17px; }
  .said :global(pre) { font: 13px/20px var(--font-mono); background: var(--ground-1); border-left: 2px solid var(--line-strong); padding: 12px 16px; overflow-x: auto; }
  .said :global(> :last-child) { margin-bottom: 0; }
  .said :global(.katex-display) { margin: 0; }
  .foot { display: flex; align-items: center; gap: 8px; }
  .foot .dia { margin: 0 8px 0 3px; }
  .revision { width: 100%; background: var(--ground-1); border: 0; border-left: 2px solid var(--growth); padding: 8px 12px; resize: vertical; font: 14px/1.6 var(--font-ui); color: var(--text); }
  .revision:focus-visible { outline: none; }

  /* What is done with it: a strip under the text, as wide as the text. */
  .deck { width: 100%; max-width: calc(var(--measure) + 2 * var(--space-4)); padding: 16px var(--space-4) 20px; display: flex; flex-direction: column; gap: 14px; position: sticky; bottom: 28px; background: var(--ground-0); }
  .deck::before { content: ""; position: absolute; top: 0; left: var(--space-4); right: var(--space-4); border-top: 1px solid var(--line); }
  .row { display: flex; align-items: center; gap: 10px 18px; flex-wrap: wrap; }
  .row .chip { height: 28px; }
  .dia.inverse { background: var(--ground-0); }
  .tiers { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; }
  .tiers button { background: none; border: 0; border-bottom: 1px solid transparent; padding: 6px 0; color: var(--text-faint); }
  .tiers button[aria-checked="true"] { color: var(--text); border-bottom-color: var(--growth); }
  .in { display: inline-flex; align-items: center; gap: 8px; }
  .in .field { width: 180px; }
  @media (max-width: 600px) {
    .col { padding: 20px 20px 24px; }
    .title { font-size: 30px; }
    .deck { bottom: 84px; padding: 12px 20px 16px; }
    .in .field { width: 120px; }
  }
</style>
