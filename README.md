# isorite

An agentic harness for understanding. See `docs/ISORITE_DOC.md` for what it is to be.

Milestones 1 and 2: a base can be opened in the browser and notes written in it, with every edit entered in the note's journal, and Iso can be asked for text at a point, for a rewrite of chosen paragraphs, or for a whole note. The Atlas and study are not built yet.

| | |
|---|---|
| `docs/plan-first-slice.md` | the plan being built |
| `docs/plan-m1.md`, `docs/plan-m2.md` | each milestone: what was built and what was not checked |
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

npm run build            # the app, into app/build
npm run serve -- <study base, or folder of notes>     # then open http://localhost:4767/
npm run test:browser     # the app in Chromium, at two widths on both grounds
npm run model            # fetch the 34 MB model for search by meaning (once)
npm run bench:retrieval -- <folder of notes> <questions.json>
```

Iso needs a provider key: set it in the app, behind the logo. It is kept in `~/.config/isorite/config.toml`.

To work on the app with hot reloading, run `npm run serve -- <base>` and, beside it, `npm run dev -w @isorite/app`.

Needs Node 24 or later.
