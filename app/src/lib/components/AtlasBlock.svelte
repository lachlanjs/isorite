<script lang="ts">
  // A note's block on the Atlas: a golden block (M12), its title set once in the map's units, up to four lines and
  // then an ellipsis, never set again as the map zooms. A question or a problem has its glyph in a notch in its top
  // edge. What is lit round it is an outline, a pixel or two wide whatever the zoom. It knows nothing of the layout
  // or of Iso.
  import type { LayoutItem } from "@isorite/core/atlas";
  import type { FileKind } from "@isorite/core";
  import Glyph from "./Glyph.svelte";

  let { item, title, kind = "", file = "", prospect = false, done = false, behind = "var(--ground-0)", mark = "", far = 0, num = 0, iso = "", linked = false, dim = false, moment = "", given = false, held = "", changed = false, pointed = "", order = 0, here = false, href, onpick, onpoint }: {
    item: LayoutItem;
    title: string;
    /** A question or a problem (M12), and whether it is solved. */
    kind?: "" | "question" | "problem";
    /** A file of the notes (M23): its kind's glyph before its name. */
    file?: "" | FileKind;
    /** A question Iso asked and not kept yet (M24, R): where it would go, in a dotted outline. */
    prospect?: boolean;
    done?: boolean;
    /** The ground of the folder it stands in: its notch cuts the edge with it. */
    behind?: string;
    /** Lit: the note chosen, what it requires, what builds on it, or what it is joined to by a weaker link ("uses", "see also"). */
    mark?: "" | "at" | "req" | "bld" | "use" | "also";
    /** For what it requires: how many steps back. Past the first the outline thins and fades. */
    far?: number;
    /** Picked for a note for Iso: its place in the order, from 1. */
    num?: number;
    /** On Iso's path (Marks): found by keyword, by meaning, along a link (or named outright), or being read now. */
    iso?: "" | "key" | "sem" | "link" | "used";
    /** Linked from the note for Iso being answered: what it was sent with. */
    linked?: boolean;
    dim?: boolean;
    /** The note a moment of the timeline touched, while it is pointed at (Atlas-Timeline): yours or Iso's. */
    moment?: "" | "you" | "iso";
    /** In the Atlas's Iso lens (M10): in what Iso is sent, changed by Iso in this conversation, pointed out by Iso
     *  (why), and the order it was read in in the last turn. */
    given?: boolean;
    /** Read by Iso in this conversation (M15): in hand ("on"), or set aside. */
    held?: "" | "on" | "aside";
    changed?: boolean;
    pointed?: string;
    order?: number;
    /** Open in the Note pane (M17): a bar inside its left edge, which dims nothing. */
    here?: boolean;
    href: string;
    onpick: (event: MouseEvent) => void;
    onpoint: (on: boolean) => void;
  } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the address given is resolved (noteHref) -->
