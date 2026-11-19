# Ledger and learner notes

How a goal is saved and resumed. Follow the base's rules for notes (`brief_base`, part=writing): one idea a note, a title that names it, a description of one line.

## Where they go

- A folder for each goal: `/learning/<goal>/` (lower case, hyphens: `/learning/stream-processing/`). If the person names another place, use it, and match that folder in the island.
- In it: the ledger `ledger.md`, a learner note for each concept, and the progress page if they want one.
- The lens: `learning` (`.isorite/lenses/learning.toml`), one island a goal, holding its folder. The first time, `edit_lens` with lens `learning`, action `create` (title "Learning"); for each goal, action `add_island` with the goal as island, its title, and match `path:/learning/<goal>/**`, so every note written there joins it. Nothing else goes in this lens.
- The `learning` lens is reserved: once it exists, isorite keeps `/learning/` off the Folders map and every other lens, and shows it only here. So search these notes with `search_notes` lens=`learning` (island: the goal), never link them from the person's own notes, and point the person to Learning in the Atlas header.

## The ledger

One for a goal. Type Concept. The level table must be the note's first table: the progress page reads the first table. The glossary is a list, not a table.

    ---
    type: Concept
    title: Stream processing learning ledger
    description: What I want from stream processing, where I stand on each part, and what each term means here.
    ---

    Goal (nebulous): <their words>. Met when: <what they will be able to do>.

    Levels: - unassessed, 0 unaware, 1 heard of it, 2 follows it when shown, 3 does it with help, 4 does it alone on a new case twice, once cold, 5 can teach it.

    | Concept | Level | Passes | Checked | Due |
    |---|---|---|---|---|
    | [Streams and event time](/learning/stream-processing/streams-and-event-time.md) | 3 | 1 | 2026-11-12 | 2026-11-13 |
    | [Keyed state](/learning/stream-processing/keyed-state.md) | - | 0 | | |

    ## Glossary

    - **Event time**: when the event happened, as the event says. Not when it arrived (processing time).

    ## Open

    <Links to question notes that mark where understanding stops.>

- Keep the five columns, named so: the progress page reads them. Rows run from the foot of the map to the goal.
- One table. No second copy of the levels anywhere: copies drift.
- The glossary defines each term once. A term never takes a second sense; if one would, choose another word. Use the glossary's words in every lesson.

## A learner note

One for each concept in the map, written when the map is made. Type Concept. Its title starts "Learning", so it is not taken for the person's note on the idea. Its "requires" links to the learner notes of its prerequisites are the map's edges; its link to the person's note on the idea is "uses".

    ---
    type: Concept
    title: Learning keyed state
    description: Level 2: follows it when shown, has not yet used it on a new case.
    ---

    About [Keyed state](/streaming/keyed-state.md "uses"). Rests on [Streams and event time](/learning/stream-processing/streams-and-event-time.md "requires").

    ## Where I stand

    Level 2. <Two sentences: what they can do, what they cannot yet.>

    ## Pitfalls

    - <A common hurdle on this concept, from the mapping.>

    ## Weak spots

    - 2026-11-12, 2026-11-14: <a slip seen twice, and what it shows is missing>.

    ## Evidence

    | Date | Check | Prompted | Idea first from | Result |
    |---|---|---|---|---|
    | 2026-11-12 | predict: <the case> | no | them | right |
    | 2026-11-12 | explain: <the case> | hint 2 | you | partly: missed <what> |

    ## Breakthroughs

    <Offered with offer_text, in their words.>

- A new learner note has its links, the level "-", and its pitfalls; the rest comes with the first check.
- `offer_text` inserts at the end of a note, so Breakthroughs stays last.
- Check: the kind (predict, explain, apply, flaw, teach-back, cold, transfer) and the case. Prompted: no, or which hint on the ladder. Idea first from: them or you; naming an idea they had already stated is still them. Result: right, partly (and what was missing), wrong.
- Keep the rows: they are why the level is what it is. If a row was wrong, correct it and say so in the reply.
- A weak spot is a slip seen twice. When it stops recurring after a level rises, leave it with a line saying when it stopped.

## The progress page

`artifact_recipe` progress, then `write_artifact` beside the ledger (`/learning/<goal>/progress.html`); the recipe already reads `ledger.md` beside it. It draws the table as it stands whenever it is opened. Link it from the ledger: `[progress](/learning/<goal>/progress.html)`. Never copy the levels into a data file.

## Questions and practice

- Where their understanding stops: `ask_question`, about the notes concerned, left open. `resolved` is theirs to mark.
- Practice for them to do: a Problem note that uses the notes it exercises; one of several steps is several Problem notes, each "requires" the one before. Point at their code with a `code:` link naming the function.

## Review schedule

Passes counts successful cold checks in a row. Due is the day last checked plus:

| Passes | Next review |
|---|---|
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 21 days |
| 5 or more | 60 days |

A miss: the level down one, passes to 0, due the next day. A concept at 4 or 5 past its due date is reviewed first in the next sitting, before new material. Dates are counted from today's date (in your instructions) and written in full (2026-11-12).

## Closing a session

Update the ledger first, then the learner notes, then say in the reply what they showed, what stays open, and what comes back when. The reply is the record they read; the notes are the one the next session reads.
