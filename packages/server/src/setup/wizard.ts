// `isorite setup`: four short steps, each with a detected default and each skippable: where the notes are, which agent
// (an existing harness gets isorite's MCP written into its project config; or isorite's own agent gets a provider and a
// key), whether this machine can run it, and starting it. Run again, it finds what is done and changes nothing that is
// already right. All the effects go through the ports below, so the tests run it on temp folders with a scripted person.

import { resolve } from "node:path";
import { OWN_DIR } from "@isorite/core";
import { bold, dim, green, red, yellow } from "../term.ts";
import { rememberBase } from "../config.ts";
import { baseCandidates, prepareBase, shown } from "./base.ts";
import { environmentChecks, type Finding, type Probes } from "./checks.ts";
import { connect, detectHarnesses, harnessById, type FoundHarness } from "./harness.ts";
import { preferredModel, providerStates, writeGateway } from "./own.ts";
import { Cancelled, type Prompter } from "./prompt.ts";

export interface SetupOptions {
  /** Answer every question with its default, and ask only for what was given as a flag. */
  yes?: boolean;
  base?: string;
  /** A harness id (claude-code, codex, gemini-cli, opencode, cursor, vscode, omp), `own`, or `none`. */
  agent?: string;
  provider?: string;
  model?: string;
  gatewayUrl?: string;
  /** The environment variable holding the key to keep (for `own`), or to name in the gateway's config. */
  keyEnv?: string;
  /** Send one tiny request to check the key and model. */
  test?: boolean;
  /** Fetch the 53 MB model for search by meaning; false: don't, null: ask (or, with --yes, don't). */
  fetchModel?: boolean | null;
  offline?: boolean;
  start?: boolean;
  port?: number;
}

/** What the wizard needs from the machine, so it can be run without it. */
export interface Ports {
  prompt: Prompter;
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  /** config.toml's path; bases.toml sits beside it. */
  config: string;
  probes?: Probes;
  /** isorite's own agent: its provider's models, a key kept, a choice made, and one tiny request. */
  agent: {
    models(provider: string): Promise<string[]>;
    /** Which providers have a key kept already. */
    kept(): Promise<string[]>;
    keep(provider: string, key: string): Promise<void>;
    choose(provider: string, model: string): Promise<void>;
    check(provider: string, model: string): Promise<{ ms: number; said: string }>;
  };
  /** Fetch the search model; the exit code. */
  fetchModel(): Promise<number>;
  /** Asked in a git project at a terminal: keep isorite's files with the project or apart. */
  where?(notes: string): Promise<void>;
  /** Start the server on the base and open the browser. Not returned from while it runs. */
  start?(notes: string): Promise<number>;
}

export interface SetupResult {
  notes: string | null;
  agent: "none" | "own" | string;
  /** Steps that could not be done, each a sentence with what to change. */
  problems: string[];
  code: number;
}

const paint = { ok: green("✓"), warn: yellow("!"), fail: red("✗"), skip: dim("–") };
const step = (p: Prompter, n: number, title: string) => p.say(`\n${bold(`${n}/4  ${title}`)}`);

function report(p: Prompter, findings: Finding[]): void {
  for (const f of findings) {
    p.say(`  ${paint[f.outcome]} ${f.step}: ${f.said}`);
    if (f.fix && f.outcome !== "ok") p.say(`      ${dim("to fix:")} ${f.fix}`);
  }
}

async function chooseBase(o: SetupOptions, io: Ports, problems: string[]): Promise<string | null> {
  const p = io.prompt;
  let path: string | null = null;
  if (o.base) path = resolve(io.cwd, o.base);
  else {
    const found = baseCandidates(io.cwd, io.home);
    if (o.yes) path = found[0]!.path;
    else {
      const options = [...found.map((c) => ({ label: c.label, hint: c.hint })), { label: "somewhere else…" }, { label: "skip: choose later" }];
      const i = await p.select("Where should your notes live?", options, 0);
      if (i === found.length + 1) return null;
      path = i === found.length ? resolve(io.cwd, await p.text("Folder:")) : found[i]!.path;
    }
  }
  if (!path) return null;
  try {
    const { path: notes, made } = prepareBase(path);
    rememberBase(notes, { path: io.config });
    p.say(`  ${paint.ok} ${made ? "made" : "using"} ${shown(notes, io.cwd)}${made ? "" : dim(`  (isorite adds ${OWN_DIR}/ here the first time it opens; your files are not touched)`)}`);
    if (made && !o.yes) await io.where?.(notes);
    return notes;
  } catch (e) {
    problems.push((e as Error).message);
    p.say(`  ${paint.fail} ${(e as Error).message}`);
    return null;
  }
}

