#!/usr/bin/env node
// isorite's command line.
//
//   isorite check <notes> [--unused]       lint a folder of notes; --unused lists pictures no note shows
//   isorite serve <notes>                  open it in the browser
//   isorite migrate <study base>           move a study base (format 1) into its notes' .isorite/
//   isorite example <folder>               write the example base, partway built, into a folder
//   isorite term [<notes>]                 OpenCode, with isorite's plugin, beside a knowledge base
//   isorite mcp [<notes>]                    the knowledge base's tools over MCP, on stdio, for another harness
//   isorite guide [<folder>]               the guide: a knowledge base about isorite, to read in isorite
//   isorite doctor [<notes>] [--report]    whether isorite can work here, a step at a time

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StudyError, citeKind } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { doctor } from "./doctor.ts";
import { proxied, rerun, trustSystem } from "./network.ts";
import { single } from "./self.ts";
import { newBase, serve } from "./serve.ts";
import { migrate } from "./migrate.ts";
import { mcp } from "./mcp.ts";
import { installOpenCode, term } from "./term.ts";
import { guide } from "./guide.ts";
import { writeExample, writeGeometry } from "@isorite/example/node";
import { modelCommand } from "./model.ts";
import { bases, memory } from "./memory.ts";
import { VERSION } from "./version.ts";


const USAGE = `isorite: an agentic harness for understanding

  isorite new <folder>                   start a knowledge base: the folder, empty, with isorite's .isorite/
  isorite check <notes> [--unused]       check a folder of notes: frontmatter, links, cycles; --unused lists
                                         the pictures no note shows
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
  isorite model [--from <folder|.tgz>] [--url <url>]
                                         the model for search by meaning: which is installed, and where; else
                                         fetched (53 MB, once) from ISORITE_MODEL_BASE_URL, npm, GitHub or
                                         Hugging Face, or --url alone; or from the .tgz fetched by hand, or a
                                         folder: its files copied there, or any compatible model
  isorite opencode                       OpenCode 2 for isorite term, installed in isorite's own folder
                                         (~/.config/isorite/opencode-cli), the global one left as it is
  isorite doctor [<notes>] [--report] [--offline]
                                         whether isorite can work here: the configuration, the network, the
                                         provider (asked a few words, a few hundred tokens), the terminal and
                                         the notes; --report gives it as one block, secrets hidden, to paste
                                         to someone (or an AI) helping
  isorite memory [<folder>]              the agent's memory: a knowledge base (~/isorite-memory unless named),
                                         a git repository of its own, lent to every session's agent and Iso
  isorite bases [lend|keep <name>]       the bases this device knows, each listed as it is opened; lend one to
                                         every session, or keep it to itself
  isorite help setup                     how isorite is set up, every setting and failure: written for an AI
                                         helping you set it up (docs/setup.md is for people)
  isorite guide [<folder>] [--port <n>]  the guide: a knowledge base about isorite, with things to do in it,
                                         written into a folder (~/isorite-guide unless named) and opened in
                                         the browser; run again, as you left it. Iso is your model, or with
                                         none set up, the guide's finder (also: isorite --tutorial)
`;

export function check(notes: string, out: (line: string) => void = console.log, unused = false): number {
  const root = resolve(notes);
  if (!existsSync(root) || !statSync(root).isDirectory()) { out(`no folder at ${root}`); return 2; }
  const bundle = loadBundle(root), issues = bundle.lint(), cycles = bundle.requiresCycles();
  for (const i of issues) out(`${i.level.padEnd(7)} ${i.path}: ${i.message}`);
  for (const c of cycles) out(`warning requires cycle: ${c.join(" -> ")}`);
  const errors = issues.filter((i) => i.level === "error").length;
  out(`${bundle.concepts.size} notes in ${bundle.directories.size} folders; ${errors} errors, ${issues.length - errors} warnings, ${cycles.length} requires cycles`);
  // The pictures no note shows or links to (M22): yours to keep or delete, so information, never a warning.
  if (unused) {
    const cited = new Set([...bundle.concepts.values()].flatMap((c) => c.cites.map((x) => x.target)));
    const idle = [...bundle.files].filter((f) => citeKind(f) === "image" && !cited.has(f)).sort();
    for (const f of idle) out(`unused  ${f}`);
    out(idle.length ? `${idle.length} ${idle.length === 1 ? "picture" : "pictures"} no note shows` : "every picture is shown by a note");
  }
  return errors ? 1 : 0;
}

