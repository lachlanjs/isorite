# Milestone 6: the terminal, on OpenCode 2 (scope)

Written 2026-10-18 as a scope, at Lachlan's asking, and revised the same day after reading OpenCode 2's source. Step 0, the spike, was run the same day in a Claude Code cloud session: its findings are §8, and the plan proper, **for approval**, is §9. Branch: `m6-terminal`.

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

**Confirmed or answered in step 0:** see §8.

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

Answered later the same day, in the cloud session:

| # | Question | Answer |
|---|---|---|
| 5 | Git in a cloud session | The "never push" rule is for Lachlan's own machine. In the cloud, push the milestone branch. `m6-terminal` is the branch. |
| 6 | Tool results as Markdown | Lachlan understood they work. **They do not in 2.0.32** (§8): the plan works round it. |
| 7 | The boards | Follow the mood board's six `Terminal-*` boards. |
| 8 | Models | Use OpenCode's free models where they serve. Otherwise ask for a key, or use scripted replies. The setup must also take a local corporate gateway. |
| 9 | Installs | Ask before each `npm install` of something new. |

**For a cloud session:** start from this file, `architecture.md` §the terminal, the six `Terminal-*` boards in the design artifact, and OpenCode's `packages/plugin/src/tui/context.ts`. rdstudio's MCP server is not in the repository: its tools are listed in §4, and the server is carried over from `~/rdstudio` only where that folder exists.

## 8. What the spike found (2026-10-18)

Run in the cloud container with OpenCode 2.0.32 (`@opencode/cli`; `opencode-ai` on npm is still 1.19.3) installed in `~/oc2`, against OpenCode's source at `4745089`. The throwaway plugins, theme, config and scripted endpoint are in `bench/m6-spike/`. The TUI was driven in tmux and read back from the pane, colours included.

**Worked as hoped**

| What | How | Seen |
|---|---|---|
| Loading | A folder `.opencode/plugins/<name>/` with `server.ts` and `tui.tsx`, found by OpenCode in the project. Solid JSX through OpenTUI; `effect` and `@opencode/plugin` are provided by the host. | Both halves load. |
| Tools | `ctx.tool.transform` adds them with an Effect `Schema` for input and output. | Offered to the model in every request. |
| Edits to notes wait | `ctx.tool.hook("execute.before")` may rename the call: a `write` or `edit` inside `notes/` becomes `isorite_propose`. | The file was unchanged; the agent was told its edit waits to be kept. |
| A gateway | `opencode.json` → `providers.gateway`: `package: "@ai-sdk/openai-compatible"`, `settings.baseURL`, `env: ["ISORITE_GATEWAY_KEY"]`, `models`. | The key arrived as `Bearer`. OpenCode fetched the AI SDK package from npm at run time. |
| The sidebar | `ui.slot({ append: "sidebar.content" })` | "notes in play" in a rounded box, beside the session. |
| The status line | `ui.slot({ append: "prompt.footer.status" })` | "◆ atlas following" beside OpenCode's own. |
| The side panel | `ui.slot({ append: "session.panel" })` and `ui.panel.open`; the panel is told its width. | Drawn beside the chat at 90 columns of 180. |
| A full screen | `ui.router.register` and `navigate({ type: "plugin" })` | The note page replaces the session. |
| The splash | The same, navigated to once at start. | Shown before the home screen. No need to replace the `app` slot. |
| Commands | `keymap.layer` with `mode: "global"`, created inside a component (an `app` slot that draws nothing), as OpenCode's own `/btw` is. Created directly in `setup` the commands do not appear. | `/note` and `/atlas` in the slash list and palette. |
| The `isorite` code block | `markdown.registerCodeBlockRenderer("isorite", …)` returning an OpenTUI `TextRenderable` | Drawn as a tree **when the block is in the agent's answer**. |
| The theme | `.opencode/themes/isorite.json`, dark = lapis, light = quartz, from `isorite.css`. Chosen in `cli.json`. | Background `#07101C`, text `#E9EEF5`, faint `#8796AD` in a truecolour terminal. |

**Not as hoped**

1. **A tool's result is not drawn as Markdown.** 2.0.32 has drawers for its own tools only. Any other tool is one line, `✓ isorite_search [query=mixing]`, which opens to plain text when clicked. There is no way to register a drawer for a tool. So the tree of notes found (`Terminal-Chat`) cannot be a tool result. The code-block renderer does work on the agent's own text.
2. **A renamed write still shows as a write.** The transcript draws the original call: "Wrote notes/the-dmft-loop.md" with the new text, though nothing was written. That misleads.
3. **The TUI's settings are global only.** Theme, keybinds and TUI plugins are read from `~/.config/opencode/cli.json`. The launcher must give OpenCode a config home of its own (`XDG_CONFIG_HOME`), which the plan meant to do anyway.
4. **The free models are unreliable from here.** Signed out, OpenCode offers 12 free models. From this container `opencode/big-pickle` answered about half the time and otherwise refused with "OpenCode's free tier can only be used from within OpenCode". `deepseek-v4.1-flash-free` and `glm-5.3-flash-free` refused every time. The refusal is the server's. It was seen through `opencode run`; the TUI was only run against the scripted gateway. It may be the container's address. Not tried from Lachlan's machine.
5. **A focused panel takes the keys.** After `/atlas`, typing went to the panel and not the prompt. The panel needs its own keys, `esc` among them, to hand focus back.
6. **Markdown eats `[1]`.** A bare `[1]` in the answer is drawn as `1`.

