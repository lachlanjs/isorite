<script lang="ts">
  // A file of the base's repository, read in full (M34), opened from a code link: Ctrl or Cmd and a click on it in a note,
  // or the file's name in the header of the code shown in place. The lines the link names (a symbol, or lines) are
  // marked and scrolled to, so a link to a whole file can be looked at as far as it is wanted, and one to a part seen in
  // the file around it. The code is read when it is opened, so it is the code as it is now.
  import { tick } from "svelte";
  import type { CodeSlice } from "@isorite/engine";
  import { app } from "$lib/app.svelte.ts";
  import { highlightFile } from "$lib/code.ts";

  let { path, at = "" }: { path: string; at?: string } = $props();
  const href = $derived(`code:${path}${at ? `#${at}` : ""}`);

  let got = $state.raw<CodeSlice | null>(null), lines = $state.raw<string[]>([]), problem = $state("");
  // The lines marked: the link's, or the line last chosen by its number.
  let picked = $state<{ start: number; end: number } | null>(null);
  let copied = $state(false);
  let box = $state<HTMLElement>();

  async function load(): Promise<void> {
    try {
      const slice = await app.api.code(href, true);
      got = slice;
      problem = "";
      if (slice.state !== "ok") { lines = []; return; }
      const plain = slice.text.split("\n");
      lines = plain.map((l) => escape(l));
      picked = slice.mark ?? null;
      await tick();
      scrollTo();
      // Coloured once the language is loaded; the lines are readable before.
      const html = await highlightFile(slice.text, slice.path);
      if (html && got === slice) lines = html.split("\n");
    } catch (e) { problem = (e as Error).message; }
  }
  const escape = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  $effect(() => { void href; void load(); });

  function scrollTo(): void {
    if (!picked || !box) return;
    const el = box.querySelector<HTMLElement>(`[data-n="${picked.start}"]`);
    el?.scrollIntoView({ block: "center" });
  }
  /** A line's number chosen: it is the one marked; with shift, the lines from the last chosen to it. */
  function choose(n: number, e: MouseEvent): void {
    picked = e.shiftKey && picked ? { start: Math.min(picked.start, n), end: Math.max(picked.end, n) } : { start: n, end: n };
  }
  const marked = (n: number): boolean => !!picked && n >= picked.start && n <= picked.end;
  /** The link to what is marked, in the form a note takes it. */
  const link = $derived(picked ? `code:${path}#L${picked.start}${picked.end > picked.start ? `-L${picked.end}` : ""}` : `code:${path}`);
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* no clipboard here */ }
  }

  const WHY: Record<string, string> = {
    "no-repository": "no repository is named for this base's code links",
    "no-file": "not in the repository",
    "too-large": "too large to show",
  };
  const name = $derived(path.split("/").at(-1) ?? path);
  const folder = $derived(path.split("/").slice(0, -1).join("/"));
</script>

<div class="reader">
  <header>
    <h1><span class="dir">{folder ? `${folder}/` : ""}</span>{name}</h1>
    <p class="meta">
      {#if got?.state === "ok"}
        <span>{got.total} lines</span>
        {#if got.symbol}<span class="sym">{got.symbol}{picked && got.mark ? "" : " (not found in the file)"}</span>{/if}
        {#if got.count}<span>{got.count} declarations of this name: the first is marked</span>{/if}
        <span class="tools"><code class="link">{link}</code><button class="btn quiet" type="button" onclick={() => void copy()}>{copied ? "copied" : "copy link"}</button></span>
      {/if}
    </p>
  </header>
  {#if problem}<p class="why">{problem}</p>
  {:else if got && got.state !== "ok"}<p class="why broken">{path}: {WHY[got.state] ?? got.state}</p>
  {:else if got}
    <div class="pre" bind:this={box} data-point="code:{path}" aria-label="The file {path}" role="region">
      {#each lines as html, i (i)}
        <div class="row" class:on={marked(i + 1)} data-n={i + 1}><button type="button" class="num" aria-label="Line {i + 1}" onclick={(e) => choose(i + 1, e)}>{i + 1}</button><span class="code">{@html html || " "}</span></div>
      {/each}
    </div>
  {:else}
    <p class="why">Reading…</p>
  {/if}
</div>

<style>
  .reader { max-width: 1120px; margin: 0 auto; padding: 32px var(--space-4) var(--space-12); display: flex; flex-direction: column; gap: var(--space-3); }
  h1 { margin: 0; font: 600 1.25rem/1.3 var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
  .dir { color: var(--text-faint); font-weight: 400; }
  .meta { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; margin: 0; padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); font: 0.75rem var(--font-ui); color: var(--text-faint); }
  .sym { color: var(--lattice); font-family: var(--font-mono); }
  .tools { margin-left: auto; display: flex; gap: var(--space-2); align-items: center; }
  .link { color: var(--text-soft); font: 0.75rem var(--font-mono); }
  .pre { border: 1px solid var(--line); background: var(--ground-1); font: 0.8125rem/1.55 var(--font-mono); overflow-x: auto; padding: 6px 0; }
  .row { display: flex; white-space: pre; content-visibility: auto; contain-intrinsic-size: auto 20px; }
  .row.on { background: var(--lattice-soft); box-shadow: inset 3px 0 0 var(--lattice); }
  .num { flex: none; width: 56px; padding: 0 10px 0 0; text-align: right; background: none; border: 0; color: var(--text-faint); font: inherit; cursor: pointer; user-select: none; }
  .num:hover { color: var(--text); }
  .code { padding-right: 16px; }
  .why { color: var(--text-faint); font: 0.8125rem var(--font-ui); }
  .broken { color: var(--rose); }
</style>
