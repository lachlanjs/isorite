/** @jsxImportSource @opentui/solid */
// isorite's TUI half: the views OpenCode does not have. The splash (`Terminal-Splash`), and in the sidebar the
// notes in play: what the agent found in the knowledge base and how far each got (`Terminal`, `Terminal-Chat`).

import { spawn } from "node:child_process";
import { fg, StyledText, TextRenderable, type TextChunk } from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Entry } from "@isorite/core";
import { noteView, type ViewChange } from "./noteview.ts";
import { NotePage, fromWhom, type NoteData } from "./notepage.tsx";
import * as Isorite from "./isorite.ts";
import * as Logo from "./logo.ts";
import { lapis, quartz } from "./palette.ts";
import { Play, type Step } from "./play.ts";
import { parseSources } from "./sources.ts";

const SPLASH = "isorite-splash";
const NOTE = "isorite-note";

// Below the keys on the board: rule 90 from a single cell, in the line colour.
const FIELD = [
  "                          :       :                          ",
  "                           : : : :                           ",
  "                            :   :                            ",
  "                             : :                             ",
  "                              :                              ",
];

/** Opens a URL in the browser, where the platform has a way to. */
function openInBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(command, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

export default Plugin.define({
  id: "isorite",
  setup(ctx) {
    const ground = () => (ctx.themeMode === "light" ? quartz : lapis);
    const style = (process.env.ISORITE_LOGO ?? "quadrant") as Logo.Style;

    // The notes in play, by session, from the server's events; titles from its listing, asked again when notes change.
    const plays = new Map<string, Play>();
    const [heard, hear] = createSignal(0);
    const [titles, setTitles] = createSignal(new Map<string, string>());
    const listTitles = () => Isorite.get<Isorite.Listing>("/api/notes").then((l) => setTitles(new Map(l.notes.map((n) => [n.id, n.title]))), () => undefined);
    void listTitles();
    // What the person sends from the browser goes into the session on screen, to be read with the next message there
    // (resume: false), and is kept under "from you". With no session on screen it waits for one.
    interface Sent { id: string; note: string; title: string; said: string; text: string }
    const fromYou = new Map<string, Sent[]>();
    const waiting: Sent[] = [];
    const deliver = async (sessionID: string) => {
      while (waiting.length) {
        const sent = waiting[0]!;
        try {
          await ctx.client.session.synthetic({ sessionID, text: sent.text, description: `from you: ${sent.title}`, resume: false });
        } catch { return; }
        waiting.shift();
        fromYou.set(sessionID, [...(fromYou.get(sessionID) ?? []), sent]);
        hear((n) => n + 1);
        await Isorite.post("/api/agent/received", { id: sent.id, agent: Isorite.AGENT }).catch(() => undefined);
      }
    };
    const onScreen = () => { const route = ctx.ui.router.current(); return route.type === "session" ? route.sessionID : null; };

    // ------------------------------------------------------------ the note view (Terminal-Note)
    const [shownNote, setShownNote] = createSignal("");
    const [noteVersion, bumpNote] = createSignal(0);
    const [current, setCurrent] = createSignal("");
    let back: Parameters<typeof ctx.ui.router.navigate>[0] = { type: "home" };
    let scroll: ScrollBoxRenderable | undefined;
    const openNote = (id: string) => {
      const route = ctx.ui.router.current();
      // A copy: the router changes its route in place as it goes.
      if (!(route.type === "plugin" && route.name === NOTE))
        back = route.type === "plugin" ? { type: "plugin", name: route.name, data: { ...route.data } } : route.type === "session" ? { type: "session", sessionID: route.sessionID } : { type: "home" };
      setCurrent("");
      setShownNote(id);
      ctx.ui.router.navigate({ type: "plugin", name: NOTE, data: { id } });
    };
    const loadNote = async (id: string): Promise<NoteData> => {
      const q = `?id=${encodeURIComponent(id)}`;
      const [note, entries, study] = await Promise.all([
        Isorite.get<{ text: string }>(`/api/note${q}`), Isorite.get<Entry[]>(`/api/journal${q}`),
        Isorite.get<{ notes: Record<string, { step: number; squares: number }> }>("/api/study").catch(() => null),
      ]);
      const reading = study?.notes[id];
      return { id, title: titles().get(id) ?? id.split("/").at(-1)!, items: noteView(note.text, entries), entries, step: reading?.step ?? 0, squares: reading?.squares ?? 0 };
    };
    const [note] = createResource(() => (shownNote() ? { id: shownNote(), v: noteVersion() } : null), ({ id }) => loadNote(id));
    const changes = () => (note()?.items.filter((i): i is ViewChange => i.type === "change") ?? []);
    // The current change: the one chosen, while it waits; else the first.
    const chosen = () => changes().find((c) => c.key === current()) ?? changes()[0];
    const settle = async (how: "keep" | "discard") => {
      const c = chosen(), id = shownNote();
      if (!c) return;
      await Isorite.post(`/api/proposal/${how}?id=${encodeURIComponent(id)}`, { proposal: c.proposal, ...(c.region === undefined ? {} : { region: c.region }) })
        .catch((e: Error) => ctx.ui.toast?.show?.({ message: e.message, variant: "error" }));
    };
    const edit = async () => {
      const c = chosen(), id = shownNote();
      if (!c) return;
      const text = await ctx.ui.dialog.prompt({ title: `Edit ${fromWhom(c.who)}'s change, then keep it`, value: c.text });
      if (text === undefined) return;
      // A rewrite is revised whole: this region's new text, the rest as they are.
      const entry = note()?.entries.find((e) => e.id === c.proposal) as { regions?: { new: string }[] } | undefined;
      const revised = c.region === undefined ? text : (entry?.regions ?? []).map((r, k) => (k === c.region ? text : r.new));
      try {
        await Isorite.post(`/api/proposal/revise?id=${encodeURIComponent(id)}`, { proposal: c.proposal, text: revised });
        await settle("keep");
      } catch (e) { ctx.ui.toast?.show?.({ message: (e as Error).message, variant: "error" }); }
    };
    ctx.ui.router.register({
      name: NOTE,
      render: () => <NotePage note={note} current={() => chosen()?.key ?? ""} ground={ground} base={baseName()} scroll={(s) => { scroll = s; }} />,
    });
    const [baseName, setBaseName] = createSignal("");
    void Isorite.get<Isorite.Session>("/api/session").then((s) => setBaseName(s.name), () => undefined);

    const stop = new AbortController();
    Isorite.listen((type, data) => {
      if (type === "note-changed") void listTitles();
      if ((type === "journal" || type === "note-changed") && data.id === shownNote()) bumpNote((n) => n + 1);
      if (type === "agent-sent") {
        waiting.push({ id: String(data.id), note: String(data.note), title: String(data.title), said: String(data.said ?? ""), text: String(data.text) });
        const sessionID = onScreen();
        if (sessionID) void deliver(sessionID);
        return;
      }
      if (type !== "agent-step" || data.agent !== Isorite.AGENT || typeof data.session !== "string") return;
      const play = plays.get(data.session) ?? new Play();
      plays.set(data.session, play);
      play.add(data.step as Step);
      hear((n) => n + 1);
    }, stop.signal);

    // The sources an answer ends with, drawn as the board draws a citation; the notes they name are used.
    ctx.markdown.registerCodeBlockRenderer("isorite", (token) => {
      const sources = parseSources(token.text);
      if (!sources.length) return null;
      const chunks: TextChunk[] = [];
      sources.forEach((s, k) => {
        const title = (titles().get(s.note) ?? s.note.split("/").at(-1)!).toLowerCase();
        chunks.push(fg(ground().growth)(`${k ? "\n" : ""}[${s.n}]`), fg(ground().text)(` ${title}`));
        if (s.section) chunks.push(fg(ground().faint)(` § ${s.section.toLowerCase()}`));
      });
      // Drawing happens in the session on screen: its notes in play are the ones to mark.
      queueMicrotask(() => {
        const route = ctx.ui.router.current();
        const play = route.type === "session" ? plays.get(route.sessionID) : undefined;
        if (play?.cite(sources.map((s) => s.note))) hear((n) => n + 1);
      });
      return new TextRenderable(ctx.renderer, { content: new StyledText(chunks) });
    });

    ctx.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        const play = () => (heard(), plays.get(input.sessionID));
        const rows = () => play()?.rows((id) => titles().get(id) ?? id.split("/").at(-1)!) ?? [];
        const summary = () => {
          const s = play()?.summary();
          return s ? [`${s.found} found`, s.followed ? `${s.followed} by links` : "", s.used ? `${s.used} used` : ""].filter(Boolean).join(" · ") : "";
        };
        const state = (row: { state: string }) => (row.state === "used" ? ground().growth : row.state === "read" ? ground().soft : ground().faint);
        const sent = () => (heard(), fromYou.get(input.sessionID) ?? []);
        return (
          <box flexDirection="column">
          <Show when={rows().length > 0}>
            <box border borderStyle="rounded" borderColor={ground().ls} title=" notes in play " paddingLeft={1} paddingRight={1} flexDirection="column">
              <text fg={ground().faint} wrapMode="none">{summary()}</text>
              <For each={rows()}>
                {(row) => (
                  <box flexDirection="row" minWidth={0} onMouseUp={() => openNote(row.id)}>
                    <text fg={ground().line} wrapMode="none" flexShrink={0}>{row.prefix}</text>
                    <text fg={ground().text} wrapMode="word" flexShrink={1} minWidth={0}>{row.label}</text>
                    <box flexGrow={1} minWidth={1} />
                    <text fg={state(row)} wrapMode="none" flexShrink={0}>{row.state === "used" ? "◆ used" : row.state}</text>
                  </box>
                )}
              </For>
            </box>
          </Show>
          <Show when={sent().length > 0}>
            <box border borderStyle="rounded" borderColor={ground().ls} title=" from you " paddingLeft={1} paddingRight={1} flexDirection="column">
              <For each={sent()}>
                {(s) => (
                  <box flexDirection="column">
                    <text fg={ground().text} wrapMode="word">{s.note.replace(/-/g, " ").replace(/\//g, " / ")}</text>
                    <Show when={s.said}><text fg={ground().faint} wrapMode="word">{`“${s.said}”`}</text></Show>
                  </box>
                )}
              </For>
            </box>
          </Show>
          </box>
        );
      },
    });

    ctx.ui.router.register({
      name: SPLASH,
      render: () => {
        const [base] = createResource(() => Isorite.base().catch((e: Error) => ({ error: e.message })));
        const line = () => {
          const b = base();
          if (!b) return " ";
          if ("error" in b) return `isorite is not answering at ${Isorite.url}`;
          return `${b.name} · ${b.notes} ${b.notes === 1 ? "note" : "notes"} · ${b.study ? "study base found" : "no study base"}`;
        };
        return (
          <box flexDirection="column" alignItems="center" justifyContent="center" width="100%" height="100%">
            <For each={Logo.rows(style)}>
              {(runs) => (
                <text>
                  <For each={runs}>{(run) => <span style={{ fg: run.growth ? ground().growth : ground().text }}>{run.text}</span>}</For>
                </text>
              )}
            </For>
            <text> </text>
            <text fg={ground().text}><b>{"  i s o r i t e"}</b></text>
            <text> </text>
            <text fg={ground().soft}>{line()}</text>
            <text> </text>
            <text>
              <span style={{ fg: ground().g0, bg: ground().text }}>{" [enter] open "}</span>
              <span style={{ fg: ground().soft }}>{"   [a] atlas in the browser   [?] keys   [q] quit"}</span>
            </text>
            <text> </text>
            <text> </text>
            <For each={FIELD}>{(row) => <text fg={ground().line}>{row}</text>}</For>
          </box>
        );
      },
    });

    // Commands live in a component, as OpenCode's own do; made in setup they do not appear.
    ctx.ui.slot({
      append: "app",
      render() {
        const onSplash = () => {
          const route = ctx.ui.router.current();
          return route.type === "plugin" && route.name === SPLASH;
        };
        const onNote = () => { const route = ctx.ui.router.current(); return route.type === "plugin" && route.name === NOTE; };
        ctx.keymap.layer(() => ({
          mode: "global",
          enabled: onNote,
          commands: [
            { id: "isorite.note.next", title: "Next change", bind: "n", run: () => { const all = changes(), k = all.findIndex((c) => c.key === chosen()?.key); if (all.length) setCurrent(all[(k + 1) % all.length]!.key); } },
            { id: "isorite.note.keep", title: "Keep the change", bind: "k", run: () => void settle("keep") },
            { id: "isorite.note.edit", title: "Edit the change, then keep it", bind: "e", run: () => void edit() },
            { id: "isorite.note.remove", title: "Remove the change", bind: "r", run: () => void settle("discard") },
            { id: "isorite.note.browser", title: "The note in the browser", bind: "b", run: () => openInBrowser(`${Isorite.url}/#/n/${shownNote()}`) },
            { id: "isorite.note.back", title: "Back", bind: "q", run: () => ctx.ui.router.navigate(back) },
            { id: "isorite.note.escape", title: "Back", bind: "escape", run: () => ctx.ui.router.navigate(back) },
            { id: "isorite.note.down", title: "Scroll down", bind: "down", run: () => scroll?.scrollBy(1) },
            { id: "isorite.note.up", title: "Scroll up", bind: "up", run: () => scroll?.scrollBy(-1) },
            { id: "isorite.note.pagedown", title: "Page down", bind: "pagedown", run: () => scroll?.scrollBy(0.8 * (scroll?.height ?? 20)) },
            { id: "isorite.note.pageup", title: "Page up", bind: "pageup", run: () => scroll?.scrollBy(-0.8 * (scroll?.height ?? 20)) },
          ],
        }));
        ctx.keymap.layer(() => ({
          mode: "global",
          commands: [{
            id: "isorite.note.open", title: "Open a note of the knowledge base", palette: true, slash: { name: "note", arguments: true },
            run: async (input) => {
              const words = input?.trim();
              if (words) {
                const hits = await Isorite.get<{ id: string }[]>(`/api/search?q=${encodeURIComponent(words)}`).catch(() => []);
                const exact = titles().has(words.replace(/^\/+|\.md$/g, "")) ? words.replace(/^\/+|\.md$/g, "") : undefined;
                const id = exact ?? hits[0]?.id;
                if (id) openNote(id); else ctx.ui.toast?.show?.({ message: `no note matches “${words}”`, variant: "warning" });
                return;
              }
              const id = await ctx.ui.dialog.select({
                title: "Open a note", placeholder: "its title",
                options: [...titles()].map(([value, title]) => ({ title, value, description: value.split("/").slice(0, -1).join(" / ") })),
              });
              if (id) openNote(id);
            },
          }],
        }));
        // Anything sent while no session was on screen goes to the first one opened.
        createEffect(() => { const sessionID = onScreen(); if (sessionID && waiting.length) void deliver(sessionID); });
        ctx.keymap.layer(() => ({
          mode: "global",
          enabled: onSplash,
          commands: [
            { id: "isorite.splash.open", title: "Open", bind: "return", run: () => ctx.ui.router.navigate({ type: "home" }) },
            { id: "isorite.splash.atlas", title: "The Atlas in the browser", bind: "a", run: () => openInBrowser(Isorite.url + "/") },
            { id: "isorite.splash.keys", title: "Keys", bind: "?", run: () => ctx.keymap.dispatch("help.show") },
            { id: "isorite.splash.quit", title: "Quit", bind: "q", run: () => ctx.keymap.dispatch("app.exit") },
          ],
        }));
        return null;
      },
    });

    // The splash is shown once, when the TUI starts.
    setTimeout(() => ctx.ui.router.navigate({ type: "plugin", name: SPLASH, data: {} }), 0);
    return () => stop.abort();
  },
});
