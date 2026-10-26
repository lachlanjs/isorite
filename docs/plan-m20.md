# Milestone 20: several bases, and the agent's memory

Written 2026-10-26, for approval. Branch `m20-bases`, from `main` at `e29c095` (0.7.0). It was proposed after your
note on rdstudio's global bundle, and comes before Obsidian import.

Your aside, in your words: rdstudio's global agent OKF "was very useful in practice and the agent would often store
things in memory that were genuinely useful later down the track". You'd like to:
- open a session in a project with isorite, in the web UI and the TUI;
- and have a web UI showing the model's global context as the agent learns new things;
- which generalises to "activate access to multiple knowledge bases at once and easily switch between them in the
  UI".

So M20 does two things:
- **Several bases at once:** one isorite server holds several knowledge bases. Each base has its own page, and you
  switch between them from the pane header. You choose which bases the agent and Iso may use.
- **The agent's memory:** a base of its own (`memory`), lent to every session. The agent reads it and writes what is
  worth keeping there. You watch it learn in that base's own tab, as you watch Iso in a project.

Nothing about a note's format changes. A base is still a folder of Markdown with its `.isorite/`.

## 1. What is there today

Found by reading `packages/server/src/{serve,http,term,mcp,config}.ts`, `packages/engine/src/engine.ts` (the agent
tools), `packages/opencode/plugin/server.ts`, `app/src/lib/{api,app.svelte}.ts` and `+layout.svelte`, at `e29c095`;
and rdstudio's `decisions/multiple-bundles.md`, `tasks/T13-global-bundle.md` and `tasks/T47-mounts.md`.

- **One server, one base:**
  - `isorite serve <notes>` opens one `Engine` and serves the app and `/api/*` for it on port 4767.
  - `isorite term` and `isorite mcp` start that server, or use the one already on the port. They refuse when it is
    serving another base ("port 4767 is serving x, not y").
- **The agent's tools** come from the server (`/api/agent/tools`, `/api/agent/look`):
  - `brief_base`, `search_notes`, `find_similar`, `outline_note`, `read_note`, `edit_note` and `write_note`;
  - the same tools for OpenCode's plugin and over MCP;
  - each look-up is drawn on the Atlas as the agent's path;
  - each change is written at once, entered under `agent:<name>`, and marked as its words, for you to undo.
- **The base's instructions** are `AGENTS.md` at the notes' root. Iso and the terminal agent are both given it.
- **The app** asks `api/` relative to its page, and is built with relative paths and hash routing. So it can be
  served from any folder, as the guide's site is under `/isorite/`.
- **There's no header above the panes (M10b).** Each pane has its own header: its name, then its switches, tools and
  settings. The base's name is shown only in the Note pane's settings.
- **The boards:**
  - `Bases` is the old two-base picture: the knowledge base, and the study base laid over it. Its study base was
    retired in M12, so it doesn't cover this.
  - `Header-Context` shows the header's path as `dmft / self-consistency condition`, the base's name first. That's
    where the switcher goes (§2.3).
  - No board shows a switcher or a memory base. I'd draw them in the app, after these two, and send screenshots.
- **What rdstudio did (T13):**
  - a private `~/knowledge` bundle, made by `rdstudio global init`, with its path in `config.toml`;
  - MCP tools that take a `scope` (project, global or all), with global ids prefixed `global:`;
  - a record tool that can write to the global bundle, and `promote` to move a note up to it;
  - no links between bundles;
  - in place of a scope toggle, the global bundle got its own dashboard on its own port.
  - That last point is the part M20 does better: one server, with a switch between bases.

## 2. What M20 does

**1. Bases you know, by name.**
- **Where they're listed:** `config.toml` (this device's file) gets a table of bases:
  ```toml
  [bases.memory]
  path = "~/isorite-memory"
  lend = true          # given to every session's agent and Iso, as well as the base it is for

  [bases.isorite]
  path = "~/isorite/notes"
  ```
- **Remembered as you go:** `isorite serve`, `term` and `mcp` add each base they open to this table, under its
  folder's name (Q92). If two folders share a name, the second gets a suffix.
- **What the page can do:** it can switch to a listed base and set its `lend`. It can't add a path. Like the
  provider's setup (M18), that only works from this machine.
- **`isorite bases`** lists them: name, path, lent or not, and open or not.

**2. One server, several bases.**
- **Opened as needed:** the server keeps one engine per base, opened the first time the base is asked for. The base
  it was started for opens at once, and so does every lent base.
- **Each base has its own engine,** as now: its own journal, watcher, search index and event stream. The model for
  search by meaning is loaded once and shared.
- **Each base has its own address:** `/b/<name>/` for the app and `/b/<name>/api/*` for the API. `/` and `/api/*`
  stay as the base the server was started for, so links, the plugin and the MCP bridge keep working unchanged.
