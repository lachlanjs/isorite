<script lang="ts">
  // The box the agent is asked in (it was a textarea; it is CodeMirror so that a pointer can stand in the text, as one
  // glowing character that moves and goes like any other). `value` is the text with each pointer as its private
  // character (pointers.ts). Keys are AgentPane's (`onkeydown`): Ctrl+Enter sends, and a key it handles it marks as handled;
  // Enter is a new line (except an input method's, which picks what it composes). `height`, where set, is the box's own height (its top edge dragged), else it grows to a few lines.
  import { onMount } from "svelte";
  import { Compartment, EditorState, type Range } from "@codemirror/state";
  import { Decoration, EditorView, ViewPlugin, WidgetType, drawSelection, keymap, placeholder as hint, type DecorationSet, type ViewUpdate } from "@codemirror/view";
  import { cursorGroupLeft, cursorGroupRight, deleteGroupBackward, deleteGroupForward, history, historyKeymap, insertNewline, selectGroupLeft, selectGroupRight } from "@codemirror/commands";
  import { MARKS, idOf, markOf, used } from "$lib/pointers.ts";
  import { pointers } from "$lib/pointers.svelte.ts";
  import { tokenEl } from "$lib/pointerToken.ts";

  let { value = $bindable(""), readonly = false, placeholder = "", height = null, touch = false, onkeydown }: { value?: string; readonly?: boolean; placeholder?: string; height?: number | null; touch?: boolean; onkeydown?: (e: KeyboardEvent) => void } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();

  /** A pointer in the text. Pressed and moved, it is carried to another place in the prompt (or let go where it was). */
  class Pointed extends WidgetType {
    id: number;
    selected: boolean;
    constructor(id: number, selected: boolean) { super(); this.id = id; this.selected = selected; }
    eq(o: Pointed): boolean { return o.id === this.id && o.selected === this.selected; }
    ignoreEvent(): boolean { return true; }
    toDOM(v: EditorView): HTMLElement {
      const p = pointers.get(this.id);
      const el = tokenEl(p ?? { id: this.id, title: "A pointer", from: 0, to: 0, kind: "turn" }, this.selected);
      el.addEventListener("pointerenter", () => { if (p) pointers.hover = p; });
      el.addEventListener("pointerleave", () => { if (pointers.hover?.id === this.id) pointers.hover = null; });
      el.addEventListener("pointerdown", (e) => carry(v, el, e));
      return el;
    }
  }

  function carry(v: EditorView, el: HTMLElement, down: PointerEvent): void {
    if (down.button !== 0) return;
    down.preventDefault();
    let ghost: HTMLElement | null = null;
    const move = (e: PointerEvent): void => {
      if (!ghost) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 4) return;
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add("pt-ghost");
        document.body.append(ghost);
        el.classList.add("pt-lifted");
      }
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      const at = v.posAtCoords({ x: e.clientX, y: e.clientY });
      ghost.classList.toggle("pt-ready", at !== null);
    };
    const up = (e: PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!ghost) { const p = pointers.get(Number(el.dataset.pt)); if (p) void pointers.open(p); return; }
      ghost.remove();
      el.classList.remove("pt-lifted");
      const from = v.posAtDOM(el), at = v.posAtCoords({ x: e.clientX, y: e.clientY });
      // Let go off the box, or where it was: it stays.
      if (at === null || at === from || at === from + 1) return;
      const ch = v.state.doc.sliceString(from, from + 1);
      v.dispatch({ changes: [{ from, to: from + 1 }, { from: at, insert: ch }], selection: { anchor: at > from ? at : at + 1 } });
      v.focus();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function marks(state: EditorState): DecorationSet {
    const out: Range<Decoration>[] = [], text = state.doc.toString();
    for (const m of text.matchAll(MARKS)) {
      const id = idOf(m[0]), at = m.index!;
      // One inside the selection shows it, so what a delete would take is seen.
      if (id !== null) out.push(Decoration.replace({ widget: new Pointed(id, state.selection.ranges.some((r) => !r.empty && r.from <= at && r.to > at)) }).range(at, at + 1));
    }
    return Decoration.set(out);
  }
  const shown = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = marks(v.state); }
    update(u: ViewUpdate) { if (u.docChanged || u.selectionSet) this.decorations = marks(u.state); }
  }, { decorations: (p) => p.decorations, provide: (p) => EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? Decoration.none) });

  const look = EditorView.theme({
    "&": { background: "none", fontSize: "13px" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { maxHeight: "var(--box-h, 200px)", minHeight: "var(--box-h, 0px)", overflow: "auto", fontFamily: "var(--font-ui)", lineHeight: "1.5" },
    ".cm-content": { padding: "10px 12px 4px", minHeight: "44px", caretColor: "var(--text)", color: "var(--text)" },
    ".cm-line": { padding: "0" },
    ".cm-placeholder": { color: "var(--text-faint)" },
    // drawSelection draws the cursor itself (and blinks it): in the text's colour, not its default black.
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)", borderLeftWidth: "1.5px" },
    ".cm-selectionBackground": { background: "color-mix(in srgb, var(--lattice) 30%, transparent) !important" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { background: "color-mix(in srgb, var(--lattice) 38%, transparent) !important" },
  });

  /** Whether the key being handled is an input method's (isComposing, or Safari's keyCode 229 just after compositionend). */
  let composing = false;
  /** Enter is a new line, unless an input method is composing with it: then it is the input method's, to pick the characters. */
  const newline = (v: EditorView): boolean => !composing && insertNewline(v);

  const lock = new Compartment();
  /** What the empty box says: who it asks, which changes once an agent is set up. */
  const hinted = new Compartment();
  onMount(() => {
    const v = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(), drawSelection(), EditorView.lineWrapping, shown, look, hinted.of(hint(placeholder)),
          lock.of(EditorState.readOnly.of(readonly)),
          EditorView.contentAttributes.of({ role: "textbox", "aria-label": "Message the agent", "aria-multiline": "true", id: "agent-box", spellcheck: "true",
            // A phone's keyboard begins each sentence with a capital, and corrects as it does elsewhere; a desktop's does not correct.
            autocapitalize: "sentences", autocorrect: touch ? "on" : "off", enterkeyhint: "enter" }),
          // AgentPane's keys first (Ctrl+Enter sends, a slash command is chosen); what it leaves, the editor does.
          EditorView.domEventHandlers({ keydown: (e) => { composing = e.isComposing || e.keyCode === 229; onkeydown?.(e); return e.defaultPrevented; } }),
          // A word at a time is the editor's own, not the browser's, which stops at each pointer (it is not text).
          keymap.of([{ key: "Enter", run: newline }, { key: "Shift-Enter", run: newline }, ...historyKeymap,
            { key: "Mod-ArrowLeft", mac: "Alt-ArrowLeft", run: cursorGroupLeft, shift: selectGroupLeft },
            { key: "Mod-ArrowRight", mac: "Alt-ArrowRight", run: cursorGroupRight, shift: selectGroupRight },
            { key: "Mod-Backspace", mac: "Alt-Backspace", run: deleteGroupBackward },
            { key: "Mod-Delete", mac: "Alt-Delete", run: deleteGroupForward }]),
          EditorView.updateListener.of((u) => { if (u.docChanged) { const t = u.state.doc.toString(); if (t !== value) value = t; } }),
        ],
      }),
    });
    view = v;
    pointers.insert = (p, at) => {
      const pos = (at && v.posAtCoords(at)) ?? v.state.selection.main.head, doc = v.state.doc;
      const before = doc.sliceString(Math.max(0, pos - 1), pos), after = doc.sliceString(pos, pos + 1);
      const s = (before && !/\s/.test(before) ? " " : "") + markOf(p.id) + (/\s/.test(after) ? "" : " ");
      v.dispatch({ changes: { from: pos, insert: s }, selection: { anchor: pos + s.length }, scrollIntoView: true });
      v.focus();
    };
    pointers.strip = (which) => {
      const doc = v.state.doc.toString(), changes: { from: number; to: number }[] = [];
      for (const m of doc.matchAll(MARKS)) { const id = idOf(m[0]), p = id === null ? undefined : pointers.get(id); if (p && which(p)) changes.push({ from: m.index!, to: m.index! + 1 }); }
      if (changes.length) v.dispatch({ changes });
    };
    for (const p of pointers.pending.splice(0)) pointers.insert(p);
    return () => { pointers.insert = null; pointers.strip = null; v.destroy(); };
  });
  // Written from outside (cleared once sent, a slash command chosen).
  $effect(() => {
    const t = value;
    if (view && t !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t }, selection: { anchor: t.length } });
  });
  // What the prompt holds, for the Atlas to show as given.
  $effect(() => { pointers.inPrompt = used(value, pointers.get); });
  $effect(() => { view?.dispatch({ effects: lock.reconfigure(EditorState.readOnly.of(readonly)) }); });
  $effect(() => { const p = placeholder; view?.dispatch({ effects: hinted.reconfigure(hint(p)) }); });
