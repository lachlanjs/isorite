<script lang="ts">
  // A pane's header: its name, then its switches (M12: in place of M10's lenses and Iso's modes), its own tools, and
  // at its right the pane's settings (M10b: there is no header above the panes). A switch says what it is on hover;
  // when on, its icon takes its colour, with a bar under it. What does not fit in the header folds into a menu at its
  // right ("more"), the least needed first: the folder it is in, then the switches from the last, then what the pane
  // says and its gauge, then the tools; the menu lists them, and a row does what its button did.
  import { onMount, tick, type Snippet } from "svelte";
  import { SWITCHES, panes, type Pane, type Switch } from "$lib/panes.svelte.ts";
  import BaseSwitch from "./BaseSwitch.svelte";
  import Glyph from "./Glyph.svelte";
  import type { Glyph as GlyphKind } from "$lib/glyphs.ts";

  // The switches that stand for a kind of thing on the Atlas wear that kind's glyph (M30), the one the Atlas draws for it;
  // the rest (provenance, the timeline, what an agent may do) are drawn here, on the same grid and stroke.
  const KIND: Partial<Record<Switch, GlyphKind>> = { questions: "question", problems: "problem", web: "web", code: "code", pictures: "image", artifacts: "artifact" };

  // `first`: the pane that stands first, whose name follows the base's (M20).
  let { pane, name, tools, settings, first = false }: { pane: Pane; name: string; tools?: Snippet; settings?: Snippet; first?: boolean } = $props();

  const SAYS: Record<Switch, string> = {
    provenance: "Provenance: whose words are whose (Alt+P)", timeline: "Timeline (Alt+T)", context: "The agent's context: what it was given, what it read and changed (Alt+C)",
    questions: "Open questions (Alt+Q)", problems: "Problems (Alt+B)", web: "Links to the web (Alt+W)", code: "Links to code (Alt+K)", pictures: "Pictures, data and other files beside the notes (Alt+I)", artifacts: "Artifacts beside the notes (Alt+A)",
    notes: "Agents may edit the notes (Alt+N)", files: "The agent may edit the project's files (Alt+F)", run: "The agent may run commands (Alt+R)",
  };
  // On the Atlas, each switch also says its name when the pane is wide enough (the pane is resized, so it is the pane's
  // width that decides, not the screen's: see the container queries below).
  const NAMES: Partial<Record<Switch, string>> = { questions: "questions", problems: "problems", web: "web", code: "code", pictures: "files", artifacts: "artifacts", context: "context" };
  const COLOUR: Record<Switch, string> = { provenance: "growth", timeline: "lattice", questions: "rose", problems: "text", web: "lattice", code: "lattice", pictures: "lattice", artifacts: "lattice", context: "growth", notes: "growth", files: "growth", run: "growth" };
  // The project's files and commands are the terminal's: offered only while one is attached (M11).
  const shown = $derived((SWITCHES[pane] as readonly Switch[]).filter((k) => (k !== "files" && k !== "run") || panes.attached));
  const open = $derived(panes.settings === pane);
  let menu = $state<HTMLElement>();
  $effect(() => { if (open) menu?.focus(); });
  // A press outside the settings, and not on their button, closes them (and the folded menu).
  function outside(e: PointerEvent): void {
    if (!(e.target instanceof Element)) return;
    if (folds && !foldMenu?.contains(e.target) && !e.target.closest(`[data-more="${pane}"]`)) folds = false;
    if (!open) return;
    if (menu?.contains(e.target) || e.target.closest(`[data-settings="${pane}"]`)) return;
    panes.settings = null;
  }

  // ------------------------------------------------------------ what does not fit

  let head = $state<HTMLElement>();
  let foldMenu = $state<HTMLElement>();
  let folded = $state(0);
  let folds = $state(false);
  type Row = { label: string; icon: string; pressed: boolean | null; act: (() => void) | null };
  let rows = $state.raw<Row[]>([]);

  /** What can fold: the switches, and what the pane's tools put in the header. */
  const movable = (): HTMLElement[] => (head ? [...head.querySelectorAll<HTMLElement>(".sw, .tools > *")] : []);
  /** Which goes first: the folder it is in, then the switches (from the last), then what the pane says and its gauge,
   *  then the rest (the agent's name, the buttons that are the pane's own). */
  const rank = (el: HTMLElement): number => (el.matches(".where") ? 0 : el.matches(".sw") ? 1 : el.matches(".says, .gauge") ? 2 : 3);

  function fit(): void {
    if (!head) return;
    const items = movable();
    for (const el of items) el.removeAttribute("data-folded");
    const css = getComputedStyle(head), gap = parseFloat(css.columnGap) || 6;
    const room = head.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    // What the header would take with everything in it: its direct children, the tools' too, but not the space that grows.
    const flat = [...head.children].flatMap((c) => (c.classList.contains("tools") ? [...c.children] : [c])).filter((c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains("grow") && !c.classList.contains("more") && c.offsetWidth > 0);
    let need = flat.reduce((t, c) => t + c.offsetWidth, 0) + Math.max(0, flat.length - 1) * gap;
    const widths = new Map(items.map((el) => [el, el.offsetWidth + (el.matches(".sw") ? 2 : gap)]));
    let n = 0;
    if (need > room) {
      need += 28 + gap; // the button that opens the menu
      const order = items.map((el, i) => ({ el, i })).filter(({ el }) => el.offsetWidth > 0).sort((a, b) => rank(a.el) - rank(b.el) || b.i - a.i);
      for (const { el } of order) {
        if (need <= room) break;
        el.setAttribute("data-folded", "");
        need -= widths.get(el) ?? 0;
        n++;
      }
    }
    folded = n;
    if (!n) folds = false;
  }
  let frame = 0;
  const later = (): void => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
  onMount(() => {
    const size = new ResizeObserver(later), content = new MutationObserver(later);
    if (head) { size.observe(head); content.observe(head, { childList: true, subtree: true, characterData: true }); }
    later();
    return () => { size.disconnect(); content.disconnect(); cancelAnimationFrame(frame); };
  });

  /** The menu's rows: what is folded, as it reads in the header, each doing what its button did. */
  function list(): Row[] {
    const folded = head ? [...head.querySelectorAll<HTMLElement>("[data-folded]")] : [];
    return folded.map((el) => ({
      label: (el.getAttribute("aria-label") || el.textContent || el.title || "").replace(/\s+/g, " ").trim(),
      icon: el.querySelector("svg")?.outerHTML ?? "",
      pressed: el.hasAttribute("aria-pressed") ? el.getAttribute("aria-pressed") === "true" : null,
      act: el instanceof HTMLButtonElement ? () => el.click() : null,
    }));
  }
  async function toggleFolds(): Promise<void> {
    folds = !folds;
    if (!folds) return;
    rows = list();
    await tick();
    foldMenu?.querySelector<HTMLElement>("button")?.focus();
  }
  function choose(row: Row): void { row.act?.(); folds = false; requestAnimationFrame(() => head?.querySelector<HTMLElement>(`[data-more="${pane}"]`)?.focus()); }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => { if (e.key !== "Escape") return; if (folds) folds = false; else if (open) panes.settings = null; }} />

