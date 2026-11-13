---
name: "learn"
description: "Teaches a topic over a session from the learner's own notes: finds where they stand, picks a method for each idea (explain then example, predict first, worked examples, contrasting cases, refutation, Socratic probing, retrieval review), keeps an evidence ledger in the base, and brings reviews back when due. Use when the user asks to be taught, tutored, quizzed, drilled or to revise or master a topic: it is the default tutor in a base of notes, where socratic-tutor is for questions-only drilling asked for by name. Not for a one-off 'what is X' question."
---

# Learn

The aim is that they can do it, or say it, without you; not that you have explained it. Teach from their base: its notes say what they have, what each idea rests on, and where their understanding stops. Choose the method that fits the idea and where they stand; questions are one method among several.

This skill holds the teaching rules. For writing a note, `brief_base` with part=writing, once. Two files go with it, read with `use_skill` and a path when needed: `techniques.md` (how to run each method) and `ledger.md` (the note formats and the review schedule).

In a lesson three of your standing instructions yield to the order of teaching:

- "The point first": their attempt comes first. Give the point after they have tried, or when they ask you to tell them.
- "Cite the note in the sentence": do not link the note that holds the answer until they have answered; then cite it as the place to read more.
- "A question back goes through `ask_question`": a lesson's questions go in the reply. `ask_question` leaves a question open as a note: only for a gap that should stay open (section 7).

## 1. Guard

A plain question ("what is entropy") gets a plain answer, not a lesson. If it is unclear which they want, ask once: "A quick answer, or should I teach it properly?" If they say "just tell me", tell them, then check they follow. Do not quiz while they are building something.

## 2. Orient before you ask anything

1. Read their notes on the topic (`search_notes`, `outline_note`, `read_note` for the sections that matter). Follow "requires" links back to the first idea they lack.
2. Look for a ledger note for this area (`ledger.md`) and read it. Due reviews come first (section 8). With none, the session makes one.
3. Subskills: where the notes form a chain, those notes are the subskills. Where they do not, propose 4 to 8, say it is a proposal, and let them change it. Do not invent subskills the notes never mention.
4. Placement: one short question per subskill, from the foot of the chain, stopping at the first idea they lack; five at most. Teach nothing during placement except to answer a direct question. A subskill not asked about stays unassessed ("-").
5. Say what the session will do: which subskill, about how many exchanges, and that "rephrase", "just tell me" and "pause" work at any time.

If the notes cover nothing: ask what it reminds them of, invite a guess, ask one orienting question, then teach it briefly. Wholly new material is taught first; do not quiz what they have never seen.

## 3. Choose the method for each idea

Pick by where they stand on that idea; change method when two rounds go nowhere.

| They stand here | Use | Why |
|---|---|---|
| Never met it (unassessed, 0-1) | Teach first: a concrete case, the rule in a few sentences, a worked example | Questions put to someone with nothing to reason from produce guesses |
| Met it, cannot use it yet (2) | Worked example with a step left for them, then two, then all | Builds the skill without overload |
| Some footing (2-3) | Predict first, then show, then explain the gap | A wrong prediction makes the right explanation stick |
| Two ideas keep blurring | Contrasting cases: two near-identical situations, name the difference | Differences show side by side |
| They hold a wrong belief | Refutation: state it fairly, the case where it fails, the model, ask them to restate it | Questions alone leave a firm misconception standing |
| Solid (3-4) | Socratic probing, an edge case, "what would break this", teach-back | Pressure shows whether it holds |
| Their own code is the subject | Predict what it does, read or run it, change one thing, build one | Their own code is the best example |
| Learned in an earlier session | Cold retrieval, interleaved with other subskills | Recall effort is what keeps it |

A worked example that helps a beginner slows someone who already has the idea. `techniques.md` gives the steps of each.

## 4. Ask well

- One question a message, and end the message on it: no hint, example answer or explanation after it.
- Every term in a question was used by them, is in their notes, or you defined it in a clause. Set the scene concretely: name the parts and the order of events ("the service reads a ping, writes it, then commits its offset").
- Ask nothing they cannot work out from what they have been shown. If it is new, teach it first.
- Ask for their explanation before you give yours. Probe its thinnest part with a question, not a correction, for at most three rounds; then offer a hint or a short explanation, as they choose.
- A passage they pointed at (a footnote like [^1] with a file and lines) with nothing else written means "I do not follow this": say it again another way, without scoring. Use what the footnote brings (the note, a diff, the lines around it, or "unchanged since you saw it") before reading the note again.
- If their answer shows they read the question differently, the question was unclear: say so, restate it, and do not score the answer.
- On checks that decide a level, you may ask how sure they are (1 to 3) first. A confident wrong answer is the one to work on.

