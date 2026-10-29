# isorite: what is on disk

Format 2 (milestone 12). The code that reads and writes each of these is in `packages/core`; the file named beside each heading is the authority where this page and the code disagree.

Changing anything here means converting people's data. Change it on purpose.

## 1. The knowledge base (`bundle.ts`)

A folder of notes in the Open Knowledge Format 0.2, as rdstudio read it. `fixtures/` pins the reading down.

- A note is a Markdown file with YAML frontmatter. `type` is the only required field.
- A link's kind is its Markdown title: `[entropy](/basics/entropy.md "requires")`. The kinds are `requires`, `uses` and `see also`; a link with no title counts as `uses`.
- Links are absolute within the base (`/folder/note.md`).
- A note's id is its path without `.md`: `basics/entropy`.

isorite's own files are in the notes' hidden `.isorite/` folder (section 2) and nowhere else among the notes. No markers for unkept text in a note's file.

## 2. isorite's own files (`own.ts`)

A hidden folder in the notes, committed with them. Made, with its `.gitattributes`, the first time the base is opened.

```
.isorite/
  .gitattributes                  *.jsonl merge=union
  journal/<note id>.jsonl         section 3
  conversations/<id>.jsonl        Iso's conversations
  understanding/<note id>.md      a note's Understanding note, before M24: no longer read or written, left as it was
  drafts/<id>.md                  notes for Iso that are not in the base yet
  record/<device>.jsonl           section 4
  settings.toml                   the base's settings: its repository
```

- **`settings.toml`** has one setting so far: `repository = "../code"`, the folder code links point into, relative to the notes folder (or absolute). `isorite term` writes it, from the folder it runs in, the first time it is run beside the base; after that it is yours to change.

- **A note for Iso** is a draft: `drafts/<id>.md`, an OKF note like any other, whose id is a lower-case ULID. Wherever notes are named it is `@draft/<id>`, and its journal is at `journal/@draft/<id>.jsonl`. When Iso's reply is kept as a note the draft's file is removed and its journal stays.
- **Format 1** kept these in a study base, a separate repository beside the notes with an `isorite.toml`. isorite no longer opens one. `isorite migrate <study base>` copies its journals, conversations, Understanding notes and drafts into `.isorite/`, writes each exercise as a problem note among the notes (its journal following it), and leaves the study record behind. The study base itself is only read. With journals already in `.isorite/` it stops, unless given `--merge`: then journals are united by entry id, as two devices' are.

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
| `kind` | `change`, `proposal`, `revise` or `discard` |

### `change`: the note's file changed

```json
{"id":"01K7…","at":"2026-10-13T09:00:01Z","session":"01K7…","device":"laptop1","who":"you",
 "kind":"change","why":"edit","before":"3f2a…","after":"9c41…",
 "hunks":[{"at":7,"del":["old line"],"ins":["new line"]}]}
```

