<script lang="ts">
  // The agent's sessions, in the drawer where the agent's conversations were (M24, K): a list, a row each with its crystal,
  // what was first asked, and when it was last added to; a live one has a dot, gold while it works. Fork and remove
  // come on the row under the pointer. One chosen is shown: a live one followed, another carried on, else read as it
  // was kept. Under them, the agent's own conversations from before M25, to read.
  import type { AgentSession } from "@isorite/engine";
  import { plainAsked, terminal } from "$lib/terminal.svelte.ts";
  import { fadeIn, glide } from "$lib/motion.ts";
  import Crystal from "./Crystal.svelte";
  import OwnFiles from "./OwnFiles.svelte";

  const DAY = 86_400_000;
  /** When, as a person says it: the time today, yesterday, the weekday within a week, else the date. */
  function when(at: string): string {
    const d = new Date(at), now = new Date(), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(d.getTime())) return "";
    if (d.getTime() >= midnight) return d.toTimeString().slice(0, 5);
    if (d.getTime() >= midnight - DAY) return "yesterday";
    if (d.getTime() >= midnight - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  }
  const many = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
  // Live first, then by when last used.
  const sessions = $derived([...(terminal.view?.sessions ?? [])].sort((a, b) => Number(b.live) - Number(a.live) || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)));
  const shown = (s: AgentSession): boolean => !terminal.old && s.session === terminal.view?.session && s.agent === terminal.view?.agentId;
  const titleOf = (s: AgentSession): string => plainAsked(s.title) || plainAsked(s.asked) || "A session";
  /** The session being asked about removing: its kept copy goes, the agent's own history does not. */
  let removing = $state("");
  const idOf = (s: AgentSession): string => `${s.agent}/${s.session}`;
  async function removePast(id: string): Promise<void> { removing = ""; await terminal.forgetPast(id); }
  async function remove(s: AgentSession): Promise<void> { removing = ""; await terminal.forget(s.agent, s.session); }
  async function fork(s: AgentSession): Promise<void> {
    await terminal.fork(s.agent, s.session);
    if (!terminal.problem) terminal.shown = "session";
  }
  async function choose(s: AgentSession): Promise<void> {
    await terminal.follow(s.agent, s.session);
    if (!terminal.problem) terminal.shown = "session";
  }
</script>