async function ownAgent(o: SetupOptions, io: Ports, problems: string[]): Promise<boolean> {
  const p = io.prompt, env = io.env;
  const kept = await io.agent.kept().catch(() => [] as string[]);
  const states = providerStates(env).map((s) => ({ ...s, kept: kept.includes(s.id) }));
  let provider = o.provider ?? null;
  if (!provider) {
    if (o.yes) provider = o.gatewayUrl ? "gateway" : states.find((s) => s.set || s.kept)?.id ?? null;
    else {
      const options = [...states.map((s) => ({ label: s.name, hint: s.set ? `key found in ${s.env}` : s.kept ? "key kept already" : "" })), { label: "A company gateway or any OpenAI-compatible address (LiteLLM, Azure, Bedrock or Vertex behind a gateway, Ollama…)" }];
      const i = await p.select("Which model provider?", options, 0);
      provider = i === states.length ? "gateway" : states[i]!.id;
    }
  }
  if (!provider) { problems.push("no provider chosen and no key found in the environment: pass --provider <name>, or set a key such as ANTHROPIC_API_KEY"); p.say(`  ${paint.fail} ${problems.at(-1)}`); return false; }

  try {
    if (provider === "gateway") {
      const url = o.gatewayUrl ?? (o.yes ? "" : await p.text("The gateway's address (https://…/v1):"));
      if (!url) throw new Error("a gateway needs its address: --gateway-url https://…/v1");
      let keyEnv = o.keyEnv;
      if (!keyEnv && !o.yes) keyEnv = (await p.text("The environment variable that holds its key (Enter if it needs none, or to type it in):")) || undefined;
      writeGateway({ url, ...(keyEnv ? { keyEnv } : {}) }, io.config);
      if (!keyEnv && !o.yes && (await p.confirm("Does it need a key you want to type in now?", false))) await io.agent.keep("gateway", await p.secret("Key:"));
      p.say(`  ${paint.ok} gateway ${url} written to ${io.config}. A client certificate (mTLS) goes in that file too: docs/setup.md#isorites-own-agent`);
    } else {
      const s = states.find((x) => x.id === provider);
      if (!s) throw new Error(`"${provider}" is not a provider isorite offers: ${states.map((x) => x.id).join(", ")}, or gateway`);
      if (o.keyEnv) {
        const key = env[o.keyEnv];
        if (!key) throw new Error(`${o.keyEnv} is not set in this terminal`);
        await io.agent.keep(provider, key);
        p.say(`  ${paint.ok} key from ${o.keyEnv} kept in isorite's data folder (readable only by you)`);
      } else if (s.kept) {
        p.say(`  ${paint.ok} using the ${s.name} key kept earlier`);
      } else if (s.set) {
        p.say(`  ${paint.ok} using ${s.env} from your environment`);
        if (!o.yes && (await p.confirm("Keep a copy where isorite keeps keys (readable only by you), so it works from any terminal?", true))) await io.agent.keep(provider, env[s.env]!);
        else p.say(`  ${dim(`start isorite from a terminal where ${s.env} is set`)}`);
      } else if (!o.yes) {
        p.say(`  ${s.name} bills you per use; the key stays on this machine, in a file only you can read.`);
        const key = await p.secret(`Paste your ${s.name} key (or press Enter to do it later in the Agent pane's settings):`);
        if (key) await io.agent.keep(provider, key);
        else { p.say(`  ${paint.skip} no key yet: the pane's settings take it`); return false; }
      } else throw new Error(`no key for ${s.name}: set ${s.env}, or pass --key-env <NAME>`);
    }

    const ids = await io.agent.models(provider).catch(() => []);
    let model = o.model ?? null;
    if (!model) {
      const guess = preferredModel(provider, ids);
      model = o.yes ? guess : guess && (await p.confirm(`Use the model ${bold(guess)}?`, true)) ? guess : await p.text("Model name:", guess ?? undefined);
    }
    if (!model) throw new Error("a model is needed: --model <name>");
    await io.agent.choose(provider, model);
    p.say(`  ${paint.ok} isorite's own agent: ${provider}/${model}`);

    const test = o.test ?? (!o.yes && (await p.confirm("Test it with one tiny request (a few tokens, billed to your key)?", true)));
    if (test) {
      try { const r = await io.agent.check(provider, model); p.say(`  ${paint.ok} it answered in ${r.ms} ms`); } catch (e) {
        problems.push(`the test request failed: ${(e as Error).message}`);
        p.say(`  ${paint.warn} the test request failed: ${(e as Error).message}\n      ${dim("saved anyway; the Agent pane's settings can change the key or model and check again")}`);
      }
    }
    return true;
  } catch (e) {
    if (e instanceof Cancelled) throw e;
    problems.push((e as Error).message);
    p.say(`  ${paint.fail} ${(e as Error).message}`);
    return false;
  }
}

