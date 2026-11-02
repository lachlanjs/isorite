// The chat over a project's threads on GitHub and GitLab (M28): who is signed in, the repository chosen, its threads
// and the one open, read again every so often while the chat is shown. A reply is sent only by the person's press.

import type { ChatHostState, ChatKind, ChatRepo, ChatSignIn, ChatState, ChatThread, ChatThreadFull } from "@isorite/engine";
import type { ChatApi } from "./api.ts";
import { app } from "./app.svelte.ts";

const LIST_EVERY = 30_000, THREAD_EVERY = 10_000;

/** How long ago, in a word or two: 3m, 2h, yesterday, Mon, 12 Jan. */
export function short(at: string, now = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const s = (now.getTime() - d.getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= midnight) return `${Math.floor(s / 3600)}h`;
  if (d.getTime() >= midnight - 86_400_000) return "yesterday";
  if (d.getTime() >= midnight - 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

class Chat {
  state = $state.raw<ChatState | null>(null);
  /** The repository chosen, as `host:server/path`. */
  repoKey = $state("");
  threads = $state.raw<ChatThread[]>([]);
  note = $state("");
  open = $state.raw<ChatThreadFull | null>(null);
  /** Why the last thing failed, in words. */
  problem = $state("");
  /** A sign-in waiting for the person to give the host its code. */
  signing = $state.raw<ChatSignIn | null>(null);
  loading = $state(false);
  sending = $state(false);
  private timer: ReturnType<typeof setInterval> | undefined;
  private shown = false;

  private get api(): ChatApi | null { return (app.api as { chat?: ChatApi } | undefined)?.chat ?? null; }
  get available(): boolean { return !!this.api; }
  get repo(): ChatRepo | null { return this.state?.repos.find((r) => `${r.host}:${r.server}/${r.path}` === this.repoKey) ?? this.state?.repos[0] ?? null; }
  /** The host the repository is on, as signed in or not. */
  get host(): ChatHostState | null { const r = this.repo; return r ? (this.state?.hosts.find((h) => h.id === r.host && h.server === r.server) ?? null) : null; }

  private fail(e: unknown): void { this.problem = (e as Error).message; }

  /** The chat is on show: read it now, and again while it stays. */
  show(on: boolean): void {
    this.shown = on;
    clearInterval(this.timer);
    if (!on) return;
    void this.refresh();
    this.timer = setInterval(() => { if (document.visibilityState !== "hidden") void this.tick(); }, 5000);
  }
  private last = { list: 0, thread: 0 };
  private async tick(): Promise<void> {
    const now = Date.now();
    if (this.open && now - this.last.thread >= THREAD_EVERY) await this.reread();
    else if (!this.open && this.host?.me && now - this.last.list >= LIST_EVERY) await this.list();
  }

  async refresh(): Promise<void> {
    if (!this.api) return;
    try { this.state = await this.api.state(); this.problem = ""; } catch (e) { this.fail(e); return; }
    if (this.host?.me) await this.list();
  }
  choose(key: string): void { this.repoKey = key; this.open = null; this.threads = []; this.note = ""; if (this.host?.me) void this.list(); }

  async list(): Promise<void> {
    const r = this.repo;
    if (!this.api || !r) return;
    this.loading = !this.threads.length;
    try { const got = await this.api.threads(r); this.threads = got.threads; this.note = got.note; this.problem = ""; this.last.list = Date.now(); } catch (e) { this.fail(e); void this.recheck(e); }
    this.loading = false;
  }
  async read(kind: ChatKind, number: number): Promise<void> {
    const r = this.repo;
    if (!this.api || !r) return;
    try { this.open = await this.api.thread(r, kind, number); this.problem = ""; this.last.thread = Date.now(); } catch (e) { this.fail(e); void this.recheck(e); }
  }
  private async reread(): Promise<void> {
    const o = this.open;
    if (!o) return;
    this.last.thread = Date.now();
    try { const r = this.repo, got = r ? await this.api?.thread(r, o.kind, o.number) : null; if (got && this.open === o && got.messages.length !== o.messages.length) this.open = got; } catch { /* the next read tries again */ }
  }
  close(): void { this.open = null; void this.list(); }
  /** A refused sign-in leaves the host signed out: the state says so. */
  private async recheck(e: unknown): Promise<void> { if ((e as { status?: number }).status === 401) { try { this.state = await this.api!.state(); } catch { /* shown already */ } } }

  async signIn(): Promise<void> {
    const h = this.host;
    if (!this.api || !h) return;
    this.problem = "";
    try { this.signing = await this.api.signIn(h.id, h.server); void this.waitFor(this.signing); } catch (e) { this.fail(e); }
  }
  private async waitFor(s: ChatSignIn): Promise<void> {
    while (this.signing === s) {
      await new Promise((r) => setTimeout(r, 5200));
      if (this.signing !== s) return;
      try {
        const got = await this.api!.poll(s.host, s.server);
        if (got.state === "waiting") continue;
        this.signing = null;
        if (got.state === "done") await this.refresh(); else this.problem = got.state === "denied" ? "The sign-in was refused." : "The code ran out; start again.";
      } catch (e) { this.signing = null; this.fail(e); }
    }
  }
  cancel(): void { this.signing = null; }
  async useCli(): Promise<void> {
    const h = this.host;
    if (!this.api || !h) return;
    try { await this.api.useCli(h.id, h.server); await this.refresh(); } catch (e) { this.fail(e); }
  }
  async signOut(): Promise<void> {
    const h = this.host;
    if (!this.api || !h) return;
    try { await this.api.signOut(h.id, h.server); this.open = null; this.threads = []; await this.refresh(); } catch (e) { this.fail(e); }
  }

  /** Send a reply to the thread open. True when it was sent. */
  async reply(text: string): Promise<boolean> {
    const r = this.repo, o = this.open;
    if (!this.api || !r || !o || !text.trim()) return false;
    this.sending = true;
    try {
      const m = await this.api.reply(r, o.kind, o.number, text.trim());
      if (this.open === o) this.open = { ...o, replies: o.replies + 1, messages: [...o.messages, m] };
      this.problem = "";
      return true;
    } catch (e) { this.fail(e); return false; } finally { this.sending = false; }
  }
}

export const chat = new Chat();
