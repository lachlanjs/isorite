---
type: Concept
title: Questions and problems
tags: [atlas, questions, problems]
description: A question marks where your understanding stops; a problem is something to do. Both stand beside the notes they are about.
---

Each is a note of its own, with its own `type`, that names the notes it is about.

A **question** is where your understanding stops, written down so it is not lost:

```markdown
---
type: Question
title: Why does leapfrog not drift?
about: [integrators/leapfrog]
---
```

It stands on the Atlas beside those notes until you resolve it: write what you found, and add `resolved:` with the date. Then it leaves the map. Make one by holding on open ground; [the agent](/agents/the-agent-pane.md "see also") may ask you one back. A note can hold one in place: `[[!why-does-leapfrog-not-drift]]`.

A **problem** is an exercise, a calculation, a thing to build, and uses the notes it names (`uses: [integrators/leapfrog]`). You mark it solved yourself, with the mark at the end of its label (◇ unsolved, ◆ solved), which adds `solved:` and the date. Nothing checks it but you. A problem has no steps inside it: one that takes several is several problems, each requiring the one before.

Given a problem, the agent checks your working rather than solving it. A question is sometimes the start of a problem. The things to do in this guide are problems and questions.
