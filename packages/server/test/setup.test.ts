// isorite setup: what it detects, what it writes, and the wizard run by a scripted person on temp folders, with the
// agent's provider and the network as fakes. No key is ever in what it says.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { baseCandidates, markdownIn, prepareBase } from "../src/setup/base.ts";
import { environmentChecks, type Probes } from "../src/setup/checks.ts";
import { connect, detectHarnesses, harnessById } from "../src/setup/harness.ts";
import { preferredModel, writeGateway } from "../src/setup/own.ts";
import { parseSetup } from "../src/setup/index.ts";
import { Cancelled, type Prompter } from "../src/setup/prompt.ts";
import { runSetup, type Ports } from "../src/setup/wizard.ts";
import { knownBases, readConfig } from "../src/config.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "isorite-setup-"));
const git = (dir: string) => { execFileSync("git", ["init", "-q", dir]); return dir; };
const write = (file: string, text = "# x\n") => { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, text); };
const bin = (...names: string[]) => { const d = tmp(); for (const n of names) { write(join(d, n), "#!/bin/sh\n"); chmodSync(join(d, n), 0o755); } return d; };

describe("where the notes could live", () => {
  it("finds an Obsidian vault, a Markdown folder, or offers a new notes folder", () => {
    const vault = tmp(); write(join(vault, ".obsidian", "app.json"), "{}"); write(join(vault, "Daily", "a.md"));
    const inside = join(vault, "Daily");
    expect(baseCandidates(inside, "/nowhere")[0]).toMatchObject({ kind: "vault", path: vault });

    const project = git(tmp()); write(join(project, "notes", "a.md")); write(join(project, "src", "x.ts"), "");
    expect(baseCandidates(project, "/nowhere")[0]).toMatchObject({ kind: "markdown", path: join(project, "notes") });

    const bare = git(tmp());
    expect(baseCandidates(bare, "/nowhere")[0]).toMatchObject({ kind: "new", path: join(bare, "notes") });
  });

  it("offers the base that is already here first", () => {
    const project = git(tmp()); mkdirSync(join(project, "notes", ".isorite"), { recursive: true });
    expect(baseCandidates(project, "/nowhere")[0]).toMatchObject({ kind: "base", path: join(project, "notes") });
  });

  it("counts Markdown without walking into node_modules, and makes a base without touching a folder of files", () => {
    const d = tmp(); write(join(d, "a.md")); write(join(d, "node_modules", "p", "b.md")); write(join(d, ".git", "c.md"));
    expect(markdownIn(d)).toBe(1);
    const fresh = join(tmp(), "n", "notes");
    expect(prepareBase(fresh)).toEqual({ path: fresh, made: true });
    expect(existsSync(join(fresh, ".isorite"))).toBe(true);
    expect(prepareBase(fresh).made).toBe(false); // again: nothing new
    expect(prepareBase(d)).toEqual({ path: d, made: false });
    expect(existsSync(join(d, ".isorite"))).toBe(false); // opened as it is; isorite adds its folder when it opens
    write(join(d, "file"), "x");
    expect(() => prepareBase(join(d, "file"))).toThrow(/is a file/);
  });
});