</script>

<div class="prompt" data-prompt bind:this={host} style:--box-h={height ? `${height}px` : undefined}></div>

<style>
  .prompt { flex: 1 1 auto; min-width: 0; }
  /* A pointer: a chip in the cut-corner frame and isorite's blue, glowing a little; where it is from is on it. */
  :global(.pt) { --c: var(--lattice); display: inline-block; vertical-align: baseline; margin: 0 2px; line-height: 0; cursor: pointer; user-select: none; color: var(--c);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--c) 55%, transparent)); transition: filter var(--t-ack) var(--ease-out); }
  :global(.pt:hover) { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--c) 85%, transparent)); }
  :global(.pt-face) { position: relative; display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px 0 6px; font: 0.7188rem/1 var(--font-ui); color: var(--c); white-space: nowrap; background: var(--c);
    clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px); }
  :global(.pt-face)::before { content: ""; position: absolute; inset: 1px; background: color-mix(in srgb, var(--c) 14%, var(--ground-1)); transition: background-color var(--t-ack) var(--ease-out);
    clip-path: polygon(4.3px 0, 100% 0, 100% calc(100% - 4.3px), calc(100% - 4.3px) 100%, 0 100%, 0 4.3px); }
  :global(.pt-face > *) { position: relative; }
  :global(.pt-face svg) { flex: none; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  :global(.pt-text) { max-width: 16em; overflow: hidden; text-overflow: ellipsis; }
  /* Chosen with the text round it (to be deleted, or copied): filled. */
  :global(.pt-selected .pt-face)::before { background: color-mix(in srgb, var(--c) 60%, var(--ground-1)); }
  :global(.pt-selected .pt-face) { color: var(--text); }
  :global(.pt-lifted) { opacity: .25; }
  :global(.pt-ghost) { position: fixed; z-index: 80; pointer-events: none; transform: translate(-50%, -50%) scale(1.06); cursor: grabbing; }
  :global(.pt-ghost.pt-ready) { filter: drop-shadow(0 0 10px var(--lattice)); }
</style>
