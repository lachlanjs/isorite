# The terminal: what to build it on (research, 2026-10-30)

Done before the install milestone (now M26, `archive/plan-m26.md`) at Lachlan's request: whether OpenCode 2 stays isorite's terminal, and if not, the best thing to build an agentic terminal on. Facts from the projects' own pages and npm on 2026-10-30; where only secondary sources said something, it is marked.

**Superseded the same day.** After looking at omp and Tern (below), the direction changed: isorite builds no terminal and no agent of its own, and attaches to the agent you already use over MCP and ACP (`plan-m25.md`). Recommendation D below is not being pursued. The library comparison stands, as a record.

## omp and Tern (2026-10-30)

- **omp (Oh My Pi)**, Stencil Labs' fork of Pi: the harness doing as much as it can. Hash-anchored edits (a stale edit is refused), language servers and debuggers, subagents in worktrees, an advisor model, browser and desktop control, memory tools, 40+ providers. Bun plus a native Rust core of about 80,000 lines; MIT. Speaks ACP (`omp acp`). In Composio's test of eight harnesses on one model, Pi passed 20/30 and omp 17/30 at about 3.7× the cost per task passed; OpenCode passed 14.
- **Tern**, Stencil's terminal (closed beta, source not public; macOS, iOS, the browser, remote servers): sessions kept by a background service, live across devices over QUIC and Tailscale, programs drawn natively through its own protocol, built-in blocks (git, SQLite, Jupyter, kanban). Built for omp.
- **What isorite takes from them:** where and how an agent runs, persists or is drawn is the host's; what the agent knows, and how understanding builds up in notes and the Atlas, is isorite's. Tern is reached through omp's MCP and a browser pane first, through ACP if it ever hosts agents that way.

## ACP and MCP, as of 2026-10-30

- **ACP:** v1 stable, v2 in draft (July 2026); SDK `@agentclientprotocol/sdk` 2.1. Stable: session list, resume, close, delete; titles; message ids; usage (context used, cost); tool call names; elicitation; extra workspace folders; a registry of agents. Drafts: proxy chains and MCP over ACP. A transports group is standardising WebSocket and HTTP. Several clients on one live session is not specified; isorite's wrapper sidesteps it by holding the one connection.
- **MCP 2026-07-28:** stateless (no handshake, no session id; client info on every request); roots, sampling and logging deprecated; extensions, with MCP Apps (HTML drawn by the host) and Tasks the first. The roadmap (August 2026) adds events pushed from the server and progressive discovery of tools.
- **Shaping context:** a server shapes what it puts in (tool results, resources, prompts, instructions) and a wrapper can prepend to prompts, but neither sees or changes the harness's whole window: its system prompt, other tools' results, or what compaction dropped.

## What the terminal is now

- `isorite term` runs **OpenCode 2** (pinned to 2.0.32; 2.2.2 is current) with isorite's plugin and theme, beside the base. OpenCode's own server runs with a password; isorite's server follows the same session for the Iso pane's Build mode (`packages/server/src/terminal.ts`, `term.ts`, `packages/opencode`).
- OpenCode reaches the model **through isorite** (`gateway.ts`), so the gateway's key, headers and client certificate are isorite's to handle, not OpenCode's.
- There are **two agents**: Iso (isorite's own loop in the engine: the base's tools, turns, permissions, conversations kept in `.isorite/`) and OpenCode's (files and commands). Iso has no tools for files or commands; Build mode hands those to OpenCode.
- Installing it is a step of its own: `isorite opencode` runs npm for `@opencode/cli`, a native binary per platform (twelve optional packages). The one-file executable has no npm in it, so on Windows Node is needed as well.
- Your notes from testing: "TUI is a bit janky and too opencode'y".

## The options

### A. Keep OpenCode 2

- **For:** a full coding agent, maintained by a large team; 2.0 (launched about 2026-10-14) made its server the centre, with stable TUI plugins and hot reload, and `@opencode/sdk` to use it as a library (secondary sources).
- **Against:** it looks and behaves like OpenCode, whatever the theme. 2.0 broke 1.x plugins, and its own beta docs said the plugin API, client and SDK could still change; isorite is already three minor versions behind. Its TUI is built on OpenTUI, which went 0.5 → 0.6 → 0.7 → 0.8 in about three weeks, with breaking changes for plugins. It is a second program to install, from npm, per platform: the hardest piece to get onto a machine with no internet. Two agents stay two agents.

### B. Pi as the terminal

Pi (`@earendil-works/pi-coding-agent` 1.4.0, MIT, about 119k stars; moved from Mario Zechner to Earendil in April 2026, 1.0 in October): a deliberately small coding agent in four layers, `pi-ai` (providers), `pi-agent-core` (the loop), `pi-tui` (the terminal UI) and `pi-coding-agent` (the CLI), usable interactively, as JSON, over RPC, or as an SDK.

