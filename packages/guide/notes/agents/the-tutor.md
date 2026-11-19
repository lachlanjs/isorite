---
type: Concept
title: The tutor
tags: [agents, skills, practice]
uses: [agents/skills]
description: The skill isorite ships for being taught, quizzed and drilled to mastery.
---

The tutor is a [skill](/agents/skills.md "uses") from Jane Street, shipped with isorite and on by default. Say `/socratic-tutor` and a topic, or ask to be taught, quizzed or drilled.

It starts by confirming you want to be taught and not answered. It asks a few questions, one at a time, to find where you stand, draws a map of the topic with a level from 0 to 5 for each part, and teaches by asking: you predict, explain, find the flaw. It does not give an answer you can reach, and raises a level only on what you showed it. Spaced review comes back unannounced, and the course ends with an assessment.

Say "show progress", "harder", "easier" or "just tell me" at any time, and "save state" for a block to paste into a later session. A plain question, such as "what is entropy", still gets a plain answer. Switch it off in the Agent pane's settings if you do not want it offered.

`/learn` is isorite's own tutor, built to work from your notes. It asks what you want to be able to do, maps the ideas that rests on and which comes before which, and asks you once, in one message, a few questions to place you. Then it teaches the first idea you lack, choosing a method for each: a case and the rule for what is new, a prediction first for what you half know, a worked example, an analogy or a diagram, two cases side by side, a flawed example to find the flaw in, questions for what you hold firmly. Say `/learn` and a topic. It is the one the agent reaches for when you ask to be taught in a base of notes; `/socratic-tutor` stays for drilling by questions alone, when you name it.

What it learns about you goes in notes of its own, never in yours: a folder `learning/<goal>/` with a ledger (the goal, a table of each idea's level and when it comes back for review, and a glossary of the terms it uses) and a small note for each idea, with the evidence for its level, your breakthroughs in your words, and the slips that keep recurring. Each of those notes "requires" the ones for the ideas it rests on. They live in the `learning` [lens](/atlas/lenses.md "see also"), each goal an island of its own: pick Learning in the Atlas header to see them. They stay off your folders and your other lenses, and nothing in your own notes links to them. Ask to see your progress and it can make a page beside the ledger that draws the table, read from the note each time the page opens. The agent knows today's date, so it sets and keeps the review dates without asking. There is no state to save: say "where were we", or "resume" and the goal, and it reads the ledger. Say "show progress", "harder", "easier", "just tell me", "rephrase", "teach me first", "review", "pause" or "stop" at any time.
