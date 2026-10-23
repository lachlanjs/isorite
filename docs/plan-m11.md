# Milestone 11: the terminal's session in the Iso pane, and Build mode

Written 2026-10-23, for approval. Lachlan wants to trial isorite on a new project at work as soon as possible, so this plan is ordered to make a trial possible early (after step 3) and leaves polish for after. It builds on M6 (the terminal: `isorite term`, the OpenCode 2 plugin, its tools and views; `docs/plan-m6.md`), on M10's split (`docs/plan-m10.md` §4: one conversation model, two sources) and on the W5 spike (2026-10-21, `packages/opencode/spike/mirror.ts`). Branch: `m11-terminal`, from `m10c-tutorial`.

## 1. What a work trial needs

- **A project folder** (the code) with **a knowledge base** for it, and the terminal agent (OpenCode 2) working in the project with isorite's tools, as M6 built.
- **The Iso pane showing that same session**, live, on the laptop's browser and on the phone: what is asked, what the agent says and does, its diffs and commands, and its questions for permission, answered from either side. As Claude Code's web sessions mirror the terminal (W3–W5).
- **Asking from the browser or the phone** into the session, with notes and passages given from the Atlas and the note (M10's context), and stopping it.
- **The models the workplace allows.** Today `isorite term` takes one OpenAI-compatible gateway (`ISORITE_GATEWAY_URL`, `_KEY`, `_MODELS`); Iso in the app takes OpenRouter or a named URL. Both should be able to use the same provider.
- **Nothing of the project leaves the machine** except to the model provider, and OpenCode's own server is never on the network: only isorite's server is, and only on localhost or the tailnet.

## 2. The shape

```
phone / laptop browser ──(tailnet or localhost)──► isorite server ──(localhost, password)──► opencode2 serve
                                                       │  engine (notes, journal, Iso)          ▲
                                                       └──── isorite tools (M6) ◄──────────────┤ plugin (server half)
                                                                                               │
                                                     terminal: opencode2 --server <url> ───────┘ plugin (TUI half)
```

- `isorite term` starts **`opencode2 serve`** on a free localhost port with a fresh random password, then the TUI with **`--server`** (the spike showed both see each other's prompts, and a permission is answered from a second client). Today it runs `--standalone`.
- **The isorite server holds the password** and is the only client of OpenCode's server besides the TUI. It reads the session with `@opencode/client` (`session.list`, `message.list`, `event.subscribe`) and acts on it (`session.prompt`, `session.interrupt`, `permission.reply`). The browser never talks to OpenCode: it gets the session as isorite events, and acts through isorite's routes, which ask the session token and Origin as every write does.
- **Which session is mirrored:** the one the terminal has on screen (the plugin already knows it, M6 step 3), else the latest in the project.

## 3. In the Iso pane

- **Build mode** (the terminal glyph already in the mode row; shown only when a terminal is connected, as decided for M10) shows the terminal's session. Ask, Write and Understand stay Iso's own, from the engine, as now. Switching mode switches which conversation is drawn; each keeps its place.
- **What is drawn**, from OpenCode's messages and events, in the pane's existing parts (M10 §4's `Item`s):
  - your prompts (from either side, marked "from the terminal" or "from here"), and the agent's text, streamed;
  - a line per tool call: isorite's look-ups as now (the note a link, the Atlas lighting the path), a command with its output folded, a file read or edited by name, an edit as a small diff;
  - a permission asked, with Allow once / Always allow / Don't allow (OpenCode's `once`, `always`, `reject`), answered here or in the terminal, whichever is first;
  - the step's model, tokens and cost in the pane's foot, as Iso's.
- **Asking from the pane** sends a prompt into the session (OpenCode's `steer` delivery while it works, else a new turn). Notes and passages in the pane's context go with it as text with their titles, replacing M6's separate "send to agent". Stop interrupts.
- **The phone:** the same pane; nothing new beyond it fitting.

## 4. The agent's edits to notes

M6 made every change by the terminal agent to a note wait to be kept (a proposal). M10 then made Iso's Write mode write directly, mark what it wrote, and offer undo, with no gate (agreed 2026-10-22). **Proposed: the terminal agent does as Write mode does**: its change to a note is written, recorded in the note's journal as `agent:opencode`, marked in Iso's lens, and undoable from the pane and the timeline. The proposal path, the `propose_*` tools' "waits to be kept" wording and the terminal note view's `[k] [e] [r]` go (Q2). Edits to code stay OpenCode's own, with its own permissions.

## 5. Models

- **One provider for both.** `isorite term` reads the same `[provider]` from `~/.config/isorite/config.toml` that Iso uses (a name, a URL, the key kept there), and gives OpenCode the matching provider, so a corporate OpenAI-compatible gateway, or OpenRouter, is set once. The `ISORITE_GATEWAY_*` variables keep working and win.
- **Or OpenCode's own.** If the workplace's provider is one OpenCode knows natively (Anthropic, Bedrock, Azure, Copilot, …), `isorite term --own-models` lets OpenCode use its own provider login in isorite's config home (`opencode2 auth login` run once there), and Iso in the app keeps its own setting (Q3).

## 6. Reaching it

- `isorite term [<base>] [--tailnet]`: with `--tailnet`, the isorite server is put behind `tailscale serve` (HTTPS on the machine's `….ts.net` name, which the server already accepts) and its URL printed, for the phone's Home Screen app. Without it, localhost only, as now. OpenCode's server stays on 127.0.0.1 in both.
- The port is the server's `--port`; OpenCode's is chosen free and never shown.

## 7. Setting up a work project

- `isorite term` in the project folder, naming the knowledge base: `isorite term ~/notes/<project>`. **The knowledge base and its study base are kept outside the repository by default** (your own, not the team's, and nothing to commit), made with `isorite init <folder>` and `isorite study init` as now. A knowledge base inside the repository (committed, shared with the team) is project mode, which keeps no journal yet (`architecture.md` §2): later (Q4).
- A short `docs/terminal.md`: install (Node 24, OpenCode 2, optional Tailscale), the provider, starting it, the phone.

## 8. Security

- OpenCode's server: 127.0.0.1 only, a new random password each start, held by the isorite server and the TUI's environment only, never sent to the browser.
- isorite's new routes (prompt, stop, permission reply) are writes: session token and same Origin, as all writes. A permission reply names only a permission the mirrored session asked.
- Over the tailnet, anyone on your tailnet who opens the page can drive the agent in your project, as they can already edit your notes. Said in `docs/terminal.md`.

## 9. Steps

1. **Serve and attach.** `isorite term` runs `opencode2 serve` + the TUI `--server`; both halves of the plugin load (server half in `serve`, TUI half in the TUI); M6's end-to-end tests pass in that arrangement. The server connects with `@opencode/client` (Q5).
2. **The session in the Iso pane, read only.** Build mode appears when a terminal is connected; turns, text, tool lines, diffs, cost, live; a page opened mid-turn catches up from `message.list`.
3. **Acting from the pane.** Prompt (with the context given), stop, permission replies. M6's "send to agent" folded into it. *A trial can start here.*
4. **The agent's note edits as Write mode's** (§4), and the turn's end from OpenCode's `session.execution.*` events instead of M6's half-second wait.
5. **Models** (§5) and **`--tailnet`** (§6); `docs/terminal.md`.
6. **Tests and a check:** unit tests for the session-to-turn mapping; end-to-end against the scripted gateway in tmux with the browser driving (prompt, permission, stop) at both widths; one real-model run on a temporary copy, cost reported. The write-up in §10.

The tutorial's L4 (terminal) and E3 (building) wait until after the trial, so they can draw on it.

## 10. What was built

(Written when built.)

## Set aside for after the trial (from your answers of 2026-10-23)

On the page as new items, to plan as M10d once the trial is running:
- **Tutorial pacing:** a step whose outcome you should see waits for "next" instead of moving on (I7's note); the card sits near what it points at rather than the bottom right; highlights that cover what you need (L1).
- **Mode awareness:** a step that needs a mode says so and switches or waits for it; a scripted answer in the wrong mode says why it did not come (L2).
- **The scratchpad** as part of the Understanding note's page, not a box (V9, I7); L3's answering step reworked.
- **The timeline:** one highlight, and the →| reset beside the rest of it; **the details section** tidied (L1).
- The "how is a body inserted …" text in Iso's box: it is L2's first question, which the step fills in for you; the card will say that it did.

## Questions

| | Question | Proposed |
|---|---|---|
| Q1 | Merge `m10b-refine` and `m10c-tutorial` into `main` first, and branch M11 from `main`? | Yes |
| Q2 | The terminal agent's edits to notes written and marked, undoable, as Write mode's (no waiting to be kept)? | Yes |
| Q3 | At work, which model provider? An OpenAI-compatible gateway (set once for both), or one OpenCode knows natively (`--own-models`)? | Tell me which |
| Q4 | The project's knowledge base outside the repository (yours), not committed in it, for the trial? | Yes |
| Q5 | `@opencode/client@2.0.32` as a dependency of `@isorite/server` (already installed with `@opencode/plugin`, no new download)? | Yes |
| Q6 | The work machine: macOS, Windows or Linux? Can OpenCode 2 (`npm i -g @opencode/cli`) and Tailscale be installed there? | Tell me |
