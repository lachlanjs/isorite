<script lang="ts">
  // An agent's session in Iso's pane (M11; over ACP since M25): each prompt (from its front end or from here), what
  // the agent said, a line for each tool call (a command with its output, a file with its diff, a look-up in the base
  // with its note), and what it asks before doing, answered here or in its front end, whichever is first. Drawn as
  // Iso's turns were (M24): what was given before a prompt, the crystal growing while it works, and once a turn is
  // over the notes it drew on as parts under the reply, lit with the phrases citing them and with the note on the
  // Atlas when pointed at. A conversation with the agent from before M25 is read here the same way.
  import AttachAgent from "./AttachAgent.svelte";
  import Crystal from "./Crystal.svelte";
  import type { Given, TerminalItem, TerminalPermission, TerminalTurn } from "@isorite/engine";
  import { onMount, untrack } from "svelte";
  import { slide } from "svelte/transition";
  import { cubicIn } from "svelte/easing";
  import { app } from "$lib/app.svelte.ts";
  import { basePage } from "$lib/here.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointedBy, pointing } from "$lib/pointing.svelte.ts";
  import { plainAsked, terminal } from "$lib/terminal.svelte.ts";

  let list = $state<HTMLElement>();
  let flow = $state<HTMLElement>();
  const view = $derived(terminal.session);
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id;
  /** What a tool did, in a word, as the Iso pane says its own steps. */
  const VERB: Record<string, string> = { shell: "ran", bash: "ran", read: "read", write: "wrote", edit: "edited", glob: "found", grep: "searched", webfetch: "fetched", websearch: "searched the web",
    search_notes: "searched", find_similar: "by meaning", outline_note: "outlined", read_note: "read", brief_base: "looked over", edit_note: "changed", write_note: "wrote" };
  /** What a tool is doing while it runs, as the line under the turn says it. */
  const DOING: Record<string, string> = { shell: "running", bash: "running", execute: "running", read: "reading", write: "writing", edit: "editing", glob: "finding files", grep: "searching",
    webfetch: "fetching", websearch: "searching the web", search_notes: "searching the notes for", find_similar: "looking by meaning for", outline_note: "outlining", read_note: "reading",
    brief_base: "looking over the base", edit_note: "changing", write_note: "writing" };
  /** The step a running turn is on: a tool by what it is doing and to what, else thinking, writing, or at work. */
  function step(t: TerminalTurn): { what: string; to: string } {
    const last = t.items.at(-1);
    if (last?.kind === "tool" && last.status === "running") return { what: DOING[bare(last.name)] ?? bare(last.name).replaceAll("_", " "), to: last.note ? titleOf(last.note) : last.title };
    if (last?.kind === "thinking") return { what: "thinking", to: "" };
    if (last?.kind === "text") return { what: "writing", to: "" };
    return { what: "at work", to: "" };
  }

  // What the agent is writing comes in bursts, as the server hears it; it is shown at a steady pace that catches up
  // with what has come (a few frames behind, never more), so the reply reads as written rather than dropped in.
  const liveTurn = $derived(view?.turns.at(-1)?.state === "running" && !terminal.old ? view.turns.at(-1)! : null);
  const liveItem = $derived(liveTurn?.items.at(-1));
  const liveKey = $derived(liveTurn && liveItem?.kind === "text" ? `${liveTurn.id}:${liveTurn.items.length - 1}` : "");
  const liveLength = $derived(liveItem?.kind === "text" ? liveItem.text.length : 0);
  let shownLen = $state(0);
  let shownKey: string | null = null;
  const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  $effect(() => {
    const key = liveKey, target = liveLength;
    let frame = 0;
    untrack(() => {
      // Already there when the pane opened: shown whole. New since: from its start.
      if (key !== shownKey) { shownLen = shownKey === null ? target : 0; shownKey = key; }
      if (!key || still()) { shownLen = target; return; }
      if (shownLen > target) shownLen = target;
      const on = () => {
        const left = liveLength - shownLen;
        if (left <= 0) return;
        // About twelve frames to catch up: long enough to carry the text over an agent's short pauses, short
        // enough that it is never far behind.
        shownLen += Math.max(1, Math.ceil(left / 12));
        frame = requestAnimationFrame(on);
      };
      frame = requestAnimationFrame(on);
    });
    return () => cancelAnimationFrame(frame);
  });
  /** The live reply as far as it is shown, ended at a word, not in one, and never in a link or a formula half
   *  written, whose marks would show as typed until it closed. */
  function streamed(text: string): string {
    if (shownLen >= text.length) return text;
    const space = text.slice(shownLen, shownLen + 16).search(/\s/);
    let cut = text.slice(0, shownLen + Math.max(0, space));
    // Inside a code block (an odd number of fences so far) a "[" or a "$" is code, and shown as it comes.
    const inCode = (cut.match(/^```/gm) ?? []).length % 2 === 1;
    if (!inCode) {
      // A link begun and not ended: from its "[" on, held back until its ")" has come.
      const open = cut.lastIndexOf("[");
      if (open > cut.lastIndexOf(")") && !cut.slice(open).includes("\n")) cut = cut.slice(0, open);
      // A formula begun and not ended: an odd number of $ on the line as it now ends.
      const last = cut.slice(cut.lastIndexOf("\n") + 1);
      const dollars = [...last.matchAll(/(?<!\\)\$(?!\d)/g)]; // $5 is money, not a formula
      if (dollars.length % 2 === 1) cut = cut.slice(0, cut.length - last.length + dollars.at(-1)!.index!);
    }
    return cut;
  }

  /** A note it changed opens in the note's Iso lens, where its words are marked (and the timeline undoes them). */
  const CHANGES = new Set(["edit_note", "write_note"]);
  function open(name: string, id: string): void { if (CHANGES.has(bare(name))) panes.flip("provenance", true); void panes.open(id, true); }
  /** isorite's own tools, as a harness names those of an MCP server (mcp__isorite__read_note, isorite_read_note). */
  const bare = (name: string): string => name.replace(/^(mcp_+)?isorite[_:]+/, "");
  const verb = (name: string): string => VERB[bare(name)] ?? bare(name).replaceAll("_", " ");
  /** A question back or an offer stands as itself (M25), not as the call that made it. */
  /** 18200 as 18.2k. */
  const tokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const itself = (i: TerminalItem): boolean => i.kind === "tool" && /^(ask_question|offer_text)$/.test(bare(i.name));
  const WHAT: Record<string, string> = { shell: "run", edit: "edit", write: "write", read: "read", webfetch: "fetch", external_directory: "reach outside the project" };
  const asks = (p: TerminalPermission): string => `${WHAT[p.action] ?? p.action} ${p.resources.join(", ")}`.trim();
  /** The asking that belongs to a tool call, drawn under it; the rest at the turn's end. */
  const askingFor = (id: string) => view?.asking.filter((p) => p.tool === id) ?? [];
  const loose = $derived(view?.asking.filter((p) => !p.tool || !view.turns.some((t) => t.items.some((i) => i.kind === "tool" && i.id === p.tool))) ?? []);

  // Kept at the newest as the session grows, but only while you are there: scrolled up to read, you stay where you
  // are, and a button takes you back down. Followed by size, not by event, so a diagram or a code block that draws
  // after the text has come still ends in view.
  const NEAR = 48;
  let pinned = $state(true);
  let behind = $state(false);
  /** How tall the session was when last measured: whether you were at the end is judged against that, since the
   *  scroll event that says you moved can come after the content has already grown. */
  let height = 0;
  const atEnd = (h: number) => !!list && h - list.scrollTop - list.clientHeight <= NEAR;
  const toEnd = (smooth = false) => { if (list) list.scrollTo({ top: list.scrollHeight, behavior: smooth ? "smooth" : "instant" }); };
  function scrolled(): void {
    if (!list) return;
    pinned = atEnd(list.scrollHeight);
    if (pinned) behind = false;
  }
  function latest(): void { pinned = true; behind = false; toEnd(!matchMedia("(prefers-reduced-motion: reduce)").matches); }
  onMount(() => {
    if (!flow || !list) return;
    height = list.scrollHeight;
    const grew = new ResizeObserver(() => {
      if (!list) return;
      const was = height;
      height = list.scrollHeight;
      if (pinned && atEnd(was)) toEnd();
      else if (height > was) { pinned = false; behind = true; }
    });
    grew.observe(flow);
    toEnd();
    return () => grew.disconnect();
  });
  // Another session shown, or a message sent from here: back to the newest.
  const shownSession = $derived(view?.session ?? null);
  $effect(() => { void shownSession; pinned = true; behind = false; toEnd(); });
  $effect(() => { if (terminal.sending) { pinned = true; behind = false; toEnd(); } });
  /** Why a call the agent asked to make was refused here: a switch in this pane's header is off. */
  const REFUSED = { run: "Not run: running commands is switched off in this pane's header (Alt+R).", files: "Not written: editing the project's files is switched off in this pane's header (Alt+F)." };
  const motion = () => (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260);

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
  /** A read folded into the parts once the next turn has begun; a change, a command and anything outside the base
   *  stay. Not as the turn ends: the reads are then just above the reply being read, and folding them would slide it. */
  const latestTurn = $derived(view?.turns.at(-1)?.id ?? "");
  const folded = (t: TerminalTurn, i: TerminalItem): boolean => t.state !== "running" && t.id !== latestTurn && i.kind === "tool" && !!i.note && !i.base && !i.diff && i.status === "done" && !CHANGES.has(bare(i.name)) && known(i.note);
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
  {@const done = terminal.answered.has(p.id)}
  <div class="permit" role="group" aria-label="The agent asks before it does this">
    <p>{view?.agent || "The agent"} wants to <code>{asks(p)}</code>.</p>
    <p class="acts"><button type="button" disabled={done} onclick={() => void terminal.reply(p.id, "once")}>Allow once</button><button type="button" disabled={done} onclick={() => void terminal.reply(p.id, "always")}>Always allow this</button><button type="button" class="no" disabled={done} onclick={() => void terminal.reply(p.id, "reject")}>Don't allow</button>{#if done}<span class="faint">answered…</span>{/if}</p>
  </div>
{/snippet}

{#snippet item(i: TerminalItem, live: boolean)}
  {#if i.kind === "text"}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
    {@const text = live ? streamed(i.text) : i.text}
    <div class="said prose" use:drawn={{ given: text, copy: true }}>{@html render(text)}</div>
  {:else if i.kind === "thinking"}
    <!-- What the model reasoned (M36): folded, since it is its working and not its answer. -->
    <details class="think"><summary><span class="caret" aria-hidden="true"></span>{live ? "Thinking…" : "Thought"}</summary><p>{i.text}</p></details>
  {:else if i.kind === "compaction"}
    <!-- The earlier conversation shortened so the session fits the model (M36). -->
    <details class="squeeze" data-state={i.state}>
      <summary><span class="caret" aria-hidden="true"></span>{#if i.state === "running"}Summarising the earlier conversation to make room…{:else if i.state === "failed"}Could not summarise the earlier conversation{i.error ? ` (${i.error})` : ""}; carrying on with all of it{:else}Earlier conversation summarised: {tokens(i.before)} → {tokens(i.after ?? 0)} tokens{/if}</summary>
      {#if i.summary}<p>{i.summary}</p>{/if}
    </details>
  {:else if i.kind === "message"}
    <!-- Said while the agent worked (M36): queued until the model has it, then where it came in. -->
    <p class="mid" data-state={i.state} data-mode={i.mode}><span class="how">{i.mode === "steer" ? "steer" : "next"}{i.state === "queued" ? " · waiting" : i.state === "dropped" ? " · not taken up" : ""}</span> {i.text}</p>
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
          <summary><span class="caret" aria-hidden="true"></span><span class="v">{verb(i.name)}</span>{#if i.note && i.base}<a class="note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>{:else if i.note}<button type="button" class="note-link" data-to={i.note} onclick={(e) => { e.preventDefault(); open(i.name, i.note!); }}>{titleOf(i.note)}</button>{:else}<code class="q">{i.title}</code>{/if}{#if i.diff}<span class="n"><span class="add">+{i.diff.filter((l) => l.startsWith("+")).length}</span> <span class="del">−{i.diff.filter((l) => l.startsWith("-")).length}</span></span>{/if}</summary>
          {#if i.diff}<pre class="diff">{#each i.diff as l, k (k)}<span class:add={l.startsWith("+")} class:del={l.startsWith("-")}>{l}</span>{/each}</pre>
          {:else}<pre class="out">{i.output}</pre>{/if}
        </details>
      {:else}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
        <p class="line"><span class="v">{verb(i.name)}</span>{#if i.note && i.base}<a class="note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>{:else if i.note}<button type="button" class="note-link" data-to={i.note} onclick={() => open(i.name, i.note!)}>{titleOf(i.note)}</button>{:else}<code class="q">{i.title}</code>{/if}</p>
      {/if}
      {#if terminal.refusedBy[i.id]}<p class="why">{REFUSED[terminal.refusedBy[i.id]!]}</p>{/if}
      {#each askingFor(i.id) as p (p.id)}{@render permit(p)}{/each}
    </div>
  {/if}
{/snippet}

<div class="wrap">
<div class="chat" bind:this={list} onscroll={scrolled} role="log" aria-label="The agent's session" aria-live="polite" onpointerover={pointAt} onpointerleave={() => pointing.set("iso", null)}>
  <div class="flow" bind:this={flow}>
  {#if view?.title && plainAsked(view.title)}<p class="title faint" title={plainAsked(view.title)}>{plainAsked(view.title)}</p>{/if}
  {#each view?.turns ?? [] as t (t.id)}
    {@render turn(t)}
  {/each}
  {#each loose as p (p.id)}{@render permit(p)}{/each}
  {#if !view?.turns.length}
    <p class="faint">{view?.agent || "The agent"}'s session shows here: what is asked in its front end or here, what it does, and what it asks before doing. Notes put in the tray go before the next prompt.</p>
  {/if}
  {#if terminal.old}<p class="faint">A conversation with the agent, from before isorite attached your own agent: kept to read.</p>
  {:else if view?.reading}<p class="faint">Kept here; {view.agent} isn't attached to carry it on.</p>{/if}
  {#if !terminal.connected}<AttachAgent />{/if}
  </div>
</div>
{#if behind && !pinned}
  <button type="button" class="latest" onclick={latest} title="Back to the newest">
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M4 9l4 4 4-4" /></svg>{terminal.running ? "Following the agent" : "Newest"}
  </button>
{/if}
</div>

{#snippet turn(t: TerminalTurn)}
  <article class="turn" data-state={t.state}>
    <div class="you"><i class="rule" aria-hidden="true"></i><p class="asked">{plainAsked(t.asked)}</p>
      {#if t.given?.length}
        <span class="gave">{#each t.given as g, k (k)}<span class="chip" class:out={t.withdrawn?.includes(k)} title={t.withdrawn?.includes(k) ? "Taken out of the conversation afterwards: the agent is no longer sent it" : undefined} data-to={g.kind === "note" ? g.id : undefined}><span class="k" aria-hidden="true">{SYM[g.kind]}</span><span class="t">{g.kind === "passage" ? g.text : g.kind === "folder" ? g.id || "the base" : titleOf(g.id)}</span></span>{/each}</span>
      {/if}
      <span class="from">{terminal.old ? "" : t.from === "here" ? "from here" : "in its front end"}</span></div>
    {#each t.items as i, k (k)}{#if !itself(i) && !folded(t, i)}<div class="it" out:slide={{ duration: motion(), easing: cubicIn }}>{@render item(i, t.state === "running" && k === t.items.length - 1)}</div>{/if}{/each}
    {#if t.state !== "running" && drew(t).length}
      <div class="parts" role="group" aria-label="What {view?.agent || 'the agent'} drew on">
        {#each drew(t) as id (id)}
          <button type="button" class="part" class:lit={lit === id} data-to={id} data-lustre onclick={() => void panes.open(id, true)}><s aria-hidden="true"></s><b>{titleOf(id)}</b>{folderOf(id)}</button>
        {/each}
      </div>
    {/if}
    {#if t.state === "running"}
      <!-- At work (M24, I): over ACP, the session's crystal grows. -->
      {@const now = step(t)}
      <p class="doing" role="status">{#if view?.session}<Crystal id={view.session} size={28} growing />{/if}<span class="who">{view?.agent || "The agent"}</span><span class="what">is {now.what}{#if now.to}{" "}<b>{now.to}</b>{/if}</span></p>
    {:else if t.state === "stopped"}
      <p class="faint end">stopped</p>
    {:else if t.state === "failed"}
      <p class="bad" role="alert">The turn failed{terminal.old ? "" : `; ${view?.agent || "the agent"} says why in its front end`}.</p>
    {/if}
  </article>
{/snippet}

<style>
  .wrap { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
  .flow { padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .title { font-size: 11px; margin-bottom: -8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Back to the newest, when you have scrolled up and more has come. */
  /* It floats over the session, so it is lifted (the one kind of thing that casts a shadow), and only fades in. */
  .latest { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px 0 10px; background: var(--glass); -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); border: 1px solid var(--line-strong); border-radius: 14px; color: var(--text-soft); font: 11.5px var(--font-ui); cursor: pointer; box-shadow: var(--lift); animation: show var(--t-ack) var(--ease-out); transition: color var(--t-ack) var(--ease-out), border-color var(--t-ack) var(--ease-out); }
  .latest svg { color: var(--lattice); }
  .latest:hover, .latest:focus-visible { color: var(--text); border-color: var(--lattice); }
  /* What comes in, comes in gently: a turn, and each thing in it. */
  /* Motion (docs/taste.md): a line draws, then what it holds shows. A turn's rule draws down its edge in the time of a
     change; its words show as it ends. Each thing the agent does after shows in the same time. */
  .you .rule { animation: draw var(--t-change) var(--ease-out); }
  .you > :not(.rule) { animation: show var(--t-change) var(--ease-out) calc(var(--t-change) / 2) both; }
  .it { animation: show var(--t-change) var(--ease-out); }
  @keyframes draw { from { transform: scaleY(0); } }
  @keyframes show { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .you .rule, .you > *, .it, .latest, .permit, .said::before { animation: none !important; } }
  .it { display: grid; min-width: 0; }
  /* A disclosure says it opens: a caret that turns. */
  /* It stands in the gutter, where a line's mark is: one mark per line, the text in one column. */
  .caret { position: absolute; left: 3px; top: calc(.5lh - 3.5px); width: 0; height: 0; border-left: 4px solid currentColor; border-top: 3.5px solid transparent; border-bottom: 3.5px solid transparent; opacity: .7; transition: transform var(--t-ack, 140ms) var(--ease-out, ease-out); }
  details[open] > summary > .caret { transform: rotate(90deg); }
  summary { position: relative; }
  .tool summary { margin-left: -16px; padding-left: 16px; }
  .tool:has(> details)::before { content: none; }
  .turn { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  /* What you asked: set apart as yours, a block on the ground with a blue rule that draws down its edge as it comes. */
  .you { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 8px 12px 8px 14px; background: var(--ground-1); border: 1px solid var(--line); border-radius: 0 var(--round) var(--round) 0; }
  .you .rule { position: absolute; left: -1px; top: -1px; bottom: -1px; width: 2px; background: var(--lattice); transform-origin: top; }
  .turn:not(:first-of-type) { margin-top: 6px; }
  .think, .squeeze { margin: 0; padding-left: 16px; font-size: 12.5px; color: var(--text-soft); }
  .think summary, .squeeze summary { margin-left: -16px; padding-left: 16px; display: flex; align-items: center; cursor: pointer; font: 11.5px var(--font-mono); color: var(--text-faint); list-style: none; width: fit-content; }
  .think summary:hover, .squeeze summary:hover { color: var(--text-soft); }
  .think summary::-webkit-details-marker, .squeeze summary::-webkit-details-marker { display: none; }
  .think p, .squeeze p { margin: 6px 0 0; padding-left: 10px; border-left: 2px solid var(--line); white-space: pre-wrap; overflow-wrap: anywhere; }
  .squeeze[data-state="failed"] summary { color: var(--rose); }
  .mid { margin: 0; padding-left: 10px; border-left: 2px solid var(--line-strong); color: var(--text); font-size: 13px; overflow-wrap: anywhere; white-space: pre-wrap; }
  .mid[data-state="queued"], .mid[data-state="dropped"] { color: var(--text-faint); }
  .mid[data-state="dropped"] { text-decoration: line-through; }
  .mid .how { font: 11px var(--font-mono); color: var(--text-soft); margin-right: 4px; }
  .asked { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); }
  .from { font-size: 11px; color: var(--text-faint); }
  .from:empty { display: none; }
  .said { padding-left: 16px; position: relative; font: 15px/1.6 var(--font-text); overflow-wrap: anywhere; min-width: 0; }
  /* The agent's words carry its mark, the gold diamond (docs/taste.md), at the height of their first line. */
  .said::before { content: ""; position: absolute; left: 3px; top: calc(.8em - 2.5px); width: 5px; height: 5px; background: var(--growth); transform: rotate(45deg); }
  /* While it writes, its diamond is lit, and breathes. */
  .turn[data-state="running"] .it:has(+ .doing) .said::before { box-shadow: 0 0 8px 1px color-mix(in srgb, var(--growth) 70%, transparent); animation: breathe-glow 1.6s ease-in-out infinite alternate; }
  @keyframes breathe-glow { from { box-shadow: 0 0 3px 0 color-mix(in srgb, var(--growth) 40%, transparent); } }
  .said :global(p + p), .said :global(p + ul), .said :global(ul + p) { margin-top: 8px; }
  .said :global(ul), .said :global(ol) { margin: 0; padding-left: 20px; }
  .said > :global(:last-child), .offer .yours > :global(:last-child) { margin-bottom: 0; }
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
  pre { border-radius: var(--round); margin: 6px 0 0; padding: 8px 10px; background: var(--ground-1); border: 1px solid var(--line); font: 11.5px/1.45 var(--font-mono); color: var(--text-soft); overflow: auto; max-height: 280px; white-space: pre; }
  .diff span { display: block; }
  .diff span:not(.add):not(.del) { color: var(--text-faint); }
  .why { margin: 0; font-size: 11.5px; color: var(--text-soft); }
  .in { color: var(--text-faint); }
  a.note-link { text-decoration: none; }
  .note-link { background: none; border: 0; padding: 0; font: inherit; color: var(--text-soft); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
  .note-link:hover, .note-link:focus-visible { color: var(--lattice); }
  .permit { margin-left: 16px; border: 1px solid var(--growth); border-radius: var(--round); padding: 10px 12px; display: grid; gap: 8px; font-size: 12.5px; color: var(--text-soft); background: color-mix(in srgb, var(--growth) 5%, transparent); animation: ask 1.2s var(--ease-out) 2; }
  /* It asks for you: a glow swells round it twice as it comes, then it waits, lit a little. */
  @keyframes ask { 50% { box-shadow: var(--glow-growth); } }
  .tool .permit { margin-left: 0; }
  .permit code { font: 12px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  .acts { display: flex; gap: 16px; flex-wrap: wrap; }
  .acts button { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .acts button:hover:not(:disabled) { color: var(--text); }
  .acts button:disabled { color: var(--text-faint); cursor: default; }
  .acts .no { color: var(--text-faint); }
  .asks { padding-left: 16px; display: grid; gap: 2px; font-size: 13px; }
  .asks p { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .asks .qm { margin-left: -17px; margin-right: 4px; color: var(--rose); flex: none; }
  .asks .qt { color: var(--text); overflow-wrap: anywhere; }
  .asks .note-link { color: var(--text); }
  .asks .qb { color: var(--text-soft); font-size: 12.5px; display: block; }
  .asks .keep { border-radius: var(--round); --cut: 5px; flex: none; margin-left: 4px; height: 22px; padding: 0 9px; background: none; border: 1px solid var(--rose); color: var(--rose); font: 10px/20px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; cursor: pointer; --glint: .4; transition: background-color var(--t-ack) var(--ease-out); }
  .asks .keep:hover { background: var(--rose-soft); }
  .offer { margin-left: 16px; border-left: 2px solid var(--line-strong); padding: 2px 0 2px 12px; display: grid; gap: 4px; }
  .offer .yours { font: 15px/1.6 var(--font-text); color: var(--text); overflow-wrap: anywhere; }
  .offer .for { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-faint); }
  .offer .in { color: var(--malachite); }
  .offer .insert { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .doing { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-faint); min-width: 0; }
  .doing .who { color: var(--text-soft); flex: none; }
  .doing .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .doing .what b { font-weight: inherit; color: var(--text-soft); }
  .gave { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { border-radius: var(--round); display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; border: 1px solid var(--line); font-size: 11px; color: var(--text-soft); max-width: 100%; }
  .chip.out { text-decoration: line-through; opacity: 0.6; }
  .chip .k { color: var(--growth); }
  .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }
  /* What the agent drew on (M24, G): parts with bracketed corners, lit blue with the phrases that cite them. */
  .parts { display: flex; flex-wrap: wrap; gap: 8px; margin-left: 16px; }
  .part { border-radius: var(--round); position: relative; display: grid; gap: 1px; justify-items: start; min-width: 0; max-width: 100%; padding: 6px 10px 5px; background: none; border: 0; text-align: left; font: 10px/14px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); cursor: pointer; --glint: .3; transition: background-color var(--t-ack) var(--ease-out); }
  .part > s { position: absolute; inset: 0; pointer-events: none; --b: var(--line-strong); --l: 6px; background:
    linear-gradient(var(--b), var(--b)) top left / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) top left / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) top right / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) top right / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) bottom left / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom left / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) bottom right / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom right / 1px var(--l) no-repeat; }
  .part b { font: 13px/18px var(--font-text); text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text); overflow-wrap: anywhere; }
  .part:hover > s, .part.lit > s { --b: var(--lattice); }
  .part:hover, .part.lit { background: var(--lattice-soft); box-shadow: 0 0 12px color-mix(in srgb, var(--lattice) var(--glow-a), transparent); }
  .bad { color: var(--rose); font-size: 12px; padding-left: 16px; }
  .end { font-size: 12px; padding-left: 16px; }
</style>
