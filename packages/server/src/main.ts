#!/usr/bin/env node
// isorite's command line.
//
//   isorite check <notes>                  lint a folder of notes
//   isorite serve <notes>                  open it in the browser
//   isorite migrate <study base>           move a study base (format 1) into its notes' .isorite/
//   isorite example <folder>               write the example base, partway built, into a folder
//   isorite term [<notes>]                 OpenCode, with isorite's plugin, beside a knowledge base
//   isorite mcp [<notes>]                    the knowledge base's tools over MCP, on stdio, for another harness
//   isorite --tutorial [<folder>]          the tutorial: the terminal's tour, and the browser's beside it
//   isorite doctor [<notes>] [--report]    whether isorite can work here, a step at a time

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StudyError } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { doctor } from "./doctor.ts";
import { proxied, rerun, trustSystem } from "./network.ts";
import { serve } from "./serve.ts";
import { migrate } from "./migrate.ts";
import { mcp } from "./mcp.ts";
import { term, tutorialTerm } from "./term.ts";
import { writeExample, writeGeometry } from "@isorite/example/node";
import { fetchModel, userModelDir } from "./model.ts";

// The version: written into the bundle when it is built for npm (scripts/package.ts), else this checkout's.
declare const ISORITE_VERSION: string | undefined;
const VERSION = typeof ISORITE_VERSION === "string" ? ISORITE_VERSION : "0.1.0 (checkout)";

const USAGE = `isorite: an agentic harness for understanding

  isorite check <notes>                  check a folder of notes: frontmatter, links, cycles
  isorite serve <notes> [--port <n>] [--allow-host <name>]
                                         open it in the browser, on this machine only
  isorite migrate <study base> [--merge] move a study base (format 1) into its notes' .isorite/; exercises
                                         become problem notes; the study base is left as it was
  isorite example <folder> [--geometry]  write the example base (notes on an N-body simulation, three weeks
                                         into being built), into an empty folder; --geometry: notes on the
                                         differential geometry of surfaces, with their questions and problems
  isorite term [<notes>] [--port <n>]
                                         OpenCode 2 here, with the knowledge base beside it: its server is
                                         started if none is running on the port
  isorite mcp [<notes>] [--port <n>] [--agent <name>]
                                         the knowledge base's tools over MCP, on stdio, for Claude Code or Pi:
                                         claude mcp add isorite -- isorite mcp <base> --agent claude-code
  isorite model [--from <folder>]        fetch the model for search by meaning (53 MB, once): from npm, else
                                         Hugging Face; or from a folder its files were copied into
  isorite doctor [<notes>] [--report] [--offline]
                                         whether isorite can work here: the configuration, the network, the
                                         provider (asked a few words, a few hundred tokens), the terminal and
                                         the notes; --report gives it as one block, secrets hidden, to paste
                                         to someone (or an AI) helping
  isorite help setup                     how isorite is set up, every setting and failure: written for an AI
                                         helping you set it up (docs/setup.md is for people)
  isorite --tutorial [<folder>] [--port <n>]
                                         the tutorial, on the example base, with a scripted model (no key,
                                         nothing sent anywhere): the terminal's tour in OpenCode 2, and the
                                         browser's opened beside it on the same base; kept in the folder, to
                                         carry on later (also: isorite tutorial term)
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
    if (command === "model") {
      const from = rest[rest.indexOf("--from") + 1];
      if (rest.includes("--from") && !from) { console.error("--from takes a folder"); return 2; }
      return fetchModel(userModelDir(), console.log, from && rest.includes("--from") ? { from } : {}).then(() => 0, (e: Error) => { console.error(e.message); return 1; });
    }
    if (command === "--version" || command === "-v") { console.log(VERSION); return 0; }
    if (command === "help" && rest[0] === "setup") {
      // From the npm package (dist/main.js, docs/ beside it) or a checkout (packages/server/src/main.ts).
      const guide = ["../docs/setup-for-agents.md", "../../../docs/setup-for-agents.md"].map((p) => fileURLToPath(new URL(p, import.meta.url))).find((p) => existsSync(p));
      if (!guide) { console.error("the setup guide is not where it was installed: https://github.com/lachlanjs/isorite/blob/main/docs/setup-for-agents.md"); return 1; }
      process.stdout.write(readFileSync(guide, "utf8"));
      return 0;
    }
    if (command === "doctor") {
      const at = rest.indexOf("--port"), port = at < 0 ? undefined : Number(rest[at + 1]);
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      const folder = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--port");
      return doctor(folder, { report: rest.includes("--report"), offline: rest.includes("--offline"), version: VERSION, ...(port === undefined ? {} : { port }) });
    }
    if (command === "example" && rest.find((r) => !r.startsWith("--"))) {
      const folder = rest.find((r) => !r.startsWith("--"))!;
      return (rest.includes("--geometry") ? writeGeometry(folder) : writeExample(folder)).then(({ notes }) => {
        console.log(`the example base is at ${notes}`);
        console.log(`  open it with: isorite serve ${notes}`);
        return 0;
      }, (e: Error) => { console.error(e.message); return 2; });
    }
    if (command === "migrate" && rest[0] && !rest[0].startsWith("--")) {
      const done = migrate(rest[0], { merge: rest.includes("--merge") });
      console.log(`moved into ${done.notes}/.isorite/: ${done.copied.length} files`);
      for (const p of done.problems) console.log(`  exercise ${p.from} is now the problem note ${p.to}`);
      for (const k of done.kept) console.log(`  kept as it was: .isorite/${k}`);
      if (done.dropped) console.log(`  the study record (${done.dropped} lines) is not carried over: format 2 has none`);
      console.log(`  ${rest[0]} is left as it was; remove it once you are satisfied`);
      return 0;
    }
  } catch (e) {
    if (e instanceof StudyError) { console.error(e.message); return 2; }
    throw e;
  }
  process.stdout.write(USAGE);
  return command && command !== "help" && command !== "--help" ? 2 : 0;
}

// Run as the command, however it is reached: npm installs it as a link, so the path it was run by is resolved first.
// Inside a company, the proxy and the system's authorities are used without flags (network.ts).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const env = proxied(process.env);
  if (env) process.exit(await rerun(env));
  trustSystem();
  process.exit(await main(process.argv.slice(2)));
}
