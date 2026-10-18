// A stage for looking at isorite term by hand, as the end-to-end test sets it: the example base, the scripted
// gateway, and the environment. Writes a shell script that runs `isorite term` on it, and keeps the gateway up.
//
//   node test/fixtures/stage.ts <folder>
//   bash <folder>/term.sh
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeExample } from "@isorite/example/node";
import { findOpenCode } from "../../src/opencode.ts";
import { startGateway } from "./gateway.ts";

const root = process.argv[2]!;
const MAIN = fileURLToPath(new URL("../../../server/src/main.ts", import.meta.url));
const base = await writeExample(join(root, "base"));
mkdirSync(join(root, "code"), { recursive: true });
const gateway = await startGateway(() => ({ text: "Mixing keeps part of the old bath." }));
mkdirSync(join(root, "config", "isorite"), { recursive: true });
writeFileSync(join(root, "config", "isorite", "config.toml"), `[provider]\nname = "scripted"\nurl = "${gateway.url}"\nkey = "iso-key"\n`);
const env = {
  ISORITE_OPENCODE: findOpenCode().command, ISORITE_GATEWAY_URL: gateway.url, ISORITE_GATEWAY_MODELS: "scripted", ISORITE_GATEWAY_KEY: "test-key",
  XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
};
writeFileSync(join(root, "term.sh"), `${Object.entries(env).map(([k, v]) => `export ${k}='${v}'`).join("\n")}\ncd '${join(root, "code")}'\nexec '${process.execPath}' '${MAIN}' term '${base.study}' --port \${PORT:-4791}\n`);
console.log(`ready: bash ${join(root, "term.sh")}`);
