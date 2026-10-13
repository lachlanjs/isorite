<script lang="ts">
  // The name, in seven turtle words, with a gold diamond for Iso over the first i and a malachite one, for
  // what you got right, over the second.
  let { width = 72 }: { width?: number } = $props();
</script>

<svg class="logo" viewBox="-0.4 -9.5 32.4 9.9" {width} height={width * 9.9 / 32.4} role="img" aria-label="isorite">
  <path d="M2 0L2 -2L0 -4M2 -2L2 -4L4 -6M5.6 0L6.6 0L7.6 -1L5.6 -3L6.6 -4L7.6 -4M11.2 0L13.2 -2L11.2 -4L9.2 -2ZM14.8 0L14.8 -2L15.8 -3L16.8 -4M14.8 -2L14.8 -4M20.4 0L20.4 -2L18.4 -4M20.4 -2L20.4 -4L22.4 -6M26 0L25 -1L25 -4L24 -4M25 -4L26 -4M25 -4L25 -5M30.6 0L29.6 0L27.6 -2L29.6 -4L31.6 -2L27.6 -2" />
  <path class="iso" d="M2 -9.05l1.2 1.2l-1.2 1.2l-1.2 -1.2z" />
  <path class="right" d="M20.4 -9.05l1.2 1.2l-1.2 1.2l-1.2 -1.2z" />
</svg>