<div class="drawer">
  <div role="list" aria-label="The agents' sessions">
    {#if !sessions.length}<p class="none">No sessions yet.</p>{/if}
    {#each sessions as s (idOf(s))}
      <div role="listitem" animate:glide in:fadeIn>
        <button type="button" class="row" class:on={shown(s)} data-lustre aria-current={shown(s) ? "true" : undefined} disabled={!s.open && !s.kept} title={!s.open && !s.kept ? `${s.name} isn't set up to carry it on` : `${s.name}${s.turns ? ` · ${many(s.turns, "turn")}` : ""}`} onclick={() => void choose(s)}>
          <span class="cr"><Crystal id={s.session} size={28} growing={s.busy} /></span>
          <span class="q">{titleOf(s)}</span>
          <span class="m">{#if s.live}<i class="live" class:busy={s.busy} aria-label={s.busy ? "at work" : "live"}></i>{/if}{when(s.last)}</span>
        </button>
        {#if removing === idOf(s)}
          <p class="sure" role="group" aria-label="Remove the kept copy">Remove from isorite? <span class="faint">The agent's history stays.</span>
            <button type="button" class="link bad" onclick={() => void remove(s)}>remove</button><button type="button" class="link" onclick={() => (removing = "")}>keep</button></p>
        {:else}
          <span class="acts">
            {#if terminal.view?.fork && s.kept}
              <button type="button" class="act" aria-label="Fork {titleOf(s)}: a new session from here" title="Fork: a new session from here" onclick={() => void fork(s)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="3.5" r="1.5" /><circle cx="5" cy="12.5" r="1.5" /><circle cx="11" cy="5.5" r="1.5" /><path d="M5 5v6M11 7c0 3-6 2-6 4" /></svg></button>
            {/if}
            {#if s.kept && !s.live}
              <button type="button" class="act del" aria-label="Remove the kept copy of {titleOf(s)}" title="Remove" onclick={() => (removing = idOf(s))}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></svg></button>
            {/if}
          </span>
        {/if}
      </div>
    {/each}
  </div>
  {#if terminal.past.length}
    <h2 class="label">Archived</h2>
    <div role="list" aria-label="Earlier conversations">
      {#each terminal.past as c (c.id)}
        <div role="listitem">
          <button type="button" class="row" class:on={terminal.old?.session === c.id} data-lustre aria-current={terminal.old?.session === c.id ? "true" : undefined} title="{many(c.notes, 'note')} · {many(c.turns, 'turn')}" onclick={() => void terminal.read(c.id)}>
            <span class="cr"><Crystal id={c.id} size={28} /></span>
            <span class="q">{c.asked}</span>
            <span class="m">{when(c.last)}</span>
          </button>
          {#if removing === `legacy/${c.id}`}
            <p class="sure" role="group" aria-label="Remove this conversation">Remove this conversation? <button type="button" class="link bad" onclick={() => void removePast(c.id)}>remove</button><button type="button" class="link" onclick={() => (removing = "")}>keep</button></p>
          {:else}
            <span class="acts"><button type="button" class="act del" aria-label="Remove the conversation {c.asked}" title="Remove" onclick={() => (removing = `legacy/${c.id}`)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></svg></button></span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  {#if terminal.problem}<p class="bad none" role="alert">{terminal.problem}</p>{/if}
  <OwnFiles />
</div>

<style>
  .drawer { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 12px 10px 16px; display: flex; flex-direction: column; gap: 2px; }
  .none { margin: 8px 6px; font: var(--fs-small) var(--font-ui); color: var(--text-faint); }
  .label { margin: 18px 8px 6px; }
  .bad { color: var(--rose); }
  .faint { color: var(--text-faint); }
  [role="listitem"] { position: relative; }
  /* A row: its crystal, what was first asked, and at the right when; the one shown is a quiet chosen fill. */
  .row { width: 100%; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 44px; padding: 6px 10px; background: none; border: 0; border-radius: var(--round); text-align: left; color: var(--text-faint); cursor: pointer; transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out); }
  .row:hover:not(:disabled) { background: var(--fill-hover); color: var(--growth); }
  .row.on { background: var(--fill-chosen); color: var(--growth); }
  .row:disabled { cursor: default; opacity: .6; }
  .cr { display: grid; place-items: center; }
  .q { font: 0.875rem/1.35 var(--font-text); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m { display: inline-flex; align-items: center; gap: 6px; font: var(--fs-meta) var(--font-ui); color: var(--text-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .live { width: 6px; height: 6px; border-radius: 50%; background: var(--malachite); }
  .live.busy { background: var(--growth); box-shadow: 0 0 6px var(--growth); }
  /* Fork and remove: on the row under the pointer (always on a touch screen), over its time. */
  .acts { position: absolute; right: 6px; top: 50%; translate: 0 -50%; display: flex; gap: 2px; opacity: 0; pointer-events: none; transition: opacity var(--dur-1) var(--ease-out); }
  [role="listitem"]:hover .acts, [role="listitem"]:focus-within .acts { opacity: 1; pointer-events: auto; }
  [role="listitem"]:hover .m, [role="listitem"]:focus-within .m { visibility: hidden; }
  @media (hover: none) { .acts { opacity: 1; pointer-events: auto; position: static; translate: none; justify-content: flex-end; } [role="listitem"] .m { visibility: visible !important; } }
  .act { width: 28px; height: 28px; display: grid; place-items: center; background: var(--surface-raised); border: 0; border-radius: var(--round); color: var(--text-faint); cursor: pointer; }
  .act:hover, .act:focus-visible { color: var(--text); background: var(--fill-chosen); }
  .act.del:hover { color: var(--rose); }
  .sure { margin: 2px 10px 8px 50px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font: var(--fs-small) var(--font-ui); color: var(--text-soft); }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .link.bad { color: var(--rose); }
</style>
