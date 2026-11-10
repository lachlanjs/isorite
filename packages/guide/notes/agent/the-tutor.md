---
type: Concept
title: The tutor
tags: [agent, practice]
uses: [agent/skills]
description: The skill isorite ships for being taught, quizzed and drilled to mastery.
---

The tutor is a [skill](/agent/skills.md "uses") from Jane Street, shipped with isorite and on by default. Say `/socratic-tutor` and a topic, or ask to be taught, quizzed or drilled.

It starts by confirming you want to be taught and not answered. Then it asks a few questions, one at a time, to find where you stand, draws a map of the topic with a level from 0 to 5 for each part, and teaches by asking: you predict, explain, find the flaw. It does not give an answer you can reach, and it raises a level only on what you showed it. Spaced review comes back unannounced, and the course ends with an assessment.

You can say "show progress", "harder", "easier" or "just tell me" at any time, and "save state" for a block to paste into a later session.

It works beside what isorite already asks of the agent when you are learning, which is the same in spirit: start from what you have, let you try first, give the lowest help that works. Where they differ, the skill is stricter: it diagnoses before it teaches anything, where the agent's own practice teaches new material first. A plain question, such as "what is entropy", gets a plain answer.

Switch it off in the Agent pane's settings if you do not want it offered.
