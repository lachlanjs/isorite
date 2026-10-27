// isorite opencode (M21): OpenCode 2 installed in isorite's own prefix, with a stand-in npm, and found there after.

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ownPrefix } from "@isorite/opencode";
import { installOpenCode } from "../src/term.ts";

/** An npm that installs an opencode2 saying it's 2.0.32 in the prefix it's given, and keeps what it was asked. */
function standInNpm(root: string, works = true): string {
  const npm = join(root, "npm");
  writeFileSync(npm, `#!/bin/sh
echo "$@" > "${join(root, "asked")}"
${works ? `prefix="$3"; mkdir -p "$prefix/node_modules/.bin"
printf '#!/bin/sh\\necho opencode v2.0.32\\n' > "$prefix/node_modules/.bin/opencode2"; chmod +x "$prefix/node_modules/.bin/opencode2"` : "exit 1"}
`);
  chmodSync(npm, 0o755);
  return npm;
}

test.skipIf(process.platform === "win32")("installs OpenCode 2 in isorite's own prefix, pinned, and finds it there", () => {
  const root = mkdtempSync(join(tmpdir(), "isorite-opencode-")), env = { PATH: "/usr/bin:/bin", XDG_CONFIG_HOME: join(root, "config") };
  const said: string[] = [];
  expect(installOpenCode(env, (l) => said.push(l), standInNpm(root))).toBe(0);
  expect(readFileSync(join(root, "asked"), "utf8").trim()).toBe(`install --prefix ${ownPrefix(env)} --no-fund --no-audit --loglevel=error @opencode/cli@2.0.32`);
  expect(said[0]).toBe(`isorite opencode: installing @opencode/cli@2.0.32 in ${join(root, "config", "isorite", "opencode-cli")}, for isorite alone; nothing global is changed`);
  expect(said.at(-1)).toBe(`OpenCode 2.0.32 is ${join(ownPrefix(env), "node_modules", ".bin", "opencode2")}: isorite term uses it from now on`);
});

test.skipIf(process.platform === "win32")("when npm can't install it, says how to name one fetched another way", () => {
  const root = mkdtempSync(join(tmpdir(), "isorite-opencode-")), said: string[] = [];
  expect(installOpenCode({ PATH: "/usr/bin:/bin", XDG_CONFIG_HOME: join(root, "config") }, (l) => said.push(l), standInNpm(root, false))).toBe(1);
  expect(said.at(-1)).toContain("ISORITE_OPENCODE=/path/to/opencode isorite term");
});
