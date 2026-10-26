---
type: Concept
title: Several bases, and the agent's memory
description: One isorite holds several bases at once; one lent to every session is the agent's memory.
---

A server can hold several bases at once. Each one you open (`isorite serve`, `term` or `mcp`) is listed, and the base's name before the first pane's name switches between them: one base to a tab, so two tabs show two side by side.

A base can be **lent** to every session: the agent in [the terminal](/terminal/isorite-term.md "uses") and Iso may look in it as well as in the base the session is for, by naming it (`base: "memory"`, or a note as `memory:tools/opencode`). The agent may write in a lent base, its words marked as its own as [Iso's are](/iso/iso-writes-marked.md "uses"); Iso only reads it. Notes don't link from one base to another.

`isorite memory` makes one such base: `~/isorite-memory`, a private git repository, lent to every session. It is the agent's memory across projects: how you like to work, your tools and how they are set up, what went wrong before. Its [AGENTS.md](/iso/agents-md.md "uses") says what to keep and how, and is yours to change.

Open the memory in a tab beside a project's and you watch it learn: what the agent reads there lights on its Atlas, and what it writes appears, marked as its own, with what you had asked it.
