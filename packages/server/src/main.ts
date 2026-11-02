#!/usr/bin/env node
// isorite's command line.
//
//   isorite [--no-open] [--port <n>]       at a terminal: open the base here, or choose one; else this help
//   isorite check <notes> [--unused]       lint a folder of notes; --unused lists pictures no note shows
//   isorite serve <notes>                  open it in the browser
//   isorite migrate <study base>           move a study base (format 1) into its notes' .isorite/
//   isorite example <folder>               write the example base, partway built, into a folder
//   isorite mcp [<notes>]                  the knowledge base's tools over MCP, on stdio, for your agent
//   isorite acp --agent "<command>"        your ACP agent, behind your ACP front end or the Iso pane
//   isorite guide [<folder>]               the guide: a knowledge base about isorite, to read in isorite
//   isorite doctor [<notes>] [--report]    whether isorite can work here, a step at a time

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { checkArtifact, columnsOf, manifestOf, parseData } from "@isorite/kit";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StudyError, citeKind, repairFrontmatter } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { doctor } from "./doctor.ts";
import { knownCommand } from "./detect.ts";
import { configPath, rememberBase } from "./config.ts";
import { repoOf } from "./git.ts";
import { askWhereFilesLive } from "./own-repo.ts";
import { proxied, rerun, trustSystem } from "./network.ts";
import { single } from "./self.ts";
import { newBase, serve } from "./serve.ts";
import { migrate } from "./migrate.ts";
import { mcp } from "./mcp.ts";
import { acp } from "./acp-wrap.ts";
import { guide } from "./guide.ts";
import { writeExample, writeGeometry } from "@isorite/example/node";
import { bases, memory } from "./memory.ts";
import { VERSION } from "./version.ts";
import { findBase, freePort, offerModel, start } from "./start.ts";
import { cacheDir } from "./embedder.ts";
import { modelCommand, modelDir } from "./model.ts";
import { openBrowser } from "./running.ts";
import { bold, dim, green, helpText, red, yellow } from "./term.ts";


const SHORT = `isorite: an agentic harness for understanding

  isorite                 open the base here, or choose one
  isorite doctor          can isorite work here, and what to change if not
  isorite help            this; help all lists every command
  isorite --version

Notes are plain Markdown in a folder of your project. Your agent reads and writes them with you.
`;

const USAGE = `isorite: an agentic harness for understanding

  isorite new <folder>                   a new base: an empty folder with .isorite/
  isorite check <notes> [--unused] [--fix]
                                         lint: frontmatter, links, cycles; --unused: pictures no note
                                         shows; --fix: quote a colon in frontmatter
  isorite serve <notes> [--port <n>] [--allow-host <name>]
                                         open it in the browser, on this machine only
  isorite migrate <study base> [--merge] a study base (format 1) into its notes' .isorite/
  isorite example <folder> [--geometry]  an example base, partway built, in an empty folder
  isorite mcp [<notes>] [--port <n>] [--agent <name>]
                                         the base's tools over MCP, on stdio:
                                         claude mcp add isorite -- isorite mcp <base>
  isorite acp --agent "<command>" [<notes>] [--port <n>] [--pane]
                                         an ACP agent behind your ACP front end, its sessions in Iso's
                                         pane; --pane: the pane alone
  isorite model [--from <folder|.tgz>] [--url <url>]
                                         the model for search by meaning: which, and where; else fetch it
                                         (53 MB, once)
  isorite doctor [<notes>] [--report] [--offline]
                                         can isorite work here, a step at a time; --report: one block to
                                         paste to someone helping
  isorite memory [<folder>]              the agent's memory: a base of its own, lent to every session
  isorite bases [lend|keep <name>]       the bases this device knows; lend one to every session, or keep it
  isorite help setup                     every setting and failure, written for an AI helping you set up
  isorite guide [<folder>] [--port <n>]  the guide: a base about isorite, to do things in (--tutorial)
`;

export function check(notes: string, out: (line: string) => void = console.log, unused = false, fix = false): number {
  const root = resolve(notes);
  if (!existsSync(root) || !statSync(root).isDirectory()) { out(`no folder at ${root}`); return 2; }
  let bundle = loadBundle(root), issues = bundle.lint();
  // An unquoted colon in a field (`title: Foo: bar`, as agents often write it) is mended on request (M29): only the lines
  // the parser refused are put in quotes.
  const mendable = issues.filter((i) => i.code === "frontmatter-invalid").flatMap((i) => { const m = repairFrontmatter(readFileSync(join(root, i.path), "utf8")); return m ? [{ path: i.path, ...m }] : []; });
  if (fix && mendable.length) {
    for (const m of mendable) { writeFileSync(join(root, m.path), m.text); out(`fixed   ${m.path}: quoted ${m.fixed.join(", ")}`); }
    bundle = loadBundle(root); issues = bundle.lint();
  }
  const cycles = bundle.requiresCycles();
  const level = (l: string) => (l === "error" ? red(l) : yellow(l)) + " ".repeat(Math.max(0, 7 - l.length));
  for (const i of issues) out(`${level(i.level)} ${bold(i.path)}: ${i.message}${i.code === "frontmatter-invalid" && !fix && mendable.some((m) => m.path === i.path) ? " (isorite check --fix quotes it)" : ""}`);
  for (const c of cycles) out(`${level("warning")} requires cycle: ${c.join(" -> ")}`);
  // Artifacts on the kit (M23): the rules write_artifact keeps, checked of each, with the files beside it.
  let artifactErrors = 0, artifactWarnings = 0;
  for (const f of [...bundle.files].filter((x) => citeKind(x) === "artifact").sort()) {
    const html = readFileSync(join(root, f), "utf8");
    if (manifestOf(html).kit === null) continue; // an HTML file of its own: shown as it is, not checked
    const dir = dirname(join(root, f)), uses = manifestOf(html).uses, files = uses.filter((u) => existsSync(join(dir, u)));
    const columns = Object.fromEntries(files.filter((u) => citeKind(u) === "data").flatMap((u) => { try { return [[u, columnsOf(parseData(u, readFileSync(join(dir, u), "utf8")))]]; } catch { return []; } }));
    for (const b of checkArtifact(html, { files, columns })) {
      out(`${level(b.level)} ${bold(f)}: ${b.message}`);
      if (b.level === "error") artifactErrors++; else artifactWarnings++;
    }
  }
  const errors = issues.filter((i) => i.level === "error").length + artifactErrors;
  const warnings = issues.length - issues.filter((i) => i.level === "error").length + artifactWarnings;
  out(`${dim(`${bundle.concepts.size} notes in ${bundle.directories.size} folders;`)} ${(errors ? red : green)(`${errors} errors`)}, ${(warnings ? yellow : green)(`${warnings} warnings`)}, ${cycles.length} requires cycles`);
  // The pictures no note shows or links to (M22): yours to keep or delete, so information, never a warning.
  if (unused) {
    const cited = new Set([...bundle.concepts.values()].flatMap((c) => c.cites.map((x) => x.target)));
    const idle = [...bundle.files].filter((f) => citeKind(f) === "image" && !cited.has(f)).sort();
    for (const f of idle) out(`unused  ${f}`);
    out(idle.length ? `${idle.length} ${idle.length === 1 ? "picture" : "pictures"} no note shows` : "every picture is shown by a note");
  }
  return errors ? 1 : 0;
}