describe("harnesses", () => {
  it("are found on PATH or by their home folder, found first", () => {
    const home = tmp(); mkdirSync(join(home, ".cursor"));
    const found = detectHarnesses({ PATH: bin("claude", "codex") }, home).filter((h) => h.found).map((h) => h.id);
    expect(found.sort()).toEqual(["claude-code", "codex", "cursor"]);
    expect(detectHarnesses({ PATH: bin() }, tmp()).some((h) => h.found)).toBe(false);
    expect(harnessById("Claude")?.id).toBe("claude-code");
  });

  it("get isorite's MCP written, keeping what the file holds, and again changes nothing", () => {
    const project = git(tmp()), notes = join(project, "notes"); mkdirSync(notes);
    write(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    const first = connect(harnessById("claude-code")!, notes);
    expect(first.state).toBe("written");
    const json = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf8"));
    expect(json.mcpServers.other).toEqual({ command: "x" });
    expect(json.mcpServers.isorite).toEqual({ command: "isorite", args: ["mcp", "notes"] });
    expect(connect(harnessById("claude-code")!, notes).state).toBe("present");
    expect(connect(harnessById("cursor")!, notes)).toMatchObject({ state: "written", file: join(project, ".cursor", "mcp.json") });
    expect(JSON.parse(readFileSync(join(project, ".cursor", "mcp.json"), "utf8")).mcpServers.isorite.args).toEqual(["mcp", "notes"]);
    expect(connect(harnessById("vscode")!, notes).state).toBe("written");
    expect(JSON.parse(readFileSync(join(project, ".vscode", "mcp.json"), "utf8")).servers.isorite.type).toBe("stdio");
  });

  it("leaves a file that is not JSON alone, and gives a command where the config is the user's", () => {
    const project = git(tmp()), notes = join(project, "notes"); mkdirSync(notes);
    write(join(project, ".mcp.json"), "{ not json");
    expect(connect(harnessById("claude-code")!, notes).state).toBe("unreadable");
    expect(readFileSync(join(project, ".mcp.json"), "utf8")).toBe("{ not json");
    expect(connect(harnessById("codex")!, notes)).toMatchObject({ state: "manual", command: `codex mcp add isorite -- isorite mcp "${notes}"` });
  });
});

describe("the environment checks", () => {
  const probes = (over: Partial<Probes> = {}): Probes => ({ portFree: async () => true, reach: async () => null, nodeVersion: "24.1.0", ...over });
  const by = <T extends { step: string }>(fs: T[], step: string) => fs.filter((f) => f.step === step);

  it("pass on a plain machine", async () => {
    const out = await environmentChecks({ env: { XDG_DATA_HOME: tmp() }, notes: join(tmp(), "n"), probes: probes() });
    expect(out.every((f) => f.outcome === "ok")).toBe(true);
  });

  it("say what to change: old Node, an unreadable CA file, a model that cannot be fetched, with the fix beside each", async () => {
    const out = await environmentChecks({ env: { XDG_DATA_HOME: tmp(), NODE_EXTRA_CA_CERTS: "/no/ca.pem", HTTPS_PROXY: "http://proxy.corp:8080", NODE_TLS_REJECT_UNAUTHORIZED: "0" }, probes: probes({ nodeVersion: "20.5.0", reach: async () => "the company's certificate is not trusted" }) });
    expect(by(out, "node")[0]).toMatchObject({ outcome: "fail", fix: expect.stringContaining("one-file") });
    expect(by(out, "certificates").map((f) => f.outcome)).toEqual(["fail", "warn"]);
    expect(by(out, "proxy")[0]!.said).toContain("proxy.corp:8080");
    expect(by(out, "search by meaning")[0]).toMatchObject({ outcome: "warn", said: expect.stringContaining("search is by words") });
  });

  it("don't ask the network offline, and a busy port is not a failure", async () => {
    let asked = 0;
    const out = await environmentChecks({ env: { XDG_DATA_HOME: tmp() }, offline: true, probes: probes({ portFree: async () => false, reach: async () => { asked++; return null; } }) });
    expect(asked).toBe(0);
    expect(by(out, "port")[0]!.outcome).toBe("ok");
    expect(by(out, "search by meaning")[0]!.outcome).toBe("skip");
  });
});

describe("isorite's own agent", () => {
  it("offers the newest plain model", () => {
    expect(preferredModel("anthropic", ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "claude-sonnet-5", "claude-sonnet-5-5", "claude-opus-5"])).toBe("claude-sonnet-5-5");
    expect(preferredModel("openrouter", ["anthropic/claude-sonnet-5:batch", "anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-5.5"])).toBe("anthropic/claude-sonnet-5.5");
    expect(preferredModel("mistral", ["a:b", "m-large"])).toBe("m-large");
    expect(preferredModel("x", [])).toBeNull();
  });

  it("writes a gateway into config.toml with the key as a name, keeping the rest", () => {
    const path = join(tmp(), "config.toml"); write(path, 'device = "abcd1234"\n');
    writeGateway({ url: "https://gw.example.com/v1/", keyEnv: "GW_KEY" }, path);
    expect(readConfig(path)).toMatchObject({ device: "abcd1234", provider: { url: "https://gw.example.com/v1", key: "$GW_KEY" } });
    expect(() => writeGateway({ url: "gw" }, path)).toThrow(/not an address/);
    expect(() => writeGateway({ url: "https://x", keyEnv: "a b" }, path)).toThrow(/environment variable/);
  });
});

