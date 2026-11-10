// `isorite setup` as a command: its flags, the real ports, and when the first start runs it by itself.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { configPath, deviceId } from "../config.ts";
import { modelCommand } from "../model.ts";
import { runSetup, type Ports, type SetupOptions } from "./wizard.ts";
import { Cancelled, defaults, terminal } from "./prompt.ts";
import { recent } from "../start.ts";
import { repoOf } from "../git.ts";
import { askWhereFilesLive } from "../own-repo.ts";

export const SETUP_USAGE = `isorite setup [options]       a short guided setup: your notes, your agent, a check of this machine, then start
  --yes, -y                   no questions: take the defaults and what the flags below say (for scripts and agents)
  --base <folder>             where the notes live (made if new); default: what is detected here
  --agent <name>              claude-code, codex, gemini-cli, opencode, cursor, vscode, omp (writes that
                              harness's MCP config in the project), own (isorite's own agent) or none
  --provider <name>           for own: anthropic, openai, openrouter, google, ... or gateway
  --model <name>              for own: the model; default: the provider's newest mid-sized one
  --key-env <NAME>            for own: keep the key held in this environment variable (never printed)
  --gateway-url <address>     for own with a gateway: its OpenAI-compatible address
  --test                      for own: send one tiny request to check the key and model
  --fetch-model, --no-fetch-model   the 53 MB model for search by meaning (--yes: not fetched unless asked)
  --offline                   fetch nothing, ask nothing of the network
  --start                     with --yes: start isorite and open the browser at the end
`;

const VALUE = new Set(["--base", "--agent", "--provider", "--model", "--key-env", "--gateway-url", "--port"]);
const FLAG = new Set(["--yes", "-y", "--test", "--fetch-model", "--no-fetch-model", "--offline", "--start", "--help", "--no-open"]);

/** The options the flags name, or the sentence saying what is wrong with them. */
export function parseSetup(argv: string[]): SetupOptions | { error: string } | "help" {
  const o: SetupOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") return "help";
    if (VALUE.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) return { error: `${a} takes a value` };
      if (a === "--base") o.base = v;
      else if (a === "--agent") o.agent = v;
      else if (a === "--provider") o.provider = v;
      else if (a === "--model") o.model = v;
      else if (a === "--key-env") o.keyEnv = v;
      else if (a === "--gateway-url") o.gatewayUrl = v;
      else { const n = Number(v); if (!(Number.isInteger(n) && n > 0 && n < 65536)) return { error: "--port takes a number" }; o.port = n; }
    } else if (FLAG.has(a)) {
      if (a === "--yes" || a === "-y") o.yes = true;
      else if (a === "--test") o.test = true;
      else if (a === "--fetch-model") o.fetchModel = true;
      else if (a === "--no-fetch-model") o.fetchModel = false;
      else if (a === "--offline") o.offline = true;
      else if (a === "--start") o.start = true;
    } else return { error: `setup doesn't know ${a}; isorite setup --help lists the options` };
  }
  return o;
}

/** Setup has not run, and nothing else has made a base or a config yet: the first `isorite` at a terminal. */
export function firstRun(config = configPath()): boolean {
  return !existsSync(config) && recent(config).length === 0;
}

/** The real ports: the machine's own agent code is loaded only when setup reaches it. */
export async function realPorts(o: SetupOptions, extra: Pick<Ports, "start">, interactive: boolean): Promise<Ports> {
  // isorite's own agent is loaded only when a step uses it: it is the slow part of starting.
  let loaded: Promise<InstanceType<typeof import("../pi/index.ts").PiControl>> | null = null;
  const pi = () => (loaded ??= import("../pi/index.ts").then((m) => new m.PiControl(process.env)));
  const prompt = interactive ? terminal() : defaults();
  return {
    prompt,
    env: process.env, cwd: process.cwd(), home: homedir(), config: configPath(),
    agent: {
      models: async (p) => (await pi()).models(p),
      kept: async () => Object.entries(await (await pi()).creds.sources()).filter(([, v]) => v === "saved").map(([k]) => k),
      keep: async (p, k) => (await pi()).creds.set(p, k),
      choose: async (p, m) => (await pi()).choose(p, m),
      check: async (p, m) => (await pi()).check(p, m),
    },
    fetchModel: () => modelCommand(undefined, console.log),
    where: async (notes) => { if (repoOf(notes)) await askWhereFilesLive(notes, (q) => prompt.text(q), console.log, configPath()); },
    ...extra,
  };
}

/** Run setup; the exit code. `interactive` is whether a person is at a terminal and --yes was not given. */
export async function setupCommand(argv: string[], extra: Pick<Ports, "start"> = {}, tty = Boolean(process.stdin.isTTY && process.stdout.isTTY)): Promise<number> {
  const o = parseSetup(argv);
  if (o === "help") { process.stdout.write(SETUP_USAGE); return 0; }
  if ("error" in o) { console.error(o.error); return 2; }
  if (!o.yes && !tty) {
    console.error("isorite setup asks questions, and this is not a terminal. Without one, give the answers as flags:\n  isorite setup --yes --base . --agent claude-code\n(isorite setup --help lists them)");
    return 2;
  }
  const ports = await realPorts(o, extra, !o.yes);
  try {
    const result = await runSetup(o, ports);
    return result.code;
  } catch (e) {
    if (e instanceof Cancelled) { console.log("\nStopped. Nothing is half-written; isorite setup runs again whenever you like."); return 130; }
    throw e;
  } finally {
    // Whatever happened, the first start does not ask again: the config exists from here on.
    try { deviceId(ports.config); } catch { /* a read-only home: the wizard offers itself again, which is all */ }
    ports.prompt.close();
  }
}