- **For:** plain TypeScript on Node ≥ 22.19, like isorite. Its dependencies are JavaScript and WebAssembly (no native add-ons seen in its npm listing), so it may build into isorite's one executable: **no second install**, which solves most of the air-gapped install for the terminal. Extensions can register tools, commands and shortcuts; draw tool calls, messages and widgets their own way; block or change a tool call before it runs (permissions); register providers (`baseUrl`, headers, a key from an environment variable or a command). The model would still go through isorite's gateway, so client certificates stay isorite's.
- **Against:** it looks and behaves like Pi; extensions can add and redraw parts but its documentation does not show replacing the editor, header or footer. A young organisation behind it, and a 1.x that moves quickly (1.0 to 1.4 in a month). Still two agents.

### C. Iso in the terminal

isorite's own terminal, drawn by isorite, over its own engine: Iso is the agent in the terminal as on the page, with tools for files and commands added to it.

- **For:** **one agent** on the page and in the terminal, the same conversations (`.isorite/conversations/`), the same permissions, the same setup, the same gateway, nothing else to install. It can look like the page: the same marks (◆ for Iso, the crystal growing, parts in corner brackets, links weighted by kind). Nothing upstream can break it.
- **Against:** the most work. Iso needs what a coding agent has: reading and editing files well (exact edits, diffs), running commands with permission, and the care those take; and a terminal UI to draw it all. Its quality as a coding agent would be isorite's to earn.

### D. Iso in the terminal, on Pi's parts

C, but not from nothing: isorite's terminal drawn with **pi-tui**, and the file and command tools taken from **Pi's coding agent** (its edit, write, read and bash, used through its SDK or copied under MIT), run by Iso's own loop and permissions.

- **For:** C's one agent and one install, with tested parts where a coding agent is hardest. pi-tui is small and fits: it draws into the terminal's own scrollback or a full screen, rewrites only lines that changed, wraps each frame in synchronised output (no flicker), and has an editor, Markdown, lists and pictures (Kitty, iTerm2); its only dependencies are `marked` and a width table.
- **Against:** still more work than A or B; tied to Pi's parts at the version taken (less so if copied).

## Libraries for drawing a terminal, for C or D

| | language | fits isorite's one executable | notes |
|---|---|---|---|
| **pi-tui** 1.4 | TypeScript, Node | yes, pure JS | differential, synchronised output; scrollback or full screen; Pi's own |
| **Ink** 8.0 | TypeScript (React), Node | yes, though Yoga's layout is WebAssembly | the most used; Claude Code and Gemini CLI are said to run on forks of it (secondary) |
| **OpenTUI** 0.8 | TypeScript on a Zig core | **no**: needs Bun ≥ 1.3.14 or Node ≥ 26.4 (FFI) | fastest; OpenCode's; 0.x, breaking often |
| **Bubble Tea** v2 | Go | a second binary | mature; would reach isorite over HTTP, not in process |
| **Ratatui** | Rust | a second binary | Codex CLI's; the same |

## Recommendation

**D: Iso in the terminal, drawn with pi-tui, with Pi's file and command tools.** It answers all four aims at once: one install (the terminal is part of the one executable, so the air-gapped machine needs nothing else), one setup (one gateway, isorite's), one command (`isorite` is the terminal), and a terminal that is isorite's own and looks like its page. A keeps the install and setup problems and the look you found "too opencode'y"; B fixes the install but keeps a second agent and a look not isorite's.

What D costs is the coding agent's quality, which is why the first step is a spike, not a rebuild:

1. **Iso with files and commands, on the page first:** Pi's edit, write, read and bash as Iso's tools in Build mode, behind Iso's permissions, against a small repository; compare its edits with OpenCode's on the same tasks.
2. **A terminal with pi-tui:** the Iso pane's conversation drawn in the terminal (turns, what Iso read as parts, the crystal while it works, permissions asked), sharing the engine in process.
3. **The one executable:** build pi-tui and Pi's tools into it, and check it starts on Linux, macOS and Windows with nothing else installed.

If step 1 shows Iso cannot edit code as well as OpenCode, B (Pi as the terminal, with an isorite extension) is the fallback: the same install gain, less work, a second agent kept.

## Sources

- Pi: [pi.dev](https://pi.dev/), [earendil-works/pi](https://github.com/earendil-works/pi), its [models](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md) and [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) docs, [pi-tui's README](https://github.com/earendil-works/pi/tree/main/packages/tui); [the move to Earendil](https://pi.dev/changelog/2026/5/7/pi-has-a-new-home); npm for versions and dependencies.
- OpenCode 2.0: [AlternativeTo](https://alternativeto.net/news/2026/10/opencode-2-0-officially-launches-with-background-agents-code-mode-and-a-rebuilt-api/), [BestHub](https://www.besthub.dev/articles/opencode-2-0-launches-with-breaking-plugin-api-runtime-overhaul-19bc9ec174e8), [releases](https://github.com/sst/opencode/releases); npm for `@opencode/cli`.
- OpenTUI: [releases](https://github.com/sst/opentui/releases), [the 0.6 upgrade issue](https://github.com/anomalyco/opencode/issues/56134); npm for its engines.
- Libraries compared: [OpenReplay on OpenTUI and Ink](https://blog.openreplay.com/opentui-alternative-ink/), [LabHub's guide](https://labhub.hopto.org/blog/2026-07-31-terminal-ui-development-guide?lang=en); npm for Ink.