- **A second base on a running server:** `isorite term <base>` and `mcp <base>` on a server that already holds
  another base now add theirs to it. They no longer refuse.
  - So one project terminal and the memory tab share one server.
  - A second project's terminal can use the same server too, on another port for OpenCode.
- **When the server stops:** a server that `term` started still stops with its terminal. If another terminal is
  still using it, it stays until that one is done too.

**3. Switching, in the UI.**
- **One base per window or tab** (Q91). The three panes show the same base, because a note's links, the Atlas and
  Iso's context are all one base's.
- **Side by side:** two tabs, or two windows. For example, the project in one and `memory` beside it.
- **The switcher:**
  - the base's name, faint, before the pane name in the header of whichever pane stands first. That's the board's
    `dmft / …` path, with no new header;
  - clicking it opens a small list of the known bases, each with its folder as a tooltip;
  - a lent base has a switch that says so, and the base you're in is ticked;
  - choosing a base opens it in this tab; Ctrl or middle click opens it in a new one.
- **On a phone:** the same, in the header of the pane on screen.
- **The guide's public site** has only its one base, so it shows no switcher.

**4. The agent, and Iso, across bases.**
- **Tools take a base:** every agent tool takes an optional `base`, which is one of the bases lent to the session.
  Without one, a tool acts on the base the session is for.
- **Notes from another base** are named with the base first, as `memory:tools/opencode-config`. Tools accept
  that form too.
- **`brief_base`** names the lent bases, with each one's description from its `AGENTS.md`'s first line. With
  `base`, it briefs that base.
- **Writing:**
  - the agent writes to any lent base as it writes now: at once, entered under its name, its words marked;
  - you undo its words in that base's page;
  - there are no links between bases, as in rdstudio: a note links only within its own base.
- **The Atlas** of the base an agent reads in draws its path. Its memory tab lights as it looks there, and a note it
  writes appears there marked as its own.
- **Iso** may read lent bases with the same `base` argument. It changes notes only in the base whose page it's in
  (Q94).
- **The Iso pane** shows a step or a citation in another base by its base and title. Clicking it opens that note in
  that base's page, in a new tab.
- **The TUI** stays on the project's base. A tool line that reads or writes another base names it
  (`memory: OpenCode's config`).

**5. The memory base.**
- **`isorite memory [folder]`** (default `~/isorite-memory`) does these steps:
  - makes the base, as `isorite new` does;
  - makes it a git repository of its own, private: you push it where you like (Q95);
  - writes its `AGENTS.md` (below);
  - lists it in `config.toml` as `memory`, lent.
- **Run again,** it says where the memory is and whether it's lent.
- **Its `AGENTS.md`** is the practice the agent follows. It's a draft, yours to change. In short:
  - Memory is for what will be useful in other projects and later sessions: how you like to work, tools and how
    they're set up, mistakes not to repeat, decisions and their reasons.
  - It isn't for what a project's own files or notes already say, and never for secrets.
  - One note for each thing worth keeping, with its why and when it applies, linked to related notes.
  - Look in memory at the start of a task, and before asking you something you may have said before.
  - Update a note that's there rather than writing a second. Delete one that turns out to be wrong.
  - Folders by kind: `you/`, `tools/`, `practice/`, `projects/`.
- **The agent's instructions** (the OpenCode plugin and MCP) get one line: the lent bases by name, and "follow each
  base's practice: brief it first". The memory base's own `AGENTS.md` says how to remember. So you can change the
  practice without a new isorite.
- **Watching it learn:**
  - the memory base open in a tab shows each note the agent reads lit on the Atlas;
  - each note it writes appears there, marked as its own;
  - the timeline holds its changes, each with what you'd asked it (the `asked` it's already given).
  - I don't plan a separate view for this. If the timeline doesn't show it well enough, Q96 asks.

**6. Over MCP** (Claude Code, Pi): the same tools, with `base`, from the same server. A Claude Code session can then
use isorite's memory as well as its own.

## 3. Tests

- **Unit (server):**
  - the `[bases]` table: read, added to as bases are opened, and names deduplicated;
  - `isorite bases`;
  - `isorite memory`: makes the base, its git repository, its `AGENTS.md` and its config entry, and running it again
    changes nothing;
  - `/b/<name>/api/*` reaches that base's engine;
  - `/api/*` reaches the first base;
  - an unknown name is a 404;
  - a lent base opens at the start;
  - the page can't add a path, and setting `lend` only works from this machine.
- **Unit (engine):**
  - `base` on each tool;
  - `memory:` ids, in what tools are given and what they return;
  - a base that isn't lent is refused, in words the agent can act on;
  - `write_note` with `base` writes there, under the agent's name;
  - Iso is refused a write to another base.
