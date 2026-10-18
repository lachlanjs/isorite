/** @jsxImportSource @opentui/solid */
// isorite's TUI half: the views OpenCode does not have. The splash (`Terminal-Splash`), and in the sidebar the
// notes in play: what the agent found in the knowledge base and how far each got (`Terminal`, `Terminal-Chat`).

import { spawn } from "node:child_process";
import { Plugin } from "@opencode/plugin/tui";
import { createResource, createSignal, For, Show } from "solid-js";
import * as Isorite from "./isorite.ts";
import * as Logo from "./logo.ts";
import { lapis, quartz } from "./palette.ts";
import { Play, type Step } from "./play.ts";

const SPLASH = "isorite-splash";

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
    const stop = new AbortController();
    Isorite.listen((type, data) => {
      if (type === "note-changed") void listTitles();
      if (type !== "agent-step" || data.agent !== Isorite.AGENT || typeof data.session !== "string") return;
      const play = plays.get(data.session) ?? new Play();
      plays.set(data.session, play);
      play.add(data.step as Step);
      hear((n) => n + 1);
    }, stop.signal);

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
        return (
          <Show when={rows().length > 0}>
            <box border borderStyle="rounded" borderColor={ground().ls} title=" notes in play " paddingLeft={1} paddingRight={1} flexDirection="column">
              <text fg={ground().faint} wrapMode="none">{summary()}</text>
              <For each={rows()}>
                {(row) => (
                  <box flexDirection="row" minWidth={0}>
                    <text fg={ground().line} wrapMode="none" flexShrink={0}>{row.prefix}</text>
                    <text fg={ground().text} wrapMode="word" flexShrink={1} minWidth={0}>{row.label}</text>
                    <box flexGrow={1} minWidth={1} />
                    <text fg={state(row)} wrapMode="none" flexShrink={0}>{row.state === "used" ? "◆ used" : row.state}</text>
                  </box>
                )}
              </For>
            </box>
          </Show>
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
