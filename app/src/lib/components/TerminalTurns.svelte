<script lang="ts">
  // The terminal's session in Iso's pane, Build mode (M11): each prompt (from the terminal or from here), what the
  // agent said, a line for each tool call (a command with its output, a file with its diff, a look-up in the base
  // with its note), and what it asks before doing, answered here or in the terminal, whichever is first.
  import type { TerminalItem, TerminalPermission, TerminalTurn } from "@isorite/engine";
  import { tick } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { basePage } from "$lib/here.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";

  let list = $state<HTMLElement>();
  const view = $derived(terminal.view);
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id;
  /** What a tool did, in a word, as the Iso pane says its own steps. */
  const VERB: Record<string, string> = { shell: "ran", bash: "ran", read: "read", write: "wrote", edit: "edited", glob: "found", grep: "searched", webfetch: "fetched", websearch: "searched the web",
    search_notes: "searched", find_similar: "by meaning", outline_note: "outlined", read_note: "read", brief_base: "looked over", edit_note: "changed", write_note: "wrote" };
  /** A note it changed opens in the note's Iso lens, where its words are marked (and the timeline undoes them). */
  const CHANGES = new Set(["edit_note", "write_note"]);
  function open(name: string, id: string): void { if (CHANGES.has(name)) panes.flip("provenance", true); void panes.open(id, true); }
  const verb = (name: string): string => VERB[name] ?? name.replaceAll("_", " ");
  const WHAT: Record<string, string> = { shell: "run", edit: "edit", write: "write", read: "read", webfetch: "fetch", external_directory: "reach outside the project" };
  const asks = (p: TerminalPermission): string => `${WHAT[p.action] ?? p.action} ${p.resources.join(", ")}`.trim();
  /** The asking that belongs to a tool call, drawn under it; the rest at the turn's end. */
  const askingFor = (id: string) => view?.asking.filter((p) => p.tool === id) ?? [];
  const loose = $derived(view?.asking.filter((p) => !p.tool || !view.turns.some((t) => t.items.some((i) => i.kind === "tool" && i.id === p.tool))) ?? []);

  // Kept at the newest as the session grows.
  $effect(() => { void view; void tick().then(() => { if (list) list.scrollTop = list.scrollHeight; }); });
</script>

