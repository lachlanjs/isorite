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
  atlas = $state.raw<{ items: number; chosen: string; steps: number; pick: boolean; here: string; out: () => void } | null>(null);
  /** An exercise, while one is open: what the header shows of it (Study-Written): its kind, the squares for what it
   *  tests, whether they flash, and the two things done from there. */
  exercise = $state.raw<{ kind: string; squares: number; due: boolean; flash: number; windBack: () => void; why: () => void; next: string | null } | null>(null);
  /** A page of study that is not an exercise (a request for one): the view switch shows study. */
  studying = $state(false);
  /** Back from signing in at the provider for a key: how it went, for the settings to say. */
  signIn = $state.raw<{ ok: boolean; message: string } | null>(null);
  /** A hint for the status line from the page, when it has one. */
  hint = $state("");
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
    await this.signedIn();
    api.events((event) => {
      this.follow(event);
      for (const listener of this.listeners) listener(event);
      if (event.type !== "note-changed") return;
      // A run of saves asks for the list once.
      if (this.relist) clearTimeout(this.relist);
      this.relist = setTimeout(() => { void this.refresh(); }, 300);
    });
  }

  /** Go to the provider to sign in and make a key. It comes back to this page, with a code, and to the place it was. */
  async startSignIn(): Promise<void> {
    const { url } = await this.api.connect(location.origin + location.pathname);
    try { sessionStorage.setItem(SIGN_IN_BACK, location.hash); } catch { /* back to the start instead */ }
    location.assign(url);
  }

  /** Back from the provider: the code in the address is exchanged for the key (by the engine; the key is never seen
   *  here), at the address the sign-in was begun from. */
  private async signedIn(): Promise<void> {
    // The router keeps the address it started on, so the code is put aside and the page opened again at the clean
    // address it left from; the code is exchanged there.
    const q = new URLSearchParams(location.search);
    let code: string | null, state: string | null;
    try {
      if (q.has("code") || q.has("state") || q.has("error")) {
        const back = sessionStorage.getItem(SIGN_IN_BACK) ?? location.hash;
        sessionStorage.removeItem(SIGN_IN_BACK);
        sessionStorage.setItem(SIGN_IN_CODE, JSON.stringify({ code: q.get("code"), state: q.get("state") }));
        location.replace(location.pathname + back);
        return new Promise(() => undefined); // nothing is drawn of the page being left
      }
      const kept = sessionStorage.getItem(SIGN_IN_CODE);
      if (kept === null) return;
      sessionStorage.removeItem(SIGN_IN_CODE);
      ({ code, state } = JSON.parse(kept) as { code: string | null; state: string | null });
    } catch {
      // No storage: exchange it here, and the address keeps the code.
      ({ code, state } = { code: q.get("code"), state: q.get("state") });
      if (!code && !state) return;
    }
    if (!code || !state) { this.signIn = { ok: false, message: "No key was made: the sign-in was left or refused." }; return; }
    try {
      const s = await this.api.connected(code, state);
      this.signIn = { ok: true, message: `Signed in at ${s.provider}: a key was made for isorite, and is held on this device.` };
    } catch (e) { this.signIn = { ok: false, message: (e as Error).message }; }
  }

  async refresh(): Promise<void> {
    try { this.listing = await this.api.notes(); } catch { /* the next event asks again */ }
  }

  private follow(e: EngineEvent): void {
    if (e.type === "iso-start") { this.iso = { request: e.request, note: e.note, agent: null, state: "reading", steps: [], message: "" }; return; }
    // A terminal agent's turn is drawn as Iso's request is, but does not take the map from Iso while it answers.
    // A page that opens during a turn learns of it from its next step.
    if ((e.type === "agent-start" || e.type === "agent-step") && this.iso?.request !== e.request) {
      if (this.iso && !this.iso.agent && (this.iso.state === "reading" || this.iso.state === "writing")) return;
      this.iso = { request: e.request, note: "", agent: e.agent, state: "reading", steps: [], message: "" };
    }
    const run = this.iso;
    if (!run || !("request" in e) || e.request !== run.request) return;
    if (e.type === "iso-step" || e.type === "agent-step") this.iso = { ...run, state: "reading", steps: [...run.steps, e.step] };
    else if (e.type === "iso-text" && run.state !== "writing") this.iso = { ...run, state: "writing" };
    else if (e.type === "iso-done" || e.type === "agent-done") this.iso = { ...run, state: "done" };
    else if (e.type === "iso-stopped") this.iso = { ...run, state: "stopped" };
    else if (e.type === "iso-failed") this.iso = { ...run, state: "failed", message: e.message };
  }

  /** Hear the engine's events until the returned function is called. */
  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

/** One request to Iso as it goes: `reading` while it looks things up, `writing` once its text comes. Or a terminal
 *  agent's turn (`agent` names it; `note` is empty): `reading` until the turn ends. */
export interface IsoRun { request: string; note: string; agent: string | null; state: "reading" | "writing" | "done" | "stopped" | "failed"; steps: Step[]; message: string }

const SIGN_IN_BACK = "isorite.sign-in.back", SIGN_IN_CODE = "isorite.sign-in.code";

export const app = new AppState();

/** The address of a note's page. */
export const noteHref = (id: string): string => resolve("/n/[...id]", { id });

/** A file name for a title: lower case, hyphens, nothing a path cannot hold. */
export function slug(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
