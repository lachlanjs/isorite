---
name: "commit-message"
description: "Draft a commit message from the staged changes. Use when the user asks for a commit message, or to commit what is staged. Runs scripts/staged-summary.sh to see the diff's shape first."
---

# Commit message

Draft the message for what is staged, and hand it back to the person to read. Do not commit unless they say so.

## Steps

1. Run `scripts/staged-summary.sh`. It prints the files changed and how much, so the message is about the whole change and not the last file you looked at.
2. Read the diff where the summary is not enough to say what the change does.
3. Write the first line as a plain capitalised sentence in the imperative, under seventy characters. It says what the change does.
4. If why is not obvious from the diff, add a second paragraph that says it. Never list the files: the diff does.

## Follow the base's convention

If the base links to the global base's commit-message convention, read it and follow it over this skill's defaults. A release commit names its version first.
