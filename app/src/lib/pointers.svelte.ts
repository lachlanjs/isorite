// The pointers in play (see pointers.ts): made when a stretch is chosen and sent to the prompt, kept for the session so
// the prompt's characters can be told from what they stand for.

import { goto } from "$app/navigation";
import { app, codeHref } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";
import { pointing } from "./pointing.svelte.ts";
import { COUNT, expand, relocate, used, whole, type Pointer } from "./pointers.ts";
import { revealPassage } from "./reveal.ts";

class Pointers {
  readonly #all = new Map<number, Pointer>();
  #next = 0;
  /** The pointer under the mouse in the prompt: its note is lit on the Atlas, and its words in the note if it is open. */
  hover = $state.raw<Pointer | null>(null);
  /** Set by the prompt: put a pointer in it, at a point of the screen (a drop) or at its cursor. */
  insert: ((p: Pointer, at?: { x: number; y: number }) => void) | null = null;

  /** The pointers the prompt holds now (set by the prompt). */
  inPrompt = $state.raw<Pointer[]>([]);
  /** Set by the prompt: take out of it each pointer that `which` says yes to. */
  strip: ((which: (p: Pointer) => boolean) => void) | null = null;
  /** Put in while the prompt was not on the screen: it takes them when it is. */
  pending: Pointer[] = [];

  /** Put a pointer in the prompt (or hold it for the prompt, which a hidden pane does not have). */
  put(p: Pointer): void {
    if (this.insert) this.insert(p); else this.pending.push(p);
    if (panes.focus !== "agent") panes.unseen++;
  }
  /** A whole note or folder, in the prompt or not. */
  holds(kind: "note" | "folder", ref: string): boolean { return this.inPrompt.some((p) => p.kind === kind && p.ref === ref && whole(p)); }
  /** A note or folder as a pointer: put in the prompt if it is not there, else taken out. Whether it is now in. */
  toggle(kind: "note" | "folder", ref: string, title: string): boolean {
    if (this.holds(kind, ref)) { this.strip?.((p) => p.kind === kind && p.ref === ref && whole(p)); return false; }
    this.put(this.make({ kind, ref, title, from: 0, to: 0, text: "" }));
    return true;
  }
  /** Where a pointer pressed is to be shown, for the page that opens it to take (a note's editor, a code file's lines):
   *  its place and words as they were taken; the page finds them again in the file as it is now. `n` tells one press from the next. */
  shown = $state.raw<(Omit<Pointer, "id" | "title"> & { n: number }) | null>(null);
  #pressed = 0;

  /** Pressed, not carried: where it came from is shown. A note or file opens at its lines, which are lit (where the words
   *  are now, if they have moved); a note moved since opens where it is now; a passage of the conversation is scrolled to
   *  and lit, looked for before `turn` when the pointer is in a sent one. Whether it was found. */
  async open(p: Omit<Pointer, "id" | "title">, turn: Element | null = null): Promise<boolean> {
    if (p.kind === "turn") return revealPassage(p.text, turn);
    if (p.kind === "folder") { pointing.set("agent", { id: p.ref, folder: true, who: "you" }); return true; }
    const lines = !whole(p) && p.from > 0;
    if (p.kind === "note") {
      let id = p.ref;
      // Moved since it was pointed to: the journal says where it is now (the note's page would say so too, but too late
      // for its lines to be lit).
      if (app.listing.notes.length && !app.listing.notes.some((n) => n.id === id)) {
        try { const w = await app.api.resolveNote(id); if (w.state === "moved" && w.id) id = w.id; } catch { /* opened where it was, and the page says what it can */ }
      }
      if (lines) this.shown = { ...p, ref: id, n: ++this.#pressed };
      await panes.open(id, true);
      return true;
    }
    // A code file of the base is named by its path in the base ("/src/a.py"), one of the repository without the slash.
    if (p.ref.startsWith("/")) {
      if (lines) this.shown = { ...p, n: ++this.#pressed };
      await panes.open(p.ref.slice(1), true);
      return true;
    }
    // One of the repository: the code reader marks the lines its address names, so they are found again first.
    let at = p;
    if (lines) try { const slice = await app.api.code(`code:${p.ref}`, true); if (slice.state === "ok") at = relocate(slice.text, { ...p, id: -1, title: "" }); } catch { /* as they were */ }
    await goto(codeHref(lines ? `code:${p.ref}#L${at.from}${at.to > at.from ? `-L${at.to}` : ""}` : `code:${p.ref}`));
    if (panes.narrow) panes.to("note");
    return true;
  }

  make(draft: Omit<Pointer, "id">): Pointer {
    const id = this.#next++ % COUNT, p = { ...draft, id };
    this.#all.set(id, p);
    return p;
  }
  get = (id: number): Pointer | undefined => this.#all.get(id);

  /** Each pointer of the prompt against its file as it is now, then the prompt as it is sent. */
  async expand(text: string): Promise<string> {
    for (const p of used(text, this.get)) {
      try {
        let file = "";
        if (p.kind === "note") file = (await app.api.readNote(p.ref)).text;
        else if (p.kind === "code" && p.ref.startsWith("/")) { const got = await app.api.file(p.ref.slice(1)); if (got) file = new TextDecoder().decode(got.bytes); }
        else if (p.kind === "code") { const slice = await app.api.code(`code:${p.ref}`, true); if (slice.state === "ok") file = slice.text; }
        this.#all.set(p.id, relocate(file, p));
      } catch { /* the file is not to be read now: its lines are as they were */ }
    }
    return expand(text, this.get);
  }
}

export const pointers = new Pointers();
