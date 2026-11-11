# Lenses

A design note. Status: decided 2026-11-11; the first slice is built, in-app editing and the follow-ups are not.

The owner's idea was to drop real directories and declare folders and notes per lens, with a pipeline keeping links and folders in step. The owner then decided the other way round: real directories stay the source of truth and the default view, and declared views, called lenses, layer on top. This note says what that means and what it costs.

M10 once had "lenses" that were display modes of a pane (normal, Iso, understand); M12 replaced them with switches (`archive/plan-m12.md`). The word is free again and means something else here: a lens groups notes, and is never a mode of a pane.

A folder on the Atlas, and the group a lens declares, are both called an island in anything a person sees. In code and in this note's older text a folder is still a folder.

## What a lens is

A lens is a named, declared grouping of the base's notes into nested islands. The real folders are the implicit lens, called "Folders". It is always there, it is the default, and it is edited by moving files, as now.

On disk a lens is `.isorite/lenses/<name>.toml`, committed with the notes. Not among the notes, because a lens is not a note and the notes stay plain OKF (`format.md`). Not in `settings.toml`, because a file each merges cleanly in git.

```toml
title = "By kind"
[[islands]]
name = "Open questions"
match = ["kind:question", "kind:problem"]

[[islands]]
name = "Combat"
notes = ["/combat/hitboxes.md", "/design/damage.md"]
match = ["path:/combat/**", "tag:combat", "links-to:/combat/index.md"]
[[islands.islands]]
name = "Weapons"
match = ["path:/combat/weapons/**"]
```

An island's members are its `notes` list (ids as links write them) plus whatever its `match` rules select. The rules are ones the base already answers deterministically: `kind:`, `tag:`, `path:` (a glob), `links-to:` and `linked-from:` (one hop, any link kind), and a leading `-` negates. Islands nest; a parent shows its own members and its children's. Evaluation is a pure function of the parsed notes and the lens file, so it belongs in core (`lens.ts`), and the engine caches it per revision with the bundle.

## How the Atlas draws a lens

Islands come from folders today (`atlas-layout.md`): a folder of notes is laid out in layers, a folder of folders by floorplan, each seeded from the folder so the same input always places the same way. A lens gives that layout a different tree. Core builds the tree from the lens and the layout runs unchanged, which is why a lens is a view and not a second layout.

Two things are not a tree.

- **A note in several islands.** The first island in file order that holds a note is its home and draws the box. Elsewhere it is a ghost: a small tag, joined to the home by a dotted line and lit with it. Ghosts take no part in routing. File order is the tie-break, so it is stable and the person controls it.
- **A note in no island.** It goes to an implicit last island, "Elsewhere". No note vanishes from a lens, and a lens with a crowded "Elsewhere" shows it is incomplete.

Stability. Each lens is seeded from its own name and island paths, so it is the same every time. Positions are not shared between lenses: switching changes the map, and a note moves. Switching animates each note from its place to its place (`--dur-3`, cut under reduced motion). Pinning positions across lenses is left out. The lens joins the layout's cache key, and `LAYOUT_VERSION` is bumped when the tree is first built from a lens. Hidden stays hidden in every lens.

## Renames and moves

`engine.moveNote` and `moveFolder` already rewrite the links to a moved note and move its journal. They are where lenses keep step: the same call rewrites `notes` entries and `path:` rules that name the old id (a folder move by prefix). A glob that still matches is left alone; one that no longer matches is reported, never guessed. It goes through the engine so the revision moves, and the lens file's journal says why.

A move made outside isorite (`git mv`, an editor, an agent's shell) is the gap. Two answers:

- On open, the engine checks lens ids against the notes. A dangling entry shows in the lens as a dim "gone" line. In a repository, `git log --follow` can offer the fix.
- `isorite check` exists (`--unused`, `--fix`) and gains lens checks: dangling entries, rules that match nothing, empty or duplicate islands, notes in no island (a warning; `--strict` fails). `--fix` rewrites entries for exact renames git reports. It exits 1 on a problem, so it gates a pipeline.

```yaml
# .github/workflows/base.yml
name: base
on:
  pull_request:
    paths: ["notes/**"]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npx isorite check notes
```

```yaml
# .gitlab-ci.yml
base:
  image: node:24
  variables: { GIT_DEPTH: "0" }
  rules:
    - changes: ["notes/**/*"]
  script: npx isorite check notes
```

## What the agent and MCP see

`brief_base` still sends the folders' map alone, plus one line naming the lenses. A new read tool, `read_lens(name)`, returns islands with member ids, and search and listing take an optional `lens` and `island`. pi and MCP share the tools, so Claude Code sees what pi sees. An agent edits a lens file through the same write route as a note, journalled with who and what was asked, and `agents_write_notes = false` covers it. A lens is a short TOML file and its diff is what the person reviews, so it gets no special tool.

## What it costs

Rough days.

- Format, parse and evaluate in core, with fixtures: 3.
- Layout from a tree, ghosts, "Elsewhere", cache key, the 1,200-note benchmark: 4.
- Engine cache, move rewriting, dangling detection: 3.
- `check` lens rules, `--fix` from git, CI examples in `docs/setup.md`: 2.
- App: Atlas switch, sidebar list, islands and ghosts, animation, four-project tests, guide note: 6.
- Agent and MCP tools with scripted-model tests: 2.
- Editing lenses in the app: 5, deferrable. A lens is a file at first.

About 20 days, 25 with editing. The first slice worth having (format, check, one lens drawn) is about 9.

## What it risks

- Two truths: a lens naming `/a/b.md` and the file can disagree after any outside move. `check` contains this and does not remove it.
- A second map to learn. The Atlas is valued for matching the folders; a lens that drifts weakens that. Folders stays first and default.
- A rule language grows. The list above is closed, and a new rule needs a decision.
- Ghosts on a large base may clutter.

## The planned follow-ups

- **Non-Markdown files as items, code hidden by default.** Hidden is how code stays off the map. Rules gain `type:` (note, picture, code). Recommend hidden wins unless a lens lists the item by id, not by glob.
- **A global base and a skills base.** Each base has its own `.isorite/lenses/`, and ids are base-relative, so a lens never names another base's notes. A `base:` prefix could come later; it is left out now.

## Deliberately left out

- A lens that moves files or changes folders.
- Notes without a real file.
- Position pinning across lenses, per-person lenses outside the base, lens composition, lenses by meaning search, lenses as a permission boundary for the agent.
- Any non-deterministic rule, and any rule over text.
- A lens as a base's default.

## Decided (2026-11-11)

1. A lens lives in `.isorite/lenses/<name>.toml`, one merging file each, and notes stay plain.
2. Ghosts, with the home being the first island in file order that holds the note.
3. First rules are `kind`, `tag`, `path`, `links-to` and explicit lists; `linked-from` and `type` come later.
4. A note in no island is a warning in `check`, and `--strict` fails on it.
5. `check --fix` rewrites lens entries from git history, for exact renames only, and only with `--fix`.
6. No in-app editing in the first slice: ship the file, `check` and one drawn lens.
7. Hidden beats a lens, unless the lens lists the item by id.
8. The name stays "lens", since the M10 pane mode is gone.
9. Added with the first slice: islands, and the notes listed in an island, keep their file order (a lens can be a step-by-step path), and the note list follows that order when the lens is chosen. An island may carry a `title` distinct from its `name` key.
10. Renamed the same day: a folder on the Atlas and a lens's group are both an "island" in what a person sees. The file has `[[islands]]` (nested `[[islands.islands]]`), the tool filter is `island`.
