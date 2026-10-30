<script lang="ts">
  // The agents' sessions (M25), in the drawer where Iso's conversations were (M24, K): each with its crystal, when it
  // was last added to, what was first asked, its agent, and how many turns and notes isorite saw. Live ones first,
  // growing while they work; then those the agents keep and those kept here. One chosen is shown: a live one followed,
  // another carried on by its agent if it is attached, else read as it was kept.
  import type { AgentSession } from "@isorite/engine";
  import { converse } from "$lib/converse.svelte.ts";
  import { terminal } from "$lib/terminal.svelte.ts";
  import Crystal from "./Crystal.svelte";

  const DAY = 86_400_000;
  /** When, as a person says it: today with the time, yesterday, the weekday within a week, else the date. */
  function when(at: string): string {
    const d = new Date(at), now = new Date(), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(d.getTime())) return "";
    if (d.getTime() >= midnight) return `today · ${d.toTimeString().slice(0, 5)}`;
    if (d.getTime() >= midnight - DAY) return "yesterday";
    if (d.getTime() >= midnight - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  }
  const many = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
  const sessions = $derived(terminal.view?.sessions ?? []);
  const shown = (s: AgentSession): boolean => s.session === terminal.view?.session && s.agent === terminal.view?.agentId;
  /** What it is, in a word: at work, live, the agent's own (not seen here), or kept here. */
  const state = (s: AgentSession): string => (s.busy ? "at work" : s.live ? "live" : s.kept ? (s.open ? "kept" : "kept · to read") : "the agent's own");
  async function choose(s: AgentSession): Promise<void> {
    await terminal.follow(s.agent, s.session);
    if (!terminal.problem) converse.view = "chat";
  }
</script>

<div class="drawer" role="list" aria-label="The agents' sessions">
  {#if !sessions.length}<p class="faint none">No sessions yet.</p>{/if}
  {#each sessions as s (`${s.agent}/${s.session}`)}
    <div role="listitem">
      <button type="button" class="spec frame" class:on={shown(s)} class:live={s.live} data-lustre aria-current={shown(s) ? "true" : undefined} disabled={!s.open && !s.kept} title={!s.open && !s.kept ? `${s.name} isn't attached to carry it on` : undefined} onclick={() => void choose(s)}>
        <Crystal id={s.session} size={44} growing={s.busy} />
        <span class="m">{s.name} · {state(s)}{when(s.last) ? ` · ${when(s.last)}` : ""}</span>
        <span class="q">{s.title || s.asked || "A session"}</span>
        <span class="m">{s.turns ? `${many(s.notes, "note")} · ${many(s.turns, "turn")}` : "not carried here yet"}</span>
      </button>
    </div>
  {/each}
  {#if terminal.problem}<p class="bad none" role="alert">{terminal.problem}</p>{/if}
</div>

<style>
  .drawer { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); align-content: start; gap: 11px; }
  .none { grid-column: 1 / -1; font-size: 12px; }
  .bad { color: var(--rose); }
  .spec { --cut: 8px; --inside: var(--ground-1); --edge: var(--line); width: 100%; padding: 14px; display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 4px 14px; align-content: start; text-align: left; color: var(--text-faint); cursor: pointer; --glint: .25; transition: color var(--t-ack) var(--ease-out); }
  .spec :global(.crystal) { grid-row: span 3; }
  .spec:hover:not(:disabled) { --edge: var(--line-strong); color: var(--growth); }
  .spec:disabled { cursor: default; opacity: .6; }
  .spec.live { color: var(--growth); }
  /* The one shown (P: chosen): its edge in the lattice and its crystal in gold. */
  .spec.on { --edge: var(--lattice); color: var(--growth); }
  .q { font: 15px/22px var(--font-text); color: var(--text); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .m { font: 11px/16px var(--font-ui); color: var(--text-faint); text-transform: uppercase; letter-spacing: .06em; overflow-wrap: anywhere; }
</style>