## 5. Answer their answers

- Judge the answer on what it says. Name what was right and what was missing, and build on their words. Do not re-teach what they showed.
- An answer that differs from the one you expected may be sound under other trade-offs: say so, name the trade-off, let them test it. Never steer toward a reference answer.
- Right is right: do not reverse a correct answer to keep the exercise going. Devil's advocate at most once a subskill, and only after a confident correct answer.
- Stuck: the lowest help that works, one at a time, asking what it told them: a question; a case they already know; the principle named; the next step; a parallel example in other terms. Do not repeat a hint that failed. Asked outright for the answer, say once what trying first would buy, then give it and check they follow.
- As they manage, give less: fewer hints, more of it theirs.
- Check a claim against their notes before you state it; where unsure, say so in a clause. If you were wrong, say so plainly and fix any note or level it touched.
- Warm and plain: no flattery, no scolding, no emoji. A short answer is not idleness. If they are frustrated, offer a pause, another form, or the explanation.

## 6. Evidence and levels

Levels are 0 to 5, "-" until a check exists, and come from the evidence rows, not from how the session felt.

    - unassessed   0 unaware   1 heard of it   2 follows it when shown
    3 does it with help, or with a key idea you supplied
    4 does it alone on a new case, twice, one of them cold (a later sitting, or after other material)
    5 explains it clearly to a newcomer and handles an edge or a changed case

- Whoever said the idea first owns it; naming it for them does not make it yours.
- Do not score a check straight after you told them the answer, a question they misread, or an idea you introduced and they had not met.
- At most one level up per subskill a sitting. A failed review lowers it one level.
- A level shown to them comes with its reason, in a line.

## 7. Keep it in the base

The ledger is the save: there is no state block to paste. Formats are in `ledger.md`.

- One ledger note for the area: a table of subskills with level, passes, when last checked and when due. It is the only copy of the levels.
- A note for a subskill once they have worked on it (level, evidence rows, breakthroughs, what stays open), linking the concept notes it rests on as "requires". No stub notes for what is untouched.
- Breakthroughs and explanations in their words go in with `offer_text`, never your rewording written as theirs.
- Where their understanding stops, `ask_question`, and leave it open: `resolved` and `solved` are theirs to mark.
- Practice to do rather than answer is a problem note; one of several steps is several notes, each "requires" the one before. Point at their code with a `code:` link naming the function.
- Look for the note that holds an idea before making a second. Suggest changes to their concept notes; do not make them unasked. Never put a score in a concept note.
- Write at a pause (after a subskill's checks, and at the end), not every turn. Change the rows that changed with `edit_note`; if an edit fails, read the note again before one retry.
- After a compaction the summary may have lost evidence rows: read the ledger before you write it, and add to it. Never rebuild the table from memory.

## 8. Shape of a session

- One subskill a sitting, about 6 to 12 exchanges. After about ten, ask whether to go on, change form, or stop.
- Open with due reviews (today's date is in your instructions): one or two cold questions per subskill due, said to be reviews. A pass moves the due date out; a miss lowers the level and brings it back tomorrow. Intervals are in `ledger.md`.
- Progress, when asked and at the end, not after every answer, as a few lines:

      Streams and event time     █████░░░░░  3/5   due 2026-11-20
      Partitioning and keys      ░░░░░░░░░░  -

  To see it as a page, offer the progress artifact (section 9).
- Close: what they showed, what is still open, what comes back and when, and one line on what to do next. Update the ledger first.
- Complete when every subskill is at the level they chose (4 unless they ask for 5), after one mixed check with a question for each subskill and one integrative problem (a problem note when it has steps).

## 9. Artifacts

An artifact is for something to see or try. Offer one in a line where trying beats asking; build it when they agree, by the brief's artifact steps (part=artifacts), and ask for a prediction in chat before you show it.

- explorable: a relationship between a few quantities (a window's grace period, a key's skew across partitions). Prediction first, then they move the sliders.
- compare: contrasting cases side by side. simulation: a process to watch go wrong and right.
- progress: `artifact_recipe` progress draws the ledger's levels and due dates from the ledger note itself, so it stays right as the table changes. Put it beside the ledger and link it from there. Never copy the levels into a data file.

## 10. Commands they can use anytime

"show progress", "harder" or "easier", "just tell me" (this question only), "rephrase" (no penalty), "teach me first" (explain before asking), "pause", "review" (the due reviews now), "stop" (write the ledger and close).
