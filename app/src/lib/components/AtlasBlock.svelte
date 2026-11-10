<script lang="ts">
  // A note's block on the Atlas: a golden block (M12), its title set once in the map's units, up to four lines and
  // then an ellipsis, never set again as the map zooms. A question or a problem has its glyph in a notch in its top
  // edge. What is lit round it is an outline, a pixel or two wide whatever the zoom. It knows nothing of the layout
  // or of the agent.
  import type { LayoutItem } from "@isorite/core/atlas";
  import type { FileKind } from "@isorite/core";
  import Glyph from "./Glyph.svelte";

  let { item, title, kind = "", file = "", prospect = false, done = false, behind = "var(--ground-0)", mark = "", far = 0, agent = "", conflicted = false, found = "", dim = false, moment = "", given = false, held = "", changed = false, order = 0, here = false, href, onpick, onpoint }: {
    item: LayoutItem;
    title: string;
    /** A question or a problem (M12), and whether it is solved. */
    kind?: "" | "question" | "problem";
    /** A file of the notes (M23): its kind's glyph before its name. */
    file?: "" | FileKind;
    /** A question the agent asked back and not kept yet (M24, R): where it would go, in a dotted outline. */
    prospect?: boolean;
    done?: boolean;
    /** The ground of the folder it stands in: its notch cuts the edge with it. */
    behind?: string;
    /** Lit: the note chosen, what it requires, what builds on it, or what it is joined to by a weaker link ("uses", "see also"). */
    mark?: "" | "at" | "req" | "bld" | "use" | "also";
    /** For what it requires: how many steps back. Past the first the outline thins and fades. */
    far?: number;
    /** On the agent's path (Marks): found by keyword, by meaning, along a link (or named outright), or being read now. */
    agent?: "" | "key" | "sem" | "link" | "used";
    dim?: boolean;
    /** Git left an unresolved merge conflict in it: a rose edge and a mark in its corner. */
    conflicted?: boolean;
    /** Found by Ctrl+K: by its words, its meaning, or both. */
    found?: "" | "words" | "meaning" | "both";
    /** The note a moment of the timeline touched, while it is pointed at (Atlas-Timeline): yours or the agent's. */
    moment?: "" | "you" | "agent";
    /** In the Atlas's agent lens (M10): in the tray, changed by the agent in the session shown, and the order it was
     *  read in in the last turn. */
    given?: boolean;
    /** Read by the agent in the session shown (M15, M25). */
    held?: "" | "on";
    changed?: boolean;
    order?: number;
    /** Open in the Note pane (M17): a bar inside its left edge, which dims nothing. */
    here?: boolean;
    href: string;
    onpick: (event: MouseEvent) => void;
    onpoint: (on: boolean) => void;
  } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the address given is resolved (noteHref) -->
