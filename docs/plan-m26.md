# Milestone 26: easy to install, set up and start

Begun 2026-10-30 from Lachlan's notes after using isorite at work ("the multiple base functionality is a bit unintuitive and the setup process is quite complex"). Revised 2026-11-01, after M25 (isorite 0.13.0): isorite calls no model and builds no terminal, so what was decided on 2026-10-30 about the gateway, the terminal's install and "`isorite` always opens the terminal" is dropped. What is left is the three phases below, and the aim that each takes the fewest steps a person can be asked for.

Approved 2026-11-01 (Q1–Q7 as recommended). Built on `m26-install`, version 0.14.0; write-up in §Built.

## Where a new person is lost now

Read from the README (0.13.0) and `packages/server/src/main.ts`: to ask a first question a person runs the installer, `isorite --version`, `isorite doctor`, `isorite new` (or finds a folder), sets a key for an agent they set up elsewhere, runs `isorite serve <path>`, and then chooses an agent from a list in the page. Particular snags:

- `isorite serve <folder>` needs a path, and nothing says which folder. A base inside a repository (the common case) is found by hand.
- The agent gets the environment of the terminal `isorite serve` was started in, so a key set in another terminal shows as "Authentication required", the most likely first failure.
- The commands are `check`, `new`, `serve`, `guide`, `mcp`, `acp`, `model`, `memory`, `bases`, `doctor`, `example` and `migrate`, with `term` and `opencode` answering that they are retired. Most are one-off. `mcp` and `acp` are not for people at all: front ends run them.
- Several bases are "a bit unintuitive": a base is a folder you must name every time; `bases` and `memory` are separate commands; the switcher is the base's name in the first pane.

## The aims

- **Install:** one command, ending by saying the next command. Nothing else to install first for the one-file install; a mirror-only route stays documented for a machine with no internet.
- **Startup:** one command, `isorite`, from any folder. It finds what to open, starts, and opens the browser.
- **Setup:** with an agent already working in its own terminal, nothing to configure: isorite finds it, says what it found, and asks once.
- **Fewer commands:** a person is shown four (`isorite`, `isorite doctor`, `isorite help`, `isorite --version`). The rest stay working and unlisted.

## Decided already (2026-10-30, still standing)

- A base lives inside its project's repository (a folder with `.isorite/`). Two bases may have the same name in different projects: a base is known by its folder and shown with its project's name where two share one. Conversations stay in each base; settings in `~/.config/isorite/`, listing the bases' folders.
- A machine with no internet gets isorite, and the model for search by meaning, through the company's npm mirror or a mirror of the release files. Nothing else is fetched unless asked.

## Proposed

### Startup: `isorite`

1. **Inside a project** (the folder or a parent holds a base, `.isorite/`): start that base, print the link, open the browser. `isorite serve <path>` stays as the explicit form and is what `isorite` calls.
2. **Inside a repository with no base:** say so, and offer to make `notes/` there (what `isorite new notes` does), once, y/N.
3. **Outside any project:** list the bases this machine knows, last used first, then "a new base here" and "the guide"; Enter on a number. One base per tab stays; the switcher in the page shows bases by project name.
4. **Nothing known at all** (first ever run): `isorite` offers the guide, since reading it is the quickest way to see what the thing is.
5. `isorite --no-open` for a remote machine; the link and the ssh port-forward line (as `serve` prints them now) are kept.

### Setup: the agent

