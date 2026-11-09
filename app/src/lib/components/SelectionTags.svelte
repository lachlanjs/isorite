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
  import { copyFlight, flash, pointFlight } from "$lib/flight.ts";
  import { full, type Pointer } from "$lib/pointers.ts";
  import { pointers } from "$lib/pointers.svelte.ts";
  import { tokenEl } from "$lib/pointerToken.ts";
  import Petal from "./Petal.svelte";

  type Draft = Omit<Pointer, "id">;
  type Armed = { draft: Draft; x: number; y: number; /** The lines of the words chosen, on the screen. */ rects: DOMRect[]; /** Takes the words out (a note's, where it can be changed). */ del?: () => void };
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
    const at = { x: last.right, y: last.bottom, rects: [...rects] };
    if (kind === "note") {
      if (ref.startsWith("@")) return null;
      const cm = root.querySelector<HTMLElement>(".cm-content"), view = cm ? EditorView.findFromDOM(cm) : null;
      if (!view) return null;
      const m = view.state.selection.main, doc = view.state.doc, off = Number(root.dataset.lineOffset ?? 0);
      if (m.empty) return null;
      const end = m.to > m.from && doc.lineAt(m.to).from === m.to ? m.to - 1 : m.to;
      const text = doc.sliceString(m.from, m.to);
      if (!text.trim()) return null;
      const del = view.state.readOnly || view.contentDOM.contentEditable === "false" ? undefined : () => { view.dispatch({ changes: { from: m.from, to: m.to }, selection: { anchor: m.from }, userEvent: "delete.selection" }); view.focus(); };
      return { ...at, ...(del ? { del } : {}), draft: { kind: "note", ref, title: app.listing.notes.find((n) => n.id === ref)?.title || ref, from: doc.lineAt(m.from).number + off, to: doc.lineAt(end).number + off, text } };
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
    // Seen taken: the words bloom, and (put by key or a click, not carried) the pointer flies to the box.
    flash(a.rects, "var(--lattice)");
    if (!at) pointFlight(tokenEl(p), a.rects.at(-1) ?? null, document.querySelector("[data-prompt]")?.getBoundingClientRect() ?? null);
    // In at once, so that what is typed next goes to the prompt; on a phone, where it is on another page, its tab too.
    pointers.insert?.(p, at);
    if (!at) panes.to("iso");
  }
  async function copy(a: Armed): Promise<void> {
    try { await navigator.clipboard.writeText(full(a.draft as Pointer)); said = "copied"; flash(a.rects, "var(--lattice)"); copyFlight(a.rects.at(-1) ?? null); }
    catch { said = "the browser would not copy"; }
    setTimeout(() => { said = ""; done(); }, 900);
  }

  function remove(a: Armed): void {
    flash(a.rects, "var(--rose)", true);
    done();
    a.del?.();
  }

  /** Where the tags stand: out from where the selection ends, below it (above where there is no room). */
  const tags = $derived.by(() => {
    if (!armed) return null;
    const below = armed.y + 80 < innerHeight, sign = below ? 1 : -1;
    // Far enough out, and far enough apart, that the two stand clear of each other (a tag is 34 wide).
    const out = 50, tags = [{ which: "agent", deg: 22 * sign }, { which: "copy", deg: 82 * sign }, ...(armed.del ? [{ which: "delete", deg: 142 * sign }] : [])].map((w, i) => {
      const t = (w.deg * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t);
      const x = Math.min(Math.max(armed!.x + ux * out + 6, 24), innerWidth - 24), y = armed!.y + uy * out + (below ? 8 : -8);
      return { ...w, x, y, i, ux, uy, sx: armed!.x + ux * 6, sy: armed!.y + uy * 6 + (below ? 4 : -4), ex: x - ux * 14, ey: y - uy * 14 };
    });
    // Squeezed against an edge they could meet: a later one is put clear of the earlier.
    for (let j = 1; j < tags.length; j++) for (let k = 0; k < j; k++) {
      const a = tags[k]!, b = tags[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 44) { b.x = Math.min(Math.max(a.x + (a.x > innerWidth / 2 ? -44 : 44), 24), innerWidth - 24); b.ex = b.x - b.ux * 14; }
    }
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
    <svg class="stems" aria-hidden="true">{#each tags as t (t.which)}<line x1={t.sx} y1={t.sy} x2={t.ex} y2={t.ey} />{/each}</svg>
    {#each tags as t (t.which)}
      <Petal x={t.x} y={t.y} i={t.i} below={t.y >= armed.y} side={t.which === "agent" ? (t.x > innerWidth - 220 ? "left" : "right") : t.which === "delete" && t.x > 150 ? "left" : ""} tone={t.which === "delete" ? "var(--rose)" : undefined} label={t.which === "agent" ? "to the agent" : t.which === "delete" ? "delete" : said || "copy"} hint={t.which === "agent" ? "Ctrl+[" : t.which === "copy" ? "Ctrl+]" : ""} data-tag={t.which}
        aria-label={t.which === "agent" ? "Point to this in the message to the agent (Ctrl+[)" : t.which === "delete" ? "Delete this text from the note" : "Copy this and where it is (Ctrl+])"}
        onmousedown={(e) => e.preventDefault()} onpointerdown={(e) => { if (t.which === "agent") lift(e); else e.preventDefault(); }} onclick={() => { if (t.which === "copy") void copy(armed!); else if (t.which === "delete") remove(armed!); }}>
        {#if t.which === "agent"}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 6.5h5.5M5.5 4l3 2.5-3 2.5" /><path d="M3 11.5h10" /></svg>
        {:else if t.which === "delete"}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9M7 7v4.5M9 7v4.5" /></svg>
        {:else}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3" width="9" height="11" /><path d="M6 3V1.8h4V3M5.8 7h4.4M5.8 9.5h4.4" /></svg>{/if}
      </Petal>
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
  .held { position: fixed; z-index: 80; pointer-events: none; transform: translate(-50%, -50%) scale(1.08); line-height: 0; }
  .held.ready { filter: drop-shadow(0 0 10px var(--lattice)); }
</style>
