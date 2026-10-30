# Milestone 26 (draft): easy to install, set up and start

Begun 2026-10-30 from Lachlan's notes after using isorite at work ("the multiple base functionality is a bit unintuitive and the setup process is quite complex"). This draft holds what is decided so far. The terminal is researched first (`docs/tui-research.md`), because what the terminal is decides how isorite is installed and started.

**Waits for M25** (`docs/plan-m25.md`, 2026-10-30): isorite now attaches to your own agent over MCP and ACP, and Iso's own loop is retired. What's below was decided before that and is to be revised: the gateway and the terminal's install leave isorite's setup, and "`isorite` always opens the terminal" is to be decided again.

## The aims

- **Install:** as easy as it can be.
- **Setup:** as easy as it can be, for two places first: a company machine with no internet, behind an authenticated LLM gateway; and an ordinary machine with OpenRouter and the internet.
- **Startup:** one command, `isorite`, and as few others as possible.
- **The terminal** (after the research): reconsider OpenCode 2, choose what the terminal is built on, and make it look and behave like the web page.

## Decided (2026-10-30)

### The commands

- `isorite` starts isorite, with every base reached from it. It opens the terminal, always.
- `isorite doctor` prints what could help find a fault.
- `isorite help` and `isorite --help` say where isorite is installed, where its settings are, its version, and the few commands, briefly.
- `isorite --version` prints the version.
- The other commands move out of sight or go (proposed below, to confirm).

### Where `isorite` opens

- **A base lives inside its project's repository** (a folder with `.isorite/`, such as `<repo>/notes`). Run in a project, `isorite` opens on that project's base.
- **Outside any project**, it lists the bases this machine knows, the last used first, with "a new base here"; Enter opens the one chosen.
- Two bases may have the same name when they are in different projects: a base is known by its folder, and shown with its project's name where two share one.
- Conversations stay in each base (`.isorite/conversations/`), as they are now.
- isorite's settings stay in `~/.config/isorite/`, listing the bases' folders.

### A machine with no internet

- isorite, its terminal and the model for search by meaning come through **the company's npm mirror, or a mirror of isorite's release files, or both**. Nothing is fetched from anywhere else unless asked.

### The gateway

- Two ways of signing in to a gateway are supported well: **a key in a header**, and **a client certificate** (mTLS). Short-lived tokens are not in scope.

## Proposed, to confirm

- `new`, `example`, `guide`, `memory` and `bases` become things done in the terminal and the page; `model` and the terminal's own install happen by themselves on first use; `check` folds into `doctor`; `migrate` happens when an old base is opened; `mcp` stays for Claude Code and Pi, unlisted.
