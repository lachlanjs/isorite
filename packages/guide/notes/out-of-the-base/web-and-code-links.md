---
type: Concept
title: Web and code links
description: Links from a note to the web, and to a project's code.
---

A note can link out of the base: to a page on the web, `[The paper](https://arxiv.org/abs/…)`, or to a file of a project's code, by a path from the project's top, `[the step](code:sim/step.py#L40-L52)`, lines and all.

Code links are read against the project's folder, named in the base's `.isorite/settings.toml`, which [isorite term](/terminal/isorite-term.md "see also") sets when it is first run. A link to a file no longer there is shown struck through, and Iso is told once.

On the Atlas, the web and code switches (Alt+W, Alt+K) show them, beside the notes that hold them.

They are [links](/notes/links-and-their-kinds.md "requires"), with no kind: they say where to look, not what rests on what.