<a data-lustre class="n {moment ? `mo-${moment}` : ''} {iso ? `p-${iso}` : ''} {mark} {kind}" class:done class:linked class:dim={dim && !num && !iso && !linked && !given} class:far={far > 1} class:pick={num > 0} class:given class:held={held === "on"} class:aside={held === "aside"} class:changed class:pointed={!!pointed} class:here class:file={!!file} class:prospect aria-current={here ? "page" : undefined} {href} aria-label={num ? `${title}: linked, number ${num}` : `${prospect ? "Asked by Iso, not kept: " : kind === "question" ? "Question: " : kind === "problem" ? `Problem${done ? ", solved" : ""}: ` : ""}${title}${given ? ": in Iso's context" : held === "on" ? ": read by Iso, in hand" : held === "aside" ? ": read by Iso, set aside" : ""}${changed ? ", changed by Iso" : ""}${pointed ? `, Iso points to it: ${pointed}` : ""}`} title={pointed || (given ? "In Iso's context: shift+click takes it back" : held === "on" ? "Read by Iso, in hand: shift+click sets it aside" : held === "aside" ? "Read by Iso, set aside: shift+click puts it in hand again" : undefined)} data-note={item.ref} style="--x:{item.gx};--y:{item.gy};--w:{item.w};--h:{item.h};--lit:{Math.max(34, 100 - (far - 1) * 20)}%;--behind:{behind}"
  onclick={onpick}
  onpointerenter={(e) => { if (e.pointerType === "mouse") onpoint(true); }}
  onpointerleave={(e) => { if (e.pointerType === "mouse") onpoint(false); }}
  onfocus={() => onpoint(true)} onblur={() => onpoint(false)}>{#if kind}<svg class="notch" viewBox="0 0 16 16" aria-hidden="true">{#if kind === "question"}<path d="M8 2.5L13.5 8L8 13.5L2.5 8Z" fill={done ? "currentColor" : "none"} />{:else}<path d="M8 2.5l5.8 10.5H2.2z" fill={done ? "currentColor" : "none"} />{/if}</svg>{/if}<span class="inner">{#if file}<Glyph kind={file} size={11} />{/if}<span class="t">{#if file && /^[^\s]+\.\w+$/.test(title)}{title.slice(0, title.lastIndexOf("."))}<wbr />{title.slice(title.lastIndexOf("."))}{:else}{title}{/if}</span></span>{#if num}<b class="num">{num}</b>{/if}{#if order}<b class="order" aria-hidden="true">{order}</b>{/if}{#if changed}<i class="dia" aria-hidden="true"></i>{/if}</a>

<style>
  /* In the map's units: the layer the block is in is scaled to the zoom, and --px is a screen pixel in it. */
  .n {
    position: absolute; left: calc(var(--x) * var(--u)); top: calc(var(--y) * var(--u)); width: calc(var(--w) * var(--u)); height: calc(var(--h) * var(--u));
    overflow: hidden; color: var(--text-soft); text-decoration: none; --glint: .3;
    background: var(--ground-2); border: var(--px) solid var(--line-strong); transition: opacity .15s;
  }
  .n:hover { color: var(--text); text-decoration: none; }
  /* A file (M23): its glyph, its name in the faint ink, a lighter edge, and no fill of its own. */
  .n.file { gap: 6px; color: var(--text-faint); background: var(--ground-0); border-style: dashed; border-color: var(--line-strong); }
  .n.file :global(.glyph) { color: var(--text-soft); }
  /* Its name at the screen's own pixels (M24): the block's size at the zoom, scaled back, so the text is laid out
     and drawn at 11 px whatever the zoom, and takes the lines the block has room for. */
  .inner {
    position: absolute; left: 0; top: 0; width: calc(100% * var(--k)); height: calc(100% * var(--k)); transform-origin: 0 0; transform: scale(var(--ik));
    padding: 0 6px; display: flex; align-items: center; gap: 6px; font: 11px/14px var(--font-ui); container-type: size;
  }
  .t { display: none; overflow: hidden; overflow-wrap: normal; min-width: 0; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  :global(.atlas-world.labels) .t { display: -webkit-box; }
  @container (max-width: 72px) { .inner > :first-child { margin-left: -2px; } .inner > :last-child { margin-right: -2px; } .inner > * { font-size: 10px; line-height: 12px; } .t { hyphens: auto; overflow-wrap: anywhere; } }
  @container (max-height: 48px) { .t { -webkit-line-clamp: 2; line-clamp: 2; } }
  @container (max-height: 32px) { .t { -webkit-line-clamp: 1; line-clamp: 1; } }
  @container (max-height: 17px) or (max-width: 40px) { :global(.atlas-world.labels) .t { display: none; } }
  /* A kind's glyph (M12) in a notch in the top edge, as a folder's name sits in its frame. */
  .question, .problem { overflow: visible; }
  .notch { position: absolute; top: -7px; left: 9px; width: 14px; height: 14px; padding: 0 2px; box-sizing: content-box; background: var(--behind); fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .question .notch { color: var(--rose); }
  .problem .notch { color: var(--text-soft); }
  .problem.done .notch { color: var(--malachite); }
  .question .t, .problem .t { overflow: hidden; }
  /* A question Iso asked and not kept (R): no face of its own, a dotted rose edge, its name faint, until kept. */
  .prospect { background: var(--ground-0); border: calc(1.5 * var(--px)) dotted var(--rose); color: var(--text-faint); }
  .dim { opacity: .5; }
  /* Iso's path (Marks, Desktop-Think), under the outlines of what is chosen. */
  .linked { outline: calc(2 * var(--px)) solid var(--lattice); outline-offset: calc(3 * var(--px)); color: var(--text); }
  .p-key { outline: calc(1.5 * var(--px)) dashed var(--growth); outline-offset: calc(3 * var(--px)); }
  .p-sem { outline: calc(2 * var(--px)) dotted var(--growth); outline-offset: calc(3 * var(--px)); }
  .p-link { outline: calc(1.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); }
  .p-used { outline: calc(1.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); background: var(--growth-soft); color: var(--text); }
  .at, .req, .bld { color: var(--text); outline: calc(2 * var(--px)) solid var(--text); outline-offset: calc(2 * var(--px)); }
  .req { outline-color: color-mix(in srgb, var(--requires) var(--lit, 100%), transparent); }
  .req.far { outline-width: var(--px); color: var(--text-soft); }
  .use { color: var(--text); outline: var(--px) solid var(--text-soft); outline-offset: calc(2 * var(--px)); }
  .also { color: var(--text-soft); outline: var(--px) dotted var(--text-faint); outline-offset: calc(2 * var(--px)); }
  .bld { outline-color: var(--builds); }
  /* Picked (Mobile-Pick): a blue outline and its number at the corner. The number stands outside the block, and
     keeps its size on screen. */
  .pick { outline: calc(2 * var(--px)) solid var(--lattice); outline-offset: calc(3 * var(--px)); color: var(--text); overflow: visible; }
  .num { position: absolute; top: -10px; right: -10px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; background: var(--lattice); color: var(--ground-0); font-size: 11px; font-weight: 700; z-index: 1; scale: var(--ik); }
  /* Open in the Note pane (M17): a bar three pixels wide inside the left edge, in the text's colour. */
  .here { box-shadow: inset calc(3 * var(--px)) 0 0 var(--text); color: var(--text); }
  .mo-you { outline: calc(2.5 * var(--px)) solid var(--lattice); outline-offset: calc(3 * var(--px)); z-index: 3; }
  .mo-iso { outline: calc(2.5 * var(--px)) solid var(--growth); outline-offset: calc(3 * var(--px)); z-index: 3; }
  /* The Iso lens (M10): in Iso's context, a gold fill; changed by Iso, a diamond at the corner; pointed out, a
     marching outline; the order it read in, a gold number. */
  .given { background: var(--growth-soft); border-color: var(--growth); color: var(--text); }
  .held { background: var(--lattice-soft); border-color: var(--lattice); color: var(--text); }
  .aside { border-style: dashed; border-color: var(--lattice); }
  .changed, .pointed, .order { overflow: visible; }
  .dia { position: absolute; top: -5px; right: -5px; width: 9px; height: 9px; background: var(--growth); transform: rotate(45deg); scale: var(--ik); }
  .pointed { outline: calc(2 * var(--px)) dashed var(--growth); outline-offset: calc(4 * var(--px)); animation: point 1.2s linear infinite; }
  @keyframes point { 50% { outline-offset: calc(6 * var(--px)); } }
  .order { position: absolute; top: -9px; left: -9px; width: 16px; height: 16px; display: grid; place-items: center; background: var(--growth); color: var(--ground-0); font-size: 10px; font-weight: 700; z-index: 1; scale: var(--ik); }
  @media (prefers-reduced-motion: reduce) { .pointed { animation: none; } }
</style>
