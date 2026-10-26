# Iso's eval cases

One JSON file per case, run by `npm run eval:iso` (scripts/eval-iso.ts) on a fresh copy of the example base (the
N-body notes), against the provider in `~/.config/isorite/config.toml`. Plain JSON, so that a prompt optimiser
(DSPy's GEPA, say) could use the same cases and checks later.

```jsonc
{
  "name": "…",                       // what is being checked, in a line
  "agents": "…",                     // optional: AGENTS.md at the top of the base
  "history": [                       // optional: earlier turns, written into the conversation as they are
    { "asked": "…", "said": "…", "read": ["integrators/leapfrog"] }  // read: notes Iso read in it, whole
  ],
  "compact": true,                   // optional: sum up the history before the judged turn
  "turn": { "mode": "ask" | "write", "asked": "…", "given": [{ "kind": "note", "id": "…" }] },
  "checks": [ … ]                    // each passes or fails; see below
}
```

Checks: `{"called": [tools]}` and `{"notCalled": [tools]}` (the judged turn's tool calls); `{"says": "regex"}` and
`{"saysNot": "regex"}` (its reply, case-insensitive); `{"linksResolve": true}` (every link in its reply names a
note); `{"changed": [ids]}` (exactly these notes changed, none other; `[]` for none); `{"created": "folder/"}` (one
note made, in that folder, with frontmatter type and title, and a link that resolves); `{"createdNot": "regex"}`
(no note made whose title matches); `{"editLines": n}` (at most n lines changed in all); `{"changedSays": "regex"}`
(the changed text matches); `{"notRead": [ids]}` (not read again in the judged turn); `{"briefing": {"open":
"regex", "notes": [ids]}}` (the compaction picked these); `{"words": n}` (the reply is at most n words).
