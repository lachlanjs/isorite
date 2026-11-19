# Lenses

A design note. Status: decided 2026-11-11; the first slice is built. On 2026-11-19 the rest was built below the app: every rule, a hidden list for each lens, lens-scoped search, and changing a lens through the engine, HTTP and the agent's `edit_lens`; the same day the app came to change lenses itself.

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

An island's members are its `notes` list (ids as links write them) plus whatever its `match` rules select. The rules are ones the base already answers deterministically: `kind:`, `tag:`, `path:` (a glob), `links-to:` (the notes that link to one) and `linked-from:` (the notes and files one links to; both one hop, any link kind), `type:` (note, picture or code), and a leading `-` negates. Islands nest; a parent shows its own members and its children's. Evaluation is a pure function of the parsed notes and the lens file, so it belongs in core (`lens.ts`), and the engine caches it per revision with the bundle.

An island holds notes unless a `type:` rule says otherwise. `type:picture` or `type:code` alone selects every picture or code file of the base; with other rules it narrows what they select (`["type:code", "path:/src/**"]` is the code in `src`). A file listed in `notes` by its path (`"/src/main.ts"`) is held whatever its kind. A file no island holds is not in the lens: Elsewhere is notes only.

A lens may have its own hidden list, `hidden = ["/src", "/combat/old.md"]` at the top of the file (ids and folders, as `hidden.txt` holds them; a folder hides what is in it). Without the key the lens hides what the base hides, so code kept off the Folders map stays off every lens until a lens says otherwise. Hiding or showing something in one lens from the app or the agent gives that lens a list of its own, starting from the base's; `set_hidden` with null goes back to the base's. A hidden item is in no island and not in Elsewhere. A folder in the list does not hide what the lens names by id in an island's `notes`; an entry that names the item itself does.

## How the Atlas draws a lens

Islands come from folders today (`atlas-layout.md`): a folder of notes is laid out in layers, a folder of folders by floorplan, each seeded from the folder so the same input always places the same way. A lens gives that layout a different tree. Core builds the tree from the lens and the layout runs unchanged, which is why a lens is a view and not a second layout.

Two things are not a tree.

- **A note in several islands.** The first island in file order that holds a note is its home and draws the box. Elsewhere it is a ghost: a small tag, joined to the home by a dotted line and lit with it. Ghosts take no part in routing. File order is the tie-break, so it is stable and the person controls it.
- **A note in no island.** It goes to an implicit last island, "Elsewhere". No note vanishes from a lens, and a lens with a crowded "Elsewhere" shows it is incomplete.

Stability. Each lens is seeded from its own name and island paths, so it is the same every time. Positions are not shared between lenses: switching changes the map, and a note moves. Switching animates each note from its place to its place (`--dur-3`, cut under reduced motion). Pinning positions across lenses is left out. The lens joins the layout's cache key, and `LAYOUT_VERSION` is bumped when the tree is first built from a lens. What a lens hides is not drawn in it (each lens's hidden list, above).

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

`brief_base` still sends the folders' map alone, plus one line naming the lenses. pi and MCP share the tools, so Claude Code sees what pi sees.

- `read_lens`, offered where the base has a lens: without a name it lists them; with one it gives each island (its title, and its name where that differs) with its members' ids in order, ghosts marked, Elsewhere, and the lens's hidden list.
- `search_notes` takes `lens` (what the lens shows in its islands: not Elsewhere, not what it hides) and `island` (one island and those in it; Elsewhere may be named). Where the base has lenses, each hit ends with where it is at home in each lens that shows it, `[tour: find-your-way]`, and a note the base hides is marked `[hidden]`. Nothing is added in a base with neither.
- `edit_lens`, offered always, since a base gets its first lens this way: `lens`, `action` (create, title, add_island, remove_island, add_notes, remove_notes, hide, unhide), `island` (`Name` or `Parent > Name`), `title`, and `notes`, which holds ids, folders (for hide and unhide) and rules: a string with a colon after its key is a rule, which no id can be, and goes to the island's `match`. Making a lens and giving it an island are a call each. A change is written by the engine, journalled under the agent's name with what it was asked, and refused where `agents_write_notes = false`.

