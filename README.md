# isorite

An agentic harness for understanding. See `docs/ISORITE_DOC.md` for what it is to be.

Milestone 1: a base can be opened in the browser and notes written in it, with every edit entered in the note's journal. Iso, the Atlas and study are not built yet.

| | |
|---|---|
| `docs/plan-first-slice.md` | the plan being built |
| `docs/plan-m1.md` | milestone 1: what was built and what was not checked |
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
```

To work on the app with hot reloading, run `npm run serve -- <base>` and, beside it, `npm run dev -w @isorite/app`.

Needs Node 24 or later.
