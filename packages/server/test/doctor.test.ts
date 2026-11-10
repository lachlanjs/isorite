import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { doctor, type DoctorOptions } from "../src/doctor.ts";
import { modelDir } from "../src/model.ts";

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** doctor, on a config.toml of its own, its lines kept. */
async function run(toml: string | null, o: DoctorOptions & { folder?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "isorite-doctor-"));
  made.push(root);
  mkdirSync(join(root, "isorite"));
  if (toml !== null) writeFileSync(join(root, "isorite", "config.toml"), toml);
  const lines: string[] = [];
  const code = await doctor(o.folder, { port: 1, execArgv: [], ...o, env: { XDG_CONFIG_HOME: root, ...o.env }, out: (l) => lines.push(l) });
  return { code, text: lines.join("\n") };
}
const DEVICE = 'device = "abcd1234"\n';

describe("isorite doctor", () => {
  it("passes with no configuration yet, and asks nothing with --offline", async () => {
    const { code, text } = await run(null, { offline: true, env: { ISORITE_EMBED: "off" } });
    expect(text).toContain("✓ config: there is no");
    expect(text).toContain("✓ port: 1 is free: isorite mcp starts a server there");
    expect(text).toMatch(/nothing failed$/);
    expect(code).toBe(0);
  });

  it("says the agent's provider, from before M25, is no longer read", async () => {
    const { text } = await run(`${DEVICE}[provider]\nkey = "sk-or-old"\n[tiers]\nmid = "x"\n`, { offline: true });
    expect(text).toContain("its [provider] and [tiers] were the agent's, and are no longer read; your agent's model is its own");
    expect(text).not.toContain("sk-or-old");
  });

  it("takes over isorite check: the notes' links in a line, a broken one named", async () => {
    const notes = mkdtempSync(join(tmpdir(), "isorite-doctor-notes-"));
    made.push(notes);
    mkdirSync(join(notes, ".isorite"));
    writeFileSync(join(notes, "a.md"), "---\ntitle: A\n---\n\nSee [[nowhere]].\n");
    const { text } = await run(DEVICE, { offline: true, folder: notes, env: { ISORITE_EMBED: "off" } });
    expect(text).toMatch(/[✓!✗] links: 1 notes; \d+ errors, \d+ warnings, 0 requires cycles/);
    expect(text).toContain("a.md");
  });

  it("fails a configuration that can't be read", async () => {
    const { code, text } = await run("device = \n", { offline: true });
    expect(text).toMatch(/✗ config: .*config\.toml/);
    expect(code).toBe(1);
  });

  it("says a proxy is ignored unless Node is told, and how to reach the browser over SSH", async () => {
    const { text } = await run(DEVICE, { offline: true, env: { HTTPS_PROXY: "http://me:hunter2@proxy.corp:8080", SSH_CONNECTION: "10.0.0.2 5000 10.0.0.3 22" } });
    expect(text).toContain("! proxy: http://me:<hidden>@proxy.corp:8080 is set, but Node ignores it unless started with NODE_USE_ENV_PROXY=1, as the isorite command does");
    expect(text).toContain("✓ browser: over SSH: on your own machine, ssh -L 1:localhost:1 <this host>, then http://localhost:1/");
  });

  it("names a notes folder that isn't there", async () => {
    const { text } = await run(DEVICE, { offline: true, folder: "/nowhere/notes" });
    expect(text).toContain(`✗ notes: no folder at ${resolve("/nowhere/notes")}`);
  });

  it("gives a report with the configuration and environment, its secrets shown only by their lengths", async () => {
    const { text } = await run(`${DEVICE}[provider]\nkey = "sk-work-secret"\n`, { report: true, offline: true, version: "0.2.0", env: { HTTPS_PROXY: "http://me:hunter2@proxy:8080", NODE_USE_ENV_PROXY: "1" } });
    expect(text.startsWith("```isorite doctor report\nisorite 0.2.0, node ")).toBe(true);
    for (const secret of ["sk-work-secret", "hunter2"]) expect(text).not.toContain(secret);
    expect(text).toContain('"key": "<14 characters>"');
    expect(text).toContain("HTTPS_PROXY=http://me:<hidden>@proxy:8080");
    expect(text.endsWith("```")).toBe(true);
  });
});

describe("isorite help setup", () => {
  it("prints the setup guide written for an AI helping someone", async () => {
    const { execFileSync } = await import("node:child_process");
    const main = (await import("node:url")).fileURLToPath(new URL("../src/main.ts", import.meta.url));
    const said = execFileSync(process.execPath, [main, "help", "setup"], { encoding: "utf8" });
    expect(said.startsWith("# Setting isorite up: for an AI helping someone")).toBe(true);
    expect(said).toContain("isorite doctor --report");
  });
});

describe("search by meaning", () => {
  it("is a warning, not a failure, without a model: search by words works alone", async () => {
    const { code, text } = await run(DEVICE, { offline: true, env: { ISORITE_EMBED_DIR: "/nowhere/model" } });
    expect(text).toContain("! search by meaning: no model in /nowhere/model: isorite model fetches it (53 MB). By hand: https://github.com/lachlanjs/isorite/releases/download/model-granite-1.0.0/isorite-model-granite-1.0.0.tgz (SHA-256 8d8ab528ae289dfc81fd2bfa80c867ca0c8342a2d98f7c86141df4b15fdf028c), then isorite model --from <that file>. Search by words works without it");
    // A mirror is named, and asked whether it answers when the network is checked.
    const closed = await new Promise<number>((done) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as AddressInfo).port; s.close(() => done(p)); }); });
    const mirrored = await run(DEVICE, { env: { ISORITE_EMBED_DIR: "/nowhere/model", ISORITE_MODEL_BASE_URL: `http://127.0.0.1:${closed}/models/` } });
    expect(mirrored.text).toContain(`http://127.0.0.1:${closed}/models/isorite-model-granite-1.0.0.tgz can't be reached from here: connect ECONNREFUSED`);
    expect(mirrored.text).toContain(`By hand: http://127.0.0.1:${closed}/models/isorite-model-granite-1.0.0.tgz (SHA-256`);
    expect(code).toBe(0);
  });
  it("names the model and where it is, and is skipped when switched off", async () => {
    const real = modelDir({});
    if (real) expect((await run(DEVICE, { offline: true, env: { ISORITE_EMBED_DIR: real } })).text).toContain(`✓ search by meaning: granite-embedding-small-english-r2 at ${real}`);
    expect((await run(DEVICE, { offline: true, env: { ISORITE_EMBED: "off" } })).text).toContain("– search by meaning: switched off (ISORITE_EMBED=off)");
  });
});

it("warns when certificate checks are off for everything, and says isorite doesn't need it", async () => {
  const { text } = await run(DEVICE, { offline: true, env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
  expect(text).toContain("! authorities: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off checking certificates for everything, and isorite doesn't need it");
});
