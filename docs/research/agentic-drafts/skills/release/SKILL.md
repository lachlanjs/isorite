---
name: release
description: Prepare and cut an isorite release: check, set the version, commit in the project's message style, tag. Use when the owner asks to release, bump the version, or "ship 0.x.y".
disable-model-invocation: true
---

Follow `docs/release.md`; this is its working checklist for the agent. Never push, tag or merge without the owner saying so in this conversation.

1. State of the tree: `git status --short` and `git branch --show-current`. Releases are made from `main`. List untracked large files (recordings, gifs, screenshots) and ask whether they belong in the commit; do not `git add -A`.
2. Pick the version: `node scripts/version.ts` prints the current one. A patch for a fix or small change, a minor for a new feature (the history: 0.21.0 was hide notes and search; 0.21.1 to 0.21.4 were refinements). Ask the owner if unsure.
3. Gate, in this order, stopping at the first failure (a release has failed on a type error in a test and in `packages/example`):
   - `npm run check` (about 2 minutes)
   - `npm test` (slow; `packages/core/test/atlas.test.js` is the long one)
   - `npm run test:browser` if `app/` changed (needs port 4799 free)
   - `npm run fixtures` if `packages/core`'s reader changed
   Use the `verifier` subagent for the first two and report only failures.
4. Set the version: `node scripts/version.ts X.Y.Z`.
5. Docs that move with a release: the guide notes in `packages/guide/notes/` for anything a person now sees differently; `docs/plan-m*.md` or `docs/ideas.md` if a plan item is done or an idea was taken up.
6. Commit with the message `isorite X.Y.Z: <what changed for the person, as lowercase clauses separated by commas>`; look at `git log --format=%s -8` for the length and tone. If this release repairs the last one, say so at the end in brackets, as in `(0.21.4's release failed on them)`.
7. Show the owner the tag and push commands from `docs/release.md` (`git tag vX.Y.Z && git push origin main vX.Y.Z`) and stop. After the push they approve the `release` environment on GitHub and the staged version on npmjs.com with 2FA; remind them of both.
8. After they confirm: `npm view isorite version` and `npx isorite@X.Y.Z --version`.
