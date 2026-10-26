# Milestone 16: the tutorial as a knowledge base about isorite

Written 2026-10-26, for approval. Branch `m16-guide`, from `main` at `8ca37f8` (0.4.0).

Lachlan approved the direction on 2026-10-26. The coach-card tutorial is replaced by a knowledge base about isorite
that you explore. Its problem notes are the things to do. The tutorial walk tests went in M15, and nothing here
brings back tests of that cost.

## 1. What is there today

Found by reading the code at `8ca37f8`.

- **The coach card** (`app/src/lib/tutorial/`, 670 lines):
  - `Tutorial.svelte` lays a card over the app.
  - `steps.ts` has seven sections (L1, L2, E1, L3, E2, L4 and the terminal's), and each step waits on a CSS
    selector or an engine event.
  - `tour.svelte.ts` keeps where you are, and `redo.ts` puts the base back for a step.
  - `base.ts` switches between the two example bases by reloading the page.
- **The scripted Iso for the tour** answers only the prompts the steps fill in, word for word. Anything else gets
  "In this tutorial I answer only what it walks you through". It lives in `packages/example/src/tutorial.ts` and
  `tutorial-geometry.ts`.
- **The public site** (`npm run build:tutorial`, `.github/workflows/tutorial.yml`, lachlanjs.github.io/isorite)
  runs the engine in the page over the N-body or the geometry example. A reload starts again.
- **`isorite --tutorial`** writes the N-body example into a folder. It runs the terminal's tour, a plugin in
  OpenCode (`packages/opencode/plugin/tour.ts`), against a scripted model, with the browser's tutorial beside it.

What is wrong with it is in the 2026-10-26 reply:
- It is text laid over the interface.
- It breaks whenever the interface changes.
- Its Iso is a script that can't answer a question.
- It teaches clicks rather than a way of working.

## 2. What M16 does

**The guide: a knowledge base whose subject is isorite.** It's written as Lachlan's own bases are, and isorite is
used to read it:
- It has about twenty Concept notes, one idea each, linked by what they rest on.
- It has about a dozen Problem notes, each `uses:` the concept it practises. Each asks you to do one thing in
  isorite, and you mark it solved yourself, as with any problem (Q72).
- It has a few Question notes. These are questions a newcomer asks, and some are left open on purpose. Resolving
  one is itself a problem.

The guide is read the way isorite asks you to read anything. On the Atlas you see what rests on what, and the
problems tick as you solve them.

**It opens on "Start here".** The note says in a few lines what isorite is and which pane is which, and how to use
the guide. It embeds the first problems (`[[!name]]`), so their ticks show there as well. There is no card and no
overlay. Whether a first-run screen is needed is Q77.

**Iso in the guide.**
- **With a provider set up** (your own `isorite guide`), Iso is the real model, reading the guide with the M15
  prompt. Asking Iso about isorite is then a real part of learning it.
- **Without one** (the public site, or no key), Iso is the guide's finder (Q74). It isn't a model, and says so.
  - **What it answers with:** it searches the guide with the engine's own `search_notes` and reads the best note.
    It replies with that note's description and links to the two or three notes that match best.
  - **Write mode:** it adds one "See also" link to the note you gave it. That's enough to practise seeing Iso's
    words marked and undoing them.
  - **Why it's built this way:** every turn goes through the real engine, so the Context view, the working set and
    undo are the real ones. Only the provider is replaced, as the example's history already does with
    `scriptedHttp`.

**On the public site your work is kept** in the browser, in IndexedDB, until you start again from the guide's
settings (Q73). Today a reload loses it.

**The coach card goes, and so does what serves only it** (§4). The N-body and geometry examples stay. The browser
tests and `isorite example` need them, and the guide's note on questions and problems links to the geometry example
as an example of a base.

## 3. The guide's notes

A draft outline. The notes are short, because the guide is read in the app, beside the thing it describes. Each
problem sits beside its concept, and one marked *local* needs your own isorite, not the site.

- **Start here.** What isorite is: your notes, the Atlas of what rests on what, and Iso. The three panes. How the
  guide works.
  - *Problem: solve this one.* Mark it solved, and see the tick here and on the Atlas.
- **notes/**
  - *A note is Markdown.* Headings, maths with `$…$`, code.
    - *Problem:* write a line of your own in "Your notes", with one word in bold and a formula.
  - *Links and their kinds.* `requires`, `uses`, `see also`, and why the kind matters on the Atlas.
    - *Problem:* link "Your notes" to a guide note, as `requires`.
  - *A note's details.* type, title, description, tags.
  - *Folders.*
    - *Problem:* make a note in a folder of your own, move it, then delete it.
  - *Every change is kept.* The timeline, and whose words are whose.
    - *Problem:* go back to an earlier version of "Your notes" and restore it.
- **atlas/**
  - *The Atlas.* What rests on what. Trunks, and folders that close and open in place.
  - *The switches.* Each pane's header switches, after "Switches, not modes".
    - *Problem:* find what "Iso's context" rests on, from the Atlas only, and open it.
- **iso/**
  - *Iso.* An agent that reads your base. Ask, write and build, by switches.
    - *Problem:* ask Iso what a problem note is for.
  - *What Iso is sent.* The Context view: given and read, age-off, briefings. From M15.
    - *Problem:* give Iso a note and a passage, then switch one off in the Context view.
  - *Iso writes, marked.* Its words are marked, and every turn can be undone.
    - *Problem:* let Iso write, see its words marked, and undo the turn.
  - *AGENTS.md.* Your base's instructions, for Iso and the terminal's agent alike.
    - *Problem (local):* write an AGENTS.md for your base.
  - *Tiers.* low, mid and max, and what each costs.
- **questions-and-problems/**
  - *Questions.* Where your understanding ends, pinned beside the notes they're about. Embeds.
    - *Problem:* write a question about a guide note you found unclear, and embed it there.
  - *Problems.* Things to do. You mark them solved, and Iso checks rather than solves.
  - *How Iso reads you.* Understanding notes.
  - *Question (left open): why are links Markdown links rather than `[[wikilinks]]`?*
    - *Problem:* resolve it, with an answer in your own words.
- **out-of-the-base/**
  - *Web and code links.* A note's links to the web and to a repository's code.
- **terminal/**
  - *isorite term.* The agent in OpenCode with your notes as its tools, followed in Iso's pane in Build mode.
    - *Problem (local):* run `isorite term` on a project, and watch it from the browser.
- **your-own-base/**
  - *Starting a base.* `isorite new`, a provider and its key, a gateway. Links to `docs/setup.md` on GitHub.
  - *Keeping a base well.* One idea per note, link by what it rests on, your words first. This is the same advice
    as the PRACTICE and LEARNING layers of Iso's prompt, and a test keeps the two agreeing (§5).

**Where the guide lives:**
- **The notes:** `packages/guide/notes/`, a package of its own, so the npm package carries it.
- **The finder:** `packages/guide/src/finder.ts`.
- **Writing it out:** `writeGuide(folder)` writes the notes and an empty `.isorite/`. The guide has no made-up
  history, so a fresh copy has an empty timeline, and that's honest.

## 4. How it is served, and what goes

**The public site.** `npm run build:tutorial` becomes `npm run build:guide`, built into `site/` as now:
- **What runs in the page:** the engine over the guide, kept in IndexedDB, with the finder as its provider.
- **`tutorial.yml`** builds it instead of the tutorial. It still deploys on a push to `main`.

**`isorite guide [<folder>]`** writes the guide into a folder, or reuses one already there, and serves it as any
base is served:
- **Iso:** with your provider if `config.toml` has one, and the finder if not.
- **`isorite --tutorial`:** kept as another name for it, so the old instructions still work.

**What is deleted:**
- `app/src/lib/tutorial/` (the card, steps, tour, redo and base switching), and the layout's hook for it.
- The `tutorial` flag in the session (`api.ts`, `engine.ts`, `serve.ts`).
- `packages/example/src/tutorial.ts` and `tutorial-geometry.ts`, the scripted answers for the tour. The example's
  history keeps its own script in `history.ts` and `geometry.ts`.
- The terminal's tour (Q75):
  - `packages/opencode/plugin/tour.ts`;
  - `packages/opencode/src/tutorial.ts` and its `tutorial/` code;
  - `tutorialTerm` in `server/src/term.ts`;
  - their tests, `tour.test.ts` and `tutorial.test.ts`.

  The guide's terminal note replaces them, with its local problem.
- `app/tests/static.ts`, if only the tutorial uses it. `build.spec.ts` comes over to the guide (§5).

## 5. Tests and checks

All of these are cheap. None walks the app step by step.

- **The guide as a base** (unit, `packages/guide/test`):
  - every note loads with core, with its kind and title;
  - no link is broken;
  - every problem `uses:` a concept, and every concept is reachable from Start here along links;
  - Start here embeds problems that exist.
- **The guide and Iso's prompt agree:** the words the PRACTICE and LEARNING layers insist on are in "Keeping a base
  well". This is the same kind of test as M15's check that the base layer's example loads.
- **The finder** (unit):
  - a question about the context view finds "What Iso is sent";
  - Write mode adds one link, which is marked Iso's and undone by the turn's undo;
  - it says it's not a model.
- **The site** (browser, one spec on the guide's build, about four tests):
  - it opens on Start here with the Atlas beside it;
  - marking the first problem solved ticks it in Start here and on the Atlas;
  - a reload keeps it, and starting again clears it;
  - asking the finder answers with a link.
- **`isorite guide`** (server unit):
  - it writes the guide;
  - run a second time, it keeps what you changed;
  - with no provider, Iso is the finder.
- **Real model, once:** on a temporary copy of the guide, low tier, three questions about isorite asked of Iso,
  each read for whether the answer comes from the guide's notes. Expected around $0.02, and the cost reported. No
  eval run is needed, since the prompt doesn't change. One eval case, "answers about isorite from the base it's
  given", is added and run on its own with `--only`, for about $0.02.
- **The rest:** `npm test`, `npm run check` and the browser tests all pass. The svelte-autofixer is run on every
  changed `.svelte` file.

## 6. Order of work

1. **The guide's notes**, in `packages/guide`, with the base tests. They're Markdown: Lachlan can read them in
   isorite from the branch (`isorite serve packages/guide/notes`) before any app code changes. That's the mockup
   this time (Q76).
2. **The finder**, with its tests.
3. **`isorite guide`**, with `--tutorial` as another name for it.
4. **The site**: the engine over IndexedDB, starting again from the guide's settings, `build:guide`, the workflow,
   and the browser spec.
5. **The removals** (§4), and the docs: `setup.md`, `terminal.md`, `architecture.md` and the README's tutorial
   line.
6. **The real-model check**, then the write-up as §8 here, and version 0.5.0.

## 7. Questions

- **Q72: solved by you only?** You mark problems solved, as isorite asks of any problem. The app doesn't check
  that you did the thing, so no selectors come back. With a real model, giving Iso a problem gets its CHECKING
  rules as now. *Recommended: yes, by you only.*
- **Q73: keep your work on the public site?** In the browser (IndexedDB), with "start again" in the guide's
  settings. *Recommended: yes.*
- **Q74: the finder as Iso without a model?** The other choice is to switch Iso off on the site, with a link to
  setting up a provider. *Recommended: the finder.* It lets the Context view, the marking of Iso's words and undo
  be tried with no key, and it says plainly that it isn't a model.
- **Q75: retire the terminal's tour?** The OpenCode plugin tour and `isorite --tutorial`'s scripted terminal go.
  The guide's terminal note, with its local problem, takes their place. *Recommended: retire it.* It is the other
  half of the coach-card format, with the same problems.
- **Q76: the notes first, as the mockup?** Step 1 ends with the notes on the branch for you to read in isorite,
  before steps 2–6. The alternative is a page on the refinement artifact. *Recommended: the notes themselves.*
- **Q77: a first-run screen?** One screen naming the three panes and their headers, shown once. Or none, with
  Start here saying it. *Recommended: none to begin with.* It can be added if reading the guide shows a need.
