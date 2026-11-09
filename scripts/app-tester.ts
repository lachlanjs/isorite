// Sets up a fresh sandbox for the "app tester" subagent (.claude/agents/app-tester.md): a folder with only the README
// (and the docs it links to), a home of its own so nothing of this machine's isorite is seen, a stand-in for a company's
// AI gateway (no real key, no cost), and the helper that drives a browser. Prints what the person would be told.
//   node scripts/app-tester.ts            make a sandbox, start the stand-in, print the brief
//   node scripts/app-tester.ts --stub <p> (internal) the stand-in gateway, on port p
// The stand-in answers every question with the same line: this checks the way in, not the quality of an answer.

import { spawn } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANSWER = "This is the stand-in gateway's one answer: it does not read your notes.";

const at = process.argv.indexOf("--stub");
if (at > 0) stub(Number(process.argv[at + 1]));
else main();

function stub(port: number): void {
  const chunk = (delta: object, finish: string | null = null, extra: object = {}) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "stand-in", choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
  createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer test-key") { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "bad or missing key" } })); return; }
      if (req.method === "GET" && req.url?.startsWith("/v1/models")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data: [{ id: "stand-in" }, { id: "stand-in-large" }] })); return; }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(chunk({ role: "assistant", content: ANSWER }));
      res.write(chunk({}, "stop", { usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 } }));
      res.end("data: [DONE]\n\n");
    });
  }).listen(port, "127.0.0.1");
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), "isorite-tester-")), home = join(dir, "home"), work = join(dir, "project");
  mkdirSync(home, { recursive: true }); mkdirSync(work, { recursive: true }); mkdirSync(join(dir, "bin"), { recursive: true });
  cpSync(join(REPO, "README.md"), join(work, "README.md"));
  for (const f of ["setup.md", "terminal.md"]) cpSync(join(REPO, "docs", f), join(work, "docs", f));
  cpSync(join(REPO, "docs", "assets"), join(work, "docs", "assets"), { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  spawn(process.execPath, [fileURLToPath(import.meta.url), "--stub", String(port)], { detached: true, stdio: "ignore" }).unref();
  // `isorite`, as the README has it, but this checkout, with a home of its own.
  const env = `HOME='${home}' XDG_CONFIG_HOME='${home}/.config' XDG_DATA_HOME='${home}/.local/share' XDG_CACHE_HOME='${home}/.cache' ISORITE_EMBED=off BROWSER=true`;
  writeFileSync(join(dir, "bin", "isorite"), `#!/bin/sh\nexec env ${env} node '${join(REPO, "packages/server/src/main.ts")}' "$@"\n`);
  chmodSync(join(dir, "bin", "isorite"), 0o755);
  // Run as `node ui.mjs <steps.mjs>`: the helper for driving the browser (see the agent's brief).
  cpSync(join(REPO, "scripts", "app-tester-ui.mjs"), join(dir, "ui.mjs"));
  mkdirSync(join(dir, "shots"), { recursive: true });
  console.log(JSON.stringify({
    sandbox: dir,
    folder: work,
    path: `${join(dir, "bin")} (put it first on PATH so that \`isorite\` runs)`,
    browser_helper: join(dir, "ui.mjs"),
    screenshots: join(dir, "shots"),
    config_file: join(home, ".config", "isorite", "config.toml"),
    note_from_it: `Our AI gateway is at http://127.0.0.1:${port}/v1 and the key is test-key. There is no client certificate on this one.`,
  }, null, 2));
}
