# Milestone 6: the terminal, on OpenCode 2 (scope)

Written 2026-10-18 as a scope, at Lachlan's asking, and revised the same day after reading OpenCode 2's source. Step 0, the spike, was run the same day in a Claude Code cloud session: its findings are §8, and the plan proper, approved the same day, is §9. Branch: `m6-terminal`.

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

## 9. The plan proper, approved

Approved by Lachlan on 2026-10-18 with these answers:

| # | On | Answer |
|---|---|---|
| 1 | The tree of notes found in the sidebar and above the prompt | Fine, and better. Do not put a thing inline where a component of its own suits it better. |
| 2 | Edits that wait to be kept | Only edits to the knowledge base, which a person must check. Edits to code, or anything else, go through as OpenCode does them. |
| 3 | The TUI's settings in a config home of isorite's own | Fine. |
| 4 | Real models | Script wherever possible. If a real model is needed, Lachlan gives a key. |
| 5 | Installs | Ask for each; Lachlan approves. |
| 6 | The splash | Carries the isorite logo as `Terminal-Splash` draws it. |

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
   **Built** (2026-10-18):
   - `isorite term [<base>] [--port <n>]` (`packages/server/src/term.ts`). OpenCode opens in the folder you are in, your code; the base is reached through the isorite server. If none answers on the port, `isorite serve` is started as a child with its output in `$TMPDIR/isorite-term-<port>.log`, so that it does not draw over the TUI, and stopped when OpenCode exits. A server already answering for another base is refused, not shared. OpenCode runs `--standalone`, so it does not join a background service that has your own config.
   - OpenCode 2 is found as `ISORITE_OPENCODE`, else `opencode2`, else `opencode`, by its version: Lachlan's `opencode` is 1.19.3, and is passed over with a message saying so.
   - The config home, `~/.config/isorite/opencode`, given to OpenCode as `OPENCODE_CONFIG_DIR` (which changes only OpenCode's own config, unlike `XDG_CONFIG_HOME`): `opencode.json` (the gateway, when named), `cli.json` (the theme, `mode: system`), `themes/isorite.json`, and `plugins/isorite`, a link to `packages/opencode/plugin`. Rewritten at each start.
   - The plugin's TUI half draws the splash: the mark (`quadrant`, as decided then; wedges since step 7), `i s o r i t e`, the base's name, note count and study base from the server, and the keys `[enter] [a] [?] [q]`, which work. The server half waits for step 2's tools: OpenCode loads a plugin folder with a TUI half alone.
   - Tests: the mark, the config home and gateway, finding OpenCode; and `term.test.ts` from end to end (the launcher, the server on the example base, OpenCode 2.0.32 in tmux, a scripted gateway): the splash, into OpenCode, a prompt answered with the key sent as `Bearer`, the server stopped on exit. 19 pass in about 5 s; the end-to-end four skip without OpenCode 2 or tmux.
   - **Not as the board:** the splash's status line (the board's says "any key skips"; only the four keys act) is not drawn.
2. **Tools and the path.** `brief`, `search`, `meaning`, `outline`, `open`, `follow`, `links`, `record`, `propose`, over the isorite server. Each call sends an `agent-step` event; the Atlas in the browser draws the agent's path as it draws Iso's. The MCP server over the same tools, for Claude Code and Pi.
   **Built** (2026-10-18):
   - The tools are Iso's own `Lookup`, served: `brief_base` (new: the folders and their note counts, and how to look), `search_notes`, `find_similar` where the device has the model, `outline_note` (which holds the links), `read_note`. The names are Iso's rather than the plan's `search`, `meaning`, `open`, `follow`: one set of tools and descriptions, and OpenCode has a `read` of its own. Kinds of step (by keyword, by meaning, along a link) are told by the step, as for Iso. `record` is left for later.
   - Engine: `agentTools`, `agentLook`, `agentStatus`, and events `agent-start`, `agent-step`, `agent-done`. Server: `GET /api/agent/tools`, `POST /api/agent/look` and `/api/agent/status`, which ask the Origin and token as any write does.
   - The plugin's server half fetches the tools and registers each as a direct tool (outside code mode, so each step is a line of the transcript). **A plugin's event stream carries no session status**, so a turn is begun by the `prompt` hook and ended by `session.wait` after half a second; the end-to-end test ran three times clean.
   - The browser: an agent's turn is drawn as Iso's request is (`app.iso`, now with `agent`), with "OpenCode is reading ‹note› in the terminal" in the status line and no stop button. It does not take the map from Iso while Iso answers. A page opened mid-turn learns of it from the next step.
   - `isorite mcp [<base>] [--port <n>] [--agent <name>]`: the same tools over MCP's stdio transport (JSON-RPC written here, no SDK), for Claude Code or Pi. A turn ends after 30 s without a look-up, or when the harness goes. Not run against Claude Code itself: tested by speaking the protocol to it.
   - Tests: the engine's agent turns and steps; the server's routes and refusals; `isorite mcp` over stdio against the example base; the end-to-end OpenCode test looking up with the tools and the server publishing each step; and in the browser, at both widths on both grounds, the Atlas drawing an agent's turn.

