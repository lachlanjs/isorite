# isorite

An agentic harness for understanding. See `docs/ISORITE_DOC.md` for what it is to be.

Nothing here is usable yet. Milestone 0 holds the core and the formats.

| | |
|---|---|
| `docs/plan-first-slice.md` | the plan being built |
| `docs/architecture.md` | how the parts fit, built and unbuilt |
| `docs/format.md` | what is on disk |
| `docs/decisions.md` | what was decided |

```sh
npm install
npm test                 # every package
npm run check            # types
npm run fixtures         # the note reader against its conformance fixtures
npm run bench:atlas -- --against bench/baselines/2026-10-11-t117-after.json
node packages/server/src/main.ts check <folder of notes>
node packages/server/src/main.ts study init <folder of notes>
```

Needs Node 24 or later.
