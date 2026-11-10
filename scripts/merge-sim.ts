// What happens when two people work on one base through git and then merge (a simulation, not a test).
//
//   node scripts/merge-sim.ts [--rebase] [--keep] [--out report.md]
//
// The tutorial base is committed, cloned twice (alice, bob), and each makes the changes people make: edits to notes, a
// tag, a move, a folder moved, a note deleted, a note added, notes hidden, an agent that edits and is kept. Each is
// made through the engine, as the app would make it (so journals and settings are written as they would be). Alice
// pushes; bob pulls. What git does, then what isorite makes of the result: whether the notes still parse, the links, the
// journals, the settings, and whether the engine opens it and lays it out. Each scenario is on its own note or folder,
// so a result says which kind of change it came from.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { Bundle, SETTINGS_FILE, readJournal, type FileEntry } from "@isorite/core";
import type { Engine } from "@isorite/engine";
import { openEngine } from "../packages/server/src/serve.ts";
import { GUIDE_DIR } from "../packages/guide/src/node.ts";

const args = process.argv.slice(2);
const REBASE = args.includes("--rebase"), KEEP = args.includes("--keep");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;

// ------------------------------------------------------------ git

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
function git(dir: string, ...a: string[]): { code: number; out: string } {
  const who = dir.split(sep).at(-1)!, env = { ...ENV, GIT_COMMITTER_NAME: who, GIT_COMMITTER_EMAIL: `${who}@example.com`, GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: `${who}@example.com` };
  try { return { code: 0, out: execFileSync("git", a, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { code: x.status ?? 1, out: `${x.stdout ?? ""}${x.stderr ?? ""}` }; }
}
const commit = (dir: string, who: string, msg: string): void => {
  git(dir, "add", "-A");
  git(dir, "-c", `user.name=${who}`, "-c", `user.email=${who}@example.com`, "commit", "-q", "-m", msg);
};

// ------------------------------------------------------------ the edits, as a person makes them

type Person = { name: string; dir: string; engine: Engine };
const paras = (text: string): string[] => text.split("\n\n");
async function edit(p: Person, id: string, change: (text: string) => string): Promise<void> {
  const now = await p.engine.readNote(id);
  await p.engine.saveNote(id, { base: now.version, text: change(now.text) });
}
/** A paragraph of the body (0 is the first after the frontmatter) changed. */
const para = (n: number, f: (s: string) => string) => (text: string): string => {
  const [, front, body] = /^(---\n[^]*?\n---\n\n)([^]*)$/.exec(text)!;
  const ps = paras(body!);
  ps[n < 0 ? ps.length + n : n] = f(ps[n < 0 ? ps.length + n : n]!);
  return front + ps.join("\n\n");
};
const addTag = (tag: string) => (text: string): string => text.replace(/^tags: \[(.*)\]$/m, (_m, t: string) => `tags: [${t}, ${tag}]`);
const agentEdits = (p: Person, session: string, note: string, oldString: string, newString: string) =>
  p.engine.agentLook({ agent: "claude", session, tool: "edit_note", args: { note, oldString, newString }, asked: "tidy this note" });
const record = (p: Person, session: string, title: string) => p.engine.keepAgentRecord({
  agent: "claude", name: "Claude", session, title, at: "2026-11-09T10:00:00.000Z", last: "2026-11-09T10:05:00.000Z",
  turns: [{ id: "t1", asked: title, from: "here", state: "done", at: "2026-11-09T10:00:00.000Z", items: [{ kind: "text", text: `done: ${title}` }] }],
});

// ------------------------------------------------------------ the result, read from disk

interface Merged {
  dir: string;
  /** Files git left conflicted, by status code (UU both changed, AA both added, DU/UD deleted by one). */
  conflicted: { code: string; path: string }[];
  /** Notes with conflict markers in them. */
  marked: string[];
  bundle: Bundle;
  notes: Map<string, string>;
  /** Journal files by note id, as the lines they hold. */
  journals: Map<string, { entries: ReturnType<typeof readJournal>; bad: number }>;
  hidden: string[];
  settingsMarked: boolean;
  engineError: string;
  mapped: boolean;
  listed: number;
  records: string[];
}
const walkFiles = (root: string): FileEntry[] => {
  const out: FileEntry[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const full = join(dir, name), path = relative(root, full).split(sep).join("/");
      if (statSync(full).isDirectory()) { out.push({ path, dir: true }); visit(full); }
      else if (name.endsWith(".md")) out.push({ path, text: readFileSync(full, "utf8") });
      else out.push({ path });
    }
  };
  visit(root);
  return out;
};
const MARK = /^(<<<<<<<|=======|>>>>>>>)( |$)/m;
async function read(dir: string): Promise<Merged> {
  const status = git(dir, "status", "--porcelain").out.split("\n").filter(Boolean);
  const conflicted = status.filter((l) => /^(UU|AA|DU|UD|AU|UA|DD) /.test(l)).map((l) => ({ code: l.slice(0, 2), path: l.slice(3) }));
  const files = walkFiles(dir), notes = new Map(files.flatMap((f) => ("text" in f && f.text !== undefined ? [[f.path.replace(/\.md$/, ""), f.text] as const] : [])));
  const bundle = Bundle.fromFiles(files);
  const journals = new Map<string, { entries: ReturnType<typeof readJournal>; bad: number }>();
  const jdir = join(dir, ".isorite", "journal");
  const visit = (d: string): void => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (name.endsWith(".jsonl")) {
        const text = readFileSync(full, "utf8"), id = relative(jdir, full).split(sep).join("/").replace(/\.jsonl$/, "");
        journals.set(id, { entries: readJournal(text), bad: text.split("\n").filter((l) => l.trim()).length - readJournal(text).length });
      }
    }
  };
  visit(jdir);
  const settingsText = [SETTINGS_FILE, "hidden.txt"].map((f) => (existsSync(join(dir, ".isorite", f)) ? readFileSync(join(dir, ".isorite", f), "utf8") : "")).join("\n");
  let engineError = "", mapped = false, listed = 0, hidden: string[] = [];
  try {
    const engine = await openEngine({ notes: dir }, "merged", null);
    const listing = await engine.notes();
    listed = listing.notes.length;
    hidden = (await engine.hidden()).ids;
    for (const n of listing.notes) await engine.readNote(n.id);
    await engine.map();
    mapped = true;
  } catch (e) { engineError = (e as Error).message; }
  const kept = join(dir, ".isorite", "conversations", "agents");
  const records = existsSync(kept) ? readdirSync(kept, { recursive: true }).map(String).filter((f) => f.endsWith(".json")) : [];
  return {
    dir, conflicted, marked: [...notes].filter(([, t]) => MARK.test(t)).map(([id]) => id), bundle, notes, journals,
    hidden, settingsMarked: MARK.test(settingsText), engineError, mapped, listed, records,
  };
}

