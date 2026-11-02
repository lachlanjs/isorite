// The agents already on this machine (M26): found on PATH, their keys looked for by name, a missing key told as that.

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { detectAgents, missingKey, onPath } from "../src/detect.ts";

function bin(...names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "isorite-bin-"));
  for (const n of names) { writeFileSync(join(dir, n), "#!/bin/sh\n"); chmodSync(join(dir, n), 0o755); }
  return dir;
}

test.skipIf(process.platform === "win32")("agents on PATH are found, with whether their key is set", () => {
  const env = { PATH: bin("claude", "npx", "codex", "opencode") };
  const found = Object.fromEntries(detectAgents(env).map((d) => [d.id, d]));
  expect(Object.keys(found).sort()).toEqual(["claude", "codex", "opencode"]);
  expect(found.claude).toMatchObject({ ready: true, keySet: false, command: "npx -y @agentclientprotocol/claude-agent-acp" });
  expect(found.claude!.note).toContain("fine if you've signed in");
  expect(found.codex!.note).toContain("CODEX_API_KEY or OPENAI_API_KEY isn't set in the terminal isorite was started from");
  expect(found.opencode).toMatchObject({ keys: [], ready: true });

  const set = Object.fromEntries(detectAgents({ ...env, ANTHROPIC_API_KEY: "x" }).map((d) => [d.id, d]));
  expect(set.claude).toMatchObject({ keySet: true });
  expect(set.claude!.note).toBe("Claude Code is installed and ANTHROPIC_API_KEY is set here.");
  expect(JSON.stringify(set)).not.toContain('"x"'); // names, never values
});

test.skipIf(process.platform === "win32")("an agent run with npx is not ready where npx is missing; nothing on PATH finds nothing", () => {
  const env = { PATH: bin("claude") };
  expect(detectAgents(env)[0]).toMatchObject({ id: "claude", ready: false });
  expect(detectAgents(env)[0]!.note).toContain("needs npx");
  expect(detectAgents({ PATH: bin() })).toEqual([]);
  expect(onPath("claude", { PATH: "" })).toBeNull();
});

test("a stop with the key unset is told as that; a key set, or an agent of its own, says nothing", () => {
  const command = "npx -y @agentclientprotocol/codex-acp";
  expect(missingKey(command, {})).toContain("CODEX_API_KEY or OPENAI_API_KEY is not set in the terminal isorite was started from");
  expect(missingKey(command, { OPENAI_API_KEY: "x" })).toBe("");
  expect(missingKey("opencode acp", {})).toBe("");
  expect(missingKey("something else", {})).toBe("");
});
