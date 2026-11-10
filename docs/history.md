# History: what each milestone delivered

One line per milestone, in order, so nobody needs to open the plans in `archive/`. Dates are as the plan states them (October and November 2026); a plan with none has no date given. Several early milestones built things later retired: that is said where it happened. Milestones 9, 28, 31 and 32 have no plan of their own (M9 was engine work on Iso's context, folded into M10; M28 was a chat branch that was never merged).

These records keep the names of their day: "Iso" is the earlier name of the Agent pane and isorite's built-in agent.

## The first slice

- **First slice** (`plan-first-slice.md`, 2026-10-13): the plan for M1 to M5, each milestone to be approved before it was built; where it differs from `ISORITE_DOC.md`, the plan and `decisions.md` are followed.
- **M1** (2026-10-13): the shell and writing a note: `isorite serve`, a note list, live-preview Markdown with maths and typed links, saved to the note's journal.
- **M2** (2026-10-13): Iso in the note (a prompt, then keep, edit or remove), notes written for Iso, search by meaning, the key and the cost shown. Iso's own loop was retired in M25.
- **M3** (2026-10-13): the Atlas: folders as regions, notes as blocks, links as routes, Iso's reading path drawn live, a note started by holding on the map.
- **M4** (2026-10-15): study: written exercises, Iso's marking and the squares of understanding. Removed in M12.
- **M5** (2026-10-18): the timeline of a note's changes, an example base, and a scripted tutorial over it published as a static site.

## Terminal, tutorial and panes

- **M6** (2026-10-18): the terminal on OpenCode 2: a plugin, tools and views, with a spike on its way. Retired in M25.
- **M7** (draft, 2026-10-18): a tutorial rewritten around an N-body simulation; replaced by M16's guide.
- **M8** (2026-10-20): the first knowledge-base layer and the tutorial's mechanics (ticks, back, redo, wrong moves). The tutorial went in M16.
- **Embed** (2026-10-23): search by meaning moved to IBM's granite embedding model, fetched from npm instead of Hugging Face, with the model's checksums pinned.
- **M10** (2026-10-22): three panes (Note, Atlas, Iso) with lenses and modes on a desktop and one pane at a time on a phone; the inline Iso taken out.
- **M10b** (2026-10-22): the panes refined from trying M10: press and hold, corner controls, no header.
- **M11** (2026-10-23): the terminal agent's session shown in the Iso pane and Build mode, so isorite could be trialled on a work project. Retired in M25.
- **M12** (2026-10-25): understanding in the notes themselves: switches in place of lenses and modes, three note kinds (note, question, problem), who wrote what; scores and review queues removed along with study.

## Work and setup, October 26 to 27

- **M13** (2026-10-26): setting isorite up at work: a gateway's own headers and query strings, after a bad first day at work.
- **M14** (2026-10-26): fixes from the same work week: the Atlas's context switch no longer eats a click, Iso's route follows the trunks.
- **M15** (2026-10-26): what Iso is sent, shown part by part, and the system prompts. Retired with Iso's loop in M25, the prompts' teaching posture kept.
- **M16** (2026-10-26): the coach-card tutorial replaced by a guide: a knowledge base about isorite whose problem notes are the things to do (`isorite guide`).
- **M17** (2026-10-26): the Atlas follows the note: the open note is marked and a link hovered in the note is lit on the map.
- **M18** (2026-10-26): a provider set up in the browser, checked and used without a restart. Retired with Iso's loop in M25.
- **M19** (2026-10-26): code coloured by language and Mermaid diagrams drawn in notes and replies.
- **M20** (2026-10-26): several bases in one server, switched from the header, and the agent's memory base (`isorite memory`, `bases.toml`).
- **M21** (2026-10-27): isorite behind a company network: no git stall, a mirror-tolerant install, the model fetched reliably, `doctor` seeing these.
- **M22** (2026-10-27): pictures in notes: drawn, pasted or dropped, shown on the Atlas beside their note.

## The look, artifacts and the agent turn

- **M23** (2026-10-28): every file a node on the Atlas (artifact, data, document, misc), web, code and picture links as nodes, and artifacts built on a small kit (`packages/kit`) and shown working in a sandbox.
- **M24** (2026-10-29): the look built (`taste.md`): the lustre pulse, crystal, the strata timeline, notes linked with weight by kind.
- **M25** (2026-10-30, 0.13.0): isorite stops being an agent: it attaches to the one you use over MCP (the agent reaches isorite) and ACP (isorite reaches the agent); Iso's own loop, `isorite term`, the OpenCode plugin and Iso's proposals retired.
- **M26** (2026-10-30, revised 2026-11-01, 0.14.0): easy to install and start: `isorite` alone finds and opens the base, agents are found on the PATH, `doctor` and `new`.
- **M27** (2026-11-02): the agent chosen from the pane as cards, and where `.isorite/` lives: with the notes or in a repository of its own.
- **M29** (2026-11-02): handling notes and code that stays linked: delete and move where they are found, folders made, renamed and moved, an agent's unquoted colon in frontmatter mended.
- **M30** (2026-11-02): the look: the lustre as a thin line of light round a touched control, Atlas icons for kinds, read mode.
- **M33 and M34** (after 0.16.0): notes and folders handled by hand (press and hold, move, delete, send), the pulse, and the code reader.
- **M35** (prototype): an isorite harness on pi, built to learn whether pi is a dependable base for an agent that isorite owns.
- **M36**: the isorite harness made usable every day (a highlight in a note goes straight into the prompt), beside a deeper MCP route for the user's own agent.
- **M37** (2026-11-06, after 0.18.0): fixes and small features from the owner's testing, and the bigger directions listed for later.
