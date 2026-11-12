# Techniques

How to run each method. Pick by where they stand on the idea (SKILL.md, section 3). Each
entry: when, how, how to check, and the way it goes wrong. The examples are generic; use
their own notes and code instead.

## Concrete case, then rule

When: the idea is new to them.
How: one case they can picture, with numbers. Then the rule, in two or three sentences,
naming the case's parts. Then one question that asks them to apply it to a second case.
Check: they say it back in their words, or handle the second case.
Goes wrong: explaining three ideas at once. Teach one, then ask.

## Worked example with fading

When: a procedure, a derivation, a design they cannot yet produce.
How: 1) you solve a case and say why each step is taken. 2) A similar case with one step
left blank for them. 3) The next with two blanks. 4) A new case, alone. Between rounds, ask
them to say why a step was taken, not only what it was.
Check: the unaided case.
Goes wrong: skipping from 1 to 4; or keeping the blanks when they already do it alone. Then
fade faster or drop to prediction.

## Predict, observe, explain

When: they have some footing and the outcome can be seen: a calculation, a program, a
simulation, a state after a failure.
How: give the setup. They write the prediction, and why. Then show the result (run it,
point to the note, build an explorable). Ask them to reconcile any difference.
Check: the reconciliation is theirs. A wrong prediction followed by a good explanation is
the best evidence you can get.
Goes wrong: showing the result before they commit to a prediction.

## Attempt first (productive failure)

When: they have the prerequisites but not the idea, and the problem has more than one
reasonable design.
How: set a problem slightly beyond them. Let them build whatever they can, including a
design that has a flaw. Do not steer. Then compare their attempt with the standard solution:
what theirs does well, where it costs, what the standard one does about it.
Check: they can say which cost each design pays.
Goes wrong: judging their attempt against one answer. A design that works under other
trade-offs is a result, not an error. Name its trade-off.

## Contrasting cases

When: two ideas keep blurring, or one idea is used where another belongs.
How: two situations that differ in one respect. Ask what differs, and what follows from it.
Then change one respect and ask them to redo it.
Check: the new pair.
Goes wrong: cases that differ in several ways at once.

## Refutation of a misconception

When: they state something that is wrong and firm, or the same slip comes twice.
How: 1) state their belief fairly and say why it is reasonable. 2) Give a case where it
fails. 3) Give the right model in a few sentences. 4) Ask them to restate the model and say
what the belief got wrong. 5) Come back to it cold in a later review.
Check: the restatement, then the later review.
Goes wrong: three rounds of questions around a belief they will not drop. After two, use
the steps above.

## Socratic probing

When: they hold the idea (about 3 to 4) and you want to see whether it holds under pressure.
How: ask for their explanation. Find its thinnest part. Ask a question that makes them use
it: change one thing in the case, ask where it would break, or ask for a case where it
fails.
Check: they defend or correct their own answer.
Goes wrong: a question whose answer they could not reach from what they have seen. That is
a trick. If they have not got it after three rounds, give a hint or explain.

## Self-explanation and teach-back

When: a worked example has just been studied, or a subskill is near level 4.
How: ask them to say why each step happens, or to explain it to someone who has never met
it. Probe the gaps as a newcomer would: "why that step?".
Check: a clear account with an edge case or a changed condition. This is level 5.
Goes wrong: accepting a rehearsed phrase. Change one thing in the case.
In the base: offer their explanation with `offer_text` for the concept note.

## Reading and changing their code (PRIMM)

When: the subject is code they wrote or are writing.
How: Predict what a function does on an input. Run or read it and compare. Investigate: say
why it did that. Modify: ask for one change, and its effect. Make: a small new piece.
Use a `code:` link with the function's name to point at it.
Check: the modification.
Goes wrong: invented examples when their own code has a real one.

## Retrieval, spacing, interleaving

When: a subskill has been learned in an earlier sitting, or the end of a sitting.
How: one cold question, no cues, on an idea from before. Mix subskills in one round. A pass
moves the next review out; a miss lowers the level one step and brings it back the next day.
Check: the cold answer, and whether they needed a prompt.
Goes wrong: asking straight after teaching it, which tests memory of the last minute.

## Calibration

When: a check that decides a level.
How: ask how sure they are, 1 to 3, before they answer. Afterwards compare.
Use: a confident wrong answer deserves a refutation. A hesitant right answer deserves a
second check before you raise the level.

## Choosing and switching

- Begin with the method in the table; change it when two rounds go nowhere.
- A new subskill with no footing: concrete case, then rule. Not a quiz.
- Rising confidence: fewer hints, then no worked blanks, then Socratic probing.
- Confusion about the question: restate; this is the most common cause of a wasted round.
- Tired or frustrated: offer a pause, a different method, or the explanation.
