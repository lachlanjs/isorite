<script lang="ts">
  // A kind's glyph (glyphs.ts), in the colour of the text around it.
  import { GLYPHS, type Glyph } from "$lib/glyphs.ts";
  let { kind, size = 12 }: { kind: Glyph; size?: number } = $props();
</script>

<svg class="glyph" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">{#each GLYPHS[kind] as d (d)}<path {d} />{/each}</svg>

<style>
  .glyph { flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: miter; }
</style>
