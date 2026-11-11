// What the whole app shares: the Api, what is open, and the list of notes,
// kept current from the engine's events.

import { resolve } from "$app/paths";
import { FOLDERS_LENS, type ResolvedLens } from "@isorite/core";
import type { Api, EngineEvent, LensSummary, Listing, Session, Step } from "@isorite/engine";
import { httpApi } from "./api.ts";
import type { Embedded } from "./editor/blocks.ts";

const storedLens = (): string => { try { return localStorage.getItem("isorite.lens") || FOLDERS_LENS; } catch { return FOLDERS_LENS; } };

class AppState {
  api!: Api;
  session = $state.raw<Session | null>(null);
  listing = $state.raw<Listing>({ notes: [], dirs: [] });
  /** The notes and folders kept off the Atlas and the list, by id (a folder hides what is in it). */
  hidden = $state.raw<string[]>([]);
  /** Whether an id (a note, or a folder) is hidden, itself or by a folder it is in. */
  isHidden(id: string): boolean { const x = id.replace(/\/$/, ""); return this.hidden.some((h) => x === h || x.startsWith(`${h}/`)); }
  async hide(id: string): Promise<void> { await this.keep([...this.hidden, id.replace(/\/$/, "")]); }
  async unhide(id: string): Promise<void> { const x = id.replace(/\/$/, ""); await this.keep(this.hidden.filter((h) => h !== x)); }
  private async keep(ids: string[]): Promise<void> {
    const was = this.hidden;
    this.hidden = [...new Set(ids)].sort();
    try { await this.api.setHidden(this.hidden); } catch (e) { this.hidden = was; throw e; }
  }
  /** The lenses the base has (`.isorite/lenses/`), the one the Atlas and the list show ("folders" is the real folders), and
   *  that one read over the notes (null for the folders). The choice is the person's, kept in this browser. */
  lenses = $state.raw<LensSummary[]>([]);
  lensName = $state(storedLens());
  lens = $state.raw<ResolvedLens | null>(null);
  /** Read the lenses and the chosen one again: after a change to the notes, which may have moved a note between islands. */
  async loadLens(): Promise<ResolvedLens | null> {
    try { this.lenses = await this.api.lenses(); } catch { this.lenses = []; }
    if (this.lensName !== FOLDERS_LENS && !this.lenses.some((l) => l.name === this.lensName)) this.lensName = FOLDERS_LENS;
    this.lens = this.lensName === FOLDERS_LENS ? null : await this.api.lens(this.lensName).catch(() => null);
    return this.lens;
  }
  async setLens(name: string): Promise<void> {
    this.lensName = name;
    try { localStorage.setItem("isorite.lens", name); } catch { /* not kept */ }
    await this.loadLens();
  }
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
  agent = $state.raw<AgentRun | null>(null);
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
    void api.hidden().then((h) => { this.hidden = h.ids; }, () => undefined);
    void this.loadLens();
    api.events((event) => {
      if (event.type === "hidden") void api.hidden().then((h) => { this.hidden = h.ids; }, () => undefined);
      if (event.type === "lenses") void this.loadLens();
      this.follow(event);
      for (const listener of this.listeners) listener(event);
      if (event.type !== "note-changed") return;
      // A run of saves asks for the list once.
      if (this.relist) clearTimeout(this.relist);
      this.relist = setTimeout(() => { void this.refresh(); }, 300);
    }, (up) => {
      this.offline = !up;
      if (!up) return;
      void this.refresh();
      for (const listener of this.back) listener();
    });
  }

  /** The event stream is down (the server restarted, the laptop slept): the browser is reconnecting. */
  offline = $state(false);
  private readonly back = new Set<() => void>();
  /** Hear when the event stream is back after being lost, to read again what may have changed meanwhile. */
  onReconnect(listener: () => void): () => void {
    this.back.add(listener);
    return () => { this.back.delete(listener); };
  }

  async refresh(): Promise<void> {
    try { this.listing = await this.api.notes(); } catch { /* the next event asks again */ }
    void this.loadLens();
  }

  private follow(e: EngineEvent): void {
    // A page that opens during a turn learns of it from its next step.
    if ((e.type === "agent-start" || e.type === "agent-step") && this.agent?.request !== e.request) this.agent = { request: e.request, note: "", agent: e.agent, state: "reading", steps: [], message: "" };
    const run = this.agent;
    if (!run || !("request" in e) || e.request !== run.request) return;
    if (e.type === "agent-step") this.agent = { ...run, state: "reading", steps: [...run.steps, e.step] };
    else if (e.type === "agent-done") this.agent = { ...run, state: "done" };
  }

  /** Hear the engine's events until the returned function is called. */
  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

/** An agent's turn as it goes (`agent` names it; `note` is empty, as the agent's own requests had the note asking until
 *  M25): `reading` until the turn ends. */
export interface AgentRun {
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
