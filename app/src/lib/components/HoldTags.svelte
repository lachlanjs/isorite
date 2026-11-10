<script lang="ts">
  // What a press and hold on a note or a folder shows (M33): four tags standing out round it, a quarter of a turn apart,
  // each on a stem from its edge: move (blue, up), rename (a folder only, blue, up and left), send to the agent (gold), delete (rose), hide (grey, left). They grow out from the item;
  // each leans towards the pointer as it comes near, and the one it is on fills, with the item answering (rose, it
  // trembles; gold, it glows). Reached, move picks the item up: its card lifts from where it was to the pointer and is
  // carried (`mode` "ghost"), put down into the folder it is let go over or taken back. `mode`: round an item in the
  // list (the tags centred on where it was pressed) or on the Atlas (round the item's block), or the card carried.
  import { toBody, type Gesture, type Tag } from "$lib/gesture.svelte.ts";

  let { g, mode, bounds }: { g: Gesture; mode: "row" | "point" | "ghost"; /** The box the tags are kept within. */ bounds?: DOMRect | null } = $props();

  const LABEL: Record<Tag, string> = { move: "move", send: "send to the agent", delete: "delete", hide: "hide", rename: "rename" };
  /** Each tag's way out from the item, in degrees (0 to the right, 90 down): move up, send towards the agent's pane. */
  const WAY: [Tag, number][] = [["move", -90], ["send", 0], ["delete", 90], ["hide", 180]];
  /** A folder has a fifth, to rename it, between move and hide. */
  const ways = $derived(g.item?.kind === "folder" && g.item.id ? [...WAY, ["rename", -135] as [Tag, number]] : WAY);
  const HALF = 17, GAP = 12; // the tag's half side; the stem between the item's edge and the tag

  type Petal = { tag: Tag; x: number; y: number; ex: number; ey: number; ux: number; uy: number; below: boolean };
  const ring = $derived.by((): { cx: number; cy: number; petals: Petal[] } | null => {
    const r = g.rect;
    if (mode === "ghost" || g.phase !== "held" || !r) return null;
    // In the list a row is as wide as the list: the tags stand round where it was pressed, at the row's height.
    const w = mode === "row" ? Math.min(r.width, 120) : r.width, h = r.height;
    const cx = mode === "row" ? Math.min(Math.max(g.origin.x, r.left + w / 2), r.right - w / 2) : r.left + r.width / 2, cy = r.top + r.height / 2;
    const b = bounds ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const place = (turn: number): Petal[] => ways.map(([tag, deg]) => {
      const t = ((deg + turn) * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t);
      // Where the way leaves the item's box, then the stem, then the tag's middle.
      const edge = Math.min(Math.abs(ux) > 1e-6 ? w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? h / 2 / Math.abs(uy) : Infinity);
      const out = edge + GAP + HALF * 1.2;
      return { tag, x: cx + ux * out, y: cy + uy * out, ex: cx + ux * edge, ey: cy + uy * edge, ux, uy, below: uy > 0.2 };
    });
    // Turned as little as it takes to keep every tag in the pane; where none keeps them all in (an item at its very
    // edge), the turn that leaves least of them out.
    const outside = (p: Petal[]) => p.reduce((t, q) => t + Math.max(0, b.left - (q.x - HALF - 4)) + Math.max(0, q.x + HALF + 4 - b.right) + Math.max(0, b.top - (q.y - HALF - 4)) + Math.max(0, q.y + HALF + 4 - b.bottom), 0);
    let best = place(0), least = outside(best);
    for (const turn of [0, 20, -20, 40, -40, 60, -60, 90, -90, 120, -120, 180]) {
      const p = place(turn), out = outside(p);
      if (out === 0) return { cx, cy, petals: p };
      if (out < least) { best = p; least = out; }
    }
    return { cx, cy, petals: best };
  });
  /** How near the pointer is to a tag: 0 far off, 1 on it. */
  const near = (p: Petal): number => Math.max(0, Math.min(1, (84 - Math.hypot(g.x - p.x, g.y - p.y)) / 64));

  /** The card, picked up: it lifts from the item's place to the pointer, rather than appearing there. */
  function lifted(node: HTMLElement, from: DOMRect | null) {
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const at = node.getBoundingClientRect();
    node.animate([{ translate: `${from.left - at.left}px ${from.top - at.top}px`, rotate: "0deg", scale: "1", boxShadow: "none" }, {}], { duration: 200, easing: "cubic-bezier(.2, .7, .2, 1)" });
  }
</script>