// ------------------------------------------------------------ the scenarios

interface Scenario {
  name: string;
  /** What each does (they are made in this order, alice's before bob's). */
  alice: (p: Person) => Promise<void>;
  bob: (p: Person) => Promise<void>;
  /** What should hold of a good merge: a sentence for each way it does not. */
  check: (m: Merged, base: Bundle) => string[];
}
const both = (m: Merged, id: string, ...words: string[]): string[] => words.filter((w) => !(m.notes.get(id) ?? "").includes(w)).map((w) => `${id} lost "${w}"`);
const noMarks = (m: Merged, id: string): string[] => (m.marked.includes(id) ? [`${id} holds conflict markers`] : []);
const linksTo = (m: Merged, id: string): string[] => m.bundle.issues.filter((i) => i.code === "broken-link" && i.path.replace(/\.md$/, "") === id).map((i) => `${id}: ${i.message}`);

const SCENARIOS: Scenario[] = [
  {
    name: "1 · one note, different paragraphs",
    alice: (p) => edit(p, "notes/a-note-is-markdown", para(0, (s) => `${s} Alice's sentence.`)),
    bob: (p) => edit(p, "notes/a-note-is-markdown", para(-1, (s) => `${s}\n\nBob's closing paragraph.`)),
    check: (m) => [...both(m, "notes/a-note-is-markdown", "Alice's sentence.", "Bob's closing paragraph."), ...noMarks(m, "notes/a-note-is-markdown"),
      ...(new Set((m.journals.get("notes/a-note-is-markdown")?.entries ?? []).map((e) => e.device)).size < 3 ? ["its journal does not show both devices"] : [])],
  },
  {
    name: "2 · one note, the same paragraph",
    alice: (p) => edit(p, "start-here", para(0, (s) => s.replace("is a home for", "is a place for"))),
    bob: (p) => edit(p, "start-here", para(0, (s) => s.replace("is a home for", "is a workshop for"))),
    check: (m) => [...noMarks(m, "start-here")],
  },
  {
    name: "3 · both add a tag to one note",
    alice: (p) => edit(p, "atlas/the-atlas", addTag("alpha")),
    bob: (p) => edit(p, "atlas/the-atlas", addTag("beta")),
    check: (m) => [...both(m, "atlas/the-atlas", "alpha", "beta"), ...noMarks(m, "atlas/the-atlas"), ...m.bundle.issues.filter((i) => i.path === "atlas/the-atlas.md" && i.code.startsWith("frontmatter")).map((i) => `the-atlas: ${i.message}`)],
  },
  {
    name: "4 · one moves a note, the other edits it",
    alice: async (p) => { await p.engine.moveNote("notes/folders", "atlas/folders", (await p.engine.readNote("notes/folders")).version); },
    bob: (p) => edit(p, "notes/folders", para(0, (s) => `${s} Bob's addition.`)),
    check: (m) => [...(m.notes.has("notes/folders") && m.notes.has("atlas/folders") ? ["the note is in both places"] : []),
      ...both(m, m.notes.has("atlas/folders") ? "atlas/folders" : "notes/folders", "Bob's addition."),
      ...(m.journals.has("notes/folders") && m.journals.has("atlas/folders") ? ["its journal is in both places"] : []),
      ...(!m.notes.has("notes/folders") && m.journals.has("notes/folders") ? ["a journal is left at the old place"] : [])],
  },
  {
    name: "5 · one moves a folder, the other works in it",
    alice: (p) => p.engine.moveFolder("agent", "the-agent"),
    bob: async (p) => {
      await edit(p, "agent/agent", para(0, (s) => `${s} Bob's note on the agent.`));
      await p.engine.createNote("agent/bobs-new-note", "---\ntype: Concept\ntitle: Bob's new note\ntags: [bob]\ndescription: Made while the folder moved.\n---\n\nWritten in agent/.\n");
    },
    check: (m) => [...(m.notes.has("agent/agent") ? ["agent/ still holds notes after the move"] : []), ...(m.notes.has("agent/bobs-new-note") ? ["bob's new note is left in agent/, which alice moved"] : []),
      ...both(m, m.notes.has("the-agent/agent") ? "the-agent/agent" : "agent/agent", "Bob's note on the agent.")],
  },
  {
    name: "6 · one deletes a note, the other edits it",
    alice: async (p) => { await p.engine.deleteNote("notes/go-back-a-version", (await p.engine.readNote("notes/go-back-a-version")).version); },
    bob: (p) => edit(p, "notes/go-back-a-version", para(-1, (s) => `${s} Bob's last word.`)),
    check: (m) => [...(m.notes.has("notes/go-back-a-version") && m.conflicted.length === 0 ? ["the note is back and git did not say so"] : [])],
  },
  {
    name: "7 · both make a note with the same name",
    alice: (p) => p.engine.createNote("notes/glossary", "---\ntype: Concept\ntitle: Glossary\ntags: [alice]\ndescription: Alice's terms.\n---\n\nAlice's terms.\n").then(() => undefined),
    bob: (p) => p.engine.createNote("notes/glossary", "---\ntype: Concept\ntitle: Glossary\ntags: [bob]\ndescription: Bob's terms.\n---\n\nBob's terms.\n").then(() => undefined),
    check: (m) => [...noMarks(m, "notes/glossary")],
  },
  {
    name: "8 · one deletes a note the other's new note links to",
    alice: async (p) => { await p.engine.deleteNote("notes/write-in-your-notes", (await p.engine.readNote("notes/write-in-your-notes")).version); },
    bob: (p) => p.engine.createNote("notes/bobs-practice", "---\ntype: Problem\ntitle: Bob's practice\ntags: [bob, practice]\n---\n\nIt rests on [writing](/notes/write-in-your-notes.md \"requires\").\n").then(() => undefined),
    check: (m) => [...linksTo(m, "notes/bobs-practice")],
  },
  {
    name: "9 · both hide notes",
    alice: async (p) => { await p.engine.setHidden(["atlas", "agent/artifacts"]); },
    bob: async (p) => { await p.engine.setHidden(["notes/folders", "terminal"]); },
    check: (m) => [...(m.settingsMarked ? ["settings.toml holds conflict markers"] : []), ...["atlas", "agent/artifacts", "notes/folders", "terminal"].filter((h) => !m.hidden.includes(h)).map((h) => `${h} is no longer hidden`)],
  },
  {
    name: "10 · both have an agent edit the same note, and keep the conversation",
    alice: async (p) => {
      const first = paras((await p.engine.readNote("your-own-base/starting-a-base")).text.split("\n---\n").slice(1).join("\n---\n"))[1]!;
      await agentEdits(p, "a1", "your-own-base/starting-a-base", first, `${first} [alice's agent]`);
      await record(p, "a1", "tidy the start");
    },
    bob: async (p) => {
      const last = paras((await p.engine.readNote("your-own-base/starting-a-base")).text.trimEnd()).at(-1)!;
      await agentEdits(p, "b1", "your-own-base/starting-a-base", last, `${last} [bob's agent]`);
      await record(p, "b1", "check the end");
    },
    check: (m) => [...both(m, "your-own-base/starting-a-base", "[alice's agent]", "[bob's agent]"), ...noMarks(m, "your-own-base/starting-a-base"),
      ...(m.records.length < 2 ? [`kept conversations: ${m.records.length} of 2`] : [])],
  },
  {
    name: "11 · both rename the same note, differently",
    alice: async (p) => { await p.engine.moveNote("notes/make-move-delete", "notes/make-and-move", (await p.engine.readNote("notes/make-move-delete")).version); },
    bob: async (p) => { await p.engine.moveNote("notes/make-move-delete", "notes/create-move-delete", (await p.engine.readNote("notes/make-move-delete")).version); },
    check: (m) => [...(["notes/make-move-delete", "notes/make-and-move", "notes/create-move-delete"].filter((i) => m.notes.has(i)).length > 1 ? ["the note is now in more than one place"] : [])],
  },
  {
    name: "12 · both move a folder, to different places",
    alice: (p) => p.engine.moveFolder("terminal", "agents/terminal"),
    bob: (p) => p.engine.moveFolder("terminal", "advanced"),
    check: (m) => [...(["terminal", "agents/terminal", "advanced"].filter((d) => [...m.notes.keys()].some((id) => id.startsWith(`${d}/`))).length > 1 ? ["its notes are in more than one folder"] : [])],
  },
];

