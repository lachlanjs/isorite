---
type: Concept
title: Skills
tags: [agents, instructions]
description: A skill is a folder with a SKILL.md that isorite's own agent loads when a request matches, or when you name it.
---

A skill is a folder with a file named `SKILL.md`: a name and a description in its header, then instructions. It is the format Claude Code, pi and others share, so a skill written for one works in another.

The agent is told only each skill's name and description. When your request matches one, it fetches the instructions then, so a skill you never use costs a line, not a page. Start a message with `/` and the skills that are on are offered; `/socratic-tutor teach me entropy` loads it for that turn.

Skills come from three places, and a later one replaces an earlier one of the same name:

- **Built in.** isorite ships [the tutor](/agents/the-tutor.md "see also").
- **Yours**, for every base: a folder under `~/.local/share/isorite/skills/`, which you can read and edit as notes in [the skills base](/bases/the-skills-base.md "see also").
- **This base's**: a folder under `.isorite/skills/`, which goes with the base if you commit it.

The Agent pane's settings list every skill, where it is from, and a switch. A skill missing its description is skipped and listed with the reason. Skills are for isorite's own agent; an agent you attach over MCP has its own.
