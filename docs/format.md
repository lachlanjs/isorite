# isorite: what is on disk

Format 2. The code that reads and writes each of these is in `packages/core`; the file named beside each heading is the authority where this page and the code disagree.

Changing anything here means converting people's data. Change it on purpose.

## 1. The knowledge base (`bundle.ts`)

A folder of notes in the Open Knowledge Format 0.2, as rdstudio read it. `fixtures/` pins the reading down.

- A note is a Markdown file with YAML frontmatter. `type` is the only required field.
- A link's kind is its Markdown title: `[entropy](/basics/entropy.md "requires")`. The kinds are `requires`, `uses` and `see also`; a link with no title counts as `uses`.
- Links are absolute within the base (`/folder/note.md`).
- A note's id is its path without `.md`: `basics/entropy`.

isorite's own files are in the notes' hidden `.isorite/` folder (section 2) and nowhere else among the notes. A note's file holds only what is the person's or the agent's to say: no markers, no metadata of isorite's own beyond what the note itself states.

## 2. isorite's own files (`own.ts`)

A hidden folder in the notes. Made, with its `.gitattributes`, the first time the base is opened.

In a project shared with people who may not use isorite, it can be kept apart from the project's repository (M27). isorite runs no git to do it: it asks once, per machine (`history` in `bases.toml`: `project` or `separate`), when a base is initialised (`isorite new` at a terminal) or first opened in the app (the drawer's *where isorite's files are kept*), and gives the commands to copy: `git init` in `.isorite/`, its line in the project's `.git/info/exclude`, a first commit, and later a remote. Where the project already tracks `.isorite/`, the commands also untrack it. `isorite doctor` shows the same. The default is as before: with the project.

```
.isorite/
  .gitattributes                  *.jsonl merge=union
  journal/<note id>.jsonl         section 3
  conversations/<id>.jsonl        agent sessions as isorite kept them (and conversations from before M25, read only)
  settings.toml                   the base's settings: its repository
  hidden.txt                      the notes and folders kept off the Atlas and the list, one id a line (merged by lines)
```

- **`settings.toml`** has one setting so far: `repository = "../code"`, the folder code links point into, relative to the notes folder (or absolute). isorite writes it, from the folder an agent is first attached in beside the base; after that it is yours to change.

- **Older files.** A base may still hold `drafts/`, `understanding/` and `record/` from earlier versions. isorite no longer reads or writes them; they can be deleted. A study base of format 1 (a separate repository beside the notes) is no longer opened.

## 3. The journal (`journal.ts`)

One file per note. One JSON object per line. Lines are only ever added.

Every entry has:

| Field | |
|---|---|
| `id` | a ULID: time, then randomness. Entries are ordered by it. |
| `at` | ISO 8601, UTC, to the second |
| `session` | the id of the session's first entry. A session ends after 30 minutes with no entry anywhere in `.isorite/`. |
| `device` | 4 to 16 lower-case letters and digits |
| `who` | `you`, `iso:<model>`, `agent:<name>`, or `external` |
| `kind` | `change` |

### `change`: the note's file changed

```json
{"id":"01K7…","at":"2026-10-13T09:00:01Z","session":"01K7…","device":"laptop1","who":"you",
 "kind":"change","why":"edit","before":"3f2a…","after":"9c41…",
 "hunks":[{"at":7,"del":["old line"],"ins":["new line"]}]}
```

