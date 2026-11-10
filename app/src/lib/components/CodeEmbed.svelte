<script lang="ts">
  // Code of the repository shown in a note (M29): `![the step](code:sim/step.py#leapfrog)`. The code is read when it is
  // shown, so it is the code as it is now; a symbol is found by its name, so it holds where the code has moved. The
  // header names the file, the symbol and the lines it covers now.
  import type { CodeSlice } from "@isorite/engine";
  import { app, codeHref } from "$lib/app.svelte.ts";
  import { highlightFile } from "$lib/code.ts";

  let { href }: { href: string } = $props();
  let got = $state.raw<CodeSlice | null>(null), html = $state<string | null>(null), problem = $state("");

  async function load(): Promise<void> {
    try {
      const slice = await app.api.code(href);
      got = slice;
      html = slice.state === "ok" ? await highlightFile(slice.text, slice.path) : null;
      problem = "";
    } catch (e) { problem = (e as Error).message; }
  }
  // Read again when the window is come back to: the code changes outside isorite.
  $effect(() => { void href; void load(); const again = () => { if (document.visibilityState === "visible") void load(); }; document.addEventListener("visibilitychange", again); return () => document.removeEventListener("visibilitychange", again); });

  const WHY: Record<string, string> = {
    "no-repository": "no repository is named for this base's code links",
    "no-file": "not in the repository",
    "no-symbol": "no longer in the file by that name",
    unsupported: "isorite can find symbols in this kind of file only by lines",
    "too-large": "too large to show",
  };
  const where = $derived(got?.state === "ok" ? (got.start === got.end ? `line ${got.start}` : `lines ${got.start}–${got.end}`) : "");
</script>

<span class="code" class:broken={got && got.state !== "ok"} data-code-embed>
  <span class="head">
    <a class="file" href={codeHref(href)} title="Read the whole file">{got?.path ?? href.slice(5).split("#")[0]}</a>
    {#if got?.symbol}<span class="sym">{got.symbol}</span>{/if}
    {#if where}<span class="lines">{where}</span>{/if}
  </span>
  {#if problem}<span class="why">{problem}</span>
  {:else if got && got.state !== "ok"}<span class="why">{WHY[got.state]}</span>
  {:else if got?.state === "ok"}
    <span class="pre" style:--from={got.start}>{#each got.text.split("\n") as line, i (i)}<span class="ln" data-n={got.start + i}>{@html (html?.split("\n")[i] ?? line.replace(/&/g, "&amp;").replace(/</g, "&lt;")) || " "}</span>{/each}</span>
    {#if got.more}<span class="why">… {got.end - got.start + 1 - 120} more lines in the file</span>{/if}
    {#if got.count}<span class="why">{got.count} declarations of this name: the first is shown</span>{/if}
  {/if}
</span>

<style>
  .code { display: block; white-space: normal; margin: 6px 0; border: 1px solid var(--line); background: var(--ground-1); font: 0.8125rem/1.5 var(--font-mono); overflow: hidden; }
  .head { display: flex; gap: 10px; align-items: baseline; padding: 3px 10px; border-bottom: 1px solid var(--line); color: var(--text-faint); font: 0.6875rem var(--font-ui); letter-spacing: .04em; }
  .file { color: var(--text-soft); font-family: var(--font-mono); text-decoration: none; }
  a.file:hover { color: var(--text); text-decoration: underline; }
  .sym { color: var(--lattice); font-family: var(--font-mono); }
  .lines { margin-left: auto; }
  .pre { display: block; overflow-x: auto; padding: 6px 0; }
  .ln { display: block; white-space: pre; padding: 0 10px 0 52px; position: relative; }
  .ln::before { content: attr(data-n); position: absolute; left: 0; width: 40px; text-align: right; color: var(--text-faint); user-select: none; }
  .why { display: block; padding: 4px 10px; color: var(--text-faint); font: 0.75rem var(--font-ui); }
  .broken .file { text-decoration: line-through; }
  .broken .why { color: var(--rose); }
</style>
