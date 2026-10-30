<script lang="ts">
  // The terminal's session in Iso's pane, Build mode (M11): each prompt (from the terminal or from here), what the
  // agent said, a line for each tool call (a command with its output, a file with its diff, a look-up in the base
  // with its note), and what it asks before doing, answered here or in the terminal, whichever is first. An agent's
  // session over ACP (M25) is drawn as Iso's were (M24): what was given before a prompt, the crystal growing while it
  // works, and once a turn is over the notes it drew on as parts under the reply, lit with the phrases citing them
  // and with the note on the Atlas when pointed at.
  import Crystal from "./Crystal.svelte";
  import Drawing from "./Drawing.svelte";
  import type { Given, TerminalItem, TerminalPermission, TerminalTurn } from "@isorite/engine";
  import { tick } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { basePage } from "$lib/here.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointedBy, pointing } from "$lib/pointing.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";

  let list = $state<HTMLElement>();
  const view = $derived(terminal.view);
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id;
  /** What a tool did, in a word, as the Iso pane says its own steps. */
  const VERB: Record<string, string> = { shell: "ran", bash: "ran", read: "read", write: "wrote", edit: "edited", glob: "found", grep: "searched", webfetch: "fetched", websearch: "searched the web",
    search_notes: "searched", find_similar: "by meaning", outline_note: "outlined", read_note: "read", brief_base: "looked over", edit_note: "changed", write_note: "wrote" };
  /** A note it changed opens in the note's Iso lens, where its words are marked (and the timeline undoes them). */
  const CHANGES = new Set(["edit_note", "write_note"]);
  function open(name: string, id: string): void { if (CHANGES.has(bare(name))) panes.flip("provenance", true); void panes.open(id, true); }
  /** isorite's own tools, as a harness names those of an MCP server (mcp__isorite__read_note, isorite_read_note). */
  const bare = (name: string): string => name.replace(/^(mcp_+)?isorite[_:]+/, "");
  const verb = (name: string): string => VERB[bare(name)] ?? bare(name).replaceAll("_", " ");
  /** A question back or an offer stands as itself (M25), not as the call that made it. */
  const itself = (i: TerminalItem): boolean => i.kind === "tool" && /^(ask_question|offer_text)$/.test(bare(i.name));
  const WHAT: Record<string, string> = { shell: "run", edit: "edit", write: "write", read: "read", webfetch: "fetch", external_directory: "reach outside the project" };
  const asks = (p: TerminalPermission): string => `${WHAT[p.action] ?? p.action} ${p.resources.join(", ")}`.trim();
  /** The asking that belongs to a tool call, drawn under it; the rest at the turn's end. */
  const askingFor = (id: string) => view?.asking.filter((p) => p.tool === id) ?? [];
  const loose = $derived(view?.asking.filter((p) => !p.tool || !view.turns.some((t) => t.items.some((i) => i.kind === "tool" && i.id === p.tool))) ?? []);

  // Kept at the newest as the session grows.
  $effect(() => { void view; void tick().then(() => { if (list) list.scrollTop = list.scrollHeight; }); });

  /** A note named in the session, under the mouse, is lit on the Atlas (M17): a link in what the agent said, or a
   *  note it read, changed or asked about. */
  function pointAt(e: PointerEvent): void {
    if (e.pointerType !== "mouse" || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>("[data-to], a[href]");
    const to = el?.dataset.to ? { id: el.dataset.to, folder: false } : el instanceof HTMLAnchorElement ? pointedBy(el.getAttribute("href") ?? "") : null;
    pointing.set("iso", to ? { ...to, who: "you" } : null);
  }
  /** What a reply drew on (M24, G): the notes it cites, in the order cited, then the others it read or changed. */
  const CITED = /\]\(\/([^)\s]+?)\.md(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g;
  const known = (id: string): boolean => app.listing.notes.some((n) => n.id === id);
  function drew(t: TerminalTurn): string[] {
    const ids = new Set<string>();
    for (const i of t.items) if (i.kind === "text") for (const m of i.text.matchAll(CITED)) ids.add(decodeURI(m[1]!));
    for (const i of t.items) if (i.kind === "tool" && i.note && !i.base && i.status !== "failed") ids.add(i.note);
    return [...ids].filter(known);
  }
  const folderOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.dir.split("/").at(-1) || "notes";
  /** A read folded into the parts once its turn is over; a change, a command and anything outside the base stay. */
  const folded = (t: TerminalTurn, i: TerminalItem): boolean => t.state !== "running" && i.kind === "tool" && !!i.note && !i.base && !i.diff && i.status === "done" && !CHANGES.has(bare(i.name)) && known(i.note);
  const lit = $derived(pointing.elsewhere?.from === "iso" && !pointing.elsewhere.folder ? pointing.elsewhere.id : pointing.onAtlas);
  $effect(() => {
    const id = lit;
    void view;
    if (!list) return;
    for (const a of list.querySelectorAll<HTMLAnchorElement>(".said a.vein")) a.classList.toggle("lit", !!id && pointedBy(a.getAttribute("href") ?? "")?.id === id);
  });
  const SYM: Record<Given["kind"], string> = { note: "▣", folder: "▭", passage: "“" };
</script>

{#snippet permit(p: TerminalPermission)}
  <div class="permit" role="group" aria-label="The terminal's agent asks before it does this">
    <p>{view?.agent || "The agent"} wants to <code>{asks(p)}</code>.</p>
    <p class="acts"><button type="button" onclick={() => void terminal.reply(p.id, "once")}>Allow once</button><button type="button" onclick={() => void terminal.reply(p.id, "always")}>Always allow this</button><button type="button" class="no" onclick={() => void terminal.reply(p.id, "reject")}>Don't allow</button></p>
  </div>
{/snippet}

{#snippet item(i: TerminalItem)}
  {#if i.kind === "text"}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
    <div class="said prose" use:drawn={{ given: i.text, copy: true }}>{@html render(i.text)}</div>
  {:else if i.kind === "question"}
    <!-- A question the agent asked back through isorite (M25), as Iso's are: a rose ◇ and "keep", which makes it a
         question note, yours. Kept, it is a link to the note. -->
    <div class="asks" data-question={i.id} data-to={i.made ?? `?${i.id}`}>
      <p><svg class="qm" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2.5L13.5 8L8 13.5L2.5 8Z" /></svg>{#if i.made}<button type="button" class="note-link" data-to={i.made} onclick={() => open("read", i.made!)}>{i.title}</button>{:else}<span class="qt">{i.title}</span>
        <button class="keep" type="button" data-lustre aria-label="Keep “{i.title}” as an open question" title="Keep as an open question about {i.about.map(titleOf).join(", ")}" onclick={() => void terminal.take(i.id)}>keep</button>{/if}</p>
      {#if i.text}<p class="qb">{i.text}</p>{/if}
    </div>
  {:else if i.kind === "offer"}
    <!-- Words the agent offered for a note (M25): inserted at the end of it, as yours, or not. -->
    <div class="offer" data-offer={i.id}>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      <div class="prose yours" use:drawn={i.text}>{@html render(i.text)}</div>
      <p class="for">{#if i.note === "AGENTS.md"}<span>AGENTS.md</span>{:else}<button type="button" class="note-link" data-to={i.note} onclick={() => open("read", i.note)}>{titleOf(i.note)}</button>{/if}
        {#if i.taken}<span class="in">inserted</span>{:else}<button class="insert" type="button" aria-label="Insert into {titleOf(i.note)} as yours" onclick={() => void terminal.take(i.id)}>insert</button>{/if}</p>
    </div>
  {:else}
    <div class="tool" data-status={i.status}>
      {#if i.output || i.diff}
        <details>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
          <summary><span class="v">{verb(i.name)}</span>{#if i.note && i.base}<a class="note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>{:else if i.note}<button type="button" class="note-link" data-to={i.note} onclick={(e) => { e.preventDefault(); open(i.name, i.note!); }}>{titleOf(i.note)}</button>{:else}<code class="q">{i.title}</code>{/if}{#if i.diff}<span class="n"><span class="add">+{i.diff.filter((l) => l.startsWith("+")).length}</span> <span class="del">−{i.diff.filter((l) => l.startsWith("-")).length}</span></span>{/if}</summary>
          {#if i.diff}<pre class="diff">{#each i.diff as l, k (k)}<span class:add={l.startsWith("+")} class:del={l.startsWith("-")}>{l}</span>{/each}</pre>
          {:else}<pre class="out">{i.output}</pre>{/if}
        </details>
      {:else}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
        <p class="line"><span class="v">{verb(i.name)}</span>{#if i.note && i.base}<a class="note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>{:else if i.note}<button type="button" class="note-link" data-to={i.note} onclick={() => open(i.name, i.note!)}>{titleOf(i.note)}</button>{:else}<code class="q">{i.title}</code>{/if}</p>
      {/if}
      {#each askingFor(i.id) as p (p.id)}{@render permit(p)}{/each}
    </div>
  {/if}
{/snippet}

<div class="chat" bind:this={list} role="log" aria-label="The terminal's session" aria-live="polite" onpointerover={pointAt} onpointerleave={() => pointing.set("iso", null)}>
  {#if view?.title}<p class="title faint">{view.title}</p>{/if}
  {#each view?.turns ?? [] as t (t.id)}
    {@render turn(t)}
  {/each}
  {#each loose as p (p.id)}{@render permit(p)}{/each}
  {#if !view?.turns.length}
    <p class="faint">{view?.via === "acp" ? `${view.agent || "The agent"}'s session shows here: what is asked in its terminal or here, what it does, and what it asks before doing. Notes put in the tray go before the next prompt.` : `The terminal's session shows here: what is asked there or here, what ${view?.agent || "the agent"} does, and what it asks before doing.`}</p>
  {/if}
  {#if view?.reading}<p class="faint">Kept here; {view.agent} isn't attached to carry it on.</p>{/if}
</div>

{#snippet turn(t: TerminalTurn)}
  <article class="turn" data-state={t.state}>
    <div class="you"><p class="asked">{t.asked}</p>
      {#if t.given?.length}
        <span class="gave">{#each t.given as g, k (k)}<span class="chip" data-to={g.kind === "note" ? g.id : undefined}><span class="k" aria-hidden="true">{SYM[g.kind]}</span><span class="t">{g.kind === "passage" ? g.text : g.kind === "folder" ? g.id || "the base" : titleOf(g.id)}</span></span>{/each}</span>
      {/if}
      <span class="from">{t.from === "here" ? "from here" : "in the terminal"}</span></div>
    {#each t.items as i, k (k)}{#if !itself(i) && !(view?.via === "acp" && folded(t, i))}{@render item(i)}{/if}{/each}
    {#if view?.via === "acp" && t.state !== "running" && drew(t).length}
      <div class="parts" role="group" aria-label="What {view.agent || 'the agent'} drew on">
        {#each drew(t) as id (id)}
          <button type="button" class="part" class:lit={lit === id} data-to={id} data-lustre onclick={() => void panes.open(id, true)}><s aria-hidden="true"></s><b>{titleOf(id)}</b>{folderOf(id)}</button>
        {/each}
      </div>
    {/if}
    {#if t.state === "running"}
      <!-- At work (M24, I): over ACP, the session's crystal grows. -->
      <p class="doing" role="status">{#if view?.via === "acp" && view.session}<Crystal id={view.session} size={28} growing />{:else}<Drawing />{/if}{view?.agent || "The agent"} is at work</p>
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
  .asks { padding-left: 16px; display: grid; gap: 2px; font-size: 13px; }
  .asks p { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .asks .qm { margin-left: -17px; margin-right: 4px; color: var(--rose); flex: none; }
  .asks .qt { color: var(--text); overflow-wrap: anywhere; }
  .asks .note-link { color: var(--text); }
  .asks .qb { color: var(--text-soft); font-size: 12.5px; display: block; }
  .asks .keep { --cut: 5px; flex: none; margin-left: 4px; height: 22px; padding: 0 9px; background: none; border: 1px solid var(--rose); color: var(--rose); font: 10px/20px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; cursor: pointer; --glint: .4; transition: background-color var(--t-ack) var(--ease-out); }
  .asks .keep:hover { background: var(--rose-soft); }
  .offer { margin-left: 16px; border-left: 2px solid var(--line-strong); padding: 2px 0 2px 12px; display: grid; gap: 4px; }
  .offer .yours { font: 15px/1.6 var(--font-text); color: var(--text); overflow-wrap: anywhere; }
  .offer .for { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-faint); }
  .offer .in { color: var(--malachite); }
  .offer .insert { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .doing { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-faint); }
  .gave { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; border: 1px solid var(--line); font-size: 11px; color: var(--text-soft); max-width: 100%; }
  .chip .k { color: var(--growth); }
  .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }
  /* What the agent drew on (M24, G): parts with bracketed corners, lit blue with the phrases that cite them. */
  .parts { display: flex; flex-wrap: wrap; gap: 8px; margin-left: 16px; }
  .part { position: relative; display: grid; gap: 1px; justify-items: start; min-width: 0; max-width: 100%; padding: 6px 10px 5px; background: none; border: 0; text-align: left; font: 10px/14px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); cursor: pointer; --glint: .3; transition: background-color var(--t-ack) var(--ease-out); }
  .part > s { position: absolute; inset: 0; pointer-events: none; --b: var(--line-strong); --l: 6px; background:
    linear-gradient(var(--b), var(--b)) top left / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) top left / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) top right / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) top right / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) bottom left / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom left / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) bottom right / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom right / 1px var(--l) no-repeat; }
  .part b { font: 13px/18px var(--font-text); text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text); overflow-wrap: anywhere; }
  .part:hover > s, .part.lit > s { --b: var(--lattice); }
  .part:hover, .part.lit { background: var(--lattice-soft); }
  .bad { color: var(--rose); font-size: 12px; padding-left: 16px; }
  .end { font-size: 12px; padding-left: 16px; }
</style>