<header class="phead" class:named={pane === "atlas"} data-head={pane} bind:this={head}>
  {#if first}<BaseSwitch />{/if}
  <span class="pname">{name}</span>
  <span class="switches" role="group" aria-label="{name}'s switches">
    {#each shown as k (k)}
      <button type="button" class="sw" data-switch={k} aria-pressed={panes.on[k]} aria-label={SAYS[k].replace(/ \(Alt\+.\)$/, "")} title={SAYS[k]} style:--c="var(--{COLOUR[k]})" onclick={() => panes.flip(k)}>
        {#if KIND[k]}<Glyph kind={KIND[k]!} size={16} />{:else}
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">
          {#if k === "provenance"}<rect x="2.5" y="2.5" width="11" height="11" /><path d="M8 2.5v11" /><rect x="8.6" y="3.1" width="4.3" height="9.8" fill="currentColor" stroke="none" />
          {:else if k === "timeline"}<path d="M8 1v14" stroke-width="1.2" /><rect x="5.5" y="2" width="5" height="3.2" fill="currentColor" stroke="none" /><path d="M8 6.3l2.3 2.3L8 10.9 5.7 8.6z" fill="currentColor" stroke="none" /><rect x="5.5" y="12" width="5" height="3" stroke-width="1.2" />
          {:else if k === "context"}<rect x="2.5" y="2.5" width="11" height="2.5" fill="currentColor" stroke="none" /><rect x="2.5" y="6.75" width="7" height="2.5" fill="currentColor" stroke="none" /><rect x="2.5" y="11" width="9" height="2.5" fill="currentColor" stroke="none" />
          {:else if k === "notes"}<path d="M2.5 13.5l2.5-2.5M5 11c.6-4.2 3.6-7.4 8.5-8.5C12.6 7.2 9.4 10.4 5 11zM7.2 8.8l2.6-.3M8.8 6.6l2.4-.4" />
          {:else if k === "files"}<path d="M3.5 2.5h5.5l3.5 3.5v7.5h-9z" /><path d="M9 2.5V6h3.5" />
          {:else}<path d="M3 4.5l3 3.5-3 3.5M7.5 12h5.5" />{/if}
        </svg>{/if}
        {#if NAMES[k]}<span class="lbl" aria-hidden="true">{NAMES[k]}</span>{/if}
      </button>
    {/each}
  </span>
  <span class="grow"></span>
  <span class="tools">{@render tools?.()}</span>
  {#if folded}
    <button class="icon more" type="button" data-more={pane} aria-label="More of {name}'s tools" aria-haspopup="menu" aria-expanded={folds} title="More" onclick={() => void toggleFolds()}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg>
    </button>
  {/if}
  {#if settings}
    <button class="icon gear" type="button" data-settings={pane} aria-label="{name} settings" aria-expanded={open} title="{name} settings" onclick={() => (panes.settings = open ? null : pane)}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /><rect x="9" y="3" width="2.5" height="3" fill="var(--ground-0)" /><rect x="4.5" y="6.5" width="2.5" height="3" fill="var(--ground-0)" /><rect x="10" y="10" width="2.5" height="3" fill="var(--ground-0)" /></svg>
    </button>
  {/if}
</header>
{#if folds && folded}
  <div class="frame foldmenu" role="menu" aria-label="More of {name}'s tools" tabindex="-1" bind:this={foldMenu}>
    {#each rows as r, i (i)}
      {#if r.act}
        <button type="button" class="row" role={r.pressed === null ? "menuitem" : "menuitemcheckbox"} aria-checked={r.pressed === null ? undefined : r.pressed} onclick={() => choose(r)}>
          <span class="ic" aria-hidden="true">{@html r.icon}</span><span class="t">{r.label}</span>{#if r.pressed}<span class="on" aria-hidden="true"></span>{/if}
        </button>
      {:else}
        <p class="row said" role="presentation">{r.label}</p>
      {/if}
    {/each}
  </div>
{/if}
{#if settings && open}
  <div class="frame settings" role="dialog" aria-label="{name} settings" tabindex="-1" bind:this={menu}>
    <span class="frame-title">{name.toLowerCase()}</span>
    <!-- Scrolled inside, so the frame's title, which stands over its edge, is not cut off. -->
    <div class="inner">{@render settings()}</div>
  </div>
{/if}

<style>
  .phead { container: phead / inline-size; height: 40px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 10px 0 16px; border-bottom: 1px solid var(--line); white-space: nowrap; user-select: none; position: relative; min-width: 0; overflow: hidden; }
  .pname { font-family: var(--font-pixel); font-size: 15px; color: var(--text-soft); display: flex; align-items: center; gap: 8px; margin-right: 6px; }
  .pname::before { content: ""; width: 6px; height: 6px; background: var(--line-strong); }
  :global(.pane.focus) .pname { color: var(--text); }
  :global(.pane.focus) .pname::before { background: var(--lattice); }
  .switches { display: flex; align-items: center; gap: 1px; margin-left: -4px; }
  .sw { position: relative; width: 28px; height: 28px; display: grid; place-items: center; background: none; border: 0; padding: 0; color: var(--text-faint); cursor: pointer; }
  .sw:hover, .sw:focus-visible { color: var(--text); }
  .sw[aria-pressed="true"] { background: var(--c, var(--lattice)); color: var(--ground-0); --cut: 4px; clip-path: var(--chosen-cut); }
  .lbl { display: none; font: 12px/1 var(--font-ui); letter-spacing: .02em; }
  /* The Atlas's switches, the kinds it shows: each is tinted its own colour while off, so what it would bring back is
     seen, and they take the width the pane has: wider buttons first, then each with its name. */
  .named .sw:not([aria-pressed="true"]) { color: color-mix(in srgb, var(--c) 55%, var(--text-faint)); }
  .named .sw:not([aria-pressed="true"]):hover, .named .sw:not([aria-pressed="true"]):focus-visible { color: var(--c); }
  @container phead (min-width: 520px) {
    .named .switches { gap: 3px; }
    .named .sw { width: 38px; }
    .named .sw :global(svg) { width: 18px; height: 18px; }
  }
  @container phead (min-width: 760px) {
    .named .switches { gap: 4px; }
    .named .sw { width: auto; padding: 0 12px 0 10px; display: inline-flex; align-items: center; gap: 7px; }
    .named .lbl { display: inline; }
  }
  .grow { flex: 1 1 auto; }
  /* The pane's tools lie in the header as if put there directly; any folded away are not drawn. */
  .tools { display: contents; }
  .phead :global([data-folded]) { display: none !important; }
  .foldmenu { --inside: var(--ground-2); filter: var(--lift-drop); animation: appear var(--t-ack) var(--ease-out); position: absolute; z-index: 21; top: 44px; right: 8px; min-width: 200px; max-width: calc(100% - 16px); padding: 6px; display: grid; gap: 1px; white-space: nowrap; }
  .row { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 10px; background: none; border: 0; color: var(--text); font: 13px var(--font-ui); text-align: left; cursor: pointer; margin: 0; }
  button.row:hover, button.row:focus-visible { background: var(--ground-3); outline: none; }
  .row .ic { width: 16px; height: 16px; display: grid; place-items: center; flex: none; color: var(--text-soft); }
  .row .ic :global(svg) { width: 16px; height: 16px; }
  .row .t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .row .on { width: 6px; height: 6px; background: var(--lattice); flex: none; }
  .row.said { color: var(--text-faint); font-size: 12px; cursor: default; white-space: normal; }
  .more[aria-expanded="true"] { color: var(--text); box-shadow: inset 0 -2px 0 var(--text); }
  /* The Agent's and the Atlas's headers are full on a phone: the base is switched from the Note pane's there, rather than shown
     squeezed to nothing beside a stray slash. */
  @container phead (max-width: 440px) { .phead:is([data-head="iso"], [data-head="atlas"]) :global(:is(.base, .slash)) { display: none; } }
  .icon { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-faint); flex: none; background: none; border: 0; padding: 0; cursor: pointer; }
  .icon:hover, .icon:focus-visible { color: var(--text); }
  .gear[aria-expanded="true"] { color: var(--text); box-shadow: inset 0 -2px 0 var(--text); }
  .settings { --inside: var(--ground-2); filter: var(--lift-drop); animation: appear var(--t-ack) var(--ease-out); position: absolute; z-index: 21; top: 54px; right: 8px; width: min(400px, calc(100% - 16px)); padding: 0; white-space: normal; user-select: text; }
  .inner { max-height: calc(100dvh - 140px); overflow: auto; padding: 24px 18px 14px; display: flex; flex-direction: column; gap: var(--space-6); }
  .settings:focus-visible { outline: none; }
  @media (max-width: 760px) {
    .phead { height: 48px; }
    .settings { top: 62px; }
    .foldmenu { top: 56px; }
    .inner { max-height: calc(100dvh - 210px); }
  }
</style>
