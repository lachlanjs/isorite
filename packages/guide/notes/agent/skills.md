---
type: Concept
title: Skills
tags: [agent, instructions]
description: A skill is a folder with a SKILL.md that isorite's own agent loads when a request matches, or when you name it.
---

A skill is a folder with a file named `SKILL.md`: a name and a description in its header, then instructions. It is the format Claude Code, pi and others share, so a skill written for one works in another.

The agent is told only each skill's name and description. When your request matches one, it fetches the instructions then, so a skill you never use costs a line, not a page. Start a message with `/` and the skills that are on are offered; `/socratic-tutor teach me entropy` loads it for that turn whether the agent would have chosen it or not.

Skills come from three places, and a later one replaces an earlier one of the same name:

- **Built in.** isorite ships [the tutor](/agent/the-tutor.md "see also").
- **Yours**, for every base: a folder under `~/.local/share/isorite/skills/`.
- **This base's**: a folder under `.isorite/skills/` inside it, which goes with the base if you commit it.

A skill that is missing its description, or is not readable, is skipped and listed with the reason. The Agent pane's settings list every skill with where it is from and a switch; one you switch off is not offered and not loaded. What is off is kept in the base.

The agent reads a skill's other files through the skill, never from the disk: it can read what is in that folder and nothing outside it. You can read and edit your own skills as notes in [the skills base](/agent/the-skills-base.md "see also"). Skills are for isorite's own agent; an agent you attach over MCP has its own.
