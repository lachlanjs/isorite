// install.sh (M21): the executable for this machine from a release (here, a local mirror of one), checked against
// its SHA256SUMS, and refused, installing nothing, when it isn't the file expected.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const INSTALL = fileURLToPath(new URL("../../../scripts/install.sh", import.meta.url));
const name = () => {
  const os = { linux: "linux", darwin: "macos" }[process.platform as string];
  const arch = { x64: "x64", arm64: "arm64" }[process.arch as string];
  return os && arch ? `isorite-${os}-${arch}` : null;
};

test.skipIf(!name())("installs the executable a release lists in SHA256SUMS, and refuses one that isn't", async () => {
  const root = mkdtempSync(join(tmpdir(), "isorite-install-")), release = join(root, "release");
  mkdirSync(release);
  // A stand-in for the executable: it answers --version as isorite does.
  const exe = "#!/bin/sh\necho 0.9.0\n";
  writeFileSync(join(release, name()!), exe);
  const sum = createHash("sha256").update(exe).digest("hex");
  writeFileSync(join(release, "SHA256SUMS"), `${sum}  ${name()}\n${"0".repeat(64)}  isorite-windows-x64.exe\n`);
  const server = createServer((req, res) => {
    const file = join(release, req.url!.slice(1));
    if (existsSync(file)) res.end(readFileSync(file)); else res.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${name()}`;
  // Run apart from this process, as the server answering it is in this one.
  const install = (...args: string[]) => new Promise<{ status: number | null; out: string }>((done) => {
    const child = spawn("sh", [INSTALL, "--url", url, ...args]);
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c));
    child.stderr.on("data", (c: Buffer) => (out += c));
    child.on("exit", (status) => done({ status, out }));
  });
  try {
    const ok = await install("--dir", join(root, "bin"));
    expect(ok.status).toBe(0);
    expect(ok.out).toContain(`  fetching ${url.replace(name()!, "SHA256SUMS")}`);
    expect(ok.out).toContain(`isorite: 0.9.0 is ${join(root, "bin", "isorite")} (SHA-256 ${sum})`);

    const wrong = await install("--dir", join(root, "wrong"), "--sha256", "0".repeat(64));
    expect(wrong.status).toBe(1);
    expect(wrong.out).toContain(`is not the file expected: its SHA-256 is ${sum}, not ${"0".repeat(64)}. Nothing was installed.`);
    expect(existsSync(join(root, "wrong"))).toBe(false);
  } finally { server.close(); }
});