describe("the flags", () => {
  it("are read, and a wrong one is said", () => {
    expect(parseSetup(["--yes", "--base", ".", "--agent", "claude-code", "--no-fetch-model"])).toEqual({ yes: true, base: ".", agent: "claude-code", fetchModel: false });
    expect(parseSetup(["--base"])).toEqual({ error: "--base takes a value" });
    expect(parseSetup(["--wat"])).toMatchObject({ error: expect.stringContaining("doesn't know --wat") });
    expect(parseSetup(["--port", "x"])).toEqual({ error: "--port takes a number" });
    expect(parseSetup(["--help"])).toBe("help");
  });
});

/** A person who answers from a script: a number for a list, text for a line; the lines said are kept. */
function person(answers: (string | boolean | number)[]): Prompter & { said: string[]; asked: string[] } {
  const said: string[] = [], asked: string[] = [];
  const next = (q: string) => { asked.push(q); if (!answers.length) throw new Cancelled(); return answers.shift()!; };
  return {
    said, asked, say: (l) => said.push(l), close: () => undefined,
    select: async (q, options, def = 0) => { const a = next(q); return a === "" ? def : (a as number) < options.length ? (a as number) : def; },
    confirm: async (q, def = true) => { const a = next(q); return a === "" ? def : a === true; },
    text: async (q, def) => String(next(q) || def || ""),
    secret: async (q) => String(next(q)),
  };
}

function machine(over: Partial<Ports> & { person: Prompter; env?: NodeJS.ProcessEnv }) {
  const home = tmp(), cwd = git(tmp()), kept: Record<string, string> = {}, chosen: string[] = [], tested: string[] = [];
  const ports: Ports = {
    env: { PATH: bin(), XDG_DATA_HOME: tmp(), ...over.env }, cwd, home, config: join(home, "config.toml"), prompt: over.person,
    probes: { portFree: async () => true, reach: async () => null, nodeVersion: "24.0.0" },
    agent: {
      models: async () => ["claude-sonnet-4-5", "claude-sonnet-5-5"], kept: async () => Object.keys(kept),
      keep: async (p, k) => { kept[p] = k; }, choose: async (p, m) => { chosen.push(`${p}/${m}`); },
      check: async (p, m) => { tested.push(`${p}/${m}`); return { ms: 12, said: "ready" }; },
    },
    fetchModel: async () => 0,
    ...over,
  };
  delete (ports as Partial<{ person: unknown }>).person;
  return { ports, cwd, home, kept, chosen, tested };
}