/** `isorite` at a terminal: asks on stdin, starts a server on the first free port (4767 up) and opens the page. */
async function terminalStart({ port, noOpen }: { port: number | undefined; noOpen: boolean }): Promise<number> {
  const { createInterface } = await import("node:readline/promises");
  const ask = async (question: string) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); try { return (await rl.question(question)).trim(); } finally { rl.close(); } };
  const browser = !noOpen && !process.env.SSH_CONNECTION && process.env.ISORITE_NO_BROWSER !== "1";
  const confirm = async (q: string) => /^y(es)?$/i.test(await ask(`${q} [y/N] `));
  // Asked on the first start without the model; a no is kept in the cache folder.
  const declined = join(cacheDir(), "model-declined");
  const model = () => offerModel({
    installed: modelDir() !== null, off: process.env.ISORITE_EMBED === "off", declined: existsSync(declined), confirm,
    fetch: () => modelCommand(undefined, console.log), out: console.log,
    decline: () => { try { mkdirSync(dirname(declined), { recursive: true }); writeFileSync(declined, ""); } catch { /* asked again next time */ } },
  });
  const serving = async (notes: string, at = "") => {
    await model();
    const use = port ?? await freePort();
    await serve(notes, { port: use });
    if (browser) openBrowser(`http://localhost:${use}/${at}`);
    return new Promise<number>(() => undefined);
  };
  return start({
    cwd: process.cwd(), config: configPath(), out: console.log,
    confirm,
    choose: async (q, count) => { const n = Number(await ask(`${q} [1-${count}] `)); return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : null; },
    open: (notes) => serving(notes),
    make: (folder) => { const made = newBase(folder); console.log(`  made ${made}`); return made; },
    made: async (notes) => { await askWhereFilesLive(notes, ask, console.log, configPath()); },
    guide: async () => { await model(); const use = port ?? await freePort(); await guide(undefined, { port: use }); return new Promise<number>(() => undefined); },
  });
}

export function main(argv: string[]): number | Promise<number> {
  const [command, ...rest] = argv;
  try {
    // M26: at a terminal, no command finds the base to open; piped, the help as always.
    if ((!command || command === "--no-open" || command === "--port") && process.stdin.isTTY && process.stdout.isTTY) {
      const args = command ? [command, ...rest] : rest, at = args.indexOf("--port"), asked = at < 0 ? undefined : Number(args[at + 1]);
      if (asked !== undefined && !(Number.isInteger(asked) && asked > 0 && asked < 65536)) { console.error("--port takes a number"); return 2; }
      return terminalStart({ port: asked, noOpen: args.includes("--no-open") });
    }
    if (command === "check" && rest.find((r) => !r.startsWith("--"))) return check(rest.find((r) => !r.startsWith("--"))!, console.log, rest.includes("--unused"), rest.includes("--fix"));
    if (command === "new" && rest[0]) {
      const made = newBase(rest[0]);
      // The commands that come next, with the whole path.
      const next = `${made}: a knowledge base, empty. Open it in the browser, and attach your agent from Iso's pane:\n  isorite serve ${made}`;
      // In a git project, asked at a terminal: keep isorite's own files with the project, or apart from it (M27).
      if (process.stdin.isTTY && process.stdout.isTTY && repoOf(made)) {
        return (async () => {
          const { createInterface } = await import("node:readline/promises");
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          try { await askWhereFilesLive(made, (q) => rl.question(q), console.log, configPath()); } finally { rl.close(); }
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
      const named = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--port");
      // Run in a project with no folder named, it checks that project's base (M26).
      const here = named ? undefined : findBase(process.cwd());
      const folder = named ?? (here?.kind === "base" ? here.notes : undefined);
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
  // The four a person needs; the rest are in `isorite help all` and still work (M26).
  process.stdout.write(helpText(command === "help" && rest[0] === "all" ? USAGE : command && command !== "help" && command !== "--help" ? USAGE : SHORT));
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
