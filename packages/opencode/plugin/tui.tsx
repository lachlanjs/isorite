/** @jsxImportSource @opentui/solid */
// isorite's TUI half: the views OpenCode does not have. The splash (`Terminal-Splash`), and in the sidebar the
// notes in play: what the agent found in the knowledge base and how far each got (`Terminal`, `Terminal-Chat`).

import { spawn } from "node:child_process";
import { BoxRenderable, fg, RGBA, StyledText, TextAttributes, TextRenderable, type Renderable, type TextChunk } from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { ago, anchorOf, blocks, describe, isStudyId, momentKey, moments, reach, type Entry, type MapModel } from "@isorite/core";
import { drawAtlas, runsOf, type Role } from "./oneatlas.ts";
import { noteView, type ViewChange } from "./noteview.ts";
import { NotePage, fromWhom, type NoteData } from "./notepage.tsx";
import * as Isorite from "./isorite.ts";
import * as Logo from "./logo.ts";
import { lapis, quartz, routeColours } from "./palette.ts";
import { Play, type Step } from "./play.ts";
import { parseSources } from "./sources.ts";
import * as Wordmark from "./wordmark.ts";

const SPLASH = "isorite-splash";
const NOTE = "isorite-note";
const ATLAS = "isorite-atlas";

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
    // The block the cursor is on, where [/] asks; the moment of the timeline shown, if any; Iso writing here.
    const [cursor, setCursor] = createSignal(0);
    const [moment, setMoment] = createSignal<{ key: string; said: string; ago: string } | null>(null);
    const [asking, setAsking] = createSignal(false);
    let back: Parameters<typeof ctx.ui.router.navigate>[0] = { type: "home" };
    let scroll: ScrollBoxRenderable | undefined;
    const openNote = (id: string) => {
      const route = ctx.ui.router.current();
      // A copy: the router changes its route in place as it goes.
      if (!(route.type === "plugin" && route.name === NOTE))
        back = route.type === "plugin" ? { type: "plugin", name: route.name, data: { ...route.data } } : route.type === "session" ? { type: "session", sessionID: route.sessionID } : { type: "home" };
      setCurrent("");
      setCursor(0);
      setMoment(null);
      setShownNote(id);
      ctx.ui.router.navigate({ type: "plugin", name: NOTE, data: { id } });
    };
    const loadNote = async (id: string, at: { key: string; said: string; ago: string } | null): Promise<NoteData> => {
      const q = `?id=${encodeURIComponent(id)}`;
      const [note, entries, study] = await Promise.all([
        Isorite.get<{ text: string }>(`/api/note${q}`), Isorite.get<Entry[]>(`/api/journal${q}`),
        Isorite.get<{ notes: Record<string, { step: number; squares: number }> }>("/api/study").catch(() => null),
      ]);
      const reading = study?.notes[id], title = titles().get(id) ?? id.split("/").at(-1)!;
      const common = { id, title, entries, step: reading?.step ?? 0, squares: reading?.squares ?? 0 };
      if (!at) return { ...common, text: note.text, items: noteView(note.text, entries) };
      // At a moment of the timeline: the note as it was then, read only, its changes then waiting left out.
      const then = await Isorite.get<{ text: string }>(`/api/version${q}&entry=${encodeURIComponent(at.key)}`);
      const upTo = entries.filter((e) => e.id <= at.key);
      return { ...common, text: then.text, at: { said: at.said, ago: at.ago }, items: noteView(then.text, upTo).filter((i) => i.type === "block") };
    };
    const [note] = createResource(() => (shownNote() ? { id: shownNote(), v: noteVersion(), at: moment() } : null), ({ id, at }) => loadNote(id, at));
    const blockCount = () => note()?.items.filter((i) => i.type === "block").length ?? 0;
    const moveCursor = (by: number) => {
      const next = Math.max(0, Math.min(blockCount() - 1, cursor() + by));
      setCursor(next);
      scroll?.scrollChildIntoView(`block-${next}`);
    };
    const askHere = async () => {
      const shown = note(), id = shownNote();
      if (!shown || shown.at) return;
      const all = blocks(shown.text), k = Math.min(cursor(), all.length - 1);
      const asked = await ctx.ui.dialog.prompt({ title: "Ask Iso here", description: k >= 0 ? `after “${all[k]!.text.split("\n")[0]!.slice(0, 60)}”` : "at the top", placeholder: "what you want written here" });
      if (!asked?.trim()) return;
      await Isorite.post("/api/iso/ask", { note: id, form: "insert", after: k >= 0 ? anchorOf(all, k) : null, before: k + 1 < all.length ? anchorOf(all, k + 1) : null, asked: asked.trim(), tier: "mid" })
        .catch((e: Error) => ctx.ui.toast?.show?.({ message: e.message, variant: "error" }));
    };
    const showTimeline = async () => {
      const shown = note();
      if (!shown) return;
      const all = moments(shown.entries).reverse();
      const key = await ctx.ui.dialog.select({ title: "The note's timeline", options: all.map((m) => ({ title: describe(m), value: momentKey(m), description: ago(m.at) })) });
      const chosen = all.find((m) => momentKey(m) === key);
      if (chosen) setMoment({ key: momentKey(chosen), said: describe(chosen), ago: ago(chosen.at) });
    };
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
      render: () => <NotePage note={note} current={() => (note()?.at ? "" : (chosen()?.key ?? ""))} cursor={cursor} asking={asking} ground={ground} base={baseName()} scroll={(s) => { scroll = s; }} />,
    });
    const [baseName, setBaseName] = createSignal("");
    void Isorite.get<Isorite.Session>("/api/session").then((s) => setBaseName(s.name), () => undefined);

    // ------------------------------------------------------------ one note's Atlas (Terminal-Atlas), in the session's panel
    /** The note the agent is reading now, by session, while its turn goes on. */
    const reading = new Map<string, string>();
    const [atlasNote, setAtlasNote] = createSignal("");
    const [mapVersion, bumpMap] = createSignal(0);
    const [map] = createResource(mapVersion, () => Isorite.get<{ model: MapModel }>("/api/map").then((m) => m.model, () => null));
    const openAtlas = (id: string) => {
      setAtlasNote(id);
      ctx.ui.panel.open(ATLAS, { presentation: "panel" });
      // The chat keeps the keys; the panel takes them when it is focused (click it, or leader and →).
      setTimeout(() => ctx.keymap.dispatch("pane.focus.left"), 0);
    };
    ctx.ui.slot({
      append: "session.panel",
      render: (input) => {
        const routes = () => (ctx.themeMode === "light" ? routeColours.quartz : routeColours.lapis);
        const colour = (role: Role) => (role === "req" ? routes().req : role === "bld" ? routes().bld : role === "gold" ? ground().growth : role === "ls" ? ground().ls : role === "faint" ? ground().faint : ground().text);
        const title = (id: string) => (titles().get(id) ?? id.split("/").at(-1)!).toLowerCase();
        const play = () => (heard(), plays.get(input.sessionID));
        const now = () => (heard(), reading.get(input.sessionID));
        // The note shown: the one chosen, else the one the agent read last, else the first in play.
        const focal = () => atlasNote() || now() || play()?.rows(title)[0]?.id || "";
        const near = () => {
          const model = map(), id = focal();
          if (!model || !id) return null;
          const r = reach(model, id), direct = r.requires.filter((n) => r.depth[n] === 1);
          return { direct, further: r.requires.length - direct.length, builds: r.builds.filter((n) => !isStudyId(n)) };
        };
        const grid = () => {
          const n = near(), id = focal();
          if (!n) return [];
          const box = (b: string) => ({ id: b, title: title(b), ...(b === now() ? { gold: true } : {}) });
          return drawAtlas(box(id), n.direct.map(box), n.builds.map(box), Math.max(46, input.width - 6));
        };
        ctx.keymap.layer(() => ({
          enabled: () => input.focused && input.name === ATLAS,
          commands: [
            { id: "isorite.atlas.next", title: "Next note in play", bind: "a", run: () => { const ids = play()?.rows(title).map((r) => r.id) ?? []; if (ids.length) setAtlasNote(ids[(ids.indexOf(focal()) + 1) % ids.length]!); } },
            { id: "isorite.atlas.open", title: "Open the note", bind: "n", run: () => { if (focal()) openNote(focal()); } },
            { id: "isorite.atlas.send", title: "Send the note to the agent", bind: "s", run: () => void sendToAgent(focal()) },
            { id: "isorite.atlas.browser", title: "The whole map in the browser", bind: "b", run: () => openInBrowser(`${Isorite.url}/#/atlas`) },
            { id: "isorite.atlas.close", title: "Close the atlas", bind: "escape", run: () => input.close() },
          ],
        }));
        return (
          <Show when={input.name === ATLAS}>
            <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={1} paddingTop={1} border={["left"]} borderColor={ground().line} backgroundColor={ground().g0}>
              <Show when={focal()} fallback={<text fg={ground().faint} wrapMode="word">No note yet: ask the agent about your notes, or name one with /atlas &lt;words&gt;.</text>}>
                <box flexDirection="row">
                  <text fg={ground().faint} wrapMode="none">{"atlas · "}</text>
                  <text fg={ground().text} wrapMode="none" flexShrink={1} minWidth={0}>{title(focal())}</text>
                  <box flexGrow={1} />
                  <text fg={ground().faint} wrapMode="none">{"[a] next note in play"}</text>
                </box>
                <text> </text>
                <Show when={near()}>
                  {(n) => (
                    <>
                      <text wrapMode="none">
                        <span style={{ fg: routes().req }}>{n().direct.length ? "it requires" : "it requires nothing"}</span>
                        <span>{" ".repeat(Math.max(1, (grid()[0]?.length ?? 60) - 12 - (n().direct.length ? 11 : 19)))}</span>
                        <span style={{ fg: routes().bld }}>{n().builds.length ? "builds on it" : ""}</span>
                      </text>
                      <For each={grid()}>
                        {(row) => <text wrapMode="none"><For each={runsOf(row)}>{(r) => <span style={{ fg: colour(r.role), ...(r.bold ? { attributes: 1 } : {}) }}>{r.text}</span>}</For></text>}
                      </For>
                      <text> </text>
                      <box flexDirection="row">
                        <text fg={ground().faint} wrapMode="none">{n().further ? `${n().further} more ${n().further === 1 ? "is" : "are"} required further back` : ""}</text>
                        <box flexGrow={1} />
                        <text fg={ground().faint} wrapMode="none">{"[b] the whole map in the browser"}</text>
                      </box>
                    </>
                  )}
                </Show>
                <Show when={now()}>{(id) => <text wrapMode="word"><span style={{ fg: ground().growth }}>{"◆ "}</span><span style={{ fg: ground().soft }}>{"OpenCode is reading "}</span><span style={{ fg: ground().growth }}>{title(id())}</span></text>}</Show>
                <Show when={input.focused}><text fg={ground().faint}>{"[n] open the note   [s] send to agent   esc closes"}</text></Show>
              </Show>
            </box>
          </Show>
        );
      },
    });

    // ------------------------------------------------------------ the status line, and sending from the terminal
    /** How many browser pages have isorite open: the Atlas follows the agent only where one does. */
    const [browsers, setBrowsers] = createSignal(0);
    ctx.ui.slot({
      append: "prompt.footer.status",
      render: () => (
        <text wrapMode="none">
          <span style={{ fg: ground().faint }}>{baseName()}</span>
          <Show when={browsers() > 0}><span style={{ fg: ground().growth }}>{"  ◆ "}</span><span style={{ fg: ground().faint }}>{"atlas following"}</span></Show>
        </text>
      ),
    });
    /** [s]: a note, or a passage of it, sent to the agent from the terminal, as from the browser: under "from you". */
    const sendToAgent = async (note: string, passage?: string) => {
      if (!note) return;
      const said = await ctx.ui.dialog.prompt({ title: "Send to the agent", description: passage ? "the passage the cursor is on" : `the note “${(titles().get(note) ?? note).toLowerCase()}”`, placeholder: "what you want of it (optional)" });
      if (said === undefined) return;
      await Isorite.post("/api/agent/send", { note, ...(passage ? { passage } : {}), said: said.trim() })
        .catch((e: Error) => ctx.ui.toast?.show?.({ message: e.message, variant: "error" }));
    };

    const stop = new AbortController();
    Isorite.listen((type, data) => {
      if (type === "note-changed") void listTitles();
      if (type === "watchers") setBrowsers(Number(data.browsers) || 0);
      if ((type === "journal" || type === "note-changed") && data.id === shownNote()) bumpNote((n) => n + 1);
      if (type.startsWith("iso-") && data.note === shownNote()) {
        setAsking(type === "iso-start" || type === "iso-step" || type === "iso-text");
        if (type === "iso-failed") ctx.ui.toast?.show?.({ message: `Iso could not answer: ${String(data.message)}`, variant: "error" });
      }
      if (type === "agent-sent") {
        waiting.push({ id: String(data.id), note: String(data.note), title: String(data.title), said: String(data.said ?? ""), text: String(data.text) });
        const sessionID = onScreen();
        if (sessionID) void deliver(sessionID);
        return;
      }
      if (type === "agent-done" && typeof data.session === "string") { reading.delete(data.session); hear((n) => n + 1); }
      if (type === "note-changed") bumpMap((n) => n + 1);
      if (type !== "agent-step" || data.agent !== Isorite.AGENT || typeof data.session !== "string") return;
      const play = plays.get(data.session) ?? new Play();
      plays.set(data.session, play);
      play.add(data.step as Step);
      const step = data.step as Step;
      if (step.opened && !step.failed) reading.set(data.session, step.opened);
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
        // The base mode, not global: a dialog opened from the note (asking Iso, the timeline) takes the keys typed in it.
        ctx.keymap.layer(() => ({
          enabled: onNote,
          commands: [
            { id: "isorite.note.next", title: "Next change", bind: "n", run: () => { const all = changes(), k = all.findIndex((c) => c.key === chosen()?.key); if (all.length) setCurrent(all[(k + 1) % all.length]!.key); } },
            { id: "isorite.note.keep", title: "Keep the change", bind: "k", run: () => { if (!moment()) void settle("keep"); } },
            { id: "isorite.note.edit", title: "Edit the change, then keep it", bind: "e", run: () => { if (!moment()) void edit(); } },
            { id: "isorite.note.remove", title: "Remove the change", bind: "r", run: () => { if (!moment()) void settle("discard"); } },
            { id: "isorite.note.send", title: "Send the paragraph to the agent", bind: "s", run: () => { const shown = note(); if (shown && !shown.at) { const b = blocks(shown.text)[cursor()]; void sendToAgent(shown.id, b?.text); } } },
            { id: "isorite.note.atlas", title: "Its atlas", bind: "a", run: () => { const id = shownNote(); ctx.ui.router.navigate(back); if (back.type === "session") setTimeout(() => openAtlas(id), 0); else setAtlasNote(id); } },
            { id: "isorite.note.browser", title: "The note in the browser", bind: "b", run: () => openInBrowser(`${Isorite.url}/#/n/${shownNote()}`) },
            { id: "isorite.note.back", title: "Back", bind: "q", run: () => (moment() ? setMoment(null) : ctx.ui.router.navigate(back)) },
            { id: "isorite.note.escape", title: "Back", bind: "escape", run: () => (moment() ? setMoment(null) : ctx.ui.router.navigate(back)) },
            { id: "isorite.note.down", title: "Next block", bind: "down", run: () => moveCursor(1) },
            { id: "isorite.note.up", title: "Block before", bind: "up", run: () => moveCursor(-1) },
            { id: "isorite.note.ask", title: "Ask Iso here", bind: "/", run: () => void askHere() },
            { id: "isorite.note.timeline", title: "The note's timeline", bind: "t", run: () => void showTimeline() },
            { id: "isorite.note.pagedown", title: "Page down", bind: "pagedown", run: () => scroll?.scrollBy(0.8 * (scroll?.height ?? 20)) },
            { id: "isorite.note.pageup", title: "Page up", bind: "pageup", run: () => scroll?.scrollBy(-0.8 * (scroll?.height ?? 20)) },
          ],
        }));
        ctx.keymap.layer(() => ({
          mode: "global",
          commands: [{
            id: "isorite.atlas.show", title: "One note's atlas, beside the chat", palette: true, slash: { name: "atlas", arguments: true },
            run: async (input) => {
              const words = input?.trim();
              const id = words ? (await Isorite.get<{ id: string }[]>(`/api/search?q=${encodeURIComponent(words)}`).catch(() => []))[0]?.id : "";
              if (words && !id) { ctx.ui.toast?.show?.({ message: `no note matches “${words}”`, variant: "warning" }); return; }
              openAtlas(id ?? "");
            },
          }, {
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
        // On OpenCode's home, isorite's name where its own is.
        createEffect(() => {
          if (ctx.ui.router.current().type !== "home") return;
          const timer = setInterval(swapLogo, 200);
          swapLogo();
          onCleanup(() => clearInterval(timer));
        });
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

    // OpenCode's home draws its name in its own letters, and no slot reaches it: its box is found among the renderables
    // by the rows it draws, hidden, and isorite's wordmark drawn beside it. Should OpenCode draw it otherwise, nothing
    // is found, and its own stays.
    const OPEN = ["█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀▀▀▀"];
    const textOf = (r: Renderable): string => (r instanceof TextRenderable ? r.plainText : r.getChildren().map((c) => textOf(c as Renderable)).join(""));
    const findLogo = (r: Renderable): Renderable | undefined => {
      for (const child of r.getChildren() as Renderable[]) {
        const found = findLogo(child);
        if (found) return found;
      }
      const text = textOf(r);
      return !(r instanceof TextRenderable) && OPEN.every((row) => text.includes(row)) ? r : undefined;
    };
    const mix = (a: string, b: string, t: number) => {
      const [x, y] = [RGBA.fromHex(a), RGBA.fromHex(b)];
      return RGBA.fromValues(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t, 1);
    };
    // The wordmark as the browser draws it, where the home has room for it; else the name in OpenCode's letters.
    const roomy = () => ctx.renderer.width >= 72 && ctx.renderer.height >= 28;
    const wordmark = () => {
      const g = ground();
      const mark = new BoxRenderable(ctx.renderer, { id: "isorite-wordmark", flexDirection: "column", alignItems: "center" });
      const chunk = (text: string, ink: string, more: Partial<TextChunk> = {}): TextChunk => ({ __isChunk: true, text, fg: RGBA.fromHex(ink), ...more });
      if (roomy()) {
        const colour = { ink: g.text, iso: g.growth, right: g.mal };
        for (const row of Wordmark.rows()) mark.add(new TextRenderable(ctx.renderer, { content: new StyledText(row.map((run) => chunk(run.text, colour[run.role]))), selectable: false }));
        return mark;
      }
      // As OpenCode's: the first half muted, the second bold, each letter on a shade a quarter of its colour.
      const half = (row: string, ink: string, bold: boolean): TextChunk[] => Wordmark.runs(row).map((run) =>
        chunk(run.text, ink, { ...(run.shaded ? { bg: mix(g.g0, ink, 0.25) } : {}), ...(bold ? { attributes: TextAttributes.BOLD } : {}) }));
      Wordmark.left.forEach((row, k) => mark.add(new TextRenderable(ctx.renderer, {
        content: new StyledText([...half(row, g.faint, false), { __isChunk: true, text: " " }, ...half(Wordmark.right[k]!, g.text, true)]), selectable: false,
      })));
      return mark;
    };
    let drawnFor = "";
    const swapLogo = () => {
      const logo = findLogo(ctx.renderer.root);
      const parent = logo?.parent;
      if (!logo || !parent) return;
      logo.visible = false;
      const mine = parent.getChildren().find((c) => c.id === "isorite-wordmark");
      const drawing = `${ctx.themeMode} ${roomy()}`;
      if (mine && drawnFor === drawing) return;
      if (mine) { parent.remove(mine); mine.destroy(); }
      parent.add(wordmark());
      drawnFor = drawing;
    };

    // The splash is shown once, when the TUI starts.
    setTimeout(() => ctx.ui.router.navigate({ type: "plugin", name: SPLASH, data: {} }), 0);
    return () => stop.abort();
  },
});
