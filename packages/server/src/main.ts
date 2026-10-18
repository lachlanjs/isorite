#!/usr/bin/env node
// isorite's command line.
//
//   isorite check <notes>                  lint a folder of notes
//   isorite study init <notes> [<where>]   make a study base beside a knowledge base
//   isorite serve <study base | notes>     open it in the browser
//   isorite example <folder>               write the example base, partway built, into a folder
//   isorite term [<study base | notes>]    OpenCode, with isorite's plugin, beside a knowledge base
//   isorite mcp [<study base | notes>]     the knowledge base's tools over MCP, on stdio, for another harness
//   isorite --tutorial [<folder>]          a tour of isorite term, on the example base, with a scripted model

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { StudyError } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { serve } from "./serve.ts";
import { initStudyBase } from "./studybase.ts";
import { mcp } from "./mcp.ts";
import { term, tutorialTerm } from "./term.ts";
import { writeExample } from "@isorite/example/node";

const USAGE = `isorite: an agentic harness for understanding

  isorite check <notes>                  check a folder of notes: frontmatter, links, cycles
  isorite study init <notes> [<where>]   make a study base for it (default: beside its repository)
  isorite serve <study base | notes> [--port <n>] [--allow-host <name>]
                                         open it in the browser, on this machine only
  isorite example <folder>               write an example base on dynamical mean-field theory, six weeks
                                         into being built, with its study base, into an empty folder
  isorite term [<study base | notes>] [--port <n>]
                                         OpenCode 2 here, with the knowledge base beside it: its server is
                                         started if none is running on the port
  isorite mcp [<study base | notes>] [--port <n>] [--agent <name>]
                                         the knowledge base's tools over MCP, on stdio, for Claude Code or Pi:
                                         claude mcp add isorite -- isorite mcp <base> --agent claude-code
  isorite --tutorial [<folder>] [--port <n>]
                                         a tour of isorite in the terminal (OpenCode 2), on the example base,
                                         with a scripted model: no key, nothing sent anywhere; kept in the
                                         folder, to carry on later (also: isorite tutorial term)
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
    // The terminal's tour: `isorite --tutorial`, or `isorite tutorial term`, or `isorite term --tutorial`.
    const tour = command === "--tutorial" ? rest : command === "tutorial" && rest[0] === "term" ? rest.slice(1) : command === "term" && rest.includes("--tutorial") ? rest.filter((a) => a !== "--tutorial") : null;
    if (tour) {
      const at = tour.indexOf("--port"), port = at < 0 ? undefined : Number(tour[at + 1]);
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      const folder = tour.find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--port");
      return tutorialTerm(folder, port === undefined ? {} : { port }).catch((e: Error) => { console.error(e.message); return 2; });
    }
    if (command === "term" || command === "mcp") {
      const flag = (name: string) => { const at = rest.indexOf(name); return at < 0 ? undefined : rest[at + 1]; };
      const port = flag("--port") === undefined ? undefined : Number(flag("--port")), agent = flag("--agent");
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      if (agent !== undefined && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(agent)) { console.error("--agent takes a name in small letters, digits and dashes"); return 2; }
      const path = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--port" && rest[i - 1] !== "--agent");
      const run = command === "term" ? term(path, port === undefined ? {} : { port }) : mcp(path, { ...(port === undefined ? {} : { port }), ...(agent ? { agent } : {}) });
      return run.catch((e: Error) => { console.error(e.message); return 2; });
    }
    if (command === "example" && rest[0]) {
      return writeExample(rest[0]).then(({ notes, study }) => {
        console.log(`the example base is at ${notes}`);
        console.log(`  its study base is ${study}`);
        console.log(`  open it with: isorite serve ${study}`);
        return 0;
      }, (e: Error) => { console.error(e.message); return 2; });
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
