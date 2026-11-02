#!/usr/bin/env node
// isorite's command line.
//
//   isorite check <notes> [--unused]       lint a folder of notes; --unused lists pictures no note shows
//   isorite serve <notes>                  open it in the browser
//   isorite migrate <study base>           move a study base (format 1) into its notes' .isorite/
//   isorite example <folder>               write the example base, partway built, into a folder
//   isorite mcp [<notes>]                  the knowledge base's tools over MCP, on stdio, for your agent
//   isorite acp --agent "<command>"        your ACP agent, behind your ACP front end or the Iso pane
//   isorite guide [<folder>]               the guide: a knowledge base about isorite, to read in isorite
//   isorite doctor [<notes>] [--report]    whether isorite can work here, a step at a time

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { checkArtifact, columnsOf, manifestOf, parseData } from "@isorite/kit";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StudyError, citeKind } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { doctor } from "./doctor.ts";
import { knownCommand } from "./agents.ts";
import { configPath, rememberBase } from "./config.ts";
import { repoOf } from "./git.ts";
import { ownRepoInfo, setHistoryChoice } from "./own-repo.ts";
import { proxied, rerun, trustSystem } from "./network.ts";
import { single } from "./self.ts";
import { newBase, serve } from "./serve.ts";
import { migrate } from "./migrate.ts";
import { mcp } from "./mcp.ts";
import { acp } from "./acp-wrap.ts";
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
  isorite mcp [<notes>] [--port <n>] [--agent <name>]
                                         the knowledge base's tools over MCP, on stdio, for your agent in its
                                         own terminal: claude mcp add isorite -- isorite mcp <base>
  isorite acp --agent "<command>" [<notes>] [--port <n>] [--pane]
                                         an ACP agent (claude-agent-acp, codex-acp, opencode acp, hermes acp)
                                         behind your ACP front end (Toad, Zed), with the base's MCP, and its
                                         sessions in Iso's pane; --pane: no front end, the pane alone
  isorite model [--from <folder|.tgz>] [--url <url>]
                                         the model for search by meaning: which is installed, and where; else
                                         fetched (53 MB, once) from ISORITE_MODEL_BASE_URL, npm, GitHub or
                                         Hugging Face, or --url alone; or from the .tgz fetched by hand, or a
                                         folder: its files copied there, or any compatible model
  isorite doctor [<notes>] [--report] [--offline]
                                         whether isorite can work here: the configuration, the network, the
                                         model for search by meaning, the server, the notes and the project's
                                         MCP config; --report gives it as one block, to paste to someone (or
                                         an AI) helping
  isorite memory [<folder>]              the agent's memory: a knowledge base (~/isorite-memory unless named),
                                         a git repository of its own, lent to every agent's session
  isorite bases [lend|keep <name>]       the bases this device knows, each listed as it is opened; lend one to
                                         every session, or keep it to itself
  isorite help setup                     how isorite is set up, every setting and failure: written for an AI
                                         helping you set it up (docs/setup.md is for people)
  isorite guide [<folder>] [--port <n>]  the guide: a knowledge base about isorite, with things to do in it,
                                         written into a folder (~/isorite-guide unless named) and opened in
                                         the browser; run again, as you left it (also: isorite --tutorial)
