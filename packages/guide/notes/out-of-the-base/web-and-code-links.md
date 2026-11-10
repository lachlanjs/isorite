---
type: Concept
title: Web and code links
tags: [links, code]
description: Links from a note to the web, and to a project's code.
---

A note can link out of the base: to a page on the web, `[The paper](https://arxiv.org/abs/…)`, or to a file of a project's code, by a path from the project's top, `[the step](code:sim/step.py#L40-L52)`, lines and all.

A link can name a function, method or class instead of its lines, `[the step](code:sim/step.py#leapfrog)`, or `#Body.step` for a method: isorite finds it by name in the file as it is now, so the link holds when the code moves. (It finds them in Python, JavaScript, TypeScript, Go, Rust, Java, C and C++, C#, Kotlin, Swift, PHP and a few more; elsewhere name lines.) Written as a picture, `![the step](code:sim/step.py#leapfrog)`, the code itself is shown in the note, coloured, with the lines it covers today.

A code file that is in the base itself, not in the project it points to, is not a link out but an item in its folder: see [the switches](/atlas/the-switches.md "see also"). It opens in the Note pane as read-only text; a folder of dependencies (`node_modules`) and what the base's top `.gitignore` names are left out, and hiding a file is as hiding a note.

Code links are read against the project's folder, named in the base's `.isorite/settings.toml`, (`repository = "../code"`). A link to a file no longer there, or to a symbol no longer in it, is shown struck through, and the agent is told once, with its next prompt from the pane.

On the Atlas, the web and code switches (Alt+W, Alt+K) show them, beside the notes that hold them.

They are [links](/notes/links-and-their-kinds.md "requires"), with no kind: they say where to look, not what rests on what.
