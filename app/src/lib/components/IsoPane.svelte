<script lang="ts">
  // Iso's pane: the conversation, what Iso may do in its mode, and what it is sent (the tray).
  import { ALLOWS, panes } from "$lib/panes.svelte.ts";
  import { tray, type Part } from "$lib/tray.svelte.ts";

  const SYM: Record<Part["kind"], string> = { note: "▣", folder: "▭", passage: "“" };
  const said = (p: Part): string => (p.kind === "passage" ? `“${p.text}” from ${p.title}` : p.kind === "folder" ? `the folder ${p.title}` : p.title);
</script>

<div class="iso" class:drop={tray.carrying?.over}>
  <div class="iso-top"><span class="mname">{panes.mode[0]!.toUpperCase() + panes.mode.slice(1)} mode</span> · {ALLOWS[panes.mode]}</div>
  <div class="chat">
    <p class="faint empty">Ask Iso about your notes. What it reads and changes shows on the Atlas and in the note.</p>
  </div>
  <div class="composer">
    <div class="tray" role="list" aria-label="What Iso is sent">
      <span class="lbl">context</span>
      {#each tray.parts as p (tray.keyOf(p))}
        <span class="chip" class:fresh={tray.fresh === tray.keyOf(p)} role="listitem" title={said(p)}>
          <span class="k" aria-hidden="true">{SYM[p.kind]}</span><span class="t">{p.kind === "passage" ? p.text : p.title}</span>
          <button type="button" aria-label="Take {said(p)} out of Iso's context" onclick={() => tray.remove(p)}>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </span>
      {:else}
        <span class="lbl">nothing chosen: Iso sees only your message</span>
      {/each}
    </div>
  </div>
</div>

<style>
  .iso { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .iso.drop { outline: 2px dashed var(--growth); outline-offset: -4px; }
  .iso-top { flex: none; padding: 6px 16px; border-bottom: 1px solid var(--line); font-size: 12px; color: var(--text-faint); }
  .mname { color: var(--growth); }
  .chat { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; }
  .empty { font-size: 12px; }
  .composer { flex: none; border-top: 1px solid var(--line); padding: 10px 12px 12px; display: grid; gap: 8px; }
  .tray { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .lbl { font-size: 11px; color: var(--text-faint); margin-right: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 2px 0 8px; border: 1px solid var(--line-strong); font-size: 12px; color: var(--text-soft); max-width: 100%; }
  .chip .k { color: var(--growth); }
  .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch; }
  .chip button { width: 18px; height: 18px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .chip button:hover { color: var(--rose); }
  .chip.fresh { animation: fresh 1.6s ease-out; }
  @keyframes fresh { 0% { background: color-mix(in srgb, var(--growth) 40%, var(--ground-0)); } }
  @media (prefers-reduced-motion: reduce) { .chip.fresh { animation: none; } }
</style>