async function chooseAgent(o: SetupOptions, io: Ports, notes: string | null, problems: string[]): Promise<string> {
  const p = io.prompt;
  const harnesses = detectHarnesses(io.env, io.home);
  let pick: string | null = o.agent ?? null;
  if (!pick && o.yes) { p.say(`  ${paint.skip} no agent chosen (--agent <name>, own, or none); attach one in the browser, or run isorite setup again`); return "none"; }
  if (!pick) {
    const listed = harnesses.filter((h) => h.found);
    const options = [
      ...listed.map((h) => ({ label: h.name, hint: `found; gives it your notes through MCP${h.file ? `, by writing ${h.file.path}` : ""}` })),
      { label: "isorite's own agent", hint: "nothing else to install; needs an API key from a model provider (or your company's gateway)" },
      { label: "skip: decide in the browser" },
    ];
    const i = await p.select("Which agent will work with your notes?", options, 0);
    if (i < listed.length) pick = listed[i]!.id;
    else if (i === listed.length) pick = "own";
    else pick = "none";
  }
  if (pick === "none") { p.say(`  ${paint.skip} skipped; the Agent pane in the browser offers every way in`); return "none"; }
  if (pick === "own") return (await ownAgent(o, io, problems)) ? "own" : "none";
  const h = harnessById(pick);
  if (!h) { problems.push(`"${pick}" is not an agent setup knows: ${detectHarnesses(io.env, io.home).map((x: FoundHarness) => x.id).join(", ")}, own, none`); p.say(`  ${paint.fail} ${problems.at(-1)}`); return "none"; }
  if (!notes) { p.say(`  ${paint.skip} ${h.name}: no base yet, so there is nothing to connect it to; run isorite setup again`); return "none"; }
  const c = connect(h, notes);
  if (c.state === "written") p.say(`  ${paint.ok} ${h.name}: isorite's MCP added to ${c.file}. Commit it with the project.`);
  else if (c.state === "present") p.say(`  ${paint.ok} ${h.name}: ${c.file} already has it`);
  else if (c.state === "unreadable") { problems.push(`${c.file} is not valid JSON, so it was left alone: fix it, then run isorite setup again`); p.say(`  ${paint.fail} ${problems.at(-1)}`); return "none"; }
  else p.say(`  ${paint.ok} ${h.name}: ${c.command}`);
  if (c.after) p.say(`      ${dim(c.after)}`);
  return h.id;
}

/** The whole of `isorite setup`. */
export async function runSetup(o: SetupOptions, io: Ports): Promise<SetupResult> {
  const p = io.prompt, problems: string[] = [];
  p.say(`${bold("isorite setup")}  ${dim("four short steps; Enter takes the default, and every step can be skipped or run again later")}`);

  step(p, 1, "Your notes");
  const notes = await chooseBase(o, io, problems);

  step(p, 2, "Your agent");
  const agent = await chooseAgent(o, io, notes, problems);

  step(p, 3, "Can this machine run it?");
  const findings = await environmentChecks({ env: io.env, ...(notes ? { notes } : {}), ...(o.port ? { port: o.port } : {}), ...(o.offline ? { offline: true } : {}), ...(io.probes ? { probes: io.probes } : {}) });
  report(p, findings);
  for (const f of findings) if (f.outcome === "fail") problems.push(`${f.step}: ${f.said}${f.fix ? `; to fix: ${f.fix}` : ""}`);
  const search = findings.find((f) => f.step === "search by meaning");
  if (search?.outcome === "ok" && /can be fetched/.test(search.said)) {
    const yes = o.fetchModel ?? (!o.yes && (await p.confirm("Fetch the 53 MB model for search by meaning now? (Without it, search is by words.)", true)));
    if (yes) {
      const code = await io.fetchModel();
      if (code) { p.say(`  ${paint.warn} the fetch did not finish; search is by words, and isorite model tries again any time`); }
    } else p.say(`  ${dim("not fetched; isorite model fetches it whenever you want it")}`);
  }

  step(p, 4, "Done");
  p.say(problems.length ? `  ${yellow(`${problems.length} thing${problems.length === 1 ? "" : "s"} to look at (above).`)} isorite doctor says what to change, and isorite setup can be run again.` : `  ${green("Everything is in place.")}`);
  p.say(`  Next time, in your project's folder: ${bold("isorite")}`);
  let code = problems.length ? 1 : 0;
  if (notes && io.start) {
    const go = o.start ?? (!o.yes && (await p.confirm("Start isorite now and open it in your browser?", true)));
    if (go) { p.close(); code = await io.start(notes); }
  }
  return { notes, agent, problems, code };
}
