# isorite: what is on disk

Format 1. The code that reads and writes each of these is in `packages/core`; the file named beside each heading is the authority where this page and the code disagree.

Changing anything here means converting people's data. Change it on purpose.

## 1. The knowledge base (`bundle.ts`)

A folder of notes in the Open Knowledge Format 0.2, as rdstudio read it. `fixtures/` pins the reading down.

- A note is a Markdown file with YAML frontmatter. `type` is the only required field.
- A link's kind is its Markdown title: `[entropy](/basics/entropy.md "requires")`. The kinds are `requires`, `uses` and `see also`; a link with no title counts as `uses`.
- Links are absolute within the base (`/folder/note.md`).
- A note's id is its path without `.md`: `basics/entropy`.

isorite writes nothing of its own into a knowledge base. No markers for unkept text, no journal, no settings.

## 2. The study base (`study.ts`)

A separate repository beside the knowledge base. Made by `isorite study init <notes>`.

```
isorite.toml
.gitattributes                  *.jsonl merge=union
journal/<note id>.jsonl         section 3
record/<device>.jsonl           section 4
study/<folder>/<name>.md        section 5
drafts/<id>.md                  notes for Iso that are not in the base yet (milestone 2)
```

`isorite.toml`:

```toml
format = 1

[base]
path = "../information-theory"   # the folder of notes, from this folder
remote = ""                      # where to clone it from, on a device that lacks it
root = "9f4def6…"                # its root commit: the same in every clone
```

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
| `why` | `start` (the note's first entry), `edit`, `keep`, `restore`, `external` |
| `before`, `after` | the first 16 hex digits of the SHA-256 of the whole file; `before` is null on `start` |
| `hunks` | line differences from the version before: at line `at` (from 0), remove `del`, add `ins` |
| `text` | the whole file after the change. Present on the first entry, on every 40th change, and whenever the chain before it is broken |
| `proposal` | on `keep`: the proposal that was kept |
| `to` | on `restore`: the entry restored to |

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
- `form: "rewrite"`: `blocks`, a list of `{ "old": {text, nth}, "new": "…" }`. An empty `new` removes the block.
- **A place is the text of a block, never a line number.** `nth` tells apart blocks with identical text. If the note has changed and the place is not found, the proposal is unplaced: shown apart from the text, and still pending.
- A block is a run of lines between blank lines. A fenced code block or a displayed equation is one block. Frontmatter is not a block. (`blocks.ts`)

### `revise` and `discard`

```json
{"id":"…", …,"who":"you","kind":"revise","proposal":"01K7…","text":"my edited version"}
{"id":"…", …,"who":"you","kind":"discard","proposal":"01K7…"}
```

A proposal is pending until a `discard` names it or a `change` with `why: keep` names it.

## 4. The study record (`record.ts`, `understanding.ts`)

One file per device, so two devices never write the same file. One JSON event per line, only ever added. Each has `id` (a ULID), `at`, `device` and `event`. Records merge as a union by id.

| `event` | Fields | Meaning |
|---|---|---|
| `attempt` | `exercise`, `tests` (note ids), `result` (`right`, `partly`, `wrong`), `by` (`iso:<model>` or `you`) | an exercise was marked |
| `wind-back` | `note` | the person lowered Iso's reading of them by one |
| `context-cleared` | | earlier moments of the session are left out of Iso's context (milestone 2) |

**Understanding is not stored.** It is a number from 0 to 6 worked out from these events by `understanding()`:

- right: one level up (half if you marked it yourself); wrong: one down; partly: holds.
- wind-back: one down.
- Evidence at level *n* holds for 1, 3, 7, 16, 35 or 80 days. Past that the note is due. Past twice that it shows one square fewer until tested again.
- The six squares are the level rounded down. The Atlas's four steps are 0, 1 to 2, 3 to 4, and 5 to 6 squares.

The rule can change without converting anything, because only events are on disk.

## 5. Exercises (milestone 4; proposed)

A note in `study/`, read as OKF like any other:

```markdown
---
type: Exercise
kind: written
tests: [basics/entropy, basics/mutual-information]
generated: { by: "iso:anthropic/claude-sonnet-5-5", at: 2026-10-13T09:00:00Z }
---

Show that the entropy of a fair coin is one bit.

## Working

…whatever you write…
```

- `tests` names notes of the knowledge base by id. This is how a study note links to the base; the base never links back.
- **Open:** how the line marked as the answer is recorded. Proposed: it is not in the file at all. Marking a line is part of the `attempt` event, which holds the working as it was and the answer's block as an anchor, so the file stays plain Markdown. To be settled in the plan for milestone 4.

## 6. What is kept outside both repositories

| What | Where (desktop) | Why not in a repository |
|---|---|---|
| provider keys, tier to model | `~/.config/isorite/config.toml` | secrets |
| this device's id | `~/.config/isorite/config.toml` | one per device |
| vectors for search by meaning | `~/.cache/isorite/` | a cache, rebuilt from the notes |
| the embedding model | fetched once into the package | 34 MB |