| Field | |
|---|---|
| `why` | `start` (the note's first entry), `edit`, `keep`, `restore`, `external`, `move` |
| `before`, `after` | the first 16 hex digits of the SHA-256 of the whole file; `before` is null on `start` |
| `hunks` | line differences from the version before: at line `at` (from 0), remove `del`, add `ins` |
| `text` | the whole file after the change. Present on the first entry, on every 40th change, and whenever the chain before it is broken |
| `proposal` | on `keep`: the proposal that was kept |
| `to` | on `restore`: the entry restored to |
| `from` | on `move`: the note's id before. The file is unchanged (`before` = `after`, no hunks); the journal file was moved with the note, from `journal/<from>.jsonl` |

Any earlier version is rebuilt by starting from the nearest `text` before it and applying hunks. A change whose `before` does not match is skipped and reported, never applied.

### `proposal`: Iso's text, not in the file

```json
{"id":"01K7…","at":"…","session":"…","device":"laptop1","who":"iso:anthropic/claude-sonnet-5-5",
 "kind":"proposal","form":"insert","asked":"give the Bethe lattice form",
 "after":{"text":"$$\nG = …\n$$","nth":0},"before":{"text":"In practice …","nth":0},
 "text":"On the Bethe lattice …",
 "cost":{"model":"…","tier":"mid","tokensIn":38200,"tokensOut":410,"tokensCached":30100,"usd":0.012},
 "read":["dmft/weiss-field","dmft/hybridisation-function"]}
```

- `form: "insert"`: new text between the block `after` and the block `before`. Either may be null (the start or the end of the note).
- `form: "rewrite"`: `regions`, a list of `{ "old": {text, nth}, "new": "…" }`. Each `old` is a *passage*: any stretch of the note the person chose, from a few words to several paragraphs, named by its exact text; `nth` tells apart passages with the same text, counted from 0 through the whole file. `new` is put exactly where the passage was; an empty `new` takes it out. Only the passages Iso changed are entered.
- **Each region of a rewrite is settled on its own.** A `change` with `why: keep` and a `discard` may carry `region`, the index of the one region kept or removed; without it they settle every region still open. A rewrite is pending while any region is.
- **What Iso says of a rewrite is a proposal of its own:** an `insert` with the same `asked`, entered straight after it, with no `cost` (the request's cost is on the rewrite). It is kept or discarded like any other text.
- **A place is text, never a line or a character number.** For new text it is the blocks before and after; for a rewrite, the passages themselves. If the note has changed and a place is not found, that proposal or that region is unplaced: shown apart from the text, and still pending.
- Optional on a proposal: `notice`, a sentence for the person (part of the reply was left out; it was cut short); and `copyOf`, on the reply to a note for Iso as it is entered again in the note it became, naming the proposal in the draft's journal. A copy is the same exchange and the same cost, counted once.
- A block is a run of lines between blank lines. A fenced code block or a displayed equation is one block. Frontmatter is not a block. (`blocks.ts`)

### `revise` and `discard`

```json
{"id":"…", …,"who":"you","kind":"revise","proposal":"01K7…","text":"my edited version"}
{"id":"…", …,"who":"you","kind":"revise","proposal":"01K7…","regions":["region one, edited","region two"]}
{"id":"…", …,"who":"you","kind":"discard","proposal":"01K7…","region":1}
{"id":"…", …,"who":"you","kind":"discard","proposal":"01K7…"}
```

A proposal is pending until a `discard` names it or a `change` with `why: keep` names it.

A journal moved in from format 1 may also hold `marks` entries (Iso's marking of an exercise). They are passed over when the journal is read.

## 4. A device's record (`record.ts`)

`.isorite/record/<device>.jsonl`: one file per device, so two devices never write the same file. One JSON event per line, only ever added. Each has `id` (a ULID), `at`, `device` and `event`. Records merge as a union by id.

| `event` | Fields | Meaning |
|---|---|---|
| `context-cleared` | | Iso is no longer sent this session's exchanges from before this event. Nothing is deleted. |
| `iso-unused` | `note`, `session`, `model`, `usd` | a reply that was paid for and offered nothing (a rewrite that changed nothing, an empty reply): counted in what the session cost |
| `iso-turn` | `conversation`, `turn`, `session`, `model`, `usd` | a turn in Iso's pane, and what it cost |

Format 1 also kept what was studied here (`attempt`, `wind-back`, `understood`, `moved`), from which a level of understanding from 0 to 6 was worked out. Format 2 has no such level. `isorite migrate` leaves those events behind.

## 5. Problems and questions

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
| `resolved` (a question), `solved` (a problem) | the day it was resolved or solved; absent while open. Written only by your own switch: a change by Iso or an agent keeps the field as it was |

- **An embed** is `[[!name]]` alone on a line, outside code: `name` is the note's file name without `.md`, or its path (`[[!global/where-is-compactness-used]]`) where two notes share the name. The app draws it as a callout. One that names nothing, or a shared name, is an issue (`embed-broken`).
- An embed counts as an `about` (or `uses`) of the note it is in: a question embedded in a note is about that note.
- Moving a note changes the `about` and `uses` that name it, and the embeds of it, to match.
- **Code and diagrams** are ordinary fenced blocks (M19). A fence named with a language (` ```python `) is coloured by it in the app. One named `mermaid` holds a Mermaid diagram, drawn by the app (with Pele), and is Mermaid in the file like anywhere else; maths in its labels is between `$$` and `$$`, as Mermaid has it.
- **Links out of the base** are ordinary Markdown links. To the web: `[the paper](https://arxiv.org/abs/…)`. To code in the base's repository: `[the step](code:src/sim.py#L40)`, or `#L40-L52` for lines; a path is within the repository, never `..`. A code link whose file is not in the repository is broken: the app strikes it through, and Iso and the terminal's agent are told once, at their next turn.
- **Pictures** (M22) are Markdown images: `![what it shows](hitboxes/player-idle.png)`, the path relative to the note or from the top of the notes (`/art/sprites/player.png`). png, jpg, gif, webp, svg and avif are shown in place; `"left"` as the title sets one at the left with the text beside it, `"centre"` (the default) on its own. Any number of notes may show one picture. A picture pasted or dropped in the app goes in a folder named for the note (`combat/hitboxes.md` puts it in `combat/hitboxes/`), named before it's saved, and the same picture already in the notes is linked rather than copied; a folder that holds only pictures is one item on the Atlas (M23). `![the player](code:assets/player.png)` shows a picture from the repository, and is a code link like any other. A picture no note shows stays: `isorite check <notes> --unused` lists them. The alt text is what Iso and agents read of a picture.
- **Files beside the notes** (M23) are any file of the notes that isn't a note, each of a kind by its extension: an artifact (html), a picture, data (csv, tsv, json, jsonl, parquet, arrow, npy, xlsx, …), a document (pdf, docx, epub, odt, …), or anything else. A note cites one as a link (`[runs](/simulation/runs.csv)`), and a broken one is reported. Each is an item on the Atlas in its folder, joined to the notes that cite it, and opens in the Note pane.
- **Artifacts** (M23) on isorite's kit say so in their head: `<meta name="isorite:kit" content="1">`, and `<meta name="isorite:uses" content="runs.csv">` naming every file it reads, relative to it, with `<title>`, `description`, `author` and `date` as before. The kit (its look, its elements, `window.iso`) is not in the file: isorite gives it when it shows one, in a sandboxed frame that reaches nothing but the files its manifest names, and "standalone" saves one file with the kit and the data inside. `isorite check` checks each by the kit's rules (`packages/kit/context/reference.md`). An HTML file without `isorite:kit` is shown as it is.

## 6. What is kept outside the notes

| What | Where (desktop) | Why not in a repository |
|---|---|---|
| provider keys, tier to model | `~/.config/isorite/config.toml` | secrets |
| this device's id | `~/.config/isorite/config.toml` | one per device |
| vectors for search by meaning | `~/.cache/isorite/vectors-<hash of the notes' folder>.json` | a cache, rebuilt from the notes |
| the embedding model | `packages/server/models/`, fetched by `npm run model` and checked against its SHA-256 | 34 MB |

`config.toml`:

```toml
device = "91d4235f"

[provider]            # OpenRouter unless `url` names another OpenAI-compatible endpoint
key = "…"
# name = "local"
# url = "http://localhost:11434/v1"

[tiers]               # which model each tier is, as the provider names it
# mid = "anthropic/claude-sonnet-5.5"

[prices]              # US dollars a million tokens, in and out, for a provider that does not report cost
# "llama3" = [0, 0]
```
