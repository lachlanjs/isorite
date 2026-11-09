<script lang="ts">
  // What a selection offers (pointers): select text in a note, a file of the repository or an answer of the agent's, and
  // two tags stand out by where it ends, in the way of the tags round a held note: one puts a pointer to it in the
  // prompt (Ctrl+[), one copies it, where it is and the words, for another place (Ctrl+]). Pick the first up and let it
  // go in the prompt wherever the words need it. The pane the text is in names itself with `data-point`: "note:<id>"
  // (its editor, whose lines are the file's by `data-line-offset`), "code:<path>" (rows with `data-n`), or "turn".
  import { EditorView } from "@codemirror/view";
  import { onMount, untrack } from "svelte";
  import { app } from "$lib/app.svelte.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointing } from "$lib/pointing.svelte.ts";
  import { toBody } from "$lib/gesture.svelte.ts";
  import { full, type Pointer } from "$lib/pointers.ts";
  import { pointers } from "$lib/pointers.svelte.ts";
  import { tokenEl } from "$lib/pointerToken.ts";

  type Draft = Omit<Pointer, "id">;
  type Armed = { draft: Draft; x: number; y: number };
  let armed = $state.raw<Armed | null>(null);
  let said = $state("");
  let drag = $state.raw<{ x: number; y: number; over: boolean } | null>(null);

  const elementOf = (n: Node | null): Element | null => (n instanceof Element ? n : n?.parentElement ?? null);

  /** The selection, as a pointer to be, and where it ends on the screen; null where it is in no place that offers one. */
  function read(): Armed | null {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const root = elementOf(range.commonAncestorContainer)?.closest<HTMLElement>("[data-point]");
    if (!root || root.closest("[data-prompt]")) return null;
    const [kind, ...rest] = root.dataset.point!.split(":"), ref = rest.join(":");
    const rects = range.getClientRects(), last = rects.length ? rects[rects.length - 1]! : range.getBoundingClientRect();
    const at = { x: last.right, y: last.bottom };
    if (kind === "note") {
      if (ref.startsWith("@")) return null;
      const cm = root.querySelector<HTMLElement>(".cm-content"), view = cm ? EditorView.findFromDOM(cm) : null;
      if (!view) return null;
      const m = view.state.selection.main, doc = view.state.doc, off = Number(root.dataset.lineOffset ?? 0);
      if (m.empty) return null;
      const end = m.to > m.from && doc.lineAt(m.to).from === m.to ? m.to - 1 : m.to;
      const text = doc.sliceString(m.from, m.to);
      if (!text.trim()) return null;
      return { ...at, draft: { kind: "note", ref, title: app.listing.notes.find((n) => n.id === ref)?.title || ref, from: doc.lineAt(m.from).number + off, to: doc.lineAt(end).number + off, text } };
    }
    const text = sel.toString();
    if (!text.trim()) return null;
    if (kind === "code") {
      const line = (n: Node): number | null => { const v = elementOf(n)?.closest<HTMLElement>("[data-n]")?.dataset.n; return v ? Number(v) : null; };
      const a = line(range.startContainer), b = line(range.endContainer);
      if (a === null || b === null) return null;
      return { ...at, draft: { kind: "code", ref, title: ref.split("/").at(-1) ?? ref, from: Math.min(a, b), to: Math.max(a, b), text } };
    }
    if (kind === "turn") return { ...at, draft: { kind: "turn", ref: "", title: "the agent", from: 0, to: 0, text } };
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = (): void => { clearTimeout(timer); timer = setTimeout(() => { if (!drag) armed = read(); }, 140); };
  onMount(() => {
    const keys = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.metaKey || e.altKey || (e.code !== "BracketLeft" && e.code !== "BracketRight")) return;
      const a = read();
      if (!a) return; // nothing chosen: the keys are the editor's own (indenting)
      e.preventDefault(); e.stopPropagation();
      if (e.code === "BracketLeft") void toAgent(a); else void copy(a);
    };
    const follow = (): void => { if (armed) armed = read(); };
    document.addEventListener("selectionchange", settle);
    window.addEventListener("keydown", keys, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => { document.removeEventListener("selectionchange", settle); window.removeEventListener("keydown", keys, true); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", follow); clearTimeout(timer); };
  });
  // A pointer under the mouse in the prompt: its note is lit on the Atlas.
  let wasPointer = false;
  $effect(() => {
    const h = pointers.hover;
    // Only the pointer under the mouse is this effect's: what else points (a link in an answer) is read by pointing, not here.
    untrack(() => { if (h?.kind === "note") pointing.set("iso", { id: h.ref, folder: false, who: "you" }); else if (pointing.elsewhere?.from === "iso" && wasPointer) pointing.set("iso", null); wasPointer = h?.kind === "note"; });
  });

  function done(): void { getSelection()?.removeAllRanges(); armed = null; }
  async function toAgent(a: Armed, at?: { x: number; y: number }): Promise<void> {
    const p = pointers.make(a.draft);
    done();
    // In at once, so that what is typed next goes to the prompt; on a phone, where it is on another page, its tab too.
    pointers.insert?.(p, at);
    if (!at) panes.to("iso");
  }
  async function copy(a: Armed): Promise<void> {
    try { await navigator.clipboard.writeText(full(a.draft as Pointer)); said = "copied"; }
    catch { said = "the browser would not copy"; }
    setTimeout(() => { said = ""; done(); }, 900);
  }

  /** Where the two tags stand: out from where the selection ends, below it (above where there is no room). */
  const tags = $derived.by(() => {
    if (!armed) return null;
    const below = armed.y + 80 < innerHeight, sign = below ? 1 : -1;
    // Far enough out, and far enough apart, that the two stand clear of each other (a tag is 34 wide).
    const out = 50, tags = [{ which: "agent", deg: 22 * sign }, { which: "copy", deg: 82 * sign }].map((w, i) => {
      const t = (w.deg * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t);
      const x = Math.min(Math.max(armed!.x + ux * out + 6, 24), innerWidth - 24), y = armed!.y + uy * out + (below ? 8 : -8);
      return { ...w, x, y, i, ux, uy, sx: armed!.x + ux * 6, sy: armed!.y + uy * 6 + (below ? 4 : -4), ex: x - ux * 14, ey: y - uy * 14 };
    });
    // Squeezed against an edge they could meet: the second is put clear of the first.
    const [a, b] = tags as [(typeof tags)[number], (typeof tags)[number]];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 44) { b.x = a.x - (a.x > innerWidth / 2 ? 44 : -44); b.ex = b.x - b.ux * 14; }
    return tags;
  });

  function lift(e: PointerEvent): void {
    if (e.button !== 0 || !armed) return;
    e.preventDefault();
    const a = armed, from = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (m: PointerEvent): void => {
      if (!moved && Math.hypot(m.clientX - from.x, m.clientY - from.y) < 5) return;
      moved = true;
      drag = { x: m.clientX, y: m.clientY, over: !!document.elementFromPoint(m.clientX, m.clientY)?.closest("[data-prompt]") };
    };
    const up = (u: PointerEvent): void => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      const over = moved && !!document.elementFromPoint(u.clientX, u.clientY)?.closest("[data-prompt]");
      drag = null;
      if (!moved) void toAgent(a);
      else if (over) void toAgent(a, { x: u.clientX, y: u.clientY });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }
  /** The token carried: made once and set following the pointer. */
  function token(node: HTMLElement): { destroy: () => void } {
    node.append(tokenEl(armed ? { ...armed.draft, id: 0 } : { id: 0, title: "", from: 0, to: 0, kind: "turn" }));
    return { destroy: () => undefined };
  }