- **OpenCode (scripted, as `packages/opencode/test` does now):** the plugin's tools carry `base`, and the
  instruction line names the lent bases.
- **Browser (new `bases.spec.ts`, four projects):**
  - two bases on one server: the switcher lists both, and choosing one shows its notes;
  - Ctrl+click opens a new tab;
  - the lent switch is kept;
  - a scripted agent writes to `memory`, and the memory tab shows the note on its Atlas, marked as the agent's, and
    in its timeline;
  - a citation `memory:…` in Iso's pane opens that base;
  - on a phone, the switcher is in the header on screen.
- **The eval:**
  - one case for Iso, where the answer is in a lent memory base: it has to look there (`base: "memory"`) and
    mustn't write;
  - mid tier, about $0.02.
  - The agent's side is tested with the scripted OpenCode rather than a real model. A real check on a temporary
    copy, once, at about $0.05, is in the order of work.
- **The site:** the guide's public site still has no switcher, and passes as it does.

## 4. The boards

- **`Header-Context`:** the base's name before the path, faint, as the switcher's place and type.
- **`Bases`:** the frames, with their labels in 12px and the faint `ft` titles, for the list of bases.
- **The rest:** the settings menus already in the app (`NoteSettings`) for the list's rows and switches.
- **Screenshots** of the switcher open, on both grounds and on a phone, compared with those before reporting.
- **Named departure:** no board draws a memory base. Its tab is an ordinary base's page.

## 5. Docs and the guide

- **The guide:** a new note, *Several bases, and the agent's memory* (`notes/terminal/memory.md`), with a problem
  note, *Give the agent a memory*, to mark solved. The *isorite term* note links to it.
- **`docs/setup.md`:** the `[bases]` table and `lend`.
- **`docs/terminal.md`:** `isorite memory` and the `base` argument.
- **`isorite help setup`** (`setup-for-agents.md`): the same, for an AI helping you.
- **The README:** a line on the memory.

## 6. Order of work

1. `[bases]` in the config, remembered as bases are opened; `isorite bases`.
2. The server holding several engines: `/b/<name>/`, lent bases opened at the start, and `term` and `mcp` adding a
   base to a running server.
3. `base` on the agent's tools and on Iso's look-ups; `memory:` ids; the plugin's and MCP's instruction line.
4. The switcher in the first pane's header, with `lend` and opening in a new tab; links between bases in the Iso
   pane.
5. `isorite memory` and its `AGENTS.md`.
6. The guide's note and problem, the docs, the eval case, and a real check on a temporary copy (about $0.05, with
   the cost reported).
7. Tests, screenshots against the boards, and a write-up as §8 here. Version 0.8.0.

## 7. Questions

- **Q91: one base per window, or a base per pane?** *Recommended: per window*, with side by side meaning two tabs.
  - A pane showing another base would need the Atlas, a note's links and Iso's context to cross bases, which is
    the cross-base linking rdstudio decided against.
  - Two tabs give you the project and its memory side by side already, each live.
- **Q92: should bases be remembered as you open them?** *Recommended: yes*, under the folder's name in
  `config.toml`. That way the switcher lists what you've used without any setting up.
  - The other choice is listing only bases you name with `isorite bases add`.
  - Either way, the page can switch between listed bases but can't add a path.
- **Q93: does the agent write to memory at once?** *Recommended: yes*, entered and marked as its words, as it writes
  notes in the project now. You undo what you don't want.
  - The alternative is that its memory writes are proposals for you to keep. That's safer, but it would stop the
    learning you liked unless you keep up with it.
- **Q94: may Iso use lent bases?** *Recommended: Iso reads them but writes only in its own base*, so Iso in a
  project knows what the memory knows, and a project's Iso can't change your memory.
  - The other choices are Iso writing to memory as the agent does, or Iso not using other bases at all.
- **Q95: where does the memory live, and as a git repository?** *Recommended: `~/isorite-memory`, named `memory`,
  made a private git repository by `isorite memory`*, as rdstudio's `~/knowledge` was. `isorite memory <folder>`
  puts it elsewhere.
- **Q96: is the timeline enough to watch it learn?** *Recommended: yes for M20*, since it already shows each change
  with what you'd asked. A later view, "what the agent learned this week", could come after you've used it for a
  while.
- **Answered 2026-10-26:** Q91–Q96 as recommended.
- **Not in M20:**
  - links between bases;
  - moving a note from a project up to memory with a command (the agent can read it and write it there);
  - a provider for each base (for keeping a base away from a work gateway);
  - mounting a shared team base read-only (rdstudio's T47).
  - Each of these can follow once you've used several bases.
