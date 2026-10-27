// isorite memory [<folder>] (M20): the agent's memory, a knowledge base of its own that is lent to every session,
// as rdstudio's ~/knowledge was. Its practice is its AGENTS.md, yours to change. And isorite bases: the bases this
// device knows.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { AGENTS_FILE, OWN_DIR, StudyError } from "@isorite/core";
import { configPath, knownBases, rememberBase, basesPath } from "./config.ts";
import { gitInit } from "./git.ts";
import { newBase } from "./serve.ts";

export const MEMORY_FOLDER = join(homedir(), "isorite-memory");

/** The memory's practice, as the agent is to follow it: read with brief_base, whichever base a session is for. */
export const MEMORY_AGENTS = `# What you keep across projects: the person, their tools, and what you have learned working with them.

This knowledge base is your memory. It is lent to every session, whatever project the session is for. Look in it,
and keep it, with the knowledge base tools, giving \`base: "memory"\`.

## When to look

- At the start of a task: search for the person, the project's tools and the kind of work.
- Before asking the person something they may have told you before.

## What to keep

Keep what will be useful in another project, or in a later session of this one:
- **you/**: how the person likes to work, what they have corrected you on or confirmed, and why.
- **tools/**: tools, services and machines, and how they are set up and reached.
- **practice/**: ways of working that went well or badly, and mistakes not to repeat.
- **projects/**: what is going on in each project that its own files don't say: goals, decisions, constraints,
  with dates as dates.

Don't keep what a project's own files, notes or history already say, what matters only to this conversation, or
anything secret: keys, passwords, tokens.

## How to keep it

- One note for each thing worth keeping: its title says it, its first lines give the fact, then **Why:** and
  **When it applies:**.
- Link it to the notes it touches.
- Update the note that is there rather than writing a second one, and delete a note that turns out to be wrong.
- Write as you learn, not at the end: the person sees each note you write marked as yours, and can undo it.
`;

/** Make the memory, or say where it is: the folder (as isorite new makes it), a git repository of its own, its
 *  practice, and its row in bases.toml, lent. */
export function memory(folder = MEMORY_FOLDER, { config = configPath(), out = console.log, env = process.env }: { config?: string; out?: (line: string) => void; env?: NodeJS.ProcessEnv } = {}): number {
  const at = resolve(folder), known = knownBases(config);
  // Run again, it says where the memory is, and changes nothing.
  const had = known.find((b) => b.path === at) ?? (folder === MEMORY_FOLDER ? known.find((b) => b.name === "memory") : undefined);
  if (had && existsSync(join(had.path, AGENTS_FILE))) {
    out(`the memory is ${had.name}, at ${had.path}: ${had.lend ? "lent to every session" : `not lent (isorite bases lend ${had.name})`}`);
    return 0;
  }
  if (!existsSync(join(at, AGENTS_FILE))) {
    if (existsSync(at) && readdirSync(at).some((f) => f !== OWN_DIR && f !== ".git")) throw new StudyError(`${at} has files in it already, and no ${AGENTS_FILE}: name another folder, isorite memory <folder>`);
    newBase(at);
    writeFileSync(join(at, AGENTS_FILE), MEMORY_AGENTS);
    const repo = existsSync(join(at, ".git")) || gitInit(at, { env });
    out(repo ? `isorite memory: made at ${at}, a private repository of its own: push it where you like`
      : `isorite memory: made at ${at}; not a git repository (git did not answer, or is not here): git init it yourself`);
  }
  const name = rememberBase(at, { path: config, as: "memory", lend: true });
  out(`  ${name}: lent to every session's agent and Iso, as listed in ${basesPath(config)}`);
  out(`  watch it learn: isorite serve ${at}, or switch to ${name} in the page of a running server`);
  return 0;
}

/** isorite bases: the bases this device knows; `lend <name>` and `keep <name>` (lend it no longer). */
export function bases(args: string[], { config = configPath(), out = console.log }: { config?: string; out?: (line: string) => void } = {}): number {
  const [verb, name] = args;
  if (verb === "lend" || verb === "keep") {
    const known = knownBases(config).find((b) => b.name === name);
    if (!known) { out(`no base ${name ?? ""} is known: isorite bases lists them`); return 2; }
    rememberBase(known.path, { path: config, lend: verb === "lend" });
    out(`${known.name}: ${verb === "lend" ? "lent to every session" : "not lent"}`);
    return 0;
  }
  const known = knownBases(config);
  if (!known.length) { out("no bases yet: each one you open is listed here (isorite serve, term, mcp); isorite memory makes the agent's memory"); return 0; }
  const width = Math.max(...known.map((b) => b.name.length));
  for (const b of known) out(`${b.name.padEnd(width)}  ${b.lend ? "lent " : "     "}  ${b.path}${existsSync(b.path) ? "" : "  (not there)"}`);
  return 0;
}
