// The tutorial as isorite --tutorial serves it, without the terminal: the example base written into a temporary
// folder, the tutorial's scripted model, and the isorite server over them with the app built into it, the session
// saying the base is the tutorial's. For the browser's half of the tutorial walked against a real server.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LOCAL_PORT = 4796;

if (process.argv[1] === import.meta.filename) {
  const { writeExample } = await import("@isorite/example/node");
  const { startScripted, tutorialScript } = await import("../../packages/opencode/src/index.ts");
  const root = mkdtempSync(join(tmpdir(), "isorite-local-tutorial-"));
  const base = await writeExample(join(root, "base"));
  const model = await startScripted(tutorialScript(base.notes));
  mkdirSync(join(root, "config", "isorite"), { recursive: true });
  writeFileSync(join(root, "config", "isorite", "config.toml"), `[provider]\nname = "tutorial"\nurl = "${model.url}"\nkey = "tutorial"\n`);
  const server = spawn(process.execPath, [join(import.meta.dirname, "..", "..", "packages", "server", "src", "main.ts"), "serve", base.notes, "--port", String(LOCAL_PORT)], {
    stdio: "inherit",
    env: { ...process.env, ISORITE_TUTORIAL: "1", XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state") },
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { server.kill(); process.exit(0); });
}
