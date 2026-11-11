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
