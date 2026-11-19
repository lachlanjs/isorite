# Techniques

How to run each method. Pick by where they stand on the concept (SKILL.md, section 5), and only where it earns its place: a method used for variety costs them a round. Each entry: when, how, how to check, and the way it goes wrong. The examples are generic; use their own notes and code instead.

## Concrete case, then rule

- When: the idea is new to them.
- How: one case they can picture, with numbers. Then the rule, in two or three sentences, naming the case's parts. Then one question that asks them to apply it to a second case.
- Check: they say it back in their words, or handle the second case.
- Goes wrong: explaining three ideas at once. Teach one, then ask.

## Motivate: the problem first

- When: a new concept whose point they cannot yet see, or they ask "why would I need this".
- How: a small case that goes wrong without the idea: the wrong total, the lost event, the proof that will not close. Let them feel the failure, then introduce the idea as what fixes it.
- Check: they can say what problem the idea solves.
- Goes wrong: a long story before the idea. One case, a few lines.

## Analogy

- When: the concept is abstract and has the shape of something they already know.
- How: name the familiar thing, map its parts one to one onto the new one, then say where the analogy breaks. Ask them to use the mapping on one case.
- Check: they apply the new idea where the analogy would mislead.
- Goes wrong: an analogy that brings its own misconception (current as water flow, stopped at pressure). Always say where it stops; drop it once the concept stands on its own.

## Diagram

- When: a structure, a process in steps, a dependency, a state machine: anything with parts and arrows.
- How: a mermaid block in the reply, or in a note when it is worth keeping (isorite draws both). Few boxes, labelled with the glossary's terms. Ask a question that needs the diagram to answer, or ask them to change it.
- Check: they read something off it, or draw the changed case.
- Goes wrong: a diagram as decoration, or one with more boxes than the idea has parts.

## Worked example with fading

- When: a procedure, a derivation, a design they cannot yet produce.
- How: 1) you solve a case and say why each step is taken. 2) A similar case with one step left blank for them. 3) The next with two blanks. 4) A new case, alone. Between rounds, ask them to say why a step was taken, not only what it was.
- Check: the unaided case.
- Goes wrong: skipping from 1 to 4; or keeping the blanks when they already do it alone. Then fade faster or drop to prediction.

## Predict, observe, explain

- When: they have some footing and the outcome can be seen: a calculation, a program, a simulation, a state after a failure.
- How: give the setup. They write the prediction, and why. Then show the result (run it, point to the note, build an explorable). Ask them to reconcile any difference.
- Check: the reconciliation is theirs. A wrong prediction followed by a good explanation is the best evidence you can get.
- Goes wrong: showing the result before they commit to a prediction.

## Attempt first (productive failure)

- When: they have the prerequisites but not the idea, and the problem has more than one reasonable design.
- How: set a problem slightly beyond them. Let them build whatever they can, including a design that has a flaw. Do not steer. Then compare their attempt with the standard solution: what theirs does well, where it costs, what the standard one does about it.
- Check: they can say which cost each design pays.
- Goes wrong: judging their attempt against one answer. A design that works under other trade-offs is a result, not an error. Name its trade-off.

## Rediscover: a chain of reasoning

- When: the conclusion follows from things they already hold, at 2 or 3.
- How: lay out the premises they have. Ask for each step in turn, so that the conclusion is the last step and theirs. Supply a step only when they cannot reach it, and note that you did.
- Check: they can retrace the chain unaided, and say which premise each step used.
- Goes wrong: a chain with a leap in it. Check each step follows from the one before; a leap is where a hint goes.

## Practical task

- When: they follow the idea and need to use it on something real.
- How: a task small enough to do alone, with a result they can check themselves: run this query, compute this by hand, change this function. Say what done looks like. A task with steps is a Problem note per step.
- Check: the result, and their account of why it came out so.
- Goes wrong: a task that needs tools or knowledge they do not have, or one so open they cannot tell when it is done.

