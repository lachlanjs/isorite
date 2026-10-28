<script lang="ts">
  // An artifact shown in a note (M23, plan-m23 §3.4): its name, which opens it in the Note pane, and it working.
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { loadArtifact, type Loaded } from "$lib/artifact.ts";
  import ArtifactFrame from "./ArtifactFrame.svelte";
  import Glyph from "./Glyph.svelte";

  let { path }: { path: string } = $props();
  let got = $state.raw<Loaded | null>(null), problem = $state(""), errors = $state<string[]>([]);
  $effect(() => { const p = path; loadArtifact(app.api, p).then((l) => { got = l; }, (e) => { problem = (e as Error).message; }); });
</script>

<span class="embed">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
  <a class="name" href={noteHref(path)}><Glyph kind="artifact" size={11} />{got?.manifest.title || path.split("/").at(-1)}</a>
  {#if problem}<span class="problem">{problem}</span>
  {:else if got}<ArtifactFrame {path} html={got.html} uses={got.manifest.uses} title={got.manifest.title || path} onerror={(m) => { if (!errors.includes(m)) errors = [...errors, m]; }} />{/if}
  {#each errors as e (e)}<span class="problem">{e}</span>{/each}
</span>

<style>
  .embed { display: block; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px 0 2px; }
  .name { display: inline-flex; align-items: center; gap: 6px; font: 11px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); text-decoration: none; }
  .name:hover { color: var(--text); }
  .problem { display: block; color: var(--rose); }
</style>
