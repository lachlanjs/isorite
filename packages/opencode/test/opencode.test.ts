import { describe, expect, it } from "vitest";
import { findOpenCode, parseVersion } from "../src/opencode.ts";

describe("finding OpenCode 2", () => {
  it("reads the version from --version", () => {
    expect(parseVersion("opencode v2.0.32\n")).toBe("2.0.32");
    expect(parseVersion("1.19.3")).toBe("1.19.3");
    expect(parseVersion("nothing")).toBeNull();
  });

  it("takes opencode2 before opencode", () => {
    const versions: Record<string, string> = { opencode2: "opencode v2.0.32", opencode: "1.19.3" };
    expect(findOpenCode({}, (c) => versions[c] ?? null)).toEqual({ command: "opencode2", version: "2.0.32" });
  });

  it("passes over an OpenCode 1 and says what it found", () => {
    expect(() => findOpenCode({}, (c) => (c === "opencode" ? "1.19.3" : null))).toThrow(/opencode2: not found; opencode: 1\.19\.3/);
  });

  it("takes only ISORITE_OPENCODE when it is set", () => {
    const seen: string[] = [];
    const found = findOpenCode({ ISORITE_OPENCODE: "/opt/oc" }, (c) => { seen.push(c); return "opencode v2.1.0"; });
    expect(found).toEqual({ command: "/opt/oc", version: "2.1.0" });
    expect(seen).toEqual(["/opt/oc"]);
  });
});
