---
name: "explain-like-a-reviewer"
description: "Explain a change the way a reviewer needs it: what it does, why, and where to look hardest. Use when the user asks to explain, summarise or walk through a diff or a pull request."
---

# Explain like a reviewer

Read the whole change before explaining any of it. Then say, in this order:

1. **What it does**, in one or two sentences a person who has not seen the code could follow.
2. **Why**, if the change or the message says; if not, say you could not tell.
3. **Where to look hardest**: the lines that carry the risk, with their file and line. Use `checklist.txt` to decide what is risky.
4. **What it leaves alone**, so the reviewer knows what was not checked.

Do not praise the change and do not pad it. If something looks wrong, say so plainly and say what you would check. Never claim the tests pass unless you ran them.
