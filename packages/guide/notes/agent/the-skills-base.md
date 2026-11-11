---
type: Concept
title: The skills base
tags: [agent, instructions, bases]
description: Your skills opened as a base, a folder each, with SKILL.md as a note and scripts as items.
---

The skills base is your [skills](/agent/skills.md "uses") folder, `~/.local/share/isorite/skills/`, opened as a base. It is the second name in the base switcher, under [the global base](/terminal/the-global-base.md "see also").

Each skill is an island. Its `SKILL.md` is a note, named by the `name` in its header and described by its `description`. Its scripts and other files are items on the island, and code and files are shown from the first.

The skills isorite ships are in an island called `built-in`. They are there to read, and to copy from; they cannot be changed here.

Editing a `SKILL.md` changes what the agent loads: skills are read again at each prompt. To make a skill, use New island in the note list, or the Atlas's tag that makes an island, and a folder with a `SKILL.md` to fill in appears.

Once you have a skill of your own, the agent can look in the skills base too, with `base: "skills"`.