- On start, look for agents on `PATH` (`claude`, `codex`, `opencode`, `omp`, `hermes`) and for the keys they read (`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, …). Iso's empty pane says what it found: "Claude Code is installed, and ANTHROPIC_API_KEY is set here. Use it?" Nothing found: the registry list, as now.
- The environment snag is told before it bites: when a chosen agent needs a key that this terminal doesn't have, the pane says "not set in the terminal isorite was started from", with the one line to fix it, instead of "Authentication required".
- The choice is kept per base (as now) and offered for new bases on the same machine.
- `isorite doctor` takes over `check` and `migrate`'s reporting: it names what's wrong in a base, and an old base is migrated when opened (it asks once).

### Install

- Both installers end with "Now run: isorite" and nothing else to read.
- `npm install -g isorite` and the mirror route keep their sections; the README's install part is cut to the two lines a person types, with the rest under "other ways".
- `isorite model` (the 53 MB model for search by meaning) is fetched on first use after asking, not by a command to remember; offline, search by words works and says why.
- First run unpacks the one-file executable "in a few seconds": say so when it happens.

### The commands

| Shown | Kept, unlisted | Folded away |
| --- | --- | --- |
| `isorite`, `doctor`, `help`, `--version` | `serve`, `new`, `example`, `guide`, `memory`, `bases`, `model`, `mcp`, `acp` | `check` and `migrate` into `doctor` and opening an old base; the retired `term` and `opencode` answer in `doctor --report` only |

`memory` and `bases` become part of the page and of the `isorite` list (memory is a base like another, lent to sessions). The commands stay for scripts, `mcp` and `acp` for front ends.

### Several bases, less unintuitive

- `isorite` lists bases by project and name, not by path; each one's last-used time is shown.
- The page's switcher shows the project's name and marks which bases are lent to the agent (memory).
- A new base is made from the list, in the page or the terminal, with the folder it will live in shown.

## Tern (looked at 2026-11-01, 0.9.8 beta, Linux)

Not part of this milestone; what it changes for it. Read from the binary's own text (a 200 MB native program with its changelog inside) and not run, so its behaviour is not checked.

- **It is an ACP and MCP host.** Tern opens agent CLIs typed in a pane "as ACP chats", lets you add your own agents, and hands MCP servers to the agents' sessions (`mcpServers`). So `isorite acp --agent "<your agent>" <base>` can be added to it as an agent, and isorite's MCP as a server: the same two doors as for Toad and Zed, with nothing built for Tern.
- **It has browser blocks on Linux** (WPE WebKit or WebKitGTK) and a `tern open` command, so isorite's page can sit beside the agent in one window.
- **Plugins are Luau** (`plugin.toml`; blocks, lenses, commands), able to run programs and make network requests. Whether a plugin block can draw a web page is not shown in the text; a plugin would be worth writing only if it can.
- **Closed beta**, source not public. So: the recipe goes in `docs/terminal.md` once it has been tried in a running Tern; no plugin yet.

## Steps

1. **`isorite` with no arguments:** find the base (cwd upward), the cases above, the browser opened; `--no-open`. Tests on temporary folders and a fake `PATH`.
2. **The list:** known bases by project and name, last used first; make one; the guide; Enter.
3. **Agent found:** detection of agents and keys on `PATH` and in the environment; Iso's empty pane offers what it found; the missing-key message. Browser tests with a scripted agent.
4. **Commands:** the help shows four; the rest answer as now; `check` and `migrate` fold into `doctor` and into opening an old base.
5. **Install:** both installers end with the next command; the model fetched on first use; the README's install cut down; `docs/setup.md` and the guide's "Starting a base" follow.
6. **Stale M25 leftovers** (found 2026-11-01): `docs/architecture.md` §Two ways in and `docs/format.md`'s `settings.toml` still describe `isorite term`; `eval/iso/` cases and README name `npm run eval:iso`, which M25 deleted.
7. **Walked through** on a machine without isorite's source (a scratch user or container): the README's steps typed as written, timed, every snag noted in the write-up.

Version 0.14.0.

## Questions

- **Q1.** `isorite` with no arguments starts and opens the browser (today it prints help). OK? (Recommended: yes; `isorite help` keeps the help.)
- **Q2.** Offer to make `notes/` in a repository with no base, y/N, on first start. (Recommended: yes.)
- **Q3.** Look for agents on `PATH` and for their keys in the environment, only to say what was found; nothing is stored, nothing is sent. (Recommended: yes.)
- **Q4.** Fetch the 53 MB model on first use, after asking, not by `isorite model`. (Recommended: yes; `isorite model` stays.)
- **Q5.** Fold `memory` and `bases` into the page and the `isorite` list, keeping the commands unlisted. (Recommended: yes.)
- **Q6.** Steps 6 and 7 (stale leftovers; a clean-machine walk-through) are part of this milestone. (Recommended: yes.)
- **Q7.** Tern: only the recipe in `docs/terminal.md` after it is tried in a running Tern, no plugin yet. (Recommended: yes.)

## Built (2026-11-01)

Steps 1–6 are done; step 7 was done in part.

- **Step 1–2, `isorite` alone** (`start.ts`, `main.ts`): `findBase` looks for `.isorite/` from the folder up to the repository's top (or the folder alone outside one), then in the folders just inside that top; one found is opened, several are asked about. In a repository with none, `notes/` is offered; elsewhere the known bases are listed last used first (`used` in `bases.toml`, set whenever a base is opened) with a new base here and the guide; with nothing known, the guide is offered. The server starts on the first free port from 4767 and the browser is opened, unless over SSH, `--no-open` or `ISORITE_NO_BROWSER=1`. Piped or in a script it prints the help as before. Two bases of one name are told apart by their project in the list.
- **Step 3, agents found** (`detect.ts`, `/api/acp/detected`, `AttachAgent.svelte`): Claude Code, Codex, OpenCode, omp and Hermes are looked for on PATH, with whether the key each reads is set where isorite started (names only, from this machine only); the empty pane lists them with *use it*. Claude's key missing is said to be fine if signed in. An agent that stops with its key unset is told as that (`hint`).
- **Step 4, the commands:** `isorite help` shows four; `isorite help all` and any unknown command show the full list; every command still works. `doctor` has a `links` line (what `check` said) and, run in a project with no folder named, checks that project's base. **Deviation:** `migrate` is not folded into opening an old base; opening one still refuses and names `isorite migrate <folder>` as before. Asking inline and migrating is left for a later change.
- **Step 5, install:** both installers end with `now run: isorite`; the model is offered once on the first start without it (a no is kept in the cache folder as `model-declined`); the README, `docs/setup.md`, `docs/terminal.md` and the guide's Starting a base begin with `isorite` alone.
- **Step 6, leftovers:** architecture.md's retired M6 terminal bullets, format.md's `isorite term`, and `eval/iso/` (the retired Iso's cases; their runner was deleted in M25) are gone or corrected.
- **Step 7, the walk-through, in part:** the real `isorite` was driven through a pseudo-terminal in a scratch home and a repository with no base: it offered `notes/`, made it, registered it with a `used` time and printed the link. **Not done:** a clean machine or container with the installers and a real agent (nothing here has Docker or a second user set up), the model offer through a pseudo-terminal (a model was found in this checkout, so it was not asked; `offerModel` is tested alone), the browser actually opening, and the pane's list of found agents in a real browser (the existing attach spec passes; no new browser test, since the test server's PATH is not under the test's control).

Tests: 88 server unit tests (7 for startup, 3 for detection, 1 for the model offer, 1 for doctor's links), 317 core, the rest unchanged and green; `npm run check` clean; the attach browser spec green. The full browser suite and the site tests were not run.

Tern: nothing built, as agreed (Q7). The recipe for `docs/terminal.md` waits for you to try isorite as an agent in a running Tern.
