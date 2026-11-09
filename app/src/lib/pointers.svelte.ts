// The pointers in play (see pointers.ts): made when a stretch is chosen and sent to the prompt, kept for the session so
// the prompt's characters can be told from what they stand for.

import { app } from "./app.svelte.ts";
import { COUNT, expand, relocate, used, type Pointer } from "./pointers.ts";

class Pointers {
  readonly #all = new Map<number, Pointer>();
  #next = 0;
  /** The pointer under the mouse in the prompt: its note is lit on the Atlas, and its words in the note if it is open. */
  hover = $state.raw<Pointer | null>(null);
  /** Set by the prompt: put a pointer in it, at a point of the screen (a drop) or at its cursor. */
  insert: ((p: Pointer, at?: { x: number; y: number }) => void) | null = null;

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
        else if (p.kind === "code") { const slice = await app.api.code(`code:${p.ref}`, true); if (slice.state === "ok") file = slice.text; }
        this.#all.set(p.id, relocate(file, p));
      } catch { /* the file is not to be read now: its lines are as they were */ }
    }
    return expand(text, this.get);
  }
}

export const pointers = new Pointers();