| Field | |
|---|---|
| `why` | `start` (the note's first entry), `edit`, `restore`, `external`, `move` (and `keep`, in journals from before M25) |
| `before`, `after` | the first 16 hex digits of the SHA-256 of the whole file; `before` is null on `start` |
| `hunks` | line differences from the version before: at line `at` (from 0), remove `del`, add `ins` |
| `text` | the whole file after the change. Present on the first entry, on every 40th change, and whenever the chain before it is broken |
| `asked` | on a change an agent made: what it was asked |
| `to` | on `restore`: the entry restored to |
| `from` | on `move`: the note's id before. The file is unchanged (`before` = `after`, no hunks); the journal file was moved with the note, from `journal/<from>.jsonl` |

Any earlier version is rebuilt by starting from the nearest `text` before it and applying hunks. A change whose `before` does not match is skipped and reported, never applied.

### Older entries

Before M25 a journal also held `proposal`, `revise` and `discard` entries (the built-in agent's text offered for a note, and what became of it), and one moved in from format 1 may hold `marks`. Nothing writes them now; they are skipped when a journal is read, and the changes replay as before.

## 4. Problems and questions

A problem or an open question is a note of the base, in any folder; section 1's rules hold for them as for any note. Its kind is its OKF `type` (`kinds.ts`).

```markdown
---
type: Question
title: Where is compactness used?
about: [global/gauss-bonnet]
resolved: 2026-10-25
---

The proof never says.
```

| Field | |
|---|---|
| `type` | `Question` or `Problem` (any case) |
| `about` (a question), `uses` (a problem) | the notes it is about or uses, by id; one, or a list |
| `resolved` (a question), `solved` (a problem) | the day it was resolved or solved; absent while open. Written only by your own switch: a change by an agent keeps the field as it was |

- **An embed** is `[[!name]]` alone on a line, outside code: `name` is the note's file name without `.md`, or its path (`[[!global/where-is-compactness-used]]`) where two notes share the name. The app draws it as a callout. One that names nothing, or a shared name, is an issue (`embed-broken`).
- An embed counts as an `about` (or `uses`) of the note it is in: a question embedded in a note is about that note.
- Moving a note changes the `about` and `uses` that name it, and the embeds of it, to match.
- **Code and diagrams** are ordinary fenced blocks (M19). A fence named with a language (` ```python `) is coloured by it in the app. One named `mermaid` holds a Mermaid diagram, drawn by the app (with Pele), and is Mermaid in the file like anywhere else; maths in its labels is between `$$` and `$$`, as Mermaid has it.
- **Links out of the base** are ordinary Markdown links. To the web: `[the paper](https://arxiv.org/abs/…)`. To code in the base's repository: `[the step](code:src/sim.py#L40)`, or `#L40-L52` for lines; a path is within the repository, never `..`. A code link whose file is not in the repository is broken: the app strikes it through, and the agent is told once, at its next turn.
- **Pictures** (M22) are Markdown images: `![what it shows](hitboxes/player-idle.png)`, the path relative to the note or from the top of the notes (`/art/sprites/player.png`). png, jpg, gif, webp, svg and avif are shown in place; `"left"` as the title sets one at the left with the text beside it, `"centre"` (the default) on its own. Any number of notes may show one picture. A picture pasted or dropped on a note in the app is saved beside it (the note's folder), under the name it came with made safe (lower case, `-` for anything outside a-z, 0-9, `.`, `_`, `-`; a pasted one is named for the minute it was pasted) and counted up where taken (`shot.png`, `shot-2.png`), and a link to it is put in at the cursor or the drop; dropped on a note on the Atlas, it is linked at the end of that note, and on a region's bare ground only saved there. Only png, jpeg, gif and webp are taken, read by their bytes, up to 5 MB, from this machine; it is a file item like any other (M23), journalled under its own path in `journal/<path>.jsonl` by one `start` entry whose `after` is the first 16 characters of the file's SHA-256 (no text, no hunks: a picture has no versions to go back to). Pictures saved before this release sit in a folder named for their note and stay where they are. `![the player](code:assets/player.png)` shows a picture from the repository, and is a code link like any other. A picture no note shows stays: `isorite check <notes> --unused` lists them. The alt text is what an agent reads of a picture.
- **Files beside the notes** (M23) are any file of the notes that isn't a note, each of a kind by its extension: an artifact (html), a picture, data (csv, tsv, json, jsonl, parquet, arrow, npy, xlsx, …), a document (pdf, docx, epub, odt, …), code (ts, py, rs, sh, css, yaml, toml and the like: read as text, shown read-only), or anything else. `node_modules`, `__pycache__`, dotfiles, a file over 20 MB and what the base's top `.gitignore` names (simple patterns: a name, `dir/`, `*.ext`, `/path`) are not files of the base, and a note is never left out by a `.gitignore`. A note cites one as a link (`[runs](/simulation/runs.csv)`), and a broken one is reported. Each is an item on the Atlas in its folder, joined to the notes that cite it, and opens in the Note pane.
- **Artifacts** (M23) on isorite's kit say so in their head: `<meta name="isorite:kit" content="1">`, and `<meta name="isorite:uses" content="runs.csv">` naming every file it reads, relative to it, with `<title>`, `description`, `author` and `date` as before. The kit (its look, its elements, `window.iso`) is not in the file: isorite gives it when it shows one, in a sandboxed frame that reaches nothing but the files its manifest names, and "standalone" saves one file with the kit and the data inside. `isorite check` checks each by the kit's rules (`packages/kit/context/reference.md`). An HTML file without `isorite:kit` is shown as it is.

## 5. What is kept outside the notes

| What | Where (desktop) | Why not in a repository |
|---|---|---|
| this device's id, the bases it knows | `~/.config/isorite/config.toml`, `bases.toml` beside it | one per device |
| vectors for search by meaning | `~/.cache/isorite/vectors-<hash of the notes' folder>.json` | a cache, rebuilt from the notes |
| the embedding model | `packages/server/models/`, fetched by `npm run model` and checked against its SHA-256 | 34 MB |

`config.toml` holds the device's id (`device = "91d4235f"`) and, for isorite's own agent, its provider and key (readable by the user only); see `docs/setup.md`.