</script>

{#if tags && armed}
  <div class="tags" use:toBody role="presentation">
    <svg class="stems" aria-hidden="true">{#each tags as t (t.which)}<line x1={t.sx} y1={t.sy} x2={t.ex} y2={t.ey} style="--i:{t.i}" />{/each}</svg>
    {#each tags as t (t.which)}
      <button type="button" class="tag" data-tag={t.which} tabindex="-1" aria-label={t.which === "agent" ? "Point to this in the message to the agent (Ctrl+[)" : "Copy this and where it is (Ctrl+])"}
        style="left:{t.x}px;top:{t.y}px;--i:{t.i}" onmousedown={(e) => e.preventDefault()} onpointerdown={(e) => { if (t.which === "agent") lift(e); else e.preventDefault(); }} onclick={() => { if (t.which === "copy") void copy(armed!); }}>
        <span class="face">
          {#if t.which === "agent"}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 6.5h5.5M5.5 4l3 2.5-3 2.5" /><path d="M3 11.5h10" /></svg>
          {:else}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3" width="9" height="11" /><path d="M6 3V1.8h4V3M5.8 7h4.4M5.8 9.5h4.4" /></svg>{/if}
        </span>
        <span class="lbl">{t.which === "agent" ? "to the agent" : said || "copy"}<kbd>{t.which === "agent" ? "Ctrl+[" : "Ctrl+]"}</kbd></span>
      </button>
    {/each}
  </div>
{/if}
{#if drag}
  <div class="held" class:ready={drag.over} use:toBody use:token style="left:{drag.x}px;top:{drag.y}px" aria-hidden="true"></div>
{/if}

<style>
  .tags { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
  .stems { position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; overflow: visible; }
  .stems line { stroke: var(--lattice); stroke-width: 1.5; stroke-linecap: round; opacity: .7; }
  .tag { --c: var(--lattice); padding: 0; border: 0; background: none; font: inherit; position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; pointer-events: auto; color: var(--c); user-select: none; -webkit-user-select: none; cursor: pointer;
    filter: drop-shadow(0 4px 8px rgb(0 0 0 / .25)); transition: scale var(--t-ack) var(--ease-out), filter var(--t-ack) var(--ease-out);
    animation: tag var(--t-change) cubic-bezier(.2, 1.3, .4, 1) backwards; animation-delay: calc(var(--i) * 30ms); }
  .tag:hover { scale: 1.14; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c) 70%, transparent)) drop-shadow(0 4px 8px rgb(0 0 0 / .25)); }
  @keyframes tag { from { scale: .3; opacity: 0; } }
  .face { position: absolute; inset: 0; display: grid; place-items: center; background: var(--c); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
  .face::before { content: ""; position: absolute; inset: 1.5px; background: var(--ground-2); transition: background-color var(--t-ack) var(--ease-out); clip-path: polygon(7.4px 0, 100% 0, 100% calc(100% - 7.4px), calc(100% - 7.4px) 100%, 0 100%, 0 7.4px); }
  .face svg { position: relative; transition: color var(--t-ack) var(--ease-out); }
  .tag:hover .face::before { background: var(--c); }
  .tag:hover .face svg { color: var(--ground-0); }
  .lbl { position: absolute; left: 50%; top: calc(100% + 6px); translate: -50% -4px; padding: 2px 6px; font: 11px/1.4 var(--font-ui); white-space: nowrap; color: var(--c); background: var(--ground-0); opacity: 0; transition: opacity var(--t-ack) var(--ease-out), translate var(--t-ack) var(--ease-out); pointer-events: none; }
  .tag:hover .lbl { opacity: 1; translate: -50% 0; }
  .lbl kbd { margin-left: 6px; font: 10px var(--font-mono); color: var(--text-faint); }
  .held { position: fixed; z-index: 80; pointer-events: none; transform: translate(-50%, -50%) scale(1.08); line-height: 0; }
  .held.ready { filter: drop-shadow(0 0 10px var(--lattice)); }
  @media (prefers-reduced-motion: reduce) { .tag { animation: none; transition: none; } }
</style>