**Each board element**

| Board | Element | Verdict |
|---|---|---|
| `Terminal-Splash` | the logo, the base line, the keys | plugin |
| `Terminal` | Iso's path as labelled steps | plugin with a workaround: tools named for the steps (`search`, `meaning`, `open`, `follow`), drawn by OpenCode as one line each. `read` and `edit` are OpenCode's own. |
| | notes in play, from you | plugin (sidebar) |
| | mode, base, atlas following, cost, `[s]` | plugin (status slot); cost and mode are OpenCode's |
| `Terminal-Chat` | the tree of notes found, with how each was found and whether used | plugin with a workaround: the tree is kept in the sidebar under "notes in play", which grows to the board's tree; and at the end of a turn the plugin draws it in `session.composer.top`, above the prompt |
| | the citation `[1] the dmft loop § mixing` | plugin with a workaround: the agent is told to end with an `isorite` sources block, which the renderer draws. How the number appears in the text, since `[1]` is eaten, is settled in step 3. |
| | a code diff with `[y] [n] [d]` | OpenCode |
| | `[o] open the note it rests on` | plugin: a command, live while a permission is asked |
| `Terminal-Chat-Tools` | web, subagents, run, permission | OpenCode |
| | `[k] draft a note from this` | plugin: a command, through the isorite server to Iso |
| `Terminal-Note` | the gutter, the marks, maths as source, a proposal with `[k] [e] [r]`, code, `[b]`, the squares, the status keys | plugin (a full-screen page); all drawn by isorite |
| `Terminal-Atlas` | one note's Atlas beside the chat, "Iso is reading", `[a] [b]` | plugin (the panel), with its own keys |

**Outcome:** a plugin plus a launcher. Nothing needs a fork of OpenCode. Pi stays the fallback that `decisions.md` names.

## 9. The plan proper, for approval

**The shape** is §4's, changed by §8:
- `@isorite/opencode` is one OpenCode plugin folder, `server.ts` and `tui.tsx`. `isorite term` copies or links it into a config home of isorite's own, beside `opencode.json`, `cli.json` and the theme. Your own OpenCode config is never read or written.
- The plugin talks to the isorite server over HTTP with the session token. It does not import the engine.
- **Models.** `isorite term` writes an `opencode.json` with two providers:
  - OpenCode's free models, as they come, the default;
  - `gateway`: OpenAI-compatible, from `ISORITE_GATEWAY_URL`, key from `ISORITE_GATEWAY_KEY`, models from `ISORITE_GATEWAY_MODELS`. Set them and the gateway is the default. A corporate gateway is this entry, and so is OpenRouter (`https://openrouter.ai/api/v1`).
- **Tests** run against `scripted.mjs` grown into a fixture, as the gateway, so they need no network and no key. They drive the TUI in tmux and read the pane, as the spike did.
- **Edits to notes.** The renamed write misleads (§8, 2), so it is the safety net only. First, `ctx.session.hook("context")` tells the agent that files in the base are notes, and that a change to one is made with `propose`, which waits to be kept. If it still writes to a note, the hook turns the call into a proposal, and the result says so.

**Steps**
1. **The package and the launcher.** `packages/opencode`: the plugin's two halves, the theme, `isorite term [base]` (starts the server if it is not running; writes the config home; starts OpenCode in it). The scripted gateway as a test fixture, and the tmux test harness.
2. **Tools and the path.** `brief`, `search`, `meaning`, `outline`, `open`, `follow`, `links`, `record`, `propose`, over the isorite server. Each call sends an `agent-step` event; the Atlas in the browser draws the agent's path as it draws Iso's. The MCP server over the same tools, for Claude Code and Pi.
3. **Edits wait to be kept; notes in play; from you.** The context hook and the safety net, proposals from `agent:opencode` kept or removed in the browser. The sidebar's notes in play, grown to the tree of notes found, and the same tree above the prompt at a turn's end; the sources block and its citations. "From you": the browser's `[ send to agent ]` reaching the session through OpenCode's server. How a prompt is put into a running session from outside is still to be read from `@opencode/client`.
4. **The note view.** `/note` and `[o]`: the gutter and marks, a proposal's `[k] [e] [r]`, `[/] ask in place`, `[t] the timeline`, `[b]`.
5. **The one-note Atlas.** The core's layout for one note drawn in cells in the panel, with its own keys and `esc`.
6. **The splash and status line**, and `[s] send to agent` from the terminal side.
7. **Screenshots beside the six boards** (rendered from the tmux panes), then the write-up. A run on a real model: the free models if they serve, else the gateway with a key you give.

**Done when** is §6's, with "through MCP" checked by a script against the MCP server, since Claude Code is not run here.

**For you to settle**
1. The tree of notes found in the sidebar and above the prompt, not inline in the chat as `Terminal-Chat` draws it. Inline is possible only if the agent copies a block into its answer, which a model may not do.
2. A real-model run: whether to ask you for an OpenRouter key, or a gateway, if the free models keep refusing.
3. Installs this needs, each asked before: OpenCode 2.0.32 in `~/oc2` (done, with your yes), and for the package's own tests `@opencode/plugin@2.0.32` and `@opentui/core@0.5.17` as dev dependencies, for types.
