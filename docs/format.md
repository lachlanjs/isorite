# isorite: what is on disk

Format 1. The code that reads and writes each of these is in `packages/core`; the file named beside each heading is the authority where this page and the code disagree.

Changing anything here means converting people's data. Change it on purpose.

## 1. The knowledge base (`bundle.ts`)

A folder of notes in the Open Knowledge Format 0.2, as rdstudio read it. `fixtures/` pins the reading down.

- A note is a Markdown file with YAML frontmatter. `type` is the only required field.
- A link's kind is its Markdown title: `[entropy](/basics/entropy.md "requires")`. The kinds are `requires`, `uses` and `see also`; a link with no title counts as `uses`.
- Links are absolute within the base (`/folder/note.md`).
- A note's id is its path without `.md`: `basics/entropy`.

When there is a study base, isorite writes nothing of its own into the knowledge base. No markers for unkept text, no journal, no settings.

**Project mode (later, proposed).** A knowledge base opened with no study base keeps its notes' journals in itself, at `.isorite/journal/<note id>.jsonl`, in the form of section 3. Whether that folder is committed is open.

## 2. The study base (`study.ts`)

A separate repository beside the knowledge base. Made by `isorite study init <notes>`.

```
isorite.toml
.gitattributes                  *.jsonl merge=union
journal/<note id>.jsonl         section 3
record/<device>.jsonl           section 4
study/<folder>/<name>.md        section 5
drafts/<id>.md                  notes for Iso that are not in the base yet
```

`isorite.toml`:

```toml
format = 1

[base]
path = "../information-theory"   # the folder of notes, from this folder
remote = ""                      # where to clone it from, on a device that lacks it
root = "9f4def6…"                # its root commit: the same in every clone
```

- **A note for Iso** is a draft: `drafts/<id>.md`, an OKF note like any other, whose id is a lower-case ULID. Wherever notes are named it is `@draft/<id>`, and its journal is at `journal/@draft/<id>.jsonl`. When Iso's reply is kept as a note the draft's file is removed and its journal stays.
- **A study folder** is the folder under `study/` with the same path as a folder of the knowledge base. `study/basics/` studies `basics/`. `study/` itself studies the root.
- Wherever the two bases are spoken of together, a study note's id is prefixed: `@study/basics/entropy-of-a-coin`. Its journal is at `journal/@study/basics/entropy-of-a-coin.jsonl`.

## 3. The journal (`journal.ts`)

One file per note. One JSON object per line. Lines are only ever added.

Every entry has:

| Field | |
|---|---|
| `id` | a ULID: time, then randomness. Entries are ordered by it. |
| `at` | ISO 8601, UTC, to the second |
| `session` | the id of the session's first entry. A session ends after 30 minutes with no entry anywhere in the study base. |
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

### `marks`

```json
{"id":"…", …,"who":"iso:openrouter/anthropic/claude-sonnet-5.5","kind":"marks","answer":{"text":"So H = 1 bit.","nth":0},"result":"partly",
 "marks":[{"passage":{"text":"two outcomes, each with probability 1/2","nth":0},"mark":"right"},{"passage":{"text":"So H = 1 bit.","nth":0},"mark":"wrong"}],
 "dropped":0,"cost":{…}}
```

Iso's marking of an exercise, in the exercise's journal. Never written into the file. The newest is laid over the working; a passage edited since loses its mark. `dropped` counts passages Iso quoted that were not in the working.

## 4. The study record (`record.ts`, `understanding.ts`)

One file per device, so two devices never write the same file. One JSON event per line, only ever added. Each has `id` (a ULID), `at`, `device` and `event`. Records merge as a union by id.

| `event` | Fields | Meaning |
|---|---|---|
| `attempt` | `exercise` (its id in the study base), `tests` (note ids), `result` (`right`, `partly`, `wrong`), `by` (`iso:<model>` or `you`), `moves`, `answer`, `working`, `marks` | an exercise was marked (below) |
| `wind-back` | `note` | the person lowered Iso's reading of them by one |
| `moved` | `from`, `to` | a note was moved: what the events before it say of `from` is said of `to` |
| `context-cleared` | | Iso is no longer sent this session's exchanges from before this event. Nothing is deleted. |
| `iso-unused` | `note`, `session`, `model`, `usd` | a reply that was paid for and offered nothing (a rewrite that changed nothing, an empty reply): counted in what the session cost |

**Understanding is not stored.** It is a number from 0 to 6 worked out from these events by `understanding()`:

- an attempt: each note it tests moves by the move Iso judged for it (−1, −½, 0, +½ or +1), and counts as tested then. The result moves nothing by itself. An attempt without `moves` moves nothing.
- wind-back: one down.
- Evidence at level *n* holds for 1, 3, 7, 16, 35 or 80 days. Past that the note is due. Past twice that it shows one square fewer until tested again.
- The six squares are the level rounded down. The Atlas's four steps are 0, 1 to 2, 3 to 4, and 5 to 6 squares.

The rule can change without converting anything, because only events are on disk.

An `attempt`, as milestone 4 writes it:

```json
{"id":"…","at":"…","device":"91d4235f","event":"attempt","exercise":"Fundamentals/entropy-of-a-coin",
 "tests":["Fundamentals/entropy"],"result":"partly","by":"iso:openrouter/anthropic/claude-sonnet-5.5",
 "moves":{"Fundamentals/entropy":{"by":0.5,"why":"Right definition, but needed one hint to sum over both outcomes."}},
 "answer":{"text":"So H = 1 bit.","nth":0},"working":"…the working as it was sent…","marks":"01K7…"}
```

- `moves` has one entry for each note in `tests`: Iso's judgement of how far the attempt is evidence of a change in understanding, weighing its accuracy, the guidance it needed and how closely the note bears on the exercise, with a reason in a line.
- `answer` is the passage marked as the answer, any selection of the working, named as a rewrite names its passages (`{text, nth}` through the whole file).
- `marks` names the `marks` entry in the exercise's journal (section 3).

## 5. Exercises (milestone 4)

A note in `study/`, read as OKF like any other:

```markdown
---
type: Exercise
kind: written
title: The entropy of a fair coin
tests: [basics/entropy, basics/mutual-information]
next: basics/entropy-of-a-die
generated: { by: "iso:anthropic/claude-sonnet-5-5", at: 2026-10-13T09:00:00Z }
---

Show that the entropy of a fair coin is one bit.

## Working

…whatever you write…
```

- `tests` names notes of the knowledge base by id. This is how a study note links to the base; the base never links back.
- `next`, optional, names the exercise that follows this one in teaching order, by its id in the study base.
- The question is the text before `## Working`; the working is everything after it.
- **The answer is not in the file.** It is any selection of the working, held by the app until the exercise is sent for marking, and then kept in the `attempt` event with the working as it was (section 4). Iso's marks are a `marks` entry in the exercise's journal (section 3).

## 6. What is kept outside both repositories

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