`;

export function check(notes: string, out: (line: string) => void = console.log, unused = false): number {
  const root = resolve(notes);
  if (!existsSync(root) || !statSync(root).isDirectory()) { out(`no folder at ${root}`); return 2; }
  const bundle = loadBundle(root), issues = bundle.lint(), cycles = bundle.requiresCycles();
  for (const i of issues) out(`${i.level.padEnd(7)} ${i.path}: ${i.message}`);
  for (const c of cycles) out(`warning requires cycle: ${c.join(" -> ")}`);
  // Artifacts on the kit (M23): the rules write_artifact keeps, checked of each, with the files beside it.
  let artifactErrors = 0, artifactWarnings = 0;
  for (const f of [...bundle.files].filter((x) => citeKind(x) === "artifact").sort()) {
    const html = readFileSync(join(root, f), "utf8");
    if (manifestOf(html).kit === null) continue; // an HTML file of its own: shown as it is, not checked
    const dir = dirname(join(root, f)), uses = manifestOf(html).uses, files = uses.filter((u) => existsSync(join(dir, u)));
    const columns = Object.fromEntries(files.filter((u) => citeKind(u) === "data").flatMap((u) => { try { return [[u, columnsOf(parseData(u, readFileSync(join(dir, u), "utf8")))]]; } catch { return []; } }));
    for (const b of checkArtifact(html, { files, columns })) {
      out(`${b.level.padEnd(7)} ${f}: ${b.message}`);
      if (b.level === "error") artifactErrors++; else artifactWarnings++;
    }
  }
  const errors = issues.filter((i) => i.level === "error").length + artifactErrors;
  out(`${bundle.concepts.size} notes in ${bundle.directories.size} folders; ${errors} errors, ${issues.length - issues.filter((i) => i.level === "error").length + artifactWarnings} warnings, ${cycles.length} requires cycles`);
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
      // The commands that come next, with the whole path.
      const next = `${made}: a knowledge base, empty. Open it in the browser, and attach your agent from Iso's pane:\n  isorite serve ${made}`;
      // In a git project, asked at a terminal: keep isorite's own files with the project, or apart from it (M27). Nothing is run.
      if (process.stdin.isTTY && process.stdout.isTTY && repoOf(made)) {
        return (async () => {
          const { createInterface } = await import("node:readline/promises");
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          let said = "";
          try { said = (await rl.question(`${made} is in a git project. isorite's own files (.isorite/: journals, kept sessions, settings) can be committed with the project, or kept apart from it, so the people sharing it don't have them.\nKeep them [p]roject / [a]part? (p) `)).trim().toLowerCase(); } finally { rl.close(); }
          const choice = said.startsWith("a") ? "separate" : "project";
          setHistoryChoice(rememberBase(made), choice, configPath());
          if (choice === "separate") {
            const info = ownRepoInfo(join(made, ".isorite"), "separate");
            console.log(`\nTo keep them apart, run these (isorite runs no git itself):\n${info.commands.map((c) => `  ${c}`).join("\n")}\n`);
          }
          console.log(next);
          return 0;
        })();
      }
      console.log(next);
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
    // OpenCode behind isorite (M11) is retired (M25): it is an ACP agent as any other.
    if (command === "term" || command === "opencode") { console.error('isorite term and isorite opencode are retired: attach OpenCode as any agent, from Iso\'s pane or with isorite acp --agent "opencode acp", or give it isorite\'s MCP (isorite doctor offers the project\'s config)'); return 2; }
    if (command === "mcp") {
      const flag = (name: string) => { const at = rest.indexOf(name); return at < 0 ? undefined : rest[at + 1]; };
      const port = flag("--port") === undefined ? undefined : Number(flag("--port")), agent = flag("--agent");
      const session = flag("--session");
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      if (agent !== undefined && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(agent)) { console.error("--agent takes a name in small letters, digits and dashes"); return 2; }
      const path = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--port" && rest[i - 1] !== "--agent" && rest[i - 1] !== "--session");
      return mcp(path, { ...(port === undefined ? {} : { port }), ...(agent ? { agent } : {}), ...(session && /^[\w-]{1,200}$/.test(session) ? { session } : {}) }).catch((e: Error) => { console.error(e.message); return 2; });
    }
    if (command === "acp") {
      const flag = (name: string) => { const at = rest.indexOf(name); return at < 0 ? undefined : rest[at + 1]; };
      const positional = rest.filter((a, i) => !a.startsWith("--") && !["--port", "--agent", "--url"].includes(rest[i - 1] ?? ""));
      // An agent by name (`isorite acp omp`), unless that is a folder here; else its command, `--agent "omp acp"`.
      const named = !flag("--agent") && positional[0] && !existsSync(positional[0]) ? knownCommand(positional[0]) : null;
      const agent = flag("--agent") ?? named ?? undefined, port = flag("--port") === undefined ? undefined : Number(flag("--port"));
      if (!agent) { console.error('isorite acp <omp|opencode|claude|codex|hermes> [<notes>] [--port <n>]\nisorite acp --agent "<the agent\'s ACP command>" [<notes>] [--port <n>] [--pane]'); return 2; }
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) { console.error("--port takes a number"); return 2; }
      // --pane: no front end, the Iso pane alone; --url: the base on the server that started this for it.
      const url = flag("--url"), pane = rest.includes("--pane");
      if (url !== undefined && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+(\/b\/[a-z0-9-]+)?$/.test(url)) { console.error("--url takes a base's address on this machine"); return 2; }
      const path = named ? positional[1] : positional[0];
      return acp(path, { agent, pane, ...(port === undefined ? {} : { port }), ...(url ? { url } : {}) }).catch((e: Error) => { console.error(e.message); return 2; });
    }
    if (command === "model") {
      const from = rest[rest.indexOf("--from") + 1], url = rest[rest.indexOf("--url") + 1];
      if (rest.includes("--from") && !from) { console.error("--from takes a folder, or the model's .tgz"); return 2; }
      if (rest.includes("--url") && !/^https?:\/\//.test(url ?? "")) { console.error("--url takes the address of the model's .tgz"); return 2; }
      return modelCommand(rest.includes("--from") ? from : undefined, console.log, process.env, {}, rest.includes("--url") ? url : undefined);
    }
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
      // Asked only at a terminal: piped or in a script, doctor only says.
      const ask = process.stdin.isTTY && process.stdout.isTTY ? async (question: string) => {
        const { createInterface } = await import("node:readline/promises");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try { return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim()); } finally { rl.close(); }
      } : undefined;
      return doctor(folder, { report: rest.includes("--report"), offline: rest.includes("--offline"), version: VERSION, ...(port === undefined ? {} : { port }), ...(ask ? { ask } : {}) });
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
const STARTS = new Set(["serve", "mcp", "acp", "guide", "tutorial", "--tutorial"]);
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
