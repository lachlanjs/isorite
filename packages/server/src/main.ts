#!/usr/bin/env node
// isorite's command line.
//
//   isorite check <notes>                  lint a folder of notes
//   isorite study init <notes> [<where>]   make a study base beside a knowledge base
//   isorite serve <study base | notes>     open it in the browser

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { StudyError } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { serve } from "./serve.ts";
import { initStudyBase } from "./studybase.ts";

const USAGE = `isorite: an agentic harness for understanding

  isorite check <notes>                  check a folder of notes: frontmatter, links, cycles
  isorite study init <notes> [<where>]   make a study base for it (default: beside its repository)
  isorite serve <study base | notes> [--port <n>] [--allow-host <name>]
                                         open it in the browser, on this machine only
`;

export function check(notes: string, out: (line: string) => void = console.log): number {
  const root = resolve(notes);
  if (!existsSync(root) || !statSync(root).isDirectory()) { out(`no folder at ${root}`); return 2; }
  const bundle = loadBundle(root), issues = bundle.lint(), cycles = bundle.requiresCycles();
  for (const i of issues) out(`${i.level.padEnd(7)} ${i.path}: ${i.message}`);
  for (const c of cycles) out(`warning requires cycle: ${c.join(" -> ")}`);
  const errors = issues.filter((i) => i.level === "error").length;
  out(`${bundle.concepts.size} notes in ${bundle.directories.size} folders; ${errors} errors, ${issues.length - errors} warnings, ${cycles.length} requires cycles`);
  return errors ? 1 : 0;
}

export function main(argv: string[]): number | Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "check" && rest[0]) return check(rest[0]);
    if (command === "serve" && rest[0]) {
      const at = rest.indexOf("--port"), port = at < 0 ? undefined : Number(rest[at + 1]);
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      // Runs until stopped; what it refuses at the start is reported like any other command's.
      const allowHosts = rest.flatMap((a, i) => (a === "--allow-host" && rest[i + 1] ? [rest[i + 1]!] : []));
      return serve(rest[0], { ...(port === undefined ? {} : { port }), allowHosts }).then(() => new Promise<number>(() => undefined), (e) => {
        if (e instanceof StudyError) { console.error(e.message); return 2; }
        throw e;
      });
    }
    if (command === "study" && rest[0] === "init" && rest[1]) {
      const made = initStudyBase(rest[1], rest[2]);
      console.log(`study base made at ${made.path}`);
      console.log(`  studies ${made.config.base.path}${made.config.base.root ? ` (root commit ${made.config.base.root.slice(0, 10)})` : " (not in git)"}`);
      console.log(made.repository ? "  a git repository of its own; nothing committed" : "  git not found: not a repository yet");
      return 0;
    }
  } catch (e) {
    if (e instanceof StudyError) { console.error(e.message); return 2; }
    throw e;
  }
  process.stdout.write(USAGE);
  return command && command !== "help" && command !== "--help" ? 2 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) process.exit(await main(process.argv.slice(2)));
