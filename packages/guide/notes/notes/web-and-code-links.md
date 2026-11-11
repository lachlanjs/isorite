---
type: Concept
title: Web and code links
tags: [notes, links, code]
description: Links from a note to the web, and to a project's code.
---

A note can link out of the base: to the web, `[The paper](https://arxiv.org/abs/…)`, or to a file of a project's code, by a path from the project's top, `[the step](code:sim/step.py#L40-L52)`.

A code link can name a function, method or class instead of lines, `[the step](code:sim/step.py#leapfrog)` or `#Body.step`: isorite finds it by name in the file as it is now, so the link holds when the code moves (in Python, JavaScript, TypeScript, Go, Rust, Java, C and C++, C#, Kotlin, Swift, PHP and a few more). Written as a picture, `![the step](code:sim/step.py#leapfrog)`, the code itself is shown, coloured.

Code links are read against the project's folder, set in the base's `.isorite/settings.toml` (`repository = "../code"`). A link to a file or symbol no longer there is struck through, and the agent is told once.

On the Atlas, the web and code switches show them beside the notes that hold them. A code file in the base itself is not a link out but an item in its island: see [the switches](/general/the-switches.md "see also").

They are [links](/notes/links-and-their-kinds.md "requires") with no kind: they say where to look, not what rests on what.
