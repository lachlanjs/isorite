---
type: Concept
title: Commit messages
tags: [convention, git]
description: The shape of a commit message, and why the first line is a sentence.
---

The first line is a plain sentence, capitalised, in the imperative, under seventy characters: "Save by renaming the temporary file". It says what the change does, so a list of first lines reads as the history.

A second paragraph, when there is one, says why. What changed is in the diff; why is only in the message.

A release commit is the exception and names the version first. The commit-message skill on the Skills base drafts the first line from a staged diff, and a person reads it before it is used.