## Contrasting cases

- When: two ideas keep blurring, or one idea is used where another belongs.
- How: two situations that differ in one respect. Ask what differs, and what follows from it. Then change one respect and ask them to redo it.
- Check: the new pair.
- Goes wrong: cases that differ in several ways at once.

## Refutation of a misconception

- When: they state something that is wrong and firm, or the same slip comes twice.
- How: 1) state their belief fairly and say why it is reasonable. 2) Give a case where it fails. 3) Give the right model in a few sentences. 4) Ask them to restate the model and say what the belief got wrong. 5) Come back to it cold in a later review.
- Check: the restatement, then the later review.
- Goes wrong: three rounds of questions around a belief they will not drop. After two, use the steps above.

## Find the flaw

- When: they hold the idea (3 or more), or a known pitfall should be met head on.
- How: a worked example or an argument with one mistake in it, built from the concept's pitfall. Say there is a flaw; ask where it is and what the right step is.
- Check: they find it and fix it, and say why it is wrong, not only that it is.
- Goes wrong: more than one flaw, or a flaw in a step they have never seen done right. Teach the right way first.

## Socratic probing

- When: they hold the idea (about 3 to 4) and you want to see whether it holds under pressure.
- How: ask for their explanation. Find its thinnest part. Ask a question that makes them use it: change one thing in the case, ask where it would break, or ask for a case where it fails.
- Check: they defend or correct their own answer.
- Goes wrong: a question whose answer they could not reach from what they have seen. That is a trick. If they have not got it after three rounds, give a hint or explain.

## Self-explanation and teach-back

- When: a worked example has just been studied, or a concept is near level 4.
- How: ask them to say why each step happens, or to explain it to someone who has never met it. Probe the gaps as a newcomer would: "why that step?".
- Check: a clear account with an edge case or a changed condition. This is level 5.
- Goes wrong: accepting a rehearsed phrase. Change one thing in the case.
- In the base: offer their explanation with `offer_text`, to the learner note's Breakthroughs or, if they want it, their own note on the idea.

## Reading and changing their code (PRIMM)

- When: the subject is code they wrote or are writing.
- How: Predict what a function does on an input. Run or read it and compare. Investigate: say why it did that. Modify: ask for one change, and its effect. Make: a small new piece. Use a `code:` link with the function's name to point at it.
- Check: the modification.
- Goes wrong: invented examples when their own code has a real one.

## Retrieval, spacing, interleaving

- When: a concept has been learned in an earlier sitting, or the end of a sitting.
- How: one cold question, no cues, on an idea from before. Mix concepts in one round. A pass moves the next review out; a miss lowers the level one step and brings it back the next day.
- Check: the cold answer, and whether they needed a prompt.
- Goes wrong: asking straight after teaching it, which tests memory of the last minute.

## Hints

- When: they are stuck, or the next step is a leap.
- How: before you give a hint, find in the map what they are missing: a prerequisite, a term, a step. Aim the hint at that, at the lowest rung of the ladder (SKILL.md, section 6) that could work. Check it does not give the answer away, and does not point at a wrong path the wording suggests.
- Check: what the hint told them, in their words, and whether they then take the step.
- Goes wrong: a hint that is the answer in pieces, or one that repeats the explanation that failed. A failed hint means the gap is elsewhere: look one concept lower.

## Calibration

- When: a check that decides a level.
- How: ask how sure they are, 1 to 3, before they answer. Afterwards compare.
- Use: a confident wrong answer deserves a refutation. A hesitant right answer deserves a second check before you raise the level.

## Choosing and switching

- Begin with the method in the table; change it when two rounds go nowhere. A different method is better than the same one said again.
- A new concept with no footing: concrete case, then rule. Not a quiz.
- Rising confidence: fewer hints, then no worked blanks, then Socratic probing.
- Confusion about the question: restate; this is the most common cause of a wasted round.
- Tired or frustrated: offer a pause, a different method, or the explanation.
