<script lang="ts">
  // An artifact, working (plan-m23 §3.4): in a frame that may run scripts and nothing else (no same origin, so no
  // token, no API, no navigating isorite), given its document through srcdoc. It reaches isorite only through the
  // bridge: the files its manifest names, the ground and the look, opening a note, and its errors.
  import { untrack } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { bridge, documentOf, groundNow } from "$lib/artifact.ts";

  let { path, html, uses, look = "isorite", title, onerror }: {
    path: string; html: string; uses: string[]; look?: string; title: string;
    /** The artifact's errors and the kit's complaints, as they come. */
    onerror?: (message: string) => void;
  } = $props();

  let frame = $state<HTMLIFrameElement>();
  let height = $state(480);
  let problem = $state("");
  let ground = $state(groundNow());
  // The ground the page shows, followed: a choice made in isorite, or the system's changing.
  $effect(() => {
    const seen = new MutationObserver(() => { ground = groundNow(); });
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ground"] });
    const sys = matchMedia("(prefers-color-scheme: light)"), follow = () => { ground = groundNow(); };
    sys.addEventListener("change", follow);
    return () => { seen.disconnect(); sys.removeEventListener("change", follow); };
  });

  let link: ReturnType<typeof bridge> | null = null;
  $effect(() => {
    if (!frame) return;
    const f = frame;
    link = bridge(f, app.api, path, () => uses, {
      onHeight: (px) => { height = Math.max(120, Math.min(20000, Math.ceil(px) + 4)); },
      onError: (m) => onerror?.(m),
      onOpen: (note) => { void panes.open(note.replace(/^\/+/, "").replace(/\.md$/, "")); },
      current: () => ({ ground, look }),
    });
    return () => { link?.stop(); link = null; };
  });
  // The document, made again only when the artifact itself changes; a change of ground or look is a message to it.
  $effect(() => {
    if (!frame) return;
    const f = frame, source = html, now = untrack(() => ({ look, ground }));
    problem = "";
    documentOf(source, now).then((doc) => { f.srcdoc = doc; }, (e) => { problem = (e as Error).message; });
  });
  $effect(() => { link?.tell({ type: "ground", ground }); });
  $effect(() => { link?.tell({ type: "look", look }); });
</script>

{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
<iframe bind:this={frame} sandbox="allow-scripts" {title} style:height="{height}px"></iframe>

<style>
  iframe { display: block; width: 100%; border: 0; background: transparent; color-scheme: normal; }
  .problem { color: var(--rose); font-size: 12px; margin: var(--space-2) 0; }
</style>