{#if mode === "ghost"}
  {#if g.phase === "moving" && g.item}
    <div class="ghost" class:ready={g.over !== null} use:toBody use:lifted={g.rect} style:left="{g.x + 12}px" style:top="{g.y + 12}px" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3">{#if g.item.kind === "folder"}<path d="M1.5 4.5h5l1.5 2h6.5v6.5h-13z" />{:else}<path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" />{/if}</svg>
      <span>{g.item.title}</span>
    </div>
  {/if}
{:else if ring}
  <div class="ring" use:toBody role="presentation">
    <svg class="stems" aria-hidden="true">
      {#each ring.petals as p, i (p.tag)}
        <line class={p.tag} class:on={g.tag === p.tag} pathLength="1" x1={p.ex} y1={p.ey} x2={p.x - p.ux * HALF} y2={p.y - p.uy * HALF} style="--i:{i};--near:{near(p)}" />
      {/each}
    </svg>
    {#each ring.petals as p, i (p.tag)}
      <span class="petal {p.tag}" class:on={g.tag === p.tag} class:below={p.below} data-tag={p.tag} aria-label={LABEL[p.tag]} style="left:{p.x}px;top:{p.y}px;--dx:{p.x - ring.cx};--dy:{p.y - ring.cy};--i:{i};--near:{near(p)}">
        <span class="face">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            {#if p.tag === "move"}<path d="M8 2v12M2 8h12M6.3 3.7L8 2l1.7 1.7M6.3 12.3L8 14l1.7-1.7M3.7 6.3L2 8l1.7 1.7M12.3 6.3L14 8l-1.7 1.7" />
            {:else if p.tag === "hide"}<path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4z" /><path d="M2.5 13.5l11-11" />
            {:else if p.tag === "rename"}<path d="M2.5 13.5l.7-3L11 2.7l2.3 2.3-7.8 7.8zM9.6 4.1l2.3 2.3" />
            {:else if p.tag === "delete"}<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9M7 7v4.5M9 7v4.5" />
            {:else}<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" /><path d="M6 8h4M8.6 6.6L10 8 8.6 9.4" />{/if}
          </svg>
        </span>
        <span class="lbl">{LABEL[p.tag]}</span>
      </span>
    {/each}
  </div>
{/if}

<style>
  .ring { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
  /* Each stem draws out from the item's edge as its tag comes; it grows firmer as the pointer nears its tag. */
  .stems { position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; overflow: visible; }
  .stems line { stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: calc(.4 + .6 * var(--near)); animation: stem var(--t-change) var(--ease-out) forwards; animation-delay: calc(var(--i) * 30ms); }
  .stems line.on { stroke-width: 2.5; opacity: 1; }
  .stems .move { stroke: var(--lattice); } .stems .delete { stroke: var(--rose); } .stems .send { stroke: var(--growth); } .stems .hide { stroke: var(--text-faint); } .stems .rename { stroke: var(--lattice); }
  @keyframes stem { to { stroke-dashoffset: 0; } }

  /* A tag: a cut-corner square in its colour, as the frames are, growing out from the item to its place. */
  .petal { --c: var(--lattice); position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; pointer-events: auto; color: var(--c);
    scale: calc(1 + .14 * var(--near)); transition: scale var(--t-ack) var(--ease-out), filter var(--t-ack) var(--ease-out);
    filter: drop-shadow(0 0 calc(var(--near) * 8px) color-mix(in srgb, var(--c) calc(var(--near) * 70%), transparent)) drop-shadow(0 4px 8px rgb(0 0 0 / .25));
    animation: petal var(--t-change) cubic-bezier(.2, 1.3, .4, 1) backwards, armed 0s linear var(--t-change) backwards; animation-delay: calc(var(--i) * 30ms), var(--t-change); }
  /* Not something to point at until it has come out: on its way it passes under the pointer, which would take the
     pointer off the item (and its links' light with it) for a moment. */
  @keyframes armed { from { pointer-events: none; } }
  .petal.delete { --c: var(--rose); } .petal.send { --c: var(--growth); } .petal.hide { --c: var(--text-faint); } .petal.rename { --c: var(--lattice); }
  @keyframes petal { from { translate: calc(var(--dx) * -1px) calc(var(--dy) * -1px); scale: .3; opacity: 0; } }
  .face { position: absolute; inset: 0; display: grid; place-items: center; background: var(--c);
    clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
  .face::before { content: ""; position: absolute; inset: 1.5px; background: var(--ground-2); transition: background-color var(--t-ack) var(--ease-out);
    clip-path: polygon(7.4px 0, 100% 0, 100% calc(100% - 7.4px), calc(100% - 7.4px) 100%, 0 100%, 0 7.4px); }
  .face svg { position: relative; transition: color var(--t-ack) var(--ease-out); }
  /* On it: filled, and its name said beside it. */
  .petal.on { scale: 1.16; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c) 70%, transparent)) drop-shadow(0 4px 8px rgb(0 0 0 / .25)); }
  .petal.on .face::before { background: var(--c); }
  .petal.on .face svg { color: var(--ground-0); }
  .lbl { position: absolute; left: 50%; bottom: calc(100% + 6px); translate: -50% 4px; padding: 2px 6px; font: 0.6875rem/1.4 var(--font-ui); white-space: nowrap; color: var(--c); background: var(--ground-0); opacity: 0; transition: opacity var(--t-ack) var(--ease-out), translate var(--t-ack) var(--ease-out); }
  .petal.below .lbl { bottom: auto; top: calc(100% + 6px); translate: -50% -4px; }
  .petal.on .lbl { opacity: 1; translate: -50% 0; }

  /* The card carried: lifted, a little turned, with a shadow under it; over a folder it can be put down in, it rights
     itself and settles a little, ready to be placed. */
  .ghost { position: fixed; z-index: 60; pointer-events: none; display: flex; align-items: center; gap: 6px; padding: 6px 10px; max-width: 260px;
    font: 0.8125rem var(--font-ui); color: var(--text); background: var(--ground-2); border: 1px solid var(--lattice); border-radius: var(--round);
    box-shadow: 0 14px 28px rgb(0 0 0 / .32), 0 3px 8px rgb(0 0 0 / .2); rotate: -1.5deg; scale: 1.04; transition: rotate var(--t-ack) var(--ease-out), scale var(--t-ack) var(--ease-out), box-shadow var(--t-ack) var(--ease-out); }
  .ghost svg { flex: none; color: var(--lattice); }
  .ghost span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ghost.ready { rotate: 0deg; scale: 1; box-shadow: 0 6px 14px rgb(0 0 0 / .28), 0 0 0 3px var(--lattice-soft); }

  @media (prefers-reduced-motion: reduce) {
    .stems line { animation: none; stroke-dashoffset: 0; }
    .petal { animation: none; transition: none; }
    .ghost { transition: none; }
  }
</style>
