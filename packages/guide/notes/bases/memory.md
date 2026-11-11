---
type: Concept
title: Lending a base, and the agent's memory
tags: [bases, agent, memory]
description: A base lent to every session is one the agent may read and write beyond the project's; one such base is its memory.
---

A server holds several bases at once. A base can be **lent** to every session: [your agent](/agents/your-own-agent.md "uses") may look in it as well as in the base the session is for, by naming it (`base: "memory"`, or a note as `memory:tools/opencode`), and write in it, its words [marked as its own](/editing/every-change-is-kept.md "uses"). A note links to another base's notes only through [the global base](/bases/the-global-base.md "see also").

`isorite memory` makes one such base: `~/isorite-memory`, a private git repository, lent to every session. It is the agent's memory across projects: how you like to work, your tools, what went wrong before. Its [AGENTS.md](/agents/agents-md.md "uses") says what to keep, and is yours to change.

Open it in a tab beside a project's and you watch it learn: what the agent reads there lights on its Atlas, and what it writes appears marked, with what you had asked it.
