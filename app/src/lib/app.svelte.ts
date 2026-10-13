// What the whole app shares: the Api, what is open, and the list of notes,
// kept current from the engine's events.

import { resolve } from "$app/paths";
import type { Api, EngineEvent, Listing, Session } from "@isorite/engine";
import { httpApi } from "./api.ts";

class AppState {
  api!: Api;
  session = $state.raw<Session | null>(null);
  listing = $state.raw<Listing>({ notes: [], dirs: [] });
  /** Why nothing could be loaded, when nothing could. */
  error = $state("");
  /** The note that is open, for what Iso would be sent: its id, or "". */
  open = $state("");
  /** What the header's path ends in: the open note's title. */
  here = $state("");
  /** How the open note's saving stands, for the status line. */
  saving = $state<{ text: string; bad: boolean } | null>(null);
  private readonly listeners = new Set<(event: EngineEvent) => void>();
  private relist: ReturnType<typeof setTimeout> | null = null;

  async load(api: Api = httpApi()): Promise<void> {
    this.api = api;
    try {
      [this.session, this.listing] = await Promise.all([api.session(), api.notes()]);
    } catch (e) {
      this.error = (e as Error).message;
      return;
    }
    api.events((event) => {
      for (const listener of this.listeners) listener(event);
      if (event.type !== "note-changed") return;
      // A run of saves asks for the list once.
      if (this.relist) clearTimeout(this.relist);
      this.relist = setTimeout(() => { void this.refresh(); }, 300);
    });
  }

  async refresh(): Promise<void> {
    try { this.listing = await this.api.notes(); } catch { /* the next event asks again */ }
  }

  /** Hear the engine's events until the returned function is called. */
  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

export const app = new AppState();

/** The address of a note's page. */
export const noteHref = (id: string): string => resolve("/n/[...id]", { id });

/** A file name for a title: lower case, hyphens, nothing a path cannot hold. */
export function slug(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
