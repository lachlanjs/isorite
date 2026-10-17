# Milestone 6: the terminal, on OpenCode 2 (scope)

Written 2026-10-18 as a scope, at Lachlan's asking. It is not yet a plan to approve. Step 0 below is a short spike, and the plan proper is written from what the spike finds. Branch, when it opens: `m6-terminal`.

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

## 3. What OpenCode 2 offers (as of 2026-10-18)

From the 2.0 announcement (anoma.ly/notes/opencode-2-0), OpenCode's documentation, and community plugins:
- **One local server for every window.** The TUI, the web interface and the desktop app all connect to the same background process. `@opencode/client` finds it automatically, and the server API was rebuilt for 2.0. isorite can therefore talk to a running session from outside: the browser's "send to agent" can reach the terminal through it.
- **TUI plugins are stable** and built on OpenTUI. The announcement says nearly every feature is now an internal plugin, more than 80 of them, all hot-reloaded. A community plugin adds to the sidebar's context section, so sidebar slots exist.
- **Server plugins** (JS/TS, run in Bun):
  - events (`message.part.updated`, `file.edited`, `permission.asked`, `session.idle`, `tui.prompt.append`, …);
  - `tool.execute.before` and `tool.execute.after`, which can change a call's arguments or block it;
  - custom tools with Zod schemas;
  - a compaction hook.
- **MCP servers run in "code mode" by default**: the agent writes a short script that chains several tool calls in one round trip.
- **Breaking:** plugins written for 1.0 do not run on 2.0. The config format changed. Upgrading is explicit: `opencode upgrade --major`.

**Not yet known, and the reason for step 0:**
- The TUI plugin API is barely documented. Community issues from June 2026 still ask where it is written down.
- Whether a plugin can add a **full-screen view** (the note view), a **side panel** beside the chat (the one-note Atlas), a **start screen** (the splash), and **keybindings**, or only slots in the sidebar, header and footer.
- Whether a tool's result can be **drawn by the plugin** (the tree of notes found), or only as text.

**Installed here:** OpenCode 1.19.3 (`~/.local/bin/opencode`), and Pi. Neither Bun nor OpenCode 2 is installed. `~/rdstudio` has an `opencode.json` of its own, which a major upgrade could break.

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

0. **Spike, one or two days. Needs Lachlan's go-ahead to install OpenCode 2.**
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

## 7. Questions for Lachlan

1. **May I install OpenCode 2 and Bun** in a separate folder for the spike, leaving 1.19.3 where it is?
2. **Which model and provider should OpenCode use** in testing: your OpenRouter key through OpenCode's own provider config, or something else? This milestone's real-model checks will cost more than Iso's, because coding sessions are long.
3. **Is Pi dropped,** or kept as the fallback if OpenCode's TUI plugins cannot draw the note view?
4. **When should it come:** after the week of use (the slice plan's order), or straight after M5?
5. Should agent edits to **files that are not notes** keep OpenCode's own accept and reject, as `decisions.md` says?
