<script lang="ts">
  // A conversation's crystal (M24, I): grown outward segment by segment, in gold, while Iso works in it; at rest, it
  // marks the conversation. Grown in whole frames (24 a second, as the lustre is), it stands a moment when whole and
  // grows again from its centre, for as long as the work goes on.
  import { CRYSTALS, crystalOf, lines } from "$lib/crystal.ts";

  let { id, size = 44, growing = false, label = "" }: { id: string; size?: number; growing?: boolean; label?: string } = $props();

  const GROW = 1100, STAND = 1100, FPS = 24;

  const c = $derived(CRYSTALS[crystalOf(id)]!);
  // Small, only its first growth, so it reads as its shape and not as a blot; scaled up to fill the box.
  const reach = $derived(size >= 40 ? 1 : 0.45);
  const segs = $derived(lines(c).filter((s) => s.out < reach).sort((a, b) => a.out - b.out));
  const zoom = $derived.by(() => { const r = Math.max(...segs.map((s) => Math.hypot(s.x2, s.y2))); return r > 0 ? 21 / r : 1; });
  // A line of about a pixel on the screen, a little finer for a crystal of many segments.
  const px = $derived(size >= 40 ? 0.75 + c.width * 0.3 : 1.1);

  /** How far out it has grown, 0 to 1. */
  let grown = $state(1);
  $effect(() => {
    if (!growing || matchMedia("(prefers-reduced-motion: reduce)").matches) { grown = 1; return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const t = ((Math.floor(((now - t0) / 1000) * FPS) * 1000) / FPS) % (GROW + STAND);
      grown = Math.min(1, t / GROW);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
  const shown = $derived(grown >= 1 ? segs.length : segs.findIndex((s) => s.out / reach > grown) + 1 || segs.length);
</script>

<svg class="crystal" class:growing width={size} height={size} viewBox="-24 -24 48 48" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
  <g transform="scale({zoom})" stroke-width={px}>{#each segs.slice(0, shown) as s, i (i)}<line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />{/each}</g>
</svg>

<style>
  .crystal { flex: none; display: block; }
  line { stroke: currentColor; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .growing { color: var(--growth); }
</style>