3. **Edits wait to be kept; notes in play; from you.** The context hook and the safety net, proposals from `agent:opencode` kept or removed in the browser. The sidebar's notes in play, grown to the tree of notes found, and the same tree above the prompt at a turn's end; the sources block and its citations. "From you": the browser's `[ send to agent ]` reaching the session through OpenCode's server. How a prompt is put into a running session from outside is still to be read from `@opencode/client`.
   **Built** (2026-10-18), in four parts:
   - **Edits wait to be kept.** Two tools join the look-ups: `propose_note_edit` (a string replaced) and `propose_note_write` (a whole note, or a new one). The plugin adds a part to OpenCode's system prompt saying where the notes are and that they change only by proposing. An `edit` or `write` by OpenCode's own tools to a `.md` file inside the notes folder is made the same proposal (the safety net); edits to code, or to anything else, are OpenCode's own, as Lachlan asked. A change becomes a `rewrite` proposal from `agent:opencode` in the note's journal, with what the person asked (the session's last prompt) and what the agent read: a replacement is its passages; a whole note is diffed by line into the passages that changed. Checked on 500 notes edited at random: keeping every passage gives exactly what was written. A new note waits as a note for review (a draft), its folder chosen when kept. In the browser an agent's change is kept or removed as Iso's are, and names the agent ("OpenCode", with what was asked on pointing; "1 change from OpenCode waiting").
   - **Notes in play.** In OpenCode's sidebar, from the server's events: what the searches found, what was reached along links from them under the note it was reached from (`requires ›`), and how far each got (not opened, looked at, read, used). The engine's steps now carry the query, the scores by meaning and the link's rating. **Not drawn:** the tree above the prompt at a turn's end, which would repeat the sidebar; and how a root was found (`keyword "mixing"`, `meaning 0.81`), which is in the model but does not fit the sidebar's width.
   - **Sources.** The agent cites as `` `[1]` `` (inline code, gold in the isorite theme; a bare `[1]` is taken by Markdown) and ends an answer with an `isorite` block, a line a source; the plugin draws it as `[1] the dmft loop § mixing` and marks those notes used.
   - **From you.** `send to agent` beside a note's `details` and `source` sends the note, or the passage chosen in it, with what you want of it. The server publishes it; the plugin puts it in the session on screen as a synthetic message that waits for the next turn (`resume: false`), shows it under "from you", and says it has it; the browser says "OpenCode has it, in the terminal", or that no terminal agent took it. Nothing is sent while no session is on screen: it waits for one.
   - **Not done:** an agent's edit to an exercise (a note of the study base) is not caught; the transcript shows a safety-net edit as "Edit" without its diff.
4. **The note view.** `/note` and `[o]`: the gutter and marks, a proposal's `[k] [e] [r]`, `[/] ask in place`, `[t] the timeline`, `[b]`.
   **Built** (2026-10-18):
   - `/note <words>` opens the note that best matches (a list to choose from without words); so does choosing a note in the sidebar's notes in play. Drawn as `Terminal-Note`: folder / title, the step and squares; a gutter of who wrote most of each block (your square, an open square for a change made outside isorite, Iso's diamond, an agent's grey diamond: `authors` in the core replays the journal, text kept from a proposal its proposer's), the rail, links underlined, maths as source, code on its own ground, a figure offered in the browser.
   - Waiting changes after their block, between dotted rules (a rewrite's passage struck through), from whom and what was asked: `[n]` the next, `[k]` keep, `[e]` edit then keep, `[r]` remove.
   - ↑ ↓ move a cursor from block to block (the rail turns blue); `[/]` asks Iso for text after it, which arrives as a waiting change while the status line says Iso is writing. `[t]` lists the note's moments, worded as the browser's timeline (now in the core); one chosen shows the note as it was, read only, until `[q]`. `[b]` opens the note in the browser; `[q]` or esc goes back.
   - **Not as the board:** `[o]` from a code diff (OpenCode draws the diff and gives no slot beside it); `[a] its atlas` is step 5. `[e]` edits in a one-line prompt, which suits a sentence better than paragraphs. The board's prompt line at the foot is the dialog `[/]` opens.
   - The note view's keys are in OpenCode's base key mode, not global: in global, letters typed in a dialog it opened (asking Iso) were also taken as its keys.
5. **The one-note Atlas.** The core's layout for one note drawn in cells in the panel, with its own keys and `esc`.
   **Built** (2026-10-18):
   - `/atlas [words]`, or `[a]` in the note view, opens one note's atlas in OpenCode's session panel, beside the chat, as `Terminal-Atlas` draws it: what it requires on the left (purple routes), the note in a heavy box, what builds on it on the right in dashed boxes (orange routes), "N more are required further back", and while a turn goes on the note the agent is reading in gold, with "OpenCode is reading …". The note shown is the one chosen, else the one the agent read last, else the first in play.
   - **The neighbourhood is the core's `reach`**, as the browser's Atlas lights a chosen note. **The drawing is not the core's layout:** `nestedLayout` places folder blocks and routes at 45°, for the whole map; three columns of boxes with square routes in terminal cells are drawn by the plugin (`oneatlas.ts`), from `reach`. So the terminal has a small layout of its own, against `architecture.md` ("does not have a layout of its own"), because the core's would have drawn the board worse.
   - After it opens, the chat keeps the keys (`pane.focus.left`); focused (a click, or leader and →), the panel's are `[a]` the next note in play, `[n]` open the note, `[b]` the whole map in the browser, esc to close.
6. **The splash and status line**, and `[s] send to agent` from the terminal side.
   **Built** (2026-10-18):
   - The status line (OpenCode's prompt footer) names the base, and says "◆ atlas following" only while a browser page has isorite open: the server tells every event stream how many browser pages listen (`watchers`), not counting a harness's plugin, which listens as `?agent=<name>`. OpenCode's own items (the mode, model, context, cost) are its own.
   - `[s]` in the note view sends the paragraph the cursor is on, and in the atlas panel the note shown, to the agent, with what you want of it: it reaches the session as from the browser, under "from you".
   - The splash (step 1) is as the board, without its status line ("any key skips"), since only its four keys act. After it, OpenCode's home shows isorite's wordmark where it drew "opencode": the browser's (`Logo.svelte`) letters redrawn in the mark's own pieces, whole squares and corner halves two cells wide, the i the mark made small with Iso's gold diamond and the malachite one over the two, 10 rows by 70 columns. **As images, by choice** (`ISORITE_LOGO=image`, Lachlan's answer: characters everywhere by default), in a terminal that shows them (kitty's graphics protocol, or sixel, as OpenTUI detects them), the mark and the browser's own wordmark are drawn as images (`plugin/assets`, made by `scripts/logo-images.ts`): straight edges, as the board and the browser draw them. Checked in kitty 0.32.2 with OpenCode itself. **By default, in quarter blocks**, which every terminal draws itself (Lachlan's choice, 2026-10-18, after the variants): the mark as on the board, and the wordmark as the browser's path drawn in quarter blocks, a stem a cell wide, with a drop shadow a cell down and to the right in the ground's deepest blue (`g3`). A cell holds two colours, so where a letter and its shadow share one the shadow is its background only if it fills the rest. The other styles were tried and kept as choices: Powerline's triangles (`triangle`, straight edges at the cell's own slope, about 63°, drawn edge to edge by xterm.js, Windows Terminal, kitty, Ghostty and WezTerm; in it the wordmark's strokes are two cells wide and a row tall, as half-block bars step half a row where they meet a triangle), the wedges of Symbols for Legacy Computing (`legacy`, 45° but bent where cells meet, and left to the font by xterm.js), and single font triangles (`simple`). `ISORITE_LOGO` chooses `image`, `legacy`, `quadrant`, `simple` or `triangle`. Where the terminal is smaller than 76 by 28, it is "isorite" in OpenCode's own letters instead ("iso" muted, "rite" bold, as "open" and "code"). No slot reaches that logo: the plugin finds its box among OpenCode's renderables by the rows it draws, hides it, and adds the wordmark beside it (`plugin/wordmark.ts`). If a later OpenCode draws its logo otherwise, nothing is found and OpenCode's stays.
7. **Screenshots beside the six boards** (rendered from the tmux panes), then the write-up. A run on a real model: the free models if they serve, else the gateway with a key you give.
   **Built** (2026-10-18): the six boards rendered from the design artifact at 1200 × 844 beside the end-to-end test's panes (160 × 44, through xterm.js), in an artifact of its own (`https://claude.ai/artifact/KV9zFsvwNVcyCQE5WHB1FX`). Fixed on the way: the note view's text in a column of reading width (84 cells with its gutter), `[a] its atlas` in its status line, a blank line after a waiting change, and the atlas panel on the page's ground rather than OpenCode's panel colour. What still differs is §10. No real model was run: no key was given.

8. **A tutorial of the terminal.** Agreed by Lachlan on 2026-10-18 ("go ahead with step 8").
   **Built** (2026-10-18):
   - `isorite tutorial term [<folder>] [--port <n>]` writes the example base into the folder (a new one in the temporary folder by default), starts the tutorial's model (`src/tutorial.ts`: a scripted OpenAI-compatible endpoint, the tests' gateway made a module, `src/scripted.ts`), points both OpenCode and Iso at it, and runs `isorite term` there. OpenCode's and isorite's settings are kept in the folder too, so nothing of the person's is used or changed; run again on the same folder, it carries on. No key, nothing sent anywhere; it needs OpenCode 2.
   - The tour (`plugin/tour.ts`): eleven steps in a card at the bottom right, each moving on when the person does what it asks, read from what the plugin already knows (the page shown, the agent's turns, the notes in play, the atlas panel, the note's waiting changes, Iso's answers, a note sent): the splash; asking about the notes, its prompt filled in; notes in play and citations; one note's atlas; a change to a note (the prompt filled in), OpenCode asking before it writes code; the note view; keeping the change; asking Iso in place; the timeline; sending to the agent; the end. `/next` moves on, `/tour` hides the card. The prompt is filled in through the focused editor (`renderer.currentFocusedEditor`), as OpenCode fills its own.
   - **On GitHub Pages**, `#/terminal` replays the tour: each step's real screen, recorded by the tour's end-to-end test (`npm run record:tour -w @isorite/opencode`, into `app/src/lib/terminal/replay.json`), drawn on a canvas a cell at a time with block, box-drawing and Powerline characters as shapes, beside the step's card; ← and → step. Not xterm.js, as proposed: drawing the recorded screens needs no terminal, and no new dependency. A unit test fails when the tour's words change and the replay has not been recorded again. The browser's tour ends with a link to it.
   - **Not as proposed:** the replay steps a screen per step, not a key at a time.

**Done when** is §6's, with "through MCP" checked by a script against the MCP server, since Claude Code is not run here.

**For you to settle**
1. The tree of notes found in the sidebar and above the prompt, not inline in the chat as `Terminal-Chat` draws it. Inline is possible only if the agent copies a block into its answer, which a model may not do.
2. A real-model run: whether to ask you for an OpenRouter key, or a gateway, if the free models keep refusing.
3. Installs this needs, each asked before: OpenCode 2.0.32 in `~/oc2` (done, with your yes), and for the package's own tests `@opencode/plugin@2.0.32` and `@opentui/core@0.5.17` as dev dependencies, for types.

## 10. What was built (2026-10-18)

Steps 1 to 7, on `m6-terminal`. Nothing was asked of a real model: every check ran against the scripted gateway.

**Running it:** `isorite term [<base>]` starts the isorite server if none answers, writes OpenCode's home (`~/.config/isorite/opencode`: the theme, the gateway, the plugin), and runs OpenCode 2 there. `ISORITE_GATEWAY_URL` and `ISORITE_GATEWAY_MODELS`, with the key in `ISORITE_GATEWAY_KEY`, point it at an OpenAI-compatible gateway, a corporate one included. `isorite mcp` gives any MCP harness the same tools.

**What each board became** (beside the boards: the artifact named in step 7):

| Board | Verdict | What differs |
|---|---|---|
| `Terminal-Splash` | As the board | No status line. After it, OpenCode's home shows the browser's wordmark in place of "opencode". |
| `Terminal` | Close | The steps are the tools' names; OpenCode draws the transcript, cost and context. The session header with the small plant and the sidebar's cellular field are not built. |
| `Terminal-Chat` | Close, as agreed | The tree is in the sidebar, without how each root was found. `[o]` beside a diff is not built: no slot beside OpenCode's diff. |
| `Terminal-Chat-Tools` | OpenCode's | Web, subagents, run and permission are OpenCode's own. `[k] draft a note from this` is not built. |
| `Terminal-Note` | As the board | Two more keys, `[n]` and `[s]`; the foot's prompt is `[/]`'s dialog. |
| `Terminal-Atlas` | As the board | In OpenCode's session panel, with keys while focused; drawn from `reach`, not the core's layout. |

**The six things wanted on 2026-10-10** (`ISORITE_CONTEXT.md`):
- **Edits seen live in the browser:** yes. An agent's change to a note waits there, named "OpenCode", and is kept or removed as Iso's are.
- **Notes brought into context and paths found, shown:** yes, on the Atlas live and in the sidebar's notes in play.
- **A referenced note opened in the browser from the terminal:** by `[b]` in the note view and the atlas, not by clicking a citation.
- **Isorite's own actions as buttons, starting it among them:** `isorite term` starts the server; the actions are keys and slash commands (`/note`, `/atlas`), not buttons.
- **Branding, with ASCII L-system trees and a splash:** the splash and the home's wordmark, in block characters. No ASCII form and no tree in the session.
- **The notes in play listed:** yes, as a tree.

**Not done, or done differently:**
- `[k] draft a note from this` and `[o] open the note it rests on` (above).
- The session header and the sidebar's cellular field (`Terminal`).
- A safety-net edit to a note shows in the transcript as OpenCode's "Edit" without a diff; an edit to an exercise is not caught.
- A turn ends half a second after the prompt, once the session has settled (`session.wait`): a plugin's events carry no session status.
- The home's wordmark is found among OpenCode's renderables by the rows of its logo; a later OpenCode that draws its logo otherwise keeps its own.
- MCP agents' steps reach the Atlas but not the terminal panel's "is reading", which is OpenCode's.

**Tests:**
- 319 core (2 Atlas timing tests fail, as on main), 77 engine, 8 example, 24 server (1 skipped), 46 app and 48 opencode tests. The opencode ones include the tour walked end to end (`test/tutorial.test.ts`), and 10 end-to-end tests that drive OpenCode 2.0.32 in tmux against the scripted gateway: splash, home and wordmark, status line, look-ups and sources, the atlas, proposals, from you, the note view (keep, ask, remove, edit, timeline, `[s]`), and the server stopping with the TUI.
- 154 browser tests passed, 4 skipped. 2 failed: `notes.spec.ts:101` on a phone, both grounds, which fails on main too. The agent's path on the Atlas, its change kept in a note, and send to agent pass at both widths on both grounds.
- The tutorial site's walks pass on both grounds: the browser's tour, and the terminal's replayed.
- Check is clean.

**For Lachlan:**
1. `[k] draft a note from this`: in this milestone or later?
2. The session header with the small plant: OpenCode has no slot at a session's top; the space above the prompt is the nearest. Build it there?
3. The steps' names: keep the tools' names, or name them for the board's steps?
4. A real-model run before the merge needs a key.
