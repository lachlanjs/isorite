# isorite: what a fresh session needs to know

Companion to `ISORITE_DOC.md` (what isorite is), `architecture.md` (how the parts fit), `format.md` (what is on disk), `decisions.md` (what was decided and by whom), `taste.md` (the look) and `atlas-layout.md` (how the map is laid out). `history.md` says what each milestone delivered; read it only if asked about the past. This page holds the little that none of those say: where isorite came from, the decisions that stand, how the owner works, and the engineering lessons that each cost an hour or more.

## Where it came from

isorite was written fresh after **rdstudio**, an earlier tool by the same developer (a command-line package with its own Iso loop, a Python core and a study layer, about 230 notes of its own knowledge base). What carried over: the OKF note format, the link kinds, keyword and by-meaning search as two tools, the grid layout of the Atlas, and the habit of testing by text and role. What did not: the Python core (it drifted from the TypeScript one within days and was deleted), the learner model, and the in-note Iso loop, which isorite also built and then retired in M25 in favour of the agent the person already uses.

## Decisions that stand

The owner's, and settled unless they reopen them.

- **The name** is isorite, from *isomorphism* and *dendrite* (2026-10-09). It was free on npm, PyPI, crates.io and as a GitHub user then; `isorite.com` belongs to an unrelated marketplace. No trademark search was made.
- **The look:** one theme, dark and light, following the system; the terminal feel without scan lines; rose is the one hue for failure and destruction; prose stays in Charter, the interface in mono. `taste.md` is the specification.
- **The Atlas** is a grid of blocks and rectangular folders, never a continuous layout. Project work is for managing notes and agent workflows, not for drawing code.
- **Search by meaning is local and bundled:** as much as possible local, to limit the setup asked of the user. Notes only; code embeddings left for later. Three model tiers were dropped with the built-in agent's own loop.
- **The format:** the OKF specification is ground truth; conventions only choose among what it allows. Reports are **artifacts**: HTML files beside the notes, cited from them, never citing back.
- **The history's purpose:** to make the developer more thoughtful about changes to the knowledge base, in more purposeful and logical chunks. A timeline's points need only be in order, not spaced by time.
- **Scope:** the developer workflow and education overlap, and breadth is intended (2026-10-08). Of the two, the product now says "an agentic harness for understanding" and ships the developer route; the learning layer is an idea (`ideas.md`).
- **The agent is yours.** isorite attaches to the agent the person already uses over MCP, and has its own agent beside it. The in-pane route over ACP and `isorite acp` are retired (2026-11-09), and the pane and its code are named Agent (earlier it was Iso: `iso:<model>` stays readable in old journals).
- **Only a person verifies.** No agent tool can mark a question resolved.

## How the developer works

- A task is planned in writing, approved by the developer, then built, then written up. Agents do not start building on their own plan.
- Git: a branch per milestone, a commit per task with a descriptive body, `--no-ff` merge to main, delete the merged branch, and never push, with no remotes, unless told.
- Preferred stack: SvelteKit and TypeScript, a typed backend, a client typed by the same interfaces.
- Markdown is one line per paragraph, never hard-wrapped.

## Engineering lessons

- **Browser tests select by text and role,** not by class. A restyle then needs changes in few suites. Give every streamed state a name a test can wait on.
- **Verify in a browser, in both themes, at 1280 and 390 px, before calling a screen done.** Several defects showed at only one width.
- **Two implementations of one thing drift.** Do not start a second implementation of anything, a terminal's copy of the map included.
- **Exact-text edits from a model fail safe; offsets and line numbers fail silently.** Never show a model's quotation without checking it against the source.
- **A trace or a log must never be able to fail the call it is recording.**
- **A layout cache needs a version number,** bumped whenever the layout changes, or browsers keep the old map.
- **Use the final names for design tokens from the first line;** aliasing old names to new values leaves them in the code for good.
- **`clip-path` for cut corners breaks focus rings and menus:** the cut is painted, not clipped (`taste.md`).
- **Imperative drawing beside a component framework** makes every later change to the map's interface slow: only the map's canvas is imperative here.
- **A fixed status line covers a phone's tab bar** unless hidden there, and a long project name pushes the bar's other parts off at 1280 px: decide which part gives way.
- **Cost should be on the screen every time** an agent is paid for.
