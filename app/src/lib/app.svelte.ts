// What the whole app shares: the Api, what is open, and the list of notes,
// kept current from the engine's events.

import { resolve } from "$app/paths";
import type { Api, EngineEvent, Listing, Session, Step } from "@isorite/engine";
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
  /** The Atlas, while it is the page: how many study items it shows, for the status line. */
  atlas = $state.raw<{ items: number; chosen: string; steps: number; chain: boolean; whole: () => void; pick: boolean; here: string; out: () => void } | null>(null);
  /** Iso's latest request, from any page or tab, as the Atlas draws its path: the note asking, each step, and how
   *  it ended. It stays until the next request, or until the Atlas lets it go. */
  iso = $state.raw<IsoRun | null>(null);
  /** The request of a note for Iso sent from its page to be watched on the map: it opens again when Iso is done. */
  watching = "";
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
      this.follow(event);
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

  private follow(e: EngineEvent): void {
    if (e.type === "iso-start") { this.iso = { request: e.request, note: e.note, state: "reading", steps: [], message: "" }; return; }
    const run = this.iso;
    if (!run || !("request" in e) || e.request !== run.request) return;
    if (e.type === "iso-step") this.iso = { ...run, state: "reading", steps: [...run.steps, e.step] };
    else if (e.type === "iso-text" && run.state !== "writing") this.iso = { ...run, state: "writing" };
    else if (e.type === "iso-done") this.iso = { ...run, state: "done" };
    else if (e.type === "iso-stopped") this.iso = { ...run, state: "stopped" };
    else if (e.type === "iso-failed") this.iso = { ...run, state: "failed", message: e.message };
  }

  /** Hear the engine's events until the returned function is called. */
  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

/** One request to Iso as it goes: `reading` while it looks things up, `writing` once its text comes. */
export interface IsoRun { request: string; note: string; state: "reading" | "writing" | "done" | "stopped" | "failed"; steps: Step[]; message: string }

export const app = new AppState();

/** The address of a note's page. */
export const noteHref = (id: string): string => resolve("/n/[...id]", { id });

/** A file name for a title: lower case, hyphens, nothing a path cannot hold. */
export function slug(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
