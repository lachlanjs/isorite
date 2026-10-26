import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { doctor, type DoctorOptions } from "../src/doctor.ts";
import { modelDir } from "../src/model.ts";

/** A gateway as OpenAI's API answers, which can be told to refuse stream_options or to drop tools. */
let gateway: Server, url: string;
const behave = { refuseStreamOptions: false, dropTools: false, models: ["small", "big"] };
beforeAll(async () => {
  gateway = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => {
      if (req.url === "/v1/models") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: behave.models.map((id) => ({ id })) })); return; }
      const body = JSON.parse(b) as { tools?: unknown[]; stream_options?: unknown };
      if (behave.refuseStreamOptions && body.stream_options) { res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "Unrecognized request argument supplied: stream_options" } })); return; }
      const tool = body.tools?.length && !behave.dropTools;
      const delta = tool ? { tool_calls: [{ index: 0, id: "c1", function: { name: "ping", arguments: "{}" } }] } : { content: "ready" };
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: tool ? "tool_calls" : "stop" }], ...(body.stream_options ? { usage: { prompt_tokens: 9, completion_tokens: 1 } } : {}) })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((done) => gateway.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/v1`;
});

const made: string[] = [];
afterAll(() => { gateway.close(); for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** doctor, on a config.toml of its own, with OpenCode 2 found and its lines kept. */
async function run(toml: string | null, o: DoctorOptions & { folder?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "isorite-doctor-"));
  made.push(root);
  mkdirSync(join(root, "isorite"));
  if (toml !== null) writeFileSync(join(root, "isorite", "config.toml"), toml);
  const lines: string[] = [];
  const code = await doctor(o.folder, { port: 1, probe: () => "opencode v2.0.32", execArgv: [], ...o, env: { XDG_CONFIG_HOME: root, ...o.env }, out: (l) => lines.push(l) });
  return { code, text: lines.join("\n") };
}
const work = (more = "") => `[provider]\nname = "work"\nurl = "${url}"\nkey = "sk-work-secret"\n${more}[tiers]\nlow = "small"\nmid = "big"\nmax = "big"\n`;

describe("isorite doctor", () => {
  it("passes a gateway that answers, streams, reports usage and calls tools", async () => {
    Object.assign(behave, { refuseStreamOptions: false, dropTools: false });
    const { code, text } = await run(work());
    expect(text).toContain("✓ key: <14 characters>, sent as Authorization: Bearer");
    expect(text).toContain(`✓ reached: ${url}/models answered with 2 models`);
    expect(text).toContain('✓ reply from big: "ready", 9 tokens in and 1 out');
    expect(text).toContain("✓ tools: big called ping");
    expect(text).toContain("through isorite's server at http://127.0.0.1:1/api/gateway");
    expect(text).toMatch(/nothing failed$/);
    expect(code).toBe(0);
  });

  it("says which models the gateway doesn't have, and that OpenRouter's names were kept", async () => {
    const { text } = await run(work().replace('max = "big"', 'max = "huge"'));
    expect(text).toContain("✗ models: huge not among them; it has small, big. Name its models under [tiers]");
    const kept = await run(`[provider]\nurl = "${url}"\nkey = "k"\n`, { offline: true });
    expect(kept.text).toContain("! models: low anthropic/claude-haiku-4.5");
    expect(kept.text).toContain("OpenRouter's names, kept because [tiers] names none");
  });

  it("names stream_usage = false for a gateway that refuses stream_options", async () => {
    Object.assign(behave, { refuseStreamOptions: true });
    const { text } = await run(work());
    expect(text).toContain("✗ reply from small: work said 400: Unrecognized request argument supplied: stream_options. Set stream_usage = false under [provider].");
    const fixed = await run(work("stream_usage = false\n"));
    expect(fixed.text).toContain('✓ reply from small: "ready"\n');
    Object.assign(behave, { refuseStreamOptions: false });
  });

  it("fails a gateway that drops the tools", async () => {
    Object.assign(behave, { dropTools: true });
    expect((await run(work())).text).toContain("✗ tools: big answered without calling the tool");
    Object.assign(behave, { dropTools: false });
  });

  it("says why a gateway can't be reached, and asks nothing more of it", async () => {
    const { code, text } = await run(work().replace(url, "http://127.0.0.1:9/v1"));
    expect(text).toMatch(/✗ reached: bad port/);
    expect(text).not.toContain("reply from");
    expect(code).toBe(1);
  });

  it("asks nothing with --offline, and fails without a key or configuration", async () => {
    const { code, text } = await run(null, { offline: true });
    expect(text).toContain("! config: there is no");
    expect(text).toContain("✗ key: none");
    expect(text).toContain("– provider: not asked (--offline)");
    expect(text).toContain("OpenCode's own models");
    expect(code).toBe(1);
  });

  it("says a proxy is ignored unless Node is told, and how to reach the browser over SSH", async () => {
    const { text } = await run(work(), { offline: true, env: { HTTPS_PROXY: "http://me:hunter2@proxy.corp:8080", SSH_CONNECTION: "10.0.0.2 5000 10.0.0.3 22" } });
    expect(text).toContain("! proxy: http://me:<hidden>@proxy.corp:8080 is set, but Node ignores it unless started with NODE_USE_ENV_PROXY=1, as the isorite command does");
    expect(text).toContain("✓ browser: over SSH: on your own machine, ssh -L 1:localhost:1 <this host>, then http://localhost:1/");
  });

  it("names a setting whose variable isn't set, and a notes folder that isn't there", async () => {
    const { text } = await run(`[provider]\nurl = "${url}"\nkey = "k"\n[provider.headers]\nX-Project = "$PROJECT"\n`, { offline: true, folder: "/nowhere/notes" });
    expect(text).toContain('✗ config: [provider] headers.X-Project is "$PROJECT", and PROJECT is not set');
    expect(text).toContain("✗ notes: no folder at /nowhere/notes");
    expect(text).toContain("! terminal: not known until config.toml is fixed");
  });

  it("gives a report with the configuration and environment, its secrets shown only by their lengths", async () => {
    const toml = work('key_header = "api-key"\npfx_passphrase = "literal-pass"\n').replace("[tiers]", '[provider.headers]\nX-Team = "notes"\nX-Api-Token = "tok-123"\nX-Project = "$PROJECT"\n[tiers]');
    const { text } = await run(toml, { report: true, offline: true, version: "0.2.0", env: { PROJECT: "p", ISORITE_GATEWAY_KEY: "gk-999", HTTPS_PROXY: "http://me:hunter2@proxy:8080", NODE_USE_ENV_PROXY: "1" } });
    expect(text.startsWith("```isorite doctor report\nisorite 0.2.0, node ")).toBe(true);
    for (const secret of ["sk-work-secret", "literal-pass", "tok-123", "gk-999", "hunter2"]) expect(text).not.toContain(secret);
    expect(text).toContain('"key": "<14 characters>"');
    expect(text).toContain('"key_header": "api-key"');
    expect(text).toContain('"X-Team": "notes"');
    expect(text).toContain('"X-Project": "$PROJECT"');
    expect(text).toContain("ISORITE_GATEWAY_KEY=<6 characters>");
    expect(text).toContain("HTTPS_PROXY=http://me:<hidden>@proxy:8080");
    expect(text).toContain("– provider: not asked (--offline)");
    expect(text.endsWith("```")).toBe(true);
  });
});

