# Milestone 6: the terminal, on OpenCode 2 (scope)

Written 2026-10-18 as a scope, at Lachlan's asking, and revised the same day after reading OpenCode 2's source. It is not yet a plan to approve. Step 0 below is a short spike, and the plan proper is written from what the spike finds. Branch, when it opens: `m6-terminal`.

## 1. What the terminal is for

From `ISORITE_DOC.md` §TUI and `decisions.md`:
- The terminal is for work that needs more than the knowledge base: editing code, running commands, using other tools. isorite does not build a coding agent. It brings the knowledge base into one, and shows that agent's use of the base live in the browser.
- **In the terminal:** the note view, a one-note Atlas, and the notes in play. **Kept in the browser:** the full Atlas, study, and long writing (`decisions.md`, "the terminal").
- A terminal agent's edits to notes wait to be kept, in the same journal as Iso's (`who: agent:<name>`). Its edits to code use the harness's own accept and reject (`decisions.md`, "my call").
- Knowledge you highlight in the browser goes straight to the agent's session ("from you").
- Key hints are shown in the terminal only.

## 2. The boards, and what each needs

| Board | What it shows | Who provides it |
|---|---|---|
| `Terminal-Splash` | The logo in full blocks and corner halves, "dmft-notes · 39 notes · study base found", `[enter] open  [a] atlas in the browser  [?] keys  [q] quit` | isorite: a TUI plugin's start screen |
| `Terminal` | A session. Iso's path as labelled steps (`search`, `meaning`, `open`, `follow`, `read`), its answer, edits and test runs. On the right, "notes in play" (used and not used) and "from you" (a note sent from the browser, with what you said). Status line: mode, base, "atlas following", session cost, `[s] send to agent`. | Steps, edits, tests and cost: **OpenCode**. The note steps' labels, notes in play, from you, atlas following: **isorite** |
| `Terminal-Chat` | Notes found, shown as a tree: what was found by keyword or by meaning (with its score), what was reached by following links (`requires ›`, `see also ›`), and whether each was used, read or not opened. A citation `[1] the dmft loop § mixing`. A code diff with `[y] accept  [n] reject  [d] whole diff  [o] open the note it rests on`. Status: `build  plan  opus  38% of context`, `[tab] mode`. | The diff, accept and reject, modes, model and context: **OpenCode**. The tree of notes, the citation and `[o]`: **isorite** |
| `Terminal-Chat-Tools` | Web search with results; "draft a note from this" (`[k]`); two subagents with progress; a command run with its output; a permission prompt `[y] once  [a] always for this session  [n] no` | Web, subagents, run and permission: **OpenCode** (2.0 has background subagents and shell). "Draft a note from this": **isorite** (a note for Iso, through the engine) |
| `Terminal-Note` | A note in the terminal. A gutter with marks by paragraph (your square, Iso's diamond); maths as source; Iso's proposal between dotted rules with `[k] keep  [e] edit  [r] remove`; a code block; a figure that offers `[b] see it in the browser`; the squares at the top right. Status: `[t] timeline  [/] ask in place  [a] its atlas  [b] browser  [q] back` | isorite: a full-screen TUI view over the engine's Api |
| `Terminal-Atlas` | The chat beside one note's Atlas: "it requires" on the left, "builds on it" on the right, drawn in box characters with routes; "Iso is reading weiss field"; `[a] next note in play`, `[b] the whole map in the browser` | isorite: a side panel drawn from the core's layout (`architecture.md` §the terminal: no layout of its own) |

So OpenCode already provides the coding agent: tools, diffs, permissions, subagents, web, modes, models and context. isorite adds five things:
1. the knowledge base as tools;
2. notes in play and from you;
3. the note view;
4. the one-note Atlas;
5. the browser following the agent.

## 3. What OpenCode 2 offers (read from its source, 2026-10-18)

From the 2.0 announcement, and from OpenCode's own source (`anomalyco/opencode` at `8f7b012`, 2026-10-17), mainly `packages/plugin/src/tui/context.ts` and `packages/plugin/src/promise/`:

**The setup**
- **One local server for every window.** The TUI, the web interface and the desktop app all connect to it, and `@opencode/client` reaches it from outside. The isorite server can therefore talk to a running session, so "send to agent" from the browser can reach the terminal.
- **Plugins.** Each is a JS or TS module with `define({ id, setup(ctx) })`, run in Bun and hot-reloaded. There are two kinds: server plugins (`@opencode/plugin`) and TUI plugins (`@opencode/plugin/tui`), with Solid components drawn by OpenTUI. Plugins written for 1.0 do not run on 2.0.

**What a TUI plugin can do, against the boards**

| Need | API | Covers |
|---|---|---|
| A whole screen of isorite's own | `ui.router.register({ name, render })` and `ui.router.navigate({ type: "plugin", name, data })` | The note view (`Terminal-Note`), and the splash if `home` cannot be replaced |
| A panel beside the chat | the `session.panel` slot with `ui.panel.open(name, { presentation: "panel" or "fullscreen" })`; the panel is told its width and whether it has focus | The one-note Atlas (`Terminal-Atlas`) |
| The sidebar | the `sidebar.content` and `sidebar.footer` slots | Notes in play, and from you (`Terminal`) |
| The status line | the `prompt.footer.status` and `home.footer.status` slots | "atlas following", the base's name, the key hints |
| Above the prompt | the `session.composer.top` slot | `[y] accept` style choices for a note's proposal |
| Replacing the start screen | the `app` slot (`replace`, `prepend` or `append`) | The splash (`Terminal-Splash`) |
| Keys | `keymap.layer({ commands: [{ id, bind, run, slash, palette }] })`, with modes that can be pushed | `[t]`, `[/]`, `[a]`, `[b]`, `[k]`, `[e]`, `[r]`, and `/note`, `/atlas` |
| Drawing inside answers | `markdown.registerCodeBlockRenderer(language, render)` | The tree of notes found, and the citations (`Terminal-Chat`): a tool returns a fenced block in an `isorite` language and the plugin draws it |
| Dialogs and notices | `ui.dialog.select`, `confirm` and `prompt`; `ui.toast` | Choosing a note; "draft a note from this" |
| State | `storage.store` (on disk, synced across windows) and `storage.memory` | What is in play, and what was sent from you |
| Session data | `data.on(event)`, and `data.session.message`, `cost` and `status` | Following the agent's tool calls, and the session's cost |
| The theme | `ctx.theme`, plus theme files (`packages/theme`) | Lapis and quartz |

**What a server plugin can do**
- `ctx.tool.transform`: add tools (`name`, `description`, Effect `Schema` for input and output, `execute`), or change and remove existing ones.
- `ctx.tool.hook("execute.before")` and `("execute.after")`: see every tool call, change its input, or stop it. This is how an edit to a note becomes a proposal that waits to be kept.
- `ctx.permission.hook("evaluate")`: decide whether to allow, ask or deny an action.
- `ctx.session.hook("context")`: change the tools and descriptions a request is sent with. This is how the agent is told about the base.
- `ctx.agent.transform`, `ctx.command.transform` and `ctx.skill.transform`: an isorite agent and commands of its own.
- MCP servers run in "code mode" by default.

**Still to confirm in step 0**
- Whether a tool's result is drawn as Markdown in the transcript, which the code-block renderer needs. If it is not, the tree of notes found goes in the sidebar instead.
- Whether the `app` slot can draw a splash before the home screen.
- How much the boards' look survives OpenTUI: box characters, a half-block logo, two colour grounds.

**Installed here:** OpenCode 1.19.3 (`~/.local/bin/opencode`) and Pi. Bun is not installed. Lachlan has approved installing what M6 needs (2026-10-18). OpenCode 2 and Bun go in a folder of their own, so that 1.19.3 and `~/rdstudio`'s `opencode.json` are untouched.

## 4. The proposed shape

```
browser (Atlas)  ◄── events ──  isorite server (Hono, engine)  ◄── HTTP + token ──  @isorite/opencode
                                       ▲                                              ├ server plugin: tools, hooks
                                       └──────── MCP (for other harnesses) ───────────┤ TUI plugin: views, panels
                                                                                      └ theme: lapis / quartz
```

- **`@isorite/opencode`**, a new package: one OpenCode plugin with a server half and a TUI half. It talks to the isorite server over HTTP with the session token, as the browser does. It does not import the engine, because Bun runs plugins and the engine's Node adapter is the server's.
- **Tools** carried over from rdstudio's MCP server: `brief`, `search`, `meaning`, `outline`, `read`, `links`, `record`. Each call is reported to the server as an `agent-step` event (`architecture.md` §events), so the Atlas draws the agent's path exactly as it draws Iso's.
- **Edits to notes wait to be kept.** `tool.execute.before` catches a write or edit to a file inside the knowledge base, blocks it, and enters it in the note's journal as a proposal from `agent:opencode`. The agent is told it is waiting to be kept. The proposal is then kept or removed in the browser or in the terminal's note view.
- **From you:** in the browser, `[ send to agent ]` on a selection or a note puts it in the session, using OpenCode's server API (`tui.prompt.append`) or as context for the next message.
- **The MCP server** comes in the same milestone, as a thin wrapper round the same tools, so that Claude Code and Pi can use the base too, without isorite's views.
- **The theme:** lapis and quartz as OpenCode themes, using the boards' colours.
- **A launcher**, `isorite term [base]`: starts the server if it is not running, then OpenCode with the plugin and theme, in a config of its own. Your global OpenCode config is not touched.

## 5. Steps

0. **Spike, about a day.** Most of the questions are already answered by section 3.
   - Install OpenCode 2 and Bun in a folder of their own (not `~/.local/bin`), so 1.19.3 and rdstudio's setup are untouched.
   - Read OpenCode 2's TUI plugin source.
   - Build throwaway plugins:
     - a sidebar block;
     - a full-screen view;
     - a side panel;
     - a keybinding;
     - a custom-drawn tool result;
     - a blocked write turned into something else.
   - Write a table: each board element against "plugin", "plugin with a workaround", or "only by forking".
   - **Outcome:** the plan for M6, choosing between a plugin only, a plugin plus a launcher with a custom view, or a fork. Pi stays the fallback that `decisions.md` names.
1. **Tools and the path:**
   - the plugin's tools against the isorite server;
   - `agent-step` events;
   - the Atlas following the agent;
   - the MCP server.
2. **Edits wait to be kept:** the hook, proposals from `agent:opencode`, and keeping one in the browser.
3. **Notes in play and from you:** the sidebar panels, and the browser's `[ send to agent ]`.
4. **The note view:** read, ask in place, keep, edit and remove, and the timeline `[t]`.
5. **The one-note Atlas:** the core's layout drawn in cells beside the chat.
6. **The splash, theme and launcher.**
7. **Screenshots beside the six terminal boards**, then the write-up.

## 6. Done when (draft)

- In a coding session started with `isorite term`, the agent finds notes by keyword and by meaning, follows links, and cites a note.
- The browser's Atlas draws that path live.
- An edit the agent makes to a note waits to be kept.
- A note sent from the browser reaches the session.
- The note view and the one-note Atlas work in the terminal.
- The same tools work from Claude Code through MCP.

## 7. Lachlan's answers (2026-10-18)

| # | Question | Answer |
|---|---|---|
| 1 | Install OpenCode 2 and Bun | Yes: install what is needed. Read the documentation and the codebase first, to see what can be customised. |
| 2 | How far to go | To the level shown in the terminal boards. |
| 3 | Pi | Kept as the fallback. |
| 4 | When | Straight after M5. Lachlan may move to a Claude Code cloud session before asking for it to start. |

Still to settle with the plan proper: which model and provider OpenCode uses for real-model checks, and their budget; and whether an agent's edits to files that are not notes keep OpenCode's own accept and reject (as `decisions.md` says).

**For a cloud session:** start from this file, `architecture.md` §the terminal, the six `Terminal-*` boards in the design artifact, and OpenCode's `packages/plugin/src/tui/context.ts`. rdstudio's MCP server is not in the repository: its tools are listed in §4, and the server is carried over from `~/rdstudio` only where that folder exists.