describe("the wizard", () => {
  it("--yes with flags: makes the base, connects the harness, changes nothing on a second run, prints no key", async () => {
    const p = person([]);
    const m = machine({ person: p, env: { ANTHROPIC_API_KEY: "sk-ant-SECRET" } });
    const o = { yes: true, base: "notes", agent: "claude-code", offline: true };
    const r = await runSetup(o, m.ports);
    expect(r).toMatchObject({ notes: join(m.cwd, "notes"), agent: "claude-code", problems: [], code: 0 });
    expect(existsSync(join(m.cwd, ".mcp.json"))).toBe(true);
    expect(knownBases(m.ports.config).map((b) => b.path)).toEqual([join(m.cwd, "notes")]);
    const again = await runSetup(o, m.ports);
    expect(again.code).toBe(0);
    expect(p.said.join("\n")).toContain("already has it");
    expect(p.said.join("\n")).not.toContain("SECRET");
  });

  it("--yes with own: takes the key from the environment, chooses the newest model, tests only when asked", async () => {
    const p = person([]), m = machine({ person: p, env: { ANTHROPIC_API_KEY: "sk-ant-SECRET" } });
    const r = await runSetup({ yes: true, base: "n", agent: "own", provider: "anthropic", offline: true }, m.ports);
    expect(r.code).toBe(0);
    expect(m.chosen).toEqual(["anthropic/claude-sonnet-5-5"]);
    expect(m.tested).toEqual([]);
    expect(m.kept).toEqual({}); // left in the environment
    await runSetup({ yes: true, base: "n", agent: "own", provider: "anthropic", keyEnv: "ANTHROPIC_API_KEY", test: true, offline: true }, m.ports);
    expect(m.kept).toEqual({ anthropic: "sk-ant-SECRET" });
    expect(m.tested).toEqual(["anthropic/claude-sonnet-5-5"]);
    expect(p.said.join("\n")).not.toContain("SECRET");
  });

  it("--yes with own and no key says what to set, and exits 1", async () => {
    const p = person([]), m = machine({ person: p });
    const r = await runSetup({ yes: true, base: "n", agent: "own", provider: "openai", offline: true }, m.ports);
    expect(r.code).toBe(1);
    expect(r.problems[0]).toContain("set OPENAI_API_KEY");
  });

  it("--yes with no agent named attaches nothing", async () => {
    const m = machine({ person: person([]) });
    expect((await runSetup({ yes: true, base: "n", offline: true }, m.ports)).agent).toBe("none");
    expect(existsSync(join(m.cwd, ".mcp.json"))).toBe(false);
  });

  it("asks, takes defaults on Enter, and types a key that is kept but never shown", async () => {
    // base: Enter (new notes/); agent: own (no harness found, so it is the first); provider: Enter (the first, OpenRouter);
    // key typed; model: Enter; test: yes; fetch model: no; start: no.
    const p = person(["", "", "", "sk-or-TYPED", "", true, false, false]);
    const m = machine({ person: p });
    const r = await runSetup({}, m.ports);
    expect(r.agent).toBe("own");
    expect(m.kept).toEqual({ openrouter: "sk-or-TYPED" });
    expect(m.tested).toHaveLength(1);
    expect(p.said.join("\n")).not.toContain("TYPED");
    expect(p.asked.join("\n")).not.toContain("TYPED");
  });

  it("a failed test is said with the reason and does not undo the choice", async () => {
    const m = machine({ person: person([]) });
    m.ports.agent.check = async () => { throw new Error("401: the key was refused"); };
    const r = await runSetup({ yes: true, base: "n", agent: "own", provider: "anthropic", keyEnv: "K", test: true, offline: true }, { ...m.ports, env: { ...m.ports.env, K: "k" } });
    expect(r.problems[0]).toContain("401: the key was refused");
    expect(m.chosen).toHaveLength(1);
  });

  it("stops cleanly when the person does (Ctrl-C): the error is the wizard's own", async () => {
    const m = machine({ person: person([0]) }); // answers the base, then nothing
    await expect(runSetup({}, m.ports)).rejects.toBeInstanceOf(Cancelled);
  });

  it("fetches the model only when asked, and says when it cannot be reached", async () => {
    let fetched = 0;
    const m = machine({ person: person([]), fetchModel: async () => { fetched++; return 0; } });
    await runSetup({ yes: true, base: "n", agent: "none" }, m.ports);
    expect(fetched).toBe(0);
    await runSetup({ yes: true, base: "n", agent: "none", fetchModel: true }, m.ports);
    expect(fetched).toBe(1);
    const p = person([]);
    const off = machine({ person: p, probes: { portFree: async () => true, reach: async () => "connection refused", nodeVersion: "24.0.0" } });
    await runSetup({ yes: true, base: "n", agent: "none" }, off.ports);
    expect(p.said.join("\n")).toContain("search is by words");
  });
});