// ------------------------------------------------------------ run

async function open(dir: string, device: string): Promise<Person> { return { name: device, dir, engine: await openEngine({ notes: dir }, device, null) }; }

async function main(): Promise<void> {
  const root = mkdtempSync(join(process.env.MERGE_SIM_DIR ?? tmpdir(), "isorite-merge-sim-"));
  const origin = join(root, "origin.git"), seed = join(root, "seed"), alice = join(root, "alice"), bob = join(root, "bob");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  cpSync(GUIDE_DIR, seed, { recursive: true });
  // The guide ignores .isorite/ (it is served from a package); a team that shares journals commits it.
  rmSync(join(seed, ".gitignore"), { force: true });
  const first = await open(seed, "seed");
  // The base as a team would have it: every note has been opened, so each has a journal, committed with the notes.
  for (const n of (await first.engine.notes()).notes) await first.engine.readNote(n.id);
  // A base that already has settings (where its code is), as one that has been used would.
  await first.engine.nameRepository("../code");
  git(seed, "init", "-q", "-b", "main");
  commit(seed, "seed", "the tutorial base");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main");
  const baseline = Bundle.fromFiles(walkFiles(seed));
  git(root, "clone", "-q", origin, alice);
  git(root, "clone", "-q", origin, bob);

  const a = await open(alice, "alice"), b = await open(bob, "bob");
  const done: { s: Scenario; aliceError: string; bobError: string }[] = [];
  for (const s of SCENARIOS) {
    let aliceError = "", bobError = "";
    try { await s.alice(a); } catch (e) { aliceError = (e as Error).message; }
    try { await s.bob(b); } catch (e) { bobError = (e as Error).message; }
    done.push({ s, aliceError, bobError });
  }
  commit(alice, "alice", "alice's changes");
  commit(bob, "bob", "bob's changes");
  git(alice, "push", "-q", "origin", "main");
  const pull = git(bob, "pull", ...(REBASE ? ["--rebase"] : ["--no-rebase", "--no-edit"]), "origin", "main");
  const m = await read(bob);

  const lines: string[] = [];
  const say = (s = ""): void => { lines.push(s); };
  say(`# Two people, one base: ${REBASE ? "pull --rebase" : "pull (merge)"}`);
  say();
  say(`git: exit ${pull.code}; ${m.conflicted.length} files conflicted: ${m.conflicted.map((c) => `${c.code} ${c.path}`).join(", ") || "none"}`);
  say(`isorite on the result: ${m.mapped ? "opens, reads every note, lays out the map" : `FAILS: ${m.engineError}`}`);
  say(`notes with conflict markers: ${m.marked.join(", ") || "none"}`);
  const mdFiles = [...m.notes.keys()].length, listed = m.listed;
  say(`notes on disk: ${mdFiles}; notes the engine lists: ${listed}${mdFiles !== listed ? ` (${mdFiles - listed} on disk that it does not list)` : ""}`);
  const base = new Set(baseline.issues.map((i) => `${i.code}|${i.path}|${i.message}`));
  const fresh = m.bundle.issues.filter((i) => !base.has(`${i.code}|${i.path}|${i.message}`));
  say(`new issues in the notes (links, frontmatter) after the merge: ${fresh.length}`);
  for (const i of fresh.slice(0, 12)) say(`  - ${i.code} ${i.path}: ${i.message}`);
  const orphan = [...m.journals.keys()].filter((id) => !m.notes.has(id) && !id.startsWith("@"));
  const bare = [...m.notes.keys()].filter((id) => !m.journals.has(id));
  say(`journals: ${m.journals.size}; for a note no longer there: ${orphan.length}${orphan.length ? ` (${orphan.slice(0, 6).join(", ")})` : ""}; notes with none: ${bare.length}${bare.length ? ` (${bare.slice(0, 6).join(", ")})` : ""}; lines that do not parse: ${[...m.journals.values()].reduce((n, j) => n + j.bad, 0)}`);
  say();
  say("| scenario | git | what is wrong after the merge |");
  say("|---|---|---|");
  for (const { s, aliceError, bobError } of done) {
    const id = s.name;
    const mine = m.conflicted.filter((c) => s.name && true).length;
    void mine;
    const problems = [...(aliceError ? [`alice could not: ${aliceError}`] : []), ...(bobError ? [`bob could not: ${bobError}`] : []), ...s.check(m, baseline)];
    say(`| ${id} | ${gitWord(s.name, m)} | ${problems.join("; ") || "nothing"} |`);
  }
  const report = lines.join("\n");
  console.log(report);
  if (OUT) writeFileSync(OUT, report + "\n");
  if (KEEP) console.log(`\nkept: ${root}`); else rmSync(root, { recursive: true, force: true });
}

/** What git said about the files a scenario touches. */
const TOUCH: Record<string, string[]> = {
  "1": ["notes/a-note-is-markdown"], "2": ["start-here"], "3": ["atlas/the-atlas"], "4": ["notes/folders", "atlas/folders"], "5": ["agent/", "the-agent/"],
  "6": ["notes/go-back-a-version"], "7": ["notes/glossary"], "8": ["notes/write-in-your-notes", "notes/bobs-practice"], "9": ["settings.toml"],
  "10": ["your-own-base/starting-a-base", "agents/claude"], "11": ["notes/make-move-delete", "notes/make-and-move", "notes/create-move-delete"], "12": ["terminal/", "agents/terminal", "advanced/"],
};
function gitWord(name: string, m: Merged): string {
  const keys = TOUCH[name.split(" ")[0]!] ?? [];
  const hit = m.conflicted.filter((c) => keys.some((k) => c.path.includes(k)));
  return hit.length ? `conflict: ${hit.map((c) => `${c.code} ${c.path.split("/").slice(-2).join("/")}`).slice(0, 3).join(", ")}${hit.length > 3 ? `, +${hit.length - 3}` : ""}` : "merged";
}

await main();
