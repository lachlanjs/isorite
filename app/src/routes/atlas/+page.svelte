<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { SessionMoment } from "@isorite/core";
  import Atlas from "$lib/components/Atlas.svelte";
  import Timeline from "$lib/components/Timeline.svelte";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { momentKey } from "$lib/timeline.ts";

  // `?pick=<a note for Iso>`: the map is then for linking notes to it.
  // With hash routing the question mark is inside the fragment.
  const pick = $derived(page.url.searchParams.get("pick") ?? new URLSearchParams(page.url.hash.split("?")[1] ?? "").get("pick") ?? "");

  // The session's timeline on the map (Atlas-Timeline): open or not as the note's is, marks only. Pointing at one
  // outlines the note it touched and names it beside the mark; choosing one opens the note at that moment.
  const remembered = (): boolean => { try { return localStorage.getItem("isorite.timeline") === "1"; } catch { return false; } };
  let timeline = $state(remembered());
  let moments = $state.raw<SessionMoment[]>([]);
  let pointed = $state.raw<SessionMoment | null>(null);
  const titleOf = (id: string): string => app.listing.notes.find((n) => n.id === id)?.title ?? id.split("/").at(-1)!;
  const isos = (m: SessionMoment) => m.who.startsWith("iso:") || m.who.startsWith("agent:");

  async function read() {
    // Notes for Iso not yet kept are not on the map.
    try { moments = (await app.api.timeline()).filter((m) => !m.note.startsWith("@draft/")); } catch { /* the next entry asks again */ }
  }
  $effect(() => {
    if (!timeline) return;
    void read();
    let again: ReturnType<typeof setTimeout> | undefined;
    const off = app.on((e) => { if (e.type === "journal") { clearTimeout(again); again = setTimeout(() => { void read(); }, 300); } });
    return () => { off(); clearTimeout(again); };
  });
  function openAt(m: SessionMoment) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
    void goto(`${noteHref(m.note)}?at=${encodeURIComponent(momentKey(m))}`);
  }
  function toggle() {
    timeline = !timeline; pointed = null;
    try { localStorage.setItem("isorite.timeline", timeline ? "1" : "0"); } catch { /* not kept */ }
  }
</script>

<div class="map">
  <Atlas pick={pick ? `@draft/${pick}` : ""} moment={pointed ? { note: pointed.note, who: isos(pointed) ? "iso" : "you" } : null} />
  {#if !pick}
    <div class="side">
      <button class="icon" type="button" aria-label="timeline" title="timeline" aria-pressed={timeline} onclick={toggle}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1v14" stroke="currentColor" stroke-width="1.2" fill="none" /><rect x="5.5" y="2" width="5" height="3.2" fill="currentColor" /><path d="M8 6.3l2.3 2.3L8 10.9 5.7 8.6z" fill="currentColor" /><rect x="5.5" y="12" width="5" height="3" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      {#if timeline}
        <Timeline {moments} at={null} {pointed} leftward name="This session's timeline" label={(m) => titleOf((m as SessionMoment).note)}
          point={(m) => (pointed = m as SessionMoment | null)}
          pick={(m) => openAt(m as SessionMoment)} />
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The map has the page: all that the header, the status line and (on a phone) the tabs leave. */
  .map { position: relative; height: calc(100dvh - var(--bar-h) - 28px); }
  @media (max-width: 600px) { .map { height: calc(100dvh - var(--bar-h) - 28px - 56px - env(safe-area-inset-bottom)); } }
  .side { position: absolute; top: 16px; right: 16px; z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .icon:hover, .icon:focus-visible { color: var(--text); }
  .icon[aria-pressed="true"] { color: var(--text-soft); }
  /* The session's timeline on a phone's Atlas is still open on the boards. */
  @media (max-width: 600px) { .side { display: none; } }
</style>