describe("isorite help setup", () => {
  it("prints the setup guide written for an AI helping someone", async () => {
    const { execFileSync } = await import("node:child_process");
    const main = new URL("../src/main.ts", import.meta.url).pathname;
    const said = execFileSync(process.execPath, [main, "help", "setup"], { encoding: "utf8" });
    expect(said.startsWith("# Setting isorite up: for an AI helping someone")).toBe(true);
    expect(said).toContain("isorite doctor --report");
  });
});

describe("search by meaning", () => {
  it("is a warning, not a failure, without a model: search by words works alone", async () => {
    const { code, text } = await run(work(), { offline: true, env: { ISORITE_EMBED_DIR: "/nowhere/model" } });
    expect(text).toContain("! search by meaning: no model in /nowhere/model: isorite model fetches it (53 MB). Search by words works without it");
    expect(code).toBe(0);
  });
  it("names the model and where it is, and is skipped when switched off", async () => {
    const real = modelDir({});
    if (real) expect((await run(work(), { offline: true, env: { ISORITE_EMBED_DIR: real } })).text).toContain(`✓ search by meaning: granite-embedding-small-english-r2 at ${real}`);
    expect((await run(work(), { offline: true, env: { ISORITE_EMBED: "off" } })).text).toContain("– search by meaning: switched off (ISORITE_EMBED=off)");
  });
});

it("warns when certificate checks are off for everything, and says isorite doesn't need it", async () => {
  const { text } = await run(work(), { offline: true, env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
  expect(text).toContain("! authorities: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off checking certificates for everything, and isorite doesn't need it");
});
