import { describe, expect, it } from "vitest";
import { join, win32 } from "node:path";
import { findOpenCode, NoOpenCode, onWindowsPath, ownCommand, ownPrefix, parseVersion } from "../src/opencode.ts";

const env = { XDG_CONFIG_HOME: "/home/me/.config" };

describe("finding OpenCode 2", () => {
  it("reads the version from --version", () => {
    expect(parseVersion("opencode v2.0.32\n")).toBe("2.0.32");
    expect(parseVersion("1.19.3")).toBe("1.19.3");
    expect(parseVersion("nothing")).toBeNull();
  });

  it("takes isorite's own prefix, then opencode2, then opencode", () => {
    expect(ownPrefix(env)).toBe(join("/home/me/.config", "isorite", "opencode-cli"));
    const versions: Record<string, string> = { [ownCommand(env)]: "opencode v2.0.32", opencode2: "opencode v2.1.4", opencode: "1.19.3" };
    expect(findOpenCode(env, (c) => versions[c] ?? null)).toEqual({ command: ownCommand(env), version: "2.0.32", from: "isorite opencode" });
    delete versions[ownCommand(env)];
    expect(findOpenCode(env, (c) => versions[c] ?? null)).toEqual({ command: "opencode2", version: "2.1.4", from: "the PATH" });
  });

  it("names an OpenCode 1 it found, and gives the line that installs OpenCode 2 for isorite alone", () => {
    let err: NoOpenCode | null = null;
    try { findOpenCode(env, (c) => (c === "opencode" ? "1.19.3" : null)); } catch (e) { err = e as NoOpenCode; }
    expect(err).toBeInstanceOf(NoOpenCode);
    expect(err!.old).toBe("opencode 1.19.3");
    expect(err!.message).toMatch(/^isorite term needs OpenCode 2; opencode 1\.19\.3 is OpenCode 1 \(opencode2: not found; opencode: 1\.19\.3\)\./);
    expect(err!.message).toContain(`isorite opencode   (npm install --prefix ${join("/home/me/.config", "isorite", "opencode-cli")} @opencode/cli@2.0.32)`);
    expect(err!.message).not.toContain("npm i -g");
  });

  it("takes only ISORITE_OPENCODE when it is set", () => {
    const seen: string[] = [];
    const found = findOpenCode({ ISORITE_OPENCODE: "/opt/oc" }, (c) => { seen.push(c); return "opencode v2.1.0"; });
    expect(found).toEqual({ command: "/opt/oc", version: "2.1.0", from: "ISORITE_OPENCODE" });
    expect(seen).toEqual(["/opt/oc"]);
  });

  it("on Windows, runs the package's opencode.exe, not npm's .cmd, which Node won't run without a shell", () => {
    expect(ownCommand(env, "win32")).toBe(join(ownPrefix(env), "node_modules", "@opencode", "cli", "bin", "opencode.exe"));
    const npm = "C:\\Users\\me\\AppData\\Roaming\\npm";
    const exe = win32.join(npm, "node_modules", "@opencode", "cli", "bin", "opencode.exe");
    const files = new Set([win32.join(npm, "opencode2.cmd"), exe]);
    const winEnv = { ...env, PATH: ["C:\\Windows", npm].join(";") };
    expect(onWindowsPath("opencode2", winEnv, (p) => files.has(p))).toBe(exe);
    expect(onWindowsPath("opencode", winEnv, (p) => files.has(p))).toBeNull();
    const seen: string[] = [];
    const found = findOpenCode(winEnv, (c) => { seen.push(c); return c === exe ? "opencode v2.0.32" : null; }, "win32", (n, e) => onWindowsPath(n, e, (p) => files.has(p)));
    expect(found).toEqual({ command: exe, version: "2.0.32", from: "the PATH" });
    expect(seen).toEqual([ownCommand(env, "win32"), exe]);
  });
});