{#snippet permit(p: TerminalPermission)}
  <div class="permit" role="group" aria-label="The terminal's agent asks before it does this">
    <p>OpenCode wants to <code>{asks(p)}</code>.</p>
    <p class="acts"><button type="button" onclick={() => void terminal.reply(p.id, "once")}>Allow once</button><button type="button" onclick={() => void terminal.reply(p.id, "always")}>Always allow this</button><button type="button" class="no" onclick={() => void terminal.reply(p.id, "reject")}>Don't allow</button></p>
  </div>
{/snippet}

{#snippet item(i: TerminalItem)}
  {#if i.kind === "text"}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
    <div class="said prose" use:drawn={{ given: i.text, copy: true }}>{@html render(i.text)}</div>
  {:else}
    <div class="tool" data-status={i.status}>
      {#if i.output || i.diff}
        <details>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
          <summary><span class="v">{verb(i.name)}</span>{#if i.note && i.base}<a class="note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>{:else if i.note}<button type="button" class="note-link" onclick={(e) => { e.preventDefault(); open(i.name, i.note!); }}>{titleOf(i.note)}</button>{:else}<code class="q">{i.title}</code>{/if}{#if i.diff}<span class="n"><span class="add">+{i.diff.filter((l) => l.startsWith("+")).length}</span> <span class="del">−{i.diff.filter((l) => l.startsWith("-")).length}</span></span>{/if}</summary>
          {#if i.diff}<pre class="diff">{#each i.diff as l, k (k)}<span class:add={l.startsWith("+")} class:del={l.startsWith("-")}>{l}</span>{/each}</pre>
          {:else}<pre class="out">{i.output}</pre>{/if}
        </details>
      {:else}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
        <p class="line"><span class="v">{verb(i.name)}</span>{#if i.note && i.base}<a class="note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>{:else if i.note}<button type="button" class="note-link" onclick={() => open(i.name, i.note!)}>{titleOf(i.note)}</button>{:else}<code class="q">{i.title}</code>{/if}</p>
      {/if}
      {#each askingFor(i.id) as p (p.id)}{@render permit(p)}{/each}
    </div>
  {/if}
{/snippet}

<div class="chat" bind:this={list} role="log" aria-label="The terminal's session" aria-live="polite">
  {#if view?.title}<p class="title faint">{view.title}</p>{/if}
  {#each view?.turns ?? [] as t (t.id)}
    {@render turn(t)}
  {/each}
  {#each loose as p (p.id)}{@render permit(p)}{/each}
  {#if !view?.turns.length}
    <p class="faint">The terminal's session shows here: what is asked there or here, what OpenCode does, and what it asks before doing.</p>
  {/if}
</div>

{#snippet turn(t: TerminalTurn)}
  <article class="turn" data-state={t.state}>
    <div class="you"><p class="asked">{t.asked}</p><span class="from">{t.from === "here" ? "from here" : "in the terminal"}</span></div>
    {#each t.items as i, k (k)}{@render item(i)}{/each}
    {#if t.state === "running"}
      <p class="doing" role="status"><i class="spin" aria-hidden="true"></i>OpenCode is at work</p>
    {:else if t.state === "stopped"}
      <p class="faint end">stopped</p>
    {:else if t.state === "failed"}
      <p class="bad" role="alert">The turn failed; the terminal says why.</p>
    {/if}
  </article>
{/snippet}

<style>
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .title { font-size: 11px; margin-bottom: -8px; }
  .turn { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .you { padding-left: 16px; position: relative; display: flex; flex-direction: column; gap: 4px; }
  .you::before { content: "›"; position: absolute; left: 0; top: 0; color: var(--lattice); }
  .asked { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); }
  .from { font-size: 11px; color: var(--text-faint); }
  .said { padding-left: 16px; position: relative; font: 15px/1.6 var(--font-text); overflow-wrap: anywhere; min-width: 0; }
  .said::before { content: "▸"; position: absolute; left: 0; top: 1px; font: 11px var(--font-ui); color: var(--growth); }
  .said :global(p + p), .said :global(p + ul), .said :global(ul + p) { margin-top: 8px; }
  .said :global(ul), .said :global(ol) { margin: 0; padding-left: 20px; }
  .said :global(pre) { overflow-x: auto; }
  .tool { padding-left: 16px; font-size: 12px; color: var(--text-faint); position: relative; min-width: 0; display: grid; gap: 6px; }
  .tool::before { content: "·"; position: absolute; left: 4px; top: 0; }
  .tool[data-status="running"]::before { content: "○"; left: 1px; color: var(--growth); }
  .tool[data-status="failed"] .v { color: var(--rose); }
  summary, .line { display: flex; gap: 8px; align-items: baseline; min-width: 0; cursor: default; list-style: none; }
  summary { cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  .v { color: var(--text-soft); min-width: 5.5em; flex: none; }
  .q { font: 11.5px var(--font-mono); color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .n { flex: none; }
  .add { color: var(--malachite); }
  .del { color: var(--rose); }
  pre { margin: 6px 0 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); color: var(--text-soft); overflow: auto; max-height: 280px; white-space: pre; }
  .diff span { display: block; }
  .in { color: var(--text-faint); }
  a.note-link { text-decoration: none; }
  .note-link { background: none; border: 0; padding: 0; font: inherit; color: var(--text-soft); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
  .note-link:hover, .note-link:focus-visible { color: var(--lattice); }
  .permit { margin-left: 16px; border: 1px solid var(--growth); padding: 10px 12px; display: grid; gap: 8px; font-size: 12.5px; color: var(--text-soft); }
  .tool .permit { margin-left: 0; }
  .permit code { font: 12px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  .acts { display: flex; gap: 16px; flex-wrap: wrap; }
  .acts button { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .acts button:hover { color: var(--text); }
  .acts .no { color: var(--text-faint); }
  .doing { padding-left: 16px; font-size: 12px; color: var(--text-faint); position: relative; }
  .doing .spin { position: absolute; left: 1px; top: 4px; width: 8px; height: 8px; border: 1px solid var(--growth); animation: spin 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .bad { color: var(--rose); font-size: 12px; padding-left: 16px; }
  .end { font-size: 12px; padding-left: 16px; }
  @media (prefers-reduced-motion: reduce) { .doing .spin { animation: none; } }
</style>