The tools are read again for each of pi's prompts, so `read_lens` and the search's two arguments appear from the prompt after a base's first lens is made; that changes the cached prefix once.

## Changing a lens

`Engine.editLens(name, change, who, asked)` makes every change: `create`, `delete`, `rename` (the file, and its journal with it), and core's `LensEdit`s (`lens-edit.ts`): `title` (the lens's, or an island's), `add_island` (in place with `at`, with `notes` and `match`), `remove_island`, `rename_island` (its title stays), `move_island`, `add_notes` (`at` places them, and moves ones already listed), `remove_notes`, `set_match`, `hide`, `unhide`, `set_hidden`. The engine checks that what is added is in the base and writes it as a link writes it. A lens file is journalled as a note is, under `@lens/<name>`, so the timeline shows its changes. The file is written anew in one plain form, so comments in it are not kept; a mistake the change brings is refused, one the file had already is left for the person. The app's route is `POST /api/lens/edit` with `{ name, change }`, behind the same origin and token as a note's save. In the app (`LensSettings.svelte`, the Atlas's settings): a new lens by its title (its file named from it), the shown lens's title, file name and deletion, its islands nested as in the file (renamed, moved among their siblings, one added inside, removed, rules in one plain field), and its hidden list. A note's menu in the list puts a note in an island or takes it out; on the lens's map the blue tag carries a note to another island (it leaves the one it was at home in) or to Elsewhere (taken out). Taking out a note an island holds by a rule adds `-path:/<id>.md` to that island. The grey tag hides in the lens shown, and the map offers "in every lens" (the base's list and each lens with its own). Ctrl+K looks in the lens shown, one island of it, or every note, and says each hit's island.

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

- **Non-Markdown files as items, code hidden by default.** Built 2026-11-19: `type:` rules and files listed by path, with each lens's hidden list (above).
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
3. First rules are `kind`, `tag`, `path`, `links-to` and explicit lists; `linked-from` and `type` come later (built 2026-11-19).
4. A note in no island is a warning in `check`, and `--strict` fails on it.
5. `check --fix` rewrites lens entries from git history, for exact renames only, and only with `--fix`.
6. No in-app editing in the first slice: ship the file, `check` and one drawn lens.
7. Hidden beats a lens, unless the lens lists the item by id. Changed 2026-11-19: each lens has its own hidden list (`hidden` in its file), and the base's list is the Folders lens's and the list of every lens without one. Within a lens its list beats its rules; a folder in it does not hide what the lens lists by id.
8. The name stays "lens", since the M10 pane mode is gone.
9. Added with the first slice: islands, and the notes listed in an island, keep their file order (a lens can be a step-by-step path), and the note list follows that order when the lens is chosen. An island may carry a `title` distinct from its `name` key.
10. Renamed the same day: a folder on the Atlas and a lens's group are both an "island" in what a person sees. The file has `[[islands]]` (nested `[[islands.islands]]`), the tool filter is `island`.

## Decided (2026-11-19)

11. A hidden list for each lens, as decision 7 now says: copied from the base's when a lens first hides or shows something of its own, so later changes to the base's list no longer reach that lens.
12. Search can be narrowed to a lens or an island of it, for the person (`/api/search` and `/api/find` take `lens`, `island` and `all=1`) and the agent (`search_notes`). Without a lens it is every note, as before; the app is told, for each hit, where it is at home in each lens and whether it is hidden.
13. The agent changes a lens with one tool, `edit_lens`, an action a change, offered always; its result is a line. A rule rides in `notes`, to keep the tool short.
14. `folders` names the base's own folders and is not a lens's file. `learning` is the learn skill's lens, and the owner asked that what is learnt live in it alone: making a lens called `learning` (from the agent or the app) also adds the folder `learning` to the base's hidden list and to every lens that has a list of its own, and gives the learning lens an empty list of its own, in one call. So `/learning/**` is off the Folders map, the note list and every other lens, and shown in its islands (`match = ["path:/learning/<goal>/**"]`). The read and write tools reach those notes by id as any other; a search with no lens finds them marked `[hidden]`, one with `lens: learning` finds them unmarked. The lens files' changes are journalled; the base's hidden list, as before, is not.
