<script lang="ts">
  // The terminal's tour, replayed: each step of `isorite --tutorial` as the real OpenCode drew it, with the
  // step's card beside it. The screens are recorded by the tour's end-to-end test
  // (packages/opencode/test/tutorial.test.ts, with ISORITE_RECORD), so they are the plugin's own, not drawings.
  import { onMount } from "svelte";
  import replay from "$lib/terminal/replay.json";
  import { drawScreen, measure, parseScreen } from "$lib/terminal/screen.ts";

  const frames = replay.frames;
  const screens = frames.map((f) => parseScreen(f.screen));
  let at = $state(0);
  let canvas: HTMLCanvasElement | undefined = $state();
  const frame = $derived(frames[at]!);
  const go = (k: number) => { at = Math.max(0, Math.min(frames.length - 1, k)); };

  // Drawn at twice the size it is shown, so it stays sharp when the page scales it down.
  const SIZE = 28;
  function draw(): void {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const m = measure(ctx, SIZE);
    canvas.width = Math.ceil(replay.cols * m.cell);
    canvas.height = replay.rows * m.row;
    drawScreen(ctx, screens[at]!, m, "#E9EEF5", "#07101C");
  }
  $effect(() => { void at; void canvas; draw(); });
  onMount(() => {
    void document.fonts.load(`${SIZE}px "Ioskeley Mono"`).then(draw);
    const keys = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(at + 1);
      else if (e.key === "ArrowLeft") go(at - 1);
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  });
</script>

<div class="terminal">
  <header>
    <h1>isorite in the terminal</h1>
    <p>A replay of the terminal's tour: OpenCode, with isorite's plugin, on the example base, its model scripted. Every screen is the real one. To walk it yourself, with OpenCode 2 installed: <code>isorite --tutorial</code>.</p>
  </header>
  <div class="stage">
    <figure class="screen">
      <canvas bind:this={canvas} aria-label="the terminal at step {at + 1}: {frame.title}"></canvas>
    </figure>
    <aside class="card frame">
      <div class="seg" aria-label="step {at + 1} of {frames.length}">
        {#each frames as f, k (f.step)}<button type="button" class:d={k <= at} aria-label="step {k + 1}: {f.title}" onclick={() => go(k)}></button>{/each}
      </div>
      <h2>{frame.title}</h2>
      <p>{frame.text}</p>
      <p class="does"><span class="label">then</span> {frame.does}</p>
      <div class="actions">
        <button class="btn quiet" type="button" disabled={at === 0} onclick={() => go(at - 1)}>back</button>
        <span class="grow"></span>
        <button class="btn primary" type="button" disabled={at === frames.length - 1} onclick={() => go(at + 1)}>next</button>
      </div>
      <p class="keys">← and → step through it.</p>
    </aside>
  </div>
</div>

<style>
  .terminal { display: flex; flex-direction: column; gap: 20px; padding: 24px; max-width: 1480px; margin: 0 auto; }
  header h1 { font-family: var(--font-text); font-size: 28px; font-weight: 400; margin: 0 0 8px; color: var(--text); }
  header p { color: var(--text-soft); font-size: 14px; line-height: 1.55; margin: 0; max-width: 72ch; }
  header code { font-family: var(--font-mono); color: var(--text); }
  .stage { display: flex; gap: 24px; align-items: flex-start; }
  .screen { flex: 1 1 auto; min-width: 0; margin: 0; border: 1px solid var(--line); background: #07101C; }
  .screen canvas { display: block; width: 100%; height: auto; }
  .card { flex: none; width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 20px 22px 18px; --fill: var(--ground-2); --edge: var(--growth); --behind: var(--ground-0); }
  .card h2 { font-family: var(--font-text); font-size: 23px; line-height: 1.25; font-weight: 400; margin: 0; color: var(--text); }
  .card p { color: var(--text-soft); font-size: 13px; line-height: 1.55; margin: 0; }
  .card .does { color: var(--text); }
  .card .label { color: var(--growth); margin-right: 6px; }
  .card .keys { color: var(--text-faint); font-size: 12px; }
  .seg { display: flex; gap: 4px; }
  .seg button { width: 16px; height: 6px; padding: 0; border: 0; background: var(--line); cursor: pointer; background-clip: content-box; padding-block: 2px; }
  .seg button.d { background-color: var(--growth); }
  .actions { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
  .actions .btn { height: 30px; font-size: 12px; }
  .grow { flex: 1; }
  @media (max-width: 900px) {
    .stage { flex-direction: column; }
    /* On a phone the screen keeps a readable size, and scrolls sideways. */
    .screen { align-self: stretch; overflow-x: auto; }
    .screen canvas { width: 900px; max-width: none; }
    .card { width: auto; align-self: stretch; }
    .terminal { padding: 16px; }
  }
</style>