<a data-lustre class="n {moment ? `mo-${moment}` : ''} {agent ? `p-${agent}` : ''} {mark} {kind}" class:done class:dim={dim && !agent && !given} class:conflicted class:f-key={found === "words"} class:f-sem={found === "meaning"} class:f-both={found === "both"} class:far={far > 1} class:given class:held={held === "on"} class:changed class:here class:file={!!file} class:prospect aria-current={here ? "page" : undefined} {href} aria-label={`${prospect ? "Asked back, not kept: " : kind === "question" ? `Question${done ? ", resolved" : ""}: ` : kind === "problem" ? `Problem${done ? ", solved" : ""}: ` : ""}${title}${given ? ": in the agent's context" : held === "on" ? ": read by the agent" : ""}${changed ? ", changed by the agent" : ""}`} title={given ? "In the agent's context: shift+click takes it back" : undefined} data-note={item.ref} style="--x:{item.gx};--y:{item.gy};--w:{item.w};--h:{item.h};--lit:{Math.max(34, 100 - (far - 1) * 20)}%;--behind:{behind}"
  onclick={onpick}
  onpointerenter={(e) => { if (e.pointerType === "mouse") onpoint(true); }}
  onpointerleave={(e) => { if (e.pointerType === "mouse") onpoint(false); }}
  onfocus={() => onpoint(true)} onblur={() => onpoint(false)}>{#if kind}<svg class="notch" viewBox="0 0 16 16" aria-hidden="true">{#if kind === "question"}<path d="M5.7 6C5.7 3.2 10.3 3.2 10.3 6C10.3 8.2 8 8.2 8 10.2M8 12.2v1.3" />{:else}<path d="M8 2.6v7M8 12.2v1.3" />{/if}{#if done}<circle cx="8" cy="8" r="7.2" />{/if}</svg>{/if}<span class="inner">{#if file}<Glyph kind={file} size={11} />{/if}<span class="t">{#if file && /^[^\s]+\.\w+$/.test(title)}{title.slice(0, title.lastIndexOf("."))}<wbr />{title.slice(title.lastIndexOf("."))}{:else}{title}{/if}</span></span>{#if order}<b class="order" aria-hidden="true">{order}</b>{/if}{#if changed}<i class="dia" aria-hidden="true"></i>{/if}</a>

<style>
  /* In the map's units: the layer the block is in is scaled to the zoom, and --px is a screen pixel in it. */
  .n {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    overflow: hidden; color: var(--text-soft); text-decoration: none; --glint: .3;
    background: var(--ground-2); border: var(--px) solid var(--line-strong); transition: opacity var(--t-change) var(--ease-out), box-shadow var(--t-change) var(--ease-out);
    /* Its corners eased by a couple of screen pixels at any zoom; its light (the bar of the note open, a glow) in two
       parts, so a block can have both. */
    border-radius: calc(var(--round-n) * var(--px)); --g: calc(14 * var(--px));
    box-shadow: var(--bar, 0 0 transparent), var(--glow, 0 0 transparent);
  }
  .n:hover { color: var(--text); text-decoration: none; }
  /* A block that comes onto the map (the map first drawn, a folder opened as the zoom passes it, a note made) grows in:
     its opacity, the time of a change. Without motion it is simply there. */
  @media (prefers-reduced-motion: no-preference) { @starting-style { .n { opacity: 0; } } }
  /* A file (M23): its glyph, its name in the faint ink, a lighter edge, and no fill of its own. */
  .n.file { gap: 6px; color: var(--text-faint); background: var(--ground-0); border-style: dashed; border-color: var(--line-strong); }
  .n.file :global(.glyph) { color: var(--text-soft); }
  /* Its name at the screen's own pixels (M24): the block's size at the zoom, scaled back, so the text is laid out
     and drawn crisp, at 11 px, and larger in steps as the block grows on the screen, taking the lines it has room for. */
  .inner {
    position: absolute; left: 0; top: 0; width: calc(100% * var(--k)); height: calc(100% * var(--k)); transform-origin: 0 0; transform: scale(var(--ik));
    padding: 0 6px; display: flex; align-items: center; gap: 6px; font: 0.6875rem/0.875rem var(--font-ui); container-type: size;
  }
  /* Its name shows once it is big enough on the screen to read, and comes in (its opacity, the time of a change) as
     the zoom settles rather than in one frame; it goes at once, as the zoom passes it. Hidden, it takes no pointer
     and is not read out. */
  .t { display: -webkit-box; visibility: hidden; opacity: 0; overflow: hidden; overflow-wrap: normal; min-width: 0; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  :global(.atlas-world.labels) .t { visibility: visible; opacity: 1; transition: opacity var(--t-change) var(--ease-out); }
  /* Zoomed in, the name grows with its box, in steps, still at the screen's pixels. */
  @container (min-width: 130px) { .inner > * { font-size: 0.8125rem; line-height: 1.0625rem; } }
  @container (min-width: 175px) { .inner > * { font-size: 0.9375rem; line-height: 1.25rem; } }
  @container (min-width: 235px) { .inner > * { font-size: 1.125rem; line-height: 1.5rem; } }
  @container (min-width: 310px) { .inner > * { font-size: 1.375rem; line-height: 1.75rem; } }
  @container (max-width: 72px) { .inner > :first-child { margin-left: -2px; } .inner > :last-child { margin-right: -2px; } .inner > * { font-size: 0.625rem; line-height: 0.75rem; } .t { hyphens: auto; overflow-wrap: anywhere; } }
  @container (max-height: 48px) { .t { -webkit-line-clamp: 2; line-clamp: 2; } }
  @container (max-height: 32px) { .t { -webkit-line-clamp: 1; line-clamp: 1; } }
  @container (max-height: 17px) or (max-width: 40px) { :global(.atlas-world.labels) .t { display: none; } }
  /* A kind's glyph (M12) in a notch in the top edge, as a folder's name sits in its frame. */
  .question, .problem { overflow: visible; }
  .notch { position: absolute; top: -7px; left: 9px; width: 14px; height: 14px; padding: 0 2px; box-sizing: content-box; background: var(--behind); fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .question .notch { color: var(--rose); }
  .problem .notch { color: var(--text-soft); }
  .question.done .notch,   .problem.done .notch { color: var(--malachite); }
  .question .t, .problem .t { overflow: hidden; }
  /* A question the agent asked and not kept (R): no face of its own, a dotted rose edge, its name faint, until kept. */
  .prospect { background: var(--ground-0); border: calc(1.5 * var(--px)) dotted var(--rose); color: var(--text-faint); }
  .dim { opacity: .5; }
  .conflicted { border-color: var(--rose); color: var(--rose); }
  /* Found by Ctrl+K (you, so blue): dashed by its words, dotted by its meaning, solid by both. */
  .f-key, .f-sem, .f-both { color: var(--text); z-index: 3; opacity: 1; outline-color: var(--lattice); outline-offset: calc(3 * var(--px)); }
  .f-key { outline: calc(2 * var(--px)) dashed var(--lattice); }
  .f-sem { outline: calc(2 * var(--px)) dotted var(--lattice); }
  .f-both { outline: calc(2.5 * var(--px)) solid var(--lattice); }
  /* The agent's path (Marks, Desktop-Think), under the outlines of what is chosen. */
  .p-key { outline: calc(1.5 * var(--px)) dashed var(--growth); outline-offset: calc(3 * var(--px)); }
  .p-sem { outline: calc(2 * var(--px)) dotted var(--growth); outline-offset: calc(3 * var(--px)); }
  .p-link { outline: calc(1.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); }
  .p-used { outline: calc(1.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); background: var(--growth-soft); color: var(--text); }
  /* The agent's light: what it used, reached or has in hand glows gold; what it read, blue, and as it first reads it
     a pulse runs out from it once. Your moments on the timeline glow in your blue, the agent's in its gold. */
  .p-used, .p-link { --glow: 0 0 var(--g) color-mix(in srgb, var(--growth) var(--glow-a), transparent); }
  .at, .req, .bld { color: var(--text); outline: calc(2 * var(--px)) solid var(--text); outline-offset: calc(2 * var(--px)); }
  .req { outline-color: color-mix(in srgb, var(--requires) var(--lit, 100%), transparent); }
  .req.far { outline-width: var(--px); color: var(--text-soft); }
  .use { color: var(--text); outline: var(--px) solid var(--text-soft); outline-offset: calc(2 * var(--px)); }
  .also { color: var(--text-soft); outline: var(--px) dotted var(--text-faint); outline-offset: calc(2 * var(--px)); }
  .bld { outline-color: var(--builds); }
  /* Picked (Mobile-Pick): a blue outline and its number at the corner. The number stands outside the block, and
     keeps its size on screen. */
  /* Open in the Note pane (M17): a bar three pixels wide inside the left edge, in the text's colour. */
  .here { --bar: inset calc(3 * var(--px)) 0 0 var(--text); color: var(--text); }
  .mo-you { outline: calc(2.5 * var(--px)) solid var(--lattice); outline-offset: calc(3 * var(--px)); z-index: 3; }
  .mo-agent { outline: calc(2.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); z-index: 3; }
  .mo-you { --glow: 0 0 var(--g) color-mix(in srgb, var(--lattice) var(--glow-a), transparent); }
  .mo-agent { --glow: 0 0 var(--g) color-mix(in srgb, var(--growth) var(--glow-a), transparent); }
  /* The agent lens (M10): in the agent's context, a gold fill; read by the agent, a blue one; changed by it, a diamond at
     the corner; the order it read in, a gold number. */
  .given { background: var(--growth-soft); border-color: var(--growth); color: var(--text); --glow: 0 0 var(--g) color-mix(in srgb, var(--growth) calc(var(--glow-a) * .7), transparent); }
  .held { background: var(--lattice-soft); border-color: var(--lattice); color: var(--text); --glow: 0 0 var(--g) color-mix(in srgb, var(--lattice) calc(var(--glow-a) * .8), transparent); animation: read var(--t-result) var(--ease-out); }
  @keyframes read { from { box-shadow: var(--bar, 0 0 transparent), 0 0 0 calc(2 * var(--px)) color-mix(in srgb, var(--lattice) 70%, transparent), 0 0 calc(24 * var(--px)) color-mix(in srgb, var(--lattice) 60%, transparent); } }
  @media (prefers-reduced-motion: reduce) { .held { animation: none; } }
  /* On the agent's way as well as read: the gold ring says so, and the blue stays in the fill, not a second ring. */
  .held:is(.p-used, .p-link, .p-key) { border-color: var(--line-strong); }
  /* What stands out over the corner (the diamond of a change, the order it read in) is not cut off by the block. */
  .changed, .n:has(> .order) { overflow: visible; }
  .dia { position: absolute; top: -5px; right: -5px; width: 9px; height: 9px; background: var(--growth); transform: rotate(45deg); scale: var(--ik); }
  .order { position: absolute; top: 0; left: 0; transform-origin: 0 0; translate: calc(-12 * var(--px)) calc(-12 * var(--px)); width: 16px; height: 16px; display: grid; place-items: center; background: var(--growth); color: var(--ground-0); font-size: 0.625rem; font-weight: 700; z-index: 1; scale: var(--ik); }
</style>
