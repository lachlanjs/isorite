<script lang="ts" module>
  /** Where you were reading in each session, while the pane shows the drawer or the context in its place: back to it,
   *  you are there again, not at the end. A session you were at the end of is not kept, and goes on following. */
  const kept = new Map<string, number>();
  /** What a tool call is, as its glyph says it. */
  export type Kind = "read" | "outline" | "search" | "edit" | "write" | "run" | "web" | "brief" | "file" | "other";
</script>

<script lang="ts">
  // The agent's session in the pane: each prompt (what you wrote, its pointers as chips), what the agent said, a row for
  // each tool call (a glyph, what it acted on, and at the right an edit's lines and how long it took; opened, its
  // output or diff), runs of look-ups folded into one row, and what it asks before doing. While a turn runs, a line
  // under it names the step with the time so far; once over, the line says how long it took and what it did, and a
  // turn that changed notes has a bar to review them or put them back. Drawn as the agent's turns were (M24): the crystal
  // growing while it works, and the notes it drew on as parts under the reply, lit with the phrases citing them.
  import AttachAgent from "./AttachAgent.svelte";
  import Crystal from "./Crystal.svelte";
  import type { Given, TerminalItem, TerminalPermission, TerminalTurn } from "@isorite/engine";
  import { onMount, untrack } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { basePage } from "$lib/here.ts";
  import { render } from "$lib/markdown.ts";
  import { drawn } from "$lib/drawn.ts";
  import { foldAway } from "$lib/motion.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointedBy, pointing } from "$lib/pointing.svelte.ts";
  import { NOTE_CHANGES, askedOf, bareTool as bare, changedIn, failure, plainAsked, terminal } from "$lib/terminal.svelte.ts";

  let list = $state<HTMLElement>();
  let flow = $state<HTMLElement>();
  const view = $derived(terminal.session);
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1) ?? id;

  // ------------------------------------------------------------ what a tool is

  const KIND: Record<string, Kind> = { read_note: "read", outline_note: "outline", search_notes: "search", find_similar: "search", brief_base: "brief", edit_note: "edit", write_note: "write",
    read: "file", ls: "file", glob: "search", grep: "search", find: "search", edit: "edit", write: "write", bash: "run", shell: "run", execute: "run", webfetch: "web", websearch: "web", read_data: "file", read_artifact: "file", write_artifact: "write", artifact_recipe: "brief" };
  const kindOf = (name: string): Kind => KIND[bare(name)] ?? "other";
  /** What a tool did, in a word: said by the row's name and tooltip, not printed. */
  const VERB: Record<string, string> = { shell: "Ran", bash: "Ran", execute: "Ran", read: "Read", ls: "Listed", write: "Wrote", edit: "Edited", glob: "Found", grep: "Searched", find: "Found", webfetch: "Fetched", websearch: "Searched the web",
    search_notes: "Searched", find_similar: "Looked by meaning for", outline_note: "Outlined", read_note: "Read", brief_base: "Looked over the base", edit_note: "Changed", write_note: "Wrote", read_data: "Read", read_artifact: "Read", write_artifact: "Wrote", artifact_recipe: "Read the recipe" };
  const verb = (name: string): string => VERB[bare(name)] ?? bare(name).replaceAll("_", " ");
  /** What a tool is doing while it runs, as the line under the turn says it. */
  const DOING: Record<string, string> = { shell: "Running", bash: "Running", execute: "Running", read: "Reading", write: "Writing", edit: "Editing", glob: "Finding files", grep: "Searching", find: "Finding files", ls: "Listing",
    webfetch: "Fetching", websearch: "Searching the web", search_notes: "Searching for", find_similar: "Looking by meaning for", outline_note: "Outlining", read_note: "Reading",
    brief_base: "Looking over the base", edit_note: "Changing", write_note: "Writing", ask_question: "Asking a question", offer_text: "Offering words" };
  /** The tools that look and change nothing: a run of them folds into one row. */
  const LOOKS = new Set<Kind>(["read", "outline", "search", "brief", "file", "web"]);

  /** A query as the person would say it: what isorite added to a prompt (the handoff's preamble, footnote marks) is not
   *  part of it. */
  const words = (q: string): string => q.replace(/^From my isorite knowledge base\.[^\n]*\n*/i, "").replace(/\[\^\d+\]:?/g, "").replace(/\s+/g, " ").trim();
  const target = (i: Extract<TerminalItem, { kind: "tool" }>): string => (i.note ? titleOf(i.note) : kindOf(i.name) === "search" ? `“${words(i.title)}”` : i.title);
  const adds = (d: string[]): number => d.filter((l) => l.startsWith("+")).length;
  const dels = (d: string[]): number => d.filter((l) => l.startsWith("-")).length;
  /** 400 as 0.4s, 72000 as 1m 12s. */
  function took(ms: number): string {
    if (ms < 100) return "<0.1s";
    if (ms < 60_000) return `${ms < 10_000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }
  /** Why a call failed when the reason is a switch of this pane: said under it, with the switch to turn on. */
  function blocked(i: Extract<TerminalItem, { kind: "tool" }>): "run" | "files" | null {
    const by = terminal.refusedBy[i.id];
    if (by) return by;
    if (i.status !== "failed") return null;
    const k = kindOf(i.name);
    if (k === "run" && !panes.on.run) return "run";
    if ((bare(i.name) === "edit" || bare(i.name) === "write") && !panes.on.files) return "files";
    return null;
  }
  const BLOCKED = { run: "Blocked: commands are off.", files: "Blocked: file edits are off." };

  /** The step a running turn is on: a tool by what it is doing and to what, else thinking, writing, or at work. */
  function step(t: TerminalTurn): { what: string; to: string } {
    const last = t.items.at(-1);
    if (last?.kind === "tool" && last.status === "running") return { what: DOING[bare(last.name)] ?? bare(last.name).replaceAll("_", " "), to: target(last) };
    if (last?.kind === "thinking") return { what: "Thinking", to: "" };
    if (last?.kind === "text" && last.text) return { what: "Writing", to: "" };
    return { what: "Working", to: "" };
  }
  /** What a turn did, once over: how many notes it read, what it changed, how many commands it ran. */
  function did(t: TerminalTurn): string {
    const tools = t.items.filter((i): i is Extract<TerminalItem, { kind: "tool" }> => i.kind === "tool");
    const read = new Set(tools.filter((i) => i.note && (kindOf(i.name) === "read" || kindOf(i.name) === "outline")).map((i) => i.note)).size;
    const changed = changedIn(t).length, ran = tools.filter((i) => kindOf(i.name) === "run" && i.status === "done").length;
    return [read ? `read ${read}` : "", changed ? `changed ${changed}` : "", ran ? `ran ${ran}` : ""].filter(Boolean).join(" · ");
  }

  // ------------------------------------------------------------ the time a turn has run

  let now = $state(Date.now());
  $effect(() => {
    if (!terminal.running) return;
    now = Date.now();
    const t = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(t);
  });
  /** When each running turn was first seen here: the server's clock and this one may differ, so the time shown counts
   *  from whichever is later. */
  const seenAt = new Map<string, number>();
  function elapsed(t: TerminalTurn): number {
    if (!seenAt.has(t.id)) seenAt.set(t.id, Date.now());
    const from = t.at ? Math.min(Date.parse(t.at), seenAt.get(t.id)!) : seenAt.get(t.id)!;
    return Math.max(0, now - Math.max(from, seenAt.get(t.id)! - 60_000));
  }

  // ------------------------------------------------------------ the live reply, at a steady pace

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

  /** A note it changed opens in the note's provenance lens, where its words are marked (and the timeline undoes them). */
  function open(name: string, id: string): void { if (NOTE_CHANGES.has(bare(name))) panes.flip("provenance", true); void panes.open(id, true); }
  function review(t: TerminalTurn): void { const [first] = changedIn(t); if (first) open("edit_note", first); }
  /** A question back or an offer stands as itself (M25), not as the call that made it. */
  const itself = (i: TerminalItem): boolean => i.kind === "tool" && /^(ask_question|offer_text)$/.test(bare(i.name));
  const WHAT: Record<string, string> = { shell: "run", bash: "run", edit: "edit", write: "write", read: "read", webfetch: "fetch", external_directory: "reach outside the project" };
  const asks = (p: TerminalPermission): string => `${WHAT[p.action] ?? p.action} ${p.resources.join(", ")}`.trim();
  /** The asking that belongs to a tool call, drawn under it; the rest at the turn's end. */
  const askingFor = (id: string) => view?.asking.filter((p) => p.tool === id) ?? [];
  const loose = $derived(view?.asking.filter((p) => !p.tool || !view.turns.some((t) => t.items.some((i) => i.kind === "tool" && i.id === p.tool))) ?? []);
  /** 18200 as 18.2k. */
  const tokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  // ------------------------------------------------------------ following the newest

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
  /** Where you are, kept as you scroll: by the time the session is put away, it is out of the page and says 0. */
  let top = 0;
  function scrolled(): void {
    if (!list) return;
    top = list.scrollTop;
    // On its way to the newest (the button): not yet there is not scrolled away. Judged against the height last
    // measured, not the height now: the reply may have grown since the scroll that brought you to its end, and that
    // growth, not yet followed, is not you scrolling away (it was, and the pane stopped following a reply as it came).
    pinned = heading || atEnd(Math.min(height, list.scrollHeight));
    if (pinned) behind = false;
  }
  /** Scrolling smoothly to the newest after the button: the session may grow on the way, and the scroll then goes on to the new end. */
  let heading = false;
  function latest(): void { pinned = true; behind = false; heading = !still(); toEnd(heading); }
  onMount(() => {
    if (!flow || !list) return;
    height = list.scrollHeight;
    const grew = new ResizeObserver(() => {
      if (!list) return;
      const was = height;
      height = list.scrollHeight;
      if (heading) toEnd(false);
      else if (pinned && atEnd(was)) toEnd();
      else if (height > was) { pinned = false; behind = true; }
    });
    grew.observe(flow);
    // The way ends where the scroll does, or where a hand takes it.
    const arrived = () => { heading = false; };
    list.addEventListener("scrollend", arrived);
    list.addEventListener("wheel", arrived, { passive: true });
    list.addEventListener("touchstart", arrived, { passive: true });
    // The pane itself made shorter (the box grown by a few lines, a line said under it): still at the end if you were.
    const shrank = new ResizeObserver(() => { if (pinned) toEnd(); });
    shrank.observe(list);
    return () => {
      grew.disconnect();
      list?.removeEventListener("scrollend", arrived);
      list?.removeEventListener("wheel", arrived);
      list?.removeEventListener("touchstart", arrived);
      shrank.disconnect();
      const s = untrack(() => view?.session);
      if (s) { if (pinned) kept.delete(s); else kept.set(s, top); }
    };
  });
  // Another session shown, or a message sent from here: back to the newest. Shown again after the drawer or the
  // context: where you were.
  const shownSession = $derived(view?.session ?? null);
  let shownBefore: string | null | undefined;
  $effect(() => {
    const s = shownSession;
    untrack(() => {
      const first = shownBefore === undefined;
      if (!first && s === shownBefore) return;
      shownBefore = s;
      const at = first && s ? kept.get(s) : undefined;
      if (at !== undefined && list) { list.scrollTop = at; pinned = atEnd(list.scrollHeight); return; }
      pinned = true; behind = false; toEnd();
    });
  });
  $effect(() => { if (terminal.sending) { pinned = true; behind = false; toEnd(); } });

  // ------------------------------------------------------------ notes named, lit on the Atlas

  /** A note named in the session, under the mouse, is lit on the Atlas (M17): a link in what the agent said, or a
   *  note it read, changed or asked about. */
  function pointAt(e: PointerEvent): void {
    if (e.pointerType !== "mouse" || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>("[data-to], a[href]");
    const to = el?.dataset.to ? { id: el.dataset.to, folder: false } : el instanceof HTMLAnchorElement ? pointedBy(el.getAttribute("href") ?? "") : null;
    pointing.set("agent", to ? { ...to, who: "you" } : null);
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
  const folded = (t: TerminalTurn, i: TerminalItem): boolean => t.state !== "running" && t.id !== latestTurn && i.kind === "tool" && !!i.note && !i.base && !i.diff && i.status === "done" && !NOTE_CHANGES.has(bare(i.name)) && known(i.note);
  const lit = $derived(pointing.elsewhere?.from === "agent" && !pointing.elsewhere.folder ? pointing.elsewhere.id : pointing.onAtlas);
  $effect(() => {
    const id = lit;
    void view;
    if (!list) return;
    for (const a of list.querySelectorAll<HTMLAnchorElement>(".said a.vein")) a.classList.toggle("lit", !!id && pointedBy(a.getAttribute("href") ?? "")?.id === id);
  });
  const SYM: Record<Given["kind"], string> = { note: "▣", folder: "▭", passage: "“" };

  // ------------------------------------------------------------ a turn's rows

  type Tool = Extract<TerminalItem, { kind: "tool" }>;
  type Row = { kind: "one"; i: TerminalItem; k: number } | { kind: "run"; tools: { i: Tool; k: number }[] };
  /** A turn's items as rows: a run of two or more look-ups is one row (opened, each of them). */
  function rowsOf(t: TerminalTurn): Row[] {
    const out: Row[] = [];
    let run: { i: Tool; k: number }[] = [];
    const flush = () => { if (run.length > 1) out.push({ kind: "run", tools: run }); else for (const r of run) out.push({ kind: "one", i: r.i, k: r.k }); run = []; };
    t.items.forEach((i, k) => {
      if (itself(i) || folded(t, i)) return;
      if (i.kind === "tool" && LOOKS.has(kindOf(i.name)) && !blocked(i) && !askingFor(i.id).length) { run.push({ i, k }); return; }
      flush();
      out.push({ kind: "one", i, k });
    });
    flush();
    return out;
  }
  /** A run of look-ups, in a few words: "Read 3 notes · searched 2". */
  function sumUp(tools: { i: Tool }[]): string {
    const n = (k: Kind[]) => tools.filter(({ i }) => k.includes(kindOf(i.name))).length;
    const notes = n(["read", "outline"]), searched = n(["search"]), files = n(["file"]), other = tools.length - notes - searched - files;
    const parts = [notes ? `read ${notes} note${notes === 1 ? "" : "s"}` : "", searched ? `searched ${searched === 1 ? "once" : `${searched} times`}` : "", files ? `${files} file${files === 1 ? "" : "s"}` : "", other ? `${other} more` : ""].filter(Boolean).join(" · ");
    return parts.charAt(0).toUpperCase() + parts.slice(1);
  }

  // ------------------------------------------------------------ the person's prompt

  /** What was asked, for showing: the handoff's preamble gone, and each footnote mark a pointer chip where it stood. */
  type Piece = { text: string } | { n: number; where: string; quote: string; id: string | null; chip: string };
  /** What was asked, as Markdown: rendered as the agent's replies are (maths, code, lists, links), by render(), whose
   *  markdown-it takes no HTML and whose output is sanitised, so nothing typed is ever read as markup. Each pointer
   *  stands in it as a private-use mark while it is rendered, and chipsIn puts its chip back in that place. */
  const markedAsked = (ps: Piece[]): string => ps.map((p, k) => ("text" in p ? p.text : `\uE000${k}\uE001`)).join("");
  function chipsIn(node: HTMLElement, ps: Piece[]) {
    const put = (list: Piece[]): void => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), found: Text[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\uE000\d+\uE001/.test(n.nodeValue ?? "")) found.push(n as Text);
      for (const text of found) {
        const parts = (text.nodeValue ?? "").split(/\uE000(\d+)\uE001/);
        const out = parts.map((part, i) => {
          if (i % 2 === 0) return document.createTextNode(part);
          const p = list[Number(part)];
          return p && !("text" in p) ? chipEl(p) : document.createTextNode("");
        });
        text.replaceWith(...out);
      }
    };
    put(ps);
    return { update: put };
  }
  /** A pointer's chip in what was asked: where it points, said on it; pressed, its note opens. */
  function chipEl(p: Exclude<Piece, { text: string }>): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pt ref";
    if (p.id) b.dataset.to = p.id;
    b.title = `${p.where}${p.quote ? `\n${p.quote}` : ""}`;
    b.innerHTML = '<span class="pt-face"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 6h6.5M6 3l3 3-3 3" /></svg><span class="pt-text"></span></span>';
    b.querySelector(".pt-text")!.textContent = p.chip;
    return b;
  }
  function chipClicked(e: MouseEvent): void {
    const to = e.target instanceof Element ? e.target.closest<HTMLElement>(".pt.ref")?.dataset.to : undefined;
    if (to) void panes.open(to, true);
  }
  function pieces(asked: string): Piece[] {
    const a = askedOf(asked);
    const body = a.body.replace(/^From my isorite knowledge base\.[^\n]*(\n+|$)/i, "");
    return body.split(/(\[\^\d+\])/).filter(Boolean).map((part): Piece => {
      const m = /^\[\^(\d+)\]$/.exec(part), r = m ? a.notes.find((x) => x.n === Number(m[1])) : undefined;
      if (!r) return { text: part };
      const note = /^\/(.+)\.md(?: L(\d+(?:–\d+)?))?/.exec(r.where), code = /^(\S+) L(\d+(?:–\d+)?)/.exec(r.where);
      const short = (t: string): string => (t.length > 16 ? `${t.slice(0, 15).trimEnd()}…` : t);
      const chip = note ? `${short(titleOf(note[1]!))}${note[2] ? ` · ${note[2]}` : ""}` : code ? `${short(code[1]!.split("/").at(-1)!)} · ${code[2]}` : /answer/.test(r.where) ? "the answer" : short(r.where.replace(/^\/|\/$/g, ""));
      return { n: r.n, where: r.where, quote: r.quote, id: note ? note[1]! : null, chip };
    });
  }
</script>

{#snippet glyph(k: Kind)}
  <svg class="g" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    {#if k === "read"}<path d="M8 4.5C6.5 3.4 4.4 3.2 2.5 3.8v8.8c1.9-.6 4-.4 5.5.7 1.5-1.1 3.6-1.3 5.5-.7V3.8c-1.9-.6-4-.4-5.5.7zM8 4.5v8.8" />
    {:else if k === "outline"}<path d="M3 4h10M5.5 7h7.5M5.5 10h7.5M3 13h10" />
    {:else if k === "search"}<circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" />
    {:else if k === "edit"}<path d="M3 13l.8-3.2 6.9-6.9 2.4 2.4-6.9 6.9zM9.4 4.2l2.4 2.4" />
    {:else if k === "write"}<path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3M6.5 10h3M8 8.5v3" />
    {:else if k === "run"}<path d="M3 5l3 3-3 3M8 11.5h5" />
    {:else if k === "web"}<circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c-2.2 2.4-2.2 8.6 0 11M8 2.5c2.2 2.4 2.2 8.6 0 11" />
    {:else if k === "brief"}<path d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6" />
    {:else if k === "file"}<path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" />
    {:else}<path d="M8 3.5L12.5 8 8 12.5 3.5 8z" />{/if}
  </svg>
{/snippet}

{#snippet meta(i: Tool)}
  <span class="meta">
    {#if i.diff?.length}<span class="n"><span class="add">+{adds(i.diff)}</span> <span class="del">−{dels(i.diff)}</span></span>{/if}
    {#if i.status === "running"}<i class="busy" aria-label="running"></i>
    {:else if i.status === "failed"}<span class="x" aria-label="failed">✕</span>
    {:else if i.ms !== undefined}<span class="ms">{took(i.ms)}</span>{/if}
  </span>
{/snippet}

{#snippet aim(i: Tool)}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- another base's page, not in this app -->
  {#if i.note && i.base}<a class="to note-link" href={basePage(i.base, `#/n/${i.note}`)} data-sveltekit-reload target="_blank" rel="noopener" title="In {i.base}, in a tab of its own"><span class="in">{i.base}:</span> {i.note}</a>
  {:else if i.note}<button type="button" class="to note-link" data-to={i.note} title="Open {titleOf(i.note)}" onclick={(e) => { e.preventDefault(); open(i.name, i.note!); }}>{titleOf(i.note)}</button>
  {:else}<span class="to q" class:mono={kindOf(i.name) === "run" || kindOf(i.name) === "file"} title={i.title}>{target(i)}</span>{/if}
{/snippet}

{#snippet permit(p: TerminalPermission)}
  {@const done = terminal.answered.has(p.id)}
  <div class="permit" class:done role="group" aria-label="The agent asks before it does this">
    <p><code>{asks(p)}</code></p>
    {#if done}<p class="faint">Answered</p>
    {:else}<p class="acts"><button type="button" class="btn primary" onclick={() => void terminal.reply(p.id, "once")}>Allow</button><button type="button" class="btn" onclick={() => void terminal.reply(p.id, "always")}>Always</button><button type="button" class="btn quiet" onclick={() => void terminal.reply(p.id, "reject")}>Deny</button></p>{/if}
  </div>
{/snippet}

{#snippet tool(i: Tool)}
  {@const off = blocked(i)}
  <div class="tool" data-status={i.status} data-kind={kindOf(i.name)}>
    {#if i.output || i.diff?.length}
      <details>
        <summary class="row" title="{verb(i.name)} {i.note ? titleOf(i.note) : i.title}">{@render glyph(kindOf(i.name))}<span class="hidden-label">{verb(i.name)}</span>{@render aim(i)}{@render meta(i)}<span class="caret" aria-hidden="true"></span></summary>
        {#if i.diff?.length}<pre class="diff">{#each i.diff as l, k (k)}<span class:add={l.startsWith("+")} class:del={l.startsWith("-")}>{l}</span>{/each}</pre>
        {:else}<pre class="out">{i.output}</pre>{/if}
      </details>
    {:else}
      <p class="row" title="{verb(i.name)} {i.note ? titleOf(i.note) : i.title}">{@render glyph(kindOf(i.name))}<span class="hidden-label">{verb(i.name)}</span>{@render aim(i)}{@render meta(i)}</p>
    {/if}
    {#if off}<p class="why">{BLOCKED[off]} <button type="button" class="link" onclick={() => panes.flip(off, true)}>Turn on</button></p>{/if}
    {#each askingFor(i.id) as p (p.id)}{@render permit(p)}{/each}
  </div>
{/snippet}

{#snippet item(i: TerminalItem, live: boolean, failed: boolean)}
  {#if i.kind === "text"}
    {#if !(failed && /^\(.*\)$/s.test(i.text))}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render() -->
      {@const text = live ? streamed(i.text) : i.text}
      <div class="said prose" use:drawn={{ given: text, copy: true }}>{@html render(text)}</div>
    {/if}
  {:else if i.kind === "thinking"}
    <!-- What the model reasoned (M36): folded, since it is its working and not its answer. -->
    <details class="think"><summary><span class="caret" aria-hidden="true"></span>{live ? "Thinking…" : "Thought"}</summary><p>{i.text}</p></details>
  {:else if i.kind === "compaction"}
    <!-- The earlier conversation shortened so the session fits the model (M36), or because the person asked (/compact). -->
    {@const freed = Math.max(0, i.before - (i.after ?? i.before))}
    <details class="squeeze" data-state={i.state} data-asked={i.asked ? "" : undefined}>
      <summary><span class="caret" aria-hidden="true"></span>{#if i.state === "running"}Compacting…{:else if i.state === "failed"}Could not compact{i.error ? ` (${i.error})` : ""}; carrying on with all of it{:else}Compacted {tokens(i.before)} → {tokens(i.after ?? 0)} tokens{freed ? `, ${tokens(freed)} freed` : ""}{/if}</summary>
      {#if i.summary}<p>{i.summary}</p>{/if}
    </details>
  {:else if i.kind === "message"}
    <!-- Said while the agent worked (M36): queued until the model has it, then where it came in. -->
    <p class="mid" data-state={i.state} data-mode={i.mode}><span class="how">{i.mode === "steer" ? "steer" : "next"}{i.state === "queued" ? " · waiting" : i.state === "dropped" ? " · not taken up" : ""}</span> {i.text}</p>
  {:else if i.kind === "question"}
    <!-- A question the agent asked back through isorite (M25): made a question note at once where agents may write
         notes (a link to it), else kept by "keep". -->
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
    {@render tool(i)}
  {/if}
{/snippet}

<div class="wrap">
<div class="chat" bind:this={list} onscroll={scrolled} role="log" aria-label="The agent's session" aria-live="polite" onpointerover={pointAt} onpointerleave={() => pointing.set("agent", null)}>
  <div class="flow" bind:this={flow} data-point="turn">
  {#if view?.title && plainAsked(view.title) && view.turns.length}<p class="title" title={plainAsked(view.title)}>{plainAsked(view.title)}</p>{/if}
  {#each view?.turns ?? [] as t (t.id)}
    {@render turn(t)}
  {/each}
  {#each loose as p (p.id)}{@render permit(p)}{/each}
  {#if !view?.turns.length && terminal.connected}
    <div class="empty"><Crystal id={view?.session ?? "new"} size={44} /><p>Ask {view?.model ? view.model.split("/").at(-1) : view?.agent || "The agent"} anything.</p></div>
  {/if}
  {#if terminal.old}<p class="faint ro">Read only.</p>
  {:else if view?.reading}<p class="faint ro">Read only: {view.agent} is not set up to carry it on.</p>{/if}
  {#if !terminal.connected}<AttachAgent />{/if}
  </div>
</div>
{#if behind && !pinned}
  <button type="button" class="latest" onclick={latest} title="Back to the newest">
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M4 9l4 4 4-4" /></svg>Newest
  </button>
{/if}
</div>

{#snippet turn(t: TerminalTurn)}
  {@const changed = changedIn(t)}
  {@const ps = pieces(t.asked)}
  {@const md = markedAsked(ps)}
  {@const fail = t.state === "failed" ? failure([...t.items].reverse().find((i): i is Extract<TerminalItem, { kind: "text" }> => i.kind === "text" && /^\(.*\)$/s.test(i.text))?.text ?? "") : null}
  <article class="turn" data-state={t.state}>
    <div class="you"><i class="rule" aria-hidden="true"></i>
      <!-- The chips in it are buttons: this only hears their clicks. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by render(), whose markdown takes no HTML -->
      <div class="asked prose" use:drawn={md} use:chipsIn={ps} onclick={chipClicked}>{@html render(md)}</div>
      {#if t.images?.length}
        <span class="shots">{#each t.images as id (id)}{@const src = terminal.imageUrl(id)}{#if src}<a class="shot" href={src} target="_blank" rel="noopener" title="Open the image"><img {src} alt="Sent with this turn" loading="lazy" /></a>{/if}{/each}</span>
      {/if}
      {#if t.given?.length}
        <span class="gave">{#each t.given as g, k (k)}<span class="chip" class:out={t.withdrawn?.includes(k)} title={t.withdrawn?.includes(k) ? "Taken out of the conversation afterwards: the agent is no longer sent it" : undefined} data-to={g.kind === "note" ? g.id : undefined}><span class="k" aria-hidden="true">{SYM[g.kind]}</span><span class="t">{g.kind === "passage" ? g.text : g.kind === "folder" ? g.id || "the base" : titleOf(g.id)}</span></span>{/each}</span>
      {/if}
      {#if t.from === "terminal" && !terminal.old}<span class="from" title="Sent from its terminal"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 5l3 3-3 3M8 11.5h5" /></svg><span class="hidden-label">Sent from its terminal</span></span>{/if}
    </div>
    {#each rowsOf(t) as r (r.kind === "one" ? r.k : `run-${r.tools[0]!.k}`)}
      <div class="it" out:foldAway>
        {#if r.kind === "one"}{@render item(r.i, t.state === "running" && r.k === t.items.length - 1, t.state === "failed")}
        {:else}
          {@const going = r.tools.find(({ i }) => i.status === "running")}
          {@const ms = r.tools.reduce((a, { i }) => a + (i.ms ?? 0), 0)}
          <details class="tool run" data-status={going ? "running" : r.tools.some(({ i }) => i.status === "failed") ? "failed" : "done"}>
            <summary class="row">{@render glyph(kindOf(r.tools[0]!.i.name))}<span class="to sum">{sumUp(r.tools)}</span>
              <span class="meta">{#if going}<i class="busy" aria-label="running"></i>{:else if ms}<span class="ms">{took(ms)}</span>{/if}</span><span class="caret" aria-hidden="true"></span></summary>
            <div class="inner">{#each r.tools as { i } (i.id)}{@render tool(i)}{/each}</div>
          </details>
        {/if}
      </div>
    {/each}
    {#if t.state !== "running" && drew(t).length}
      <div class="parts" role="group" aria-label="What {view?.agent || 'the agent'} drew on">
        {#each drew(t) as id (id)}
          <button type="button" class="part" class:lit={lit === id} data-to={id} data-lustre onclick={() => void panes.open(id, true)}><s aria-hidden="true"></s><b>{titleOf(id)}</b>{folderOf(id)}</button>
        {/each}
      </div>
    {/if}
    {#if t.state === "running"}
      <!-- At work: the gem, turning; the step, and the time so far. -->
      {@const s = step(t)}
      <p class="doing foot" role="status"><i class="gem" aria-hidden="true"></i><span class="what">{s.what}{#if s.to}{" "}<b>{s.to}</b>{/if}</span><span class="time">{took(elapsed(t))}</span></p>
    {:else if t.state === "failed" && fail}
      <div class="failed" role="alert"><span class="x" aria-hidden="true">✕</span><span class="said-fail" title={fail.said}>{fail.said}</span>
        {#if !terminal.old}{#if fail.fix === "settings"}<button type="button" class="btn" onclick={() => void terminal.settings()}>Open settings</button>{:else}<button type="button" class="btn" disabled={terminal.running} onclick={() => void terminal.retry(t)}>Retry</button>{/if}{/if}</div>
    {:else if t.state === "failed"}
      <p class="failed" role="alert"><span class="x" aria-hidden="true">✕</span>Failed.</p>
    {:else}
      <p class="foot end" data-state={t.state}><i class={t.state === "stopped" ? "sq" : "dia"} aria-hidden="true"></i><span>{[t.state === "stopped" ? "Stopped" : "", t.took === undefined ? "" : took(t.took), did(t)].filter(Boolean).join(" · ")}</span></p>
    {/if}
    {#if changed.length && t.state !== "running" && !terminal.old}
      <div class="changed" role="group" aria-label="Notes this turn changed">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l.8-3.2 6.9-6.9 2.4 2.4-6.9 6.9zM9.4 4.2l2.4 2.4" /></svg>
        {#if terminal.undone.has(t.id)}<span class="what">Undone: {changed.length === 1 ? titleOf(changed[0]!) : `${changed.length} notes`} put back</span>
        {:else}
          <span class="what" title={changed.map(titleOf).join(", ")}>{changed.length === 1 ? titleOf(changed[0]!) : `${changed.length} notes`} changed</span>
          <button type="button" class="link" onclick={() => review(t)}>Review</button>
          <button type="button" class="link" disabled={!!terminal.undoing || terminal.running} onclick={() => void terminal.undo(t)}>{terminal.undoing === t.id ? "Undoing…" : "Undo turn"}</button>
        {/if}
      </div>
    {/if}
  </article>
{/snippet}

<style>
  .wrap { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; scrollbar-gutter: stable; overflow-anchor: none; }
  /* --gut: the column at the left where each thing's mark stands (the agent's diamond, a tool's glyph, a caret). */
  .flow { --gut: 22px; min-height: 100%; padding: 16px 16px 24px; display: flex; flex-direction: column; gap: 14px; }
  .title { font: var(--fs-meta)/1.4 var(--font-ui); color: var(--text-faint); margin-bottom: -4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .faint { color: var(--text-faint); }
  .ro { font-size: var(--fs-small); }
  .empty { margin: auto 0; padding: 48px 0 24px; display: grid; justify-items: center; gap: 14px; color: var(--growth); }
  .empty p { margin: 0; font: var(--fs-ui)/1.4 var(--font-ui); color: var(--text-soft); }
  /* Back to the newest, when you have scrolled up and more has come: it floats over the session (glass, lifted). */
  .latest { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px 0 10px; background: var(--glass); -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); border: 1px solid var(--line-strong); border-radius: 14px; color: var(--text-soft); font: var(--fs-small) var(--font-ui); cursor: pointer; box-shadow: var(--lift); animation: show var(--dur-1) var(--ease-out); transition: color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out); }
  .latest svg { color: var(--lattice); }
  .latest:hover, .latest:focus-visible { color: var(--text); border-color: var(--lattice); }
  /* Motion (docs/taste.md): a line draws, then what it holds shows. A turn's rule draws down its edge in the time of a
     change; its words show as it ends. Each thing the agent does after shows in the same time. */
  .you .rule { animation: draw var(--dur-2) var(--ease-out); }
  .you > :not(.rule) { animation: show var(--dur-2) var(--ease-out) calc(var(--dur-2) / 2) both; }
  .it, .foot, .changed, .failed { animation: show var(--dur-2) var(--ease-out); }
  @keyframes draw { from { transform: scaleY(0); } }
  @keyframes show { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .you .rule, .you > *, .it, .foot, .changed, .failed, .latest, .permit, .said::before { animation: none !important; } }
  .it { display: grid; min-width: 0; }
  .turn { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .turn:not(:first-of-type) { margin-top: 10px; }
  /* A disclosure says it opens: a caret that turns. */
  .caret { flex: none; width: 0; height: 0; border-left: 4px solid currentColor; border-top: 3.5px solid transparent; border-bottom: 3.5px solid transparent; opacity: .6; transition: transform var(--dur-1) var(--ease-out); }
  details[open] > summary > .caret { transform: rotate(90deg); }
  summary { list-style: none; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }

  /* What you asked: set apart as yours, a block on the ground with a blue rule that draws down its edge as it comes. */
  .you { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 8px 14px; background: var(--surface-raised); border-radius: 0 var(--round) var(--round) 0; }
  .you .rule { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--lattice); transform-origin: top; }
  .asked { margin: 0; overflow-wrap: anywhere; color: var(--text); font: var(--fs-ui)/1.55 var(--font-ui); min-width: 0; }
  .asked :global(p) { margin: 0; }
  .asked > :global(* + *) { margin-top: 8px; }
  .asked > :global(:last-child) { margin-bottom: 0; }
  .asked :global(ul), .asked :global(ol) { margin-bottom: 0; padding-left: 20px; }
  .asked :global(pre) { overflow-x: auto; }
  .asked :global(.ref) { background: none; border: 0; padding: 0; font: inherit; }
  .from { position: absolute; top: 8px; right: 10px; color: var(--text-faint); display: inline-flex; }
  .shots { display: flex; flex-wrap: wrap; gap: 6px; }
  .shot { display: block; width: 64px; height: 64px; border-radius: var(--round); overflow: hidden; background: var(--ground-2); outline-offset: 2px; }
  .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gave { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { border-radius: var(--round); display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; background: var(--fill-hover); font-size: var(--fs-meta); color: var(--text-soft); max-width: 100%; }
  .chip.out { text-decoration: line-through; opacity: 0.6; }
  .chip .k { color: var(--lattice); }
  .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }

  /* What the agent said: its gold diamond in the gutter, at the height of its first line. */
  .said { padding-left: var(--gut); position: relative; font: 0.9375rem/1.6 var(--font-text); overflow-wrap: anywhere; min-width: 0; }
  .said::before { content: ""; position: absolute; left: 6px; top: calc(.8em - 2.5px); width: 5px; height: 5px; background: var(--growth); transform: rotate(45deg); }
  /* The agent's mark is one gold diamond at a time: this one once the turn is over, the footer's gem while it works (so not both), and a running tool's dot is round. */
  .turn[data-state="running"] .said::before { display: none; }
  .said :global(p + p), .said :global(p + ul), .said :global(ul + p) { margin-top: 8px; }
  .said :global(ul), .said :global(ol) { margin: 0; padding-left: 20px; }
  .said > :global(:last-child), .offer .yours > :global(:last-child) { margin-bottom: 0; }
  .said :global(pre) { overflow-x: auto; }

  .think, .squeeze { margin: 0; padding-left: var(--gut); font-size: 0.7812rem; color: var(--text-soft); }
  .think summary, .squeeze summary { position: relative; display: flex; align-items: center; min-height: var(--row-dense); font: var(--fs-small) var(--font-ui); color: var(--text-faint); width: fit-content; }
  .think summary .caret, .squeeze summary .caret { position: absolute; left: calc(-1 * var(--gut) + 7px); }
  .think summary:hover, .squeeze summary:hover { color: var(--text-soft); }
  .think p, .squeeze p { margin: 4px 0 0; padding-left: 10px; border-left: 2px solid var(--line); white-space: pre-wrap; overflow-wrap: anywhere; }
  .squeeze[data-state="failed"] summary { color: var(--rose); }
  .mid { margin: 0 0 0 var(--gut); padding-left: 10px; border-left: 2px solid var(--line-strong); color: var(--text); font-size: 0.8125rem; overflow-wrap: anywhere; white-space: pre-wrap; }
  .mid[data-state="queued"], .mid[data-state="dropped"] { color: var(--text-faint); }
  .mid[data-state="dropped"] { text-decoration: line-through; }
  .mid .how { font: var(--fs-meta) var(--font-ui); color: var(--text-soft); margin-right: 4px; }

  /* A tool call: one row, its glyph in the gutter, what it acted on, and at the right what it did and how long it took. */
  .tool { display: grid; gap: 4px; min-width: 0; font: var(--fs-small)/1.4 var(--font-ui); color: var(--text-faint); }
  .row { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: var(--row-dense); margin: 0 -6px 0 0; padding: 0 6px 0 var(--gut); border-radius: var(--round); transition: background-color var(--dur-1) var(--ease-out); }
  summary.row:hover { background: var(--fill-hover); }
  .row .g { position: absolute; left: 2px; top: 50%; translate: 0 -50%; color: var(--text-faint); }
  .tool[data-kind="edit"] .g, .tool[data-kind="write"] .g { color: var(--growth); }
  .tool[data-status="failed"] .g { color: var(--rose); }
  .to { min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-soft); }
  .to.mono { font: var(--fs-meta) var(--font-mono); }
  .sum { color: var(--text-soft); }
  .meta { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; color: var(--text-faint); }
  .row > .caret { margin-left: -2px; }
  .ms { font-size: var(--fs-meta); }
  .x { color: var(--rose); }
  .n { font-size: var(--fs-meta); }
  .add { color: var(--malachite); }
  .del { color: var(--rose); }
  /* Running: a small gold point that breathes. */
  .busy { width: 6px; height: 6px; border-radius: 50%; background: var(--growth); animation: breathe 1.2s ease-in-out infinite alternate; }
  @keyframes breathe { from { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .busy { animation: none; } }
  .run .inner { display: grid; gap: 0; margin-left: 10px; padding-left: 4px; border-left: 1px solid var(--line-faint); }
  .run .inner .row .g { left: 4px; }
  pre { border-radius: var(--round); margin: 4px 0 2px var(--gut); padding: 8px 10px; background: var(--surface-raised); font: 0.7188rem/1.45 var(--font-mono); color: var(--text-soft); overflow: auto; max-height: 280px; white-space: pre; }
  .diff span { display: block; }
  .diff span:not(.add):not(.del) { color: var(--text-faint); }
  .why { margin: 0 0 0 var(--gut); font-size: var(--fs-small); color: var(--text-soft); }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .link:hover:not(:disabled) { color: var(--text); }
  .link:disabled { color: var(--text-faint); cursor: default; }
  .in { color: var(--text-faint); }
  a.note-link { text-decoration: none; }
  .note-link { background: none; border: 0; padding: 0; font: inherit; color: var(--text-soft); cursor: pointer; text-align: left; }
  .note-link:hover, .note-link:focus-visible { color: var(--lattice); }

  /* It asks for you: a gold edge, a glow that swells twice as it comes; then it waits, answered by its buttons. */
  .permit { margin-left: var(--gut); border: 1px solid var(--growth); border-radius: var(--round); padding: 10px 12px; display: grid; gap: 8px; font-size: 0.7812rem; color: var(--text-soft); background: color-mix(in srgb, var(--growth) 5%, transparent); animation: ask 1.2s var(--ease-out) 2; }
  .permit.done { border-color: var(--line); background: none; padding: 6px 12px; }
  @keyframes ask { 50% { box-shadow: var(--glow-growth); } }
  .tool .permit { margin-left: var(--gut); }
  .permit p { margin: 0; }
  .permit code { font: 0.75rem var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .acts .btn { height: 28px; padding: 0 12px; font-size: var(--fs-small); }

  .asks { padding-left: var(--gut); display: grid; gap: 2px; font-size: 0.8125rem; }
  .asks p { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 0; }
  .asks .qm { margin-left: calc(-1 * var(--gut) + 3px); margin-right: 6px; color: var(--rose); flex: none; }
  .asks .qt { color: var(--text); overflow-wrap: anywhere; }
  .asks .note-link { color: var(--text); }
  .asks .qb { color: var(--text-soft); font-size: 0.7812rem; display: block; }
  .asks .keep { border-radius: var(--round); flex: none; margin-left: 4px; height: 22px; padding: 0 9px; background: none; border: 1px solid var(--rose); color: var(--rose); font: 0.6875rem/1.25rem var(--font-ui); cursor: pointer; transition: background-color var(--dur-1) var(--ease-out); }
  .asks .keep:hover { background: var(--rose-soft); }
  .offer { margin-left: var(--gut); border-left: 2px solid var(--line-strong); padding: 2px 0 2px 12px; display: grid; gap: 4px; }
  .offer .yours { font: 0.9375rem/1.6 var(--font-text); color: var(--text); overflow-wrap: anywhere; }
  .offer .for { display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: var(--text-faint); margin: 0; }
  .offer .in { color: var(--malachite); }
  .offer .insert { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }

  /* The turn's foot: while it works, the gem turning, the step and the time; once over, how long and what it did. One
     line of the same height in both, so nothing moves when the turn ends. */
  .foot { display: flex; align-items: center; gap: 8px; min-height: var(--row-dense); margin: 0; padding-left: var(--gut); position: relative; font: var(--fs-small)/1.4 var(--font-ui); color: var(--text-faint); min-width: 0; font-variant-numeric: tabular-nums; }
  .foot .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-soft); }
  .foot .what b { font-weight: inherit; color: var(--text); }
  .foot .time { flex: none; color: var(--text-faint); }
  .foot.end { gap: 0; }
  .foot .dia, .foot .sq, .gem { position: absolute; left: 0; top: 50%; translate: 0 -50%; }
  .foot .dia { left: 6px; width: 5px; height: 5px; background: var(--line-strong); rotate: 45deg; }
  .foot .sq { left: 5px; width: 7px; height: 7px; background: var(--rose); }
  /* The agent's mark while it works: the gold diamond turns on its point as a cut stone does, and a ring of light leaves it. */
  .gem { width: 16px; height: 16px; display: grid; place-items: center; }
  .gem::before { content: ""; width: 8px; height: 8px; background: var(--growth); transform: rotate(45deg); animation: gem-turn 2.4s ease-in-out infinite; box-shadow: 0 0 8px 1px color-mix(in srgb, var(--growth) 60%, transparent); }
  .gem::after { content: ""; position: absolute; inset: 3px; border: 1px solid var(--growth); transform: rotate(45deg); opacity: 0; animation: gem-ring 2.4s ease-out infinite; }
  @keyframes gem-turn { 0%, 100% { transform: rotate(45deg) scale(1); } 25% { transform: rotate(45deg) scaleX(.15); } 50% { transform: rotate(45deg) scale(1.15); } 75% { transform: rotate(45deg) scaleY(.15); } }
  @keyframes gem-ring { 0%, 45% { opacity: 0; transform: rotate(45deg) scale(1); } 55% { opacity: .7; } 100% { opacity: 0; transform: rotate(45deg) scale(2.2); } }
  @media (prefers-reduced-motion: reduce) { .gem::before, .gem::after { animation: none; } .gem::after { display: none; } }

  /* A turn that failed: what went wrong in a few words, and the one thing to do. */
  .failed { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 0 var(--gut); padding: 8px 10px; border-radius: var(--round); background: color-mix(in srgb, var(--rose) 9%, transparent); font: var(--fs-small)/1.4 var(--font-ui); color: var(--text); }
  .failed .said-fail { flex: 1 1 12em; min-width: 0; overflow-wrap: anywhere; }
  .failed .btn { height: 26px; padding: 0 10px; font-size: var(--fs-small); }

  /* A turn that changed notes: which, and what to do about them. */
  .changed { display: flex; align-items: center; gap: 12px; margin-left: var(--gut); padding: 6px 10px; border-radius: var(--round); background: color-mix(in srgb, var(--growth) 7%, transparent); font: var(--fs-small)/1.4 var(--font-ui); color: var(--text-soft); }
  .changed svg { color: var(--growth); flex: none; margin-right: -4px; }
  .changed .link { flex: none; }
  .changed .what { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }

  /* What the agent drew on (M24, G): parts with bracketed corners, lit blue with the phrases that cite them. */
  .parts { display: flex; flex-wrap: wrap; gap: 8px; margin-left: var(--gut); }
  .part { border-radius: var(--round); position: relative; display: grid; gap: 1px; justify-items: start; min-width: 0; max-width: 100%; padding: 6px 10px 5px; background: none; border: 0; text-align: left; font: var(--fs-meta)/14px var(--font-ui); color: var(--text-faint); cursor: pointer; --glint: .3; transition: background-color var(--dur-1) var(--ease-out); }
  .part > s { position: absolute; inset: 0; pointer-events: none; --b: var(--line-strong); --l: 6px; background:
    linear-gradient(var(--b), var(--b)) top left / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) top left / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) top right / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) top right / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) bottom left / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom left / 1px var(--l) no-repeat,
    linear-gradient(var(--b), var(--b)) bottom right / var(--l) 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom right / 1px var(--l) no-repeat; }
  .part b { font: 0.8125rem/1.125rem var(--font-text); font-weight: 400; color: var(--text); overflow-wrap: anywhere; }
  .part:hover > s, .part.lit > s { --b: var(--lattice); }
  .part:hover, .part.lit { background: var(--lattice-soft); box-shadow: 0 0 12px color-mix(in srgb, var(--lattice) var(--glow-a), transparent); }
</style>