export function main(argv: string[]): number | Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "check" && rest.find((r) => !r.startsWith("--"))) return check(rest.find((r) => !r.startsWith("--"))!, console.log, rest.includes("--unused"));
    if (command === "new" && rest[0]) {
      const made = newBase(rest[0]);
      // The commands that come next, with the whole path: term is run from the code's folder.
      console.log(`${made}: a knowledge base, empty. Open it in the browser, or beside your code in the terminal:\n  isorite serve ${made}\n  cd <your code> && isorite term ${made}`);
      return 0;
    }
    if (command === "serve" && rest[0]) {
      const at = rest.indexOf("--port"), port = at < 0 ? undefined : Number(rest[at + 1]);
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      // Runs until stopped; what it refuses at the start is reported like any other command's.
      const allowHosts = rest.flatMap((a, i) => (a === "--allow-host" && rest[i + 1] ? [rest[i + 1]!] : []));
      return serve(rest[0], { ...(port === undefined ? {} : { port }), allowHosts, held: rest.includes("--held") }).then(() => new Promise<number>(() => undefined), (e) => {
        if (e instanceof StudyError) { console.error(e.message); return 2; }
        throw e;
      });
    }
    // The guide (M16): `isorite guide`, and by its old names, `isorite --tutorial` and `isorite tutorial`.
    if (command === "guide" || command === "--tutorial" || command === "tutorial") {
      const args = command === "tutorial" && rest[0] === "term" ? rest.slice(1) : rest;
      const at = args.indexOf("--port"), port = at < 0 ? undefined : Number(args[at + 1]);
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      const folder = args.find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--port");
      return guide(folder, port === undefined ? {} : { port }).then(() => new Promise<number>(() => undefined), (e: Error) => { console.error(e.message); return 2; });
    }
    if (command === "term" && rest.includes("--tutorial")) { console.error("The terminal's tour is retired: isorite guide opens the guide, whose note on isorite term says how to try it."); return 2; }
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
      const from = rest[rest.indexOf("--from") + 1], url = rest[rest.indexOf("--url") + 1];
      if (rest.includes("--from") && !from) { console.error("--from takes a folder, or the model's .tgz"); return 2; }
      if (rest.includes("--url") && !/^https?:\/\//.test(url ?? "")) { console.error("--url takes the address of the model's .tgz"); return 2; }
      return modelCommand(rest.includes("--from") ? from : undefined, console.log, process.env, {}, rest.includes("--url") ? url : undefined);
    }
    if (command === "opencode") return installOpenCode();
    if (command === "memory") return memory(rest.find((a) => !a.startsWith("--")));
    if (command === "bases") return bases(rest);
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

/** The commands that start something, which say so at once (M21): a subprocess that stalls after this is then
 *  seen to stall. To stderr, as `mcp` speaks on stdout; once, not again when the command runs itself again with
 *  the proxy on (ISORITE_STARTING). */
const STARTS = new Set(["serve", "term", "mcp", "guide", "tutorial", "--tutorial"]);
export function starting(argv: string[], env: NodeJS.ProcessEnv = process.env, write = (s: string) => process.stderr.write(s)): boolean {
  if (!STARTS.has(argv[0] ?? "") || env.ISORITE_STARTING) return false;
  write("isorite: starting…\n");
  return true;
}

/** The command as run: said to be starting, the proxy turned on (running itself again), the system's authorities
 *  trusted; its exit code. The single executable calls this (M21). */
export async function run(argv: string[]): Promise<number> {
  starting(argv);
  delete process.env.ISORITE_STARTING;
  const env = proxied(process.env);
  if (env) return rerun({ ...env, ISORITE_STARTING: "1" });
  trustSystem();
  return main(argv);
}

// Run as the command, however it is reached: npm installs it as a link, so the path it was run by is resolved first.
// Inside a company, the proxy and the system's authorities are used without flags (network.ts).
// The single executable's argv[1] is itself, as typed: it calls run() (M21).
if (!single() && process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) process.exit(await run(process.argv.slice(2)));
