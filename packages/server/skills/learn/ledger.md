# Ledger formats

The ledger is how a session is saved and resumed. Follow the base's own rules for notes
(`brief_base`, part=writing): one idea a note, a title that names it, a description of one
line. Put the notes in the folder the person points at; if there is none, `learning/` next
to the notes the topic rests on.

## The ledger note

One for an area. Type Concept.

    ---
    type: Concept
    title: <Area> learning ledger
    description: Where I stand on each part of <area>, how I know, and when each comes back.
    ---

    Levels: - unassessed, 0 unaware, 1 heard of it, 2 follows it when shown, 3 does it
    with help, 4 does it alone, 5 can teach it.

    | Subskill | Level | Passes | Last checked | Due |
    |---|---|---|---|---|
    | [Streams and event time](/learning/streams-and-event-time.md) | 3 | 1 | 2026-11-12 | 2026-11-13 |
    | Partitioning and keys | - | 0 | | |

    Open: <links to the question notes that mark where understanding stops>.

- A subskill with no note yet is plain text. Link it when its note exists.
- Keep one table. Do not keep the same levels in a second note; copies drift.
- If they ask for a chart, a mermaid `xychart-beta horizontal` beside the table, with the
  table kept as the source.

## A subskill note

Make it when they have worked on it. Type Concept. Link the concept notes it rests on as
"requires" and notes it draws on as "uses".

    ---
    type: Concept
    title: <Subskill>
    description: Level <n>: <the reason in a line>.
    ---

    ## Where I stand

    Level <n>. <Two sentences: what they can do, what they cannot yet.>

    ## Evidence

    | Date | Check | Prompted | Idea first from | Result |
    |---|---|---|---|---|
    | 2026-11-12 | predict: <the case> | no | them | right |
    | 2026-11-12 | explain: <the case> | hint 2 | you | partly: missed <what> |

    ## Still open

    <Links to question notes, or what the next session should test.>

    ## Breakthroughs

    <Offered with offer_text, in their words.>

`offer_text` inserts at the end of a note, so keep Breakthroughs the last section. Link with
a title that says what the link is: `[Keyed state](/streaming/keyed-state.md "requires")`.

Columns:
- Check: the kind (predict, explain, apply, flaw, teach-back, cold, transfer) and the case.
- Prompted: no, or which hint on the ladder.
- Idea first from: them or you. Naming an idea they had already stated is still them.
- Result: right, partly (and what was missing), wrong.

Keep the rows. They are why the level is what it is. If an earlier row was wrong, correct it
in the row and say so in the reply.

## Open questions and practice

- Where their understanding stops: `ask_question`, about the notes concerned. Leave it
  open. `resolved` is theirs to mark.
- Practice for them to do: a Problem note that uses the notes it exercises. A problem of
  several steps is several Problem notes, each linked "requires" to the one before.
- Their own words for a gap in a note: `offer_text`.

## Review schedule

Passes counts successful cold checks in a row. Due date is last checked plus:

| Passes | Next review |
|---|---|
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 21 days |
| 5 or more | 60 days |

A miss: lower the level by one, set passes to 0, due the next day. A subskill at 4 or 5
that has passed its last due date is reviewed first in the next sitting, before new
material. You need today's date to set these. If you do not have it, ask once and write
the dates in full (2026-11-12).

## Closing a session

Update the ledger first, then the subskill notes, then say in the reply: what they showed,
what stays open, what comes back and when. The reply is the record they read; the notes are
the one the next session reads.
