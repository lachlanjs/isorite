// What the whole app shares: the Api, what is open, and the list of notes,
// kept current from the engine's events.

import { resolve } from "$app/paths";
import type { Api, EngineEvent, Listing, Session, Step } from "@isorite/engine";
import { httpApi } from "./api.ts";
import type { Embedded } from "./editor/blocks.ts";

class AppState {
  api!: Api;
  session = $state.raw<Session | null>(null);
  listing = $state.raw<Listing>({ notes: [], dirs: [] });
  /** Why nothing could be loaded, when nothing could. */
  error = $state("");
  /** The note that is open: its id, or "". */
  open = $state("");
  /** What the header's path ends in: the open note's title. */
  here = $state("");
  /** How the open note's saving stands, for the Note pane's header. */
  saving = $state<{ text: string; bad: boolean } | null>(null);
  /** The Atlas: what is chosen on it, and where it is, for its header and settings. */
  atlas = $state.raw<{ chosen: string; chosenId: string; steps: number; here: string; out: () => void; fit: () => void; relayout: () => void } | null>(null);
  /** An agent's latest turn, from any page or tab, as the Atlas draws its path: each step, and how it ended. It
   *  stays until the next turn, or until the Atlas lets it go. */
  iso = $state.raw<IsoRun | null>(null);
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
    // A page that opens during a turn learns of it from its next step.
    if ((e.type === "agent-start" || e.type === "agent-step") && this.iso?.request !== e.request) this.iso = { request: e.request, note: "", agent: e.agent, state: "reading", steps: [], message: "" };
    const run = this.iso;
    if (!run || !("request" in e) || e.request !== run.request) return;
    if (e.type === "agent-step") this.iso = { ...run, state: "reading", steps: [...run.steps, e.step] };
    else if (e.type === "agent-done") this.iso = { ...run, state: "done" };
  }

  /** Hear the engine's events until the returned function is called. */
  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

/** An agent's turn as it goes (`agent` names it; `note` is empty, as Iso's own requests had the note asking until
 *  M25): `reading` until the turn ends. */
export interface IsoRun {
  request: string; note: string; agent: string | null; state: "reading" | "writing" | "done" | "stopped" | "failed"; steps: Step[]; message: string;
}

export const app = new AppState();

/** The address of a note's page. */
export const noteHref = (id: string): string => resolve("/n/[...id]", { id });

/** Where a code link (`code:path#anchor`) is read in full (M34): the code reader, the anchor kept to mark its lines. */
export const codeHref = (href: string): string => {
  const [path = "", anchor = ""] = href.trim().replace(/^code:/, "").split("#");
  return `${resolve("/code/[...path]", { path })}${anchor ? `?at=${encodeURIComponent(anchor)}` : ""}`;
};

/** A file name for a title: lower case, hyphens, nothing a path cannot hold. */
export function slug(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

/** What an embed names (`[[!name]]`, M12), as the bundle resolves it: by file name, or by path where two share it. */
export function findEmbed(ref: string): Embedded | null {
  const path = ref.trim().replace(/^\/+/, "").replace(/\.md$/, "");
  const found = path.includes("/") ? app.listing.notes.filter((n) => n.id === path) : app.listing.notes.filter((n) => n.id.split("/").at(-1) === path);
  const n = found.length === 1 ? found[0]! : null;
  return n ? { id: n.id, title: n.title, kind: n.kind ?? "note", done: !!n.done } : null;
}
