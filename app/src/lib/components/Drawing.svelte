<script lang="ts">
  // A wait that is not Iso's (M24): the logo's strokes drawing themselves, over and over, in place of a spinner.
  // Still, under reduced motion: the logo, drawn.
  let { width = 26, label = "" }: { width?: number; label?: string } = $props();
</script>

<svg class="logo drawing" viewBox="-0.4 -6.5 32.4 7" {width} height={width * 7 / 32.4} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
  <path pathLength="1" d="M2 0L2 -2L0 -4M2 -2L2 -4L4 -6M5.6 0L6.6 0L7.6 -1L5.6 -3L6.6 -4L7.6 -4M11.2 0L13.2 -2L11.2 -4L9.2 -2ZM14.8 0L14.8 -2L15.8 -3L16.8 -4M14.8 -2L14.8 -4M20.4 0L20.4 -2L18.4 -4M20.4 -2L20.4 -4L22.4 -6M26 0L25 -1L25 -4L24 -4M25 -4L26 -4M25 -4L25 -5M30.6 0L29.6 0L27.6 -2L29.6 -4L31.6 -2L27.6 -2" />
</svg>

<style>
  .drawing { display: inline-block; vertical-align: middle; }
  .drawing path { stroke: currentColor; stroke-width: 1; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.6s var(--ease-out) infinite; }
  /* Grows along its strokes, stands, and is taken back the way it came. */
  @keyframes draw { 55% { stroke-dashoffset: 0; } 75% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -1; } }
  @media (prefers-reduced-motion: reduce) { .drawing path { animation: none; stroke-dashoffset: 0; } }
</style>
