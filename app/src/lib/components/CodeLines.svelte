<script lang="ts">
  // A file's text as numbered lines, read only: in the code reader (a file of the repository, M34) and in the Note pane
  // (a code file of the base). The lines are readable at once and coloured once their language has loaded; a long line
  // runs on to the right, the box scrolling sideways with the numbers kept in sight. The box names itself for the
  // selection's tags with `data-point`, and each row carries its number in `data-n`.
  import { highlightFile } from "$lib/code.ts";

  let { text, path, point, marked = () => false, choose, box = $bindable() }: {
    text: string;
    /** The file's path, whose name says its language. */
    path: string;
    /** What the selection's tags take the box for: "code:<path>". */
    point: string;
    /** Whether a line (from 1) is marked. */
    marked?: (n: number) => boolean;
    /** A line's number chosen; without it the numbers are not buttons. */
    choose?: (n: number, e: MouseEvent) => void;
    box?: HTMLElement | undefined;
  } = $props();

  const escape = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let coloured = $state.raw<{ text: string; lines: string[] } | null>(null);
  // The newline that ends a file ends its last line; it is not a line of its own.
  const lines = $derived((coloured?.text === text ? coloured.lines : text.split("\n").map(escape)).slice(0, text.endsWith("\n") ? -1 : undefined));
  $effect(() => {
    const t = text, p = path;
    void highlightFile(t, p).then((html) => { if (html !== null && t === text) coloured = { text: t, lines: html.split("\n") }; });
  });
</script>

<div class="pre" bind:this={box} data-point={point} data-source aria-label="The file {path}" role="region">
  <div class="lines">
    {#each lines as html, i (i)}
      <div class="row" class:on={marked(i + 1)} data-n={i + 1}>{#if choose}<button type="button" class="num" aria-label="Line {i + 1}" onclick={(e) => choose(i + 1, e)}>{i + 1}</button>{:else}<span class="num" aria-hidden="true">{i + 1}</span>{/if}<span class="code">{@html html || " "}</span></div>
    {/each}
  </div>
</div>

<style>
  .pre { border: 1px solid var(--line); background: var(--ground-1); font: 0.8125rem/1.55 var(--font-mono); color: var(--text); overflow-x: auto; padding: 6px 0; tab-size: 4; }
  /* As wide as its longest line, so a marked row's ground runs under all of it. */
  .lines { width: max-content; min-width: 100%; }
  .row { display: flex; white-space: pre; content-visibility: auto; contain-intrinsic-size: auto 20px; }
  .row.on { background: var(--lattice-soft); box-shadow: inset 3px 0 0 var(--lattice); }
  /* The numbers stay at the left as the lines scroll sideways, on the box's own ground. */
  .num { position: sticky; left: 0; flex: none; width: 56px; padding: 0 10px 0 0; text-align: right; background: var(--ground-1); border: 0; color: var(--text-faint); font: inherit; user-select: none; }
  .row.on .num { background: linear-gradient(var(--lattice-soft), var(--lattice-soft)), var(--ground-1); box-shadow: inset 3px 0 0 var(--lattice); }
  button.num { cursor: pointer; }
  button.num:hover { color: var(--text); }
  .code { padding-right: 16px; }
</style>
