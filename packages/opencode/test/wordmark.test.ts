import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lines, PATH, rows, word } from "../plugin/wordmark.ts";

describe("the wordmark", () => {
  it("is drawn from the browser's own path", () => {
    const svelte = readFileSync(new URL("../../../app/src/lib/components/Logo.svelte", import.meta.url), "utf8");
    expect(/<path d="([^"]+)"/.exec(svelte)?.[1]).toBe(PATH);
  });

  it("has every row as wide, so that centred it stays aligned", () => {
    const widths = rows().map((runs) => [...runs.map((r) => r.text).join("")].length);
    expect(new Set(widths).size).toBe(1);
  });

  it("puts Iso's diamond over the first i and the malachite one over the second, each on its stem", () => {
    const [cap, , , , , , , , , foot] = lines();
    const centres = [...cap!].flatMap((ch, k) => (ch === "█" ? [k] : []));
    expect(centres).toHaveLength(2);
    for (const k of centres) expect([...foot!][k]).toBe("█");
    expect(rows()[0]!.filter((r) => r.role !== "ink").map((r) => r.role)).toEqual(["iso", "right"]);
  });

  it("in OpenCode's letters, has the i one cell wide and the others four", () => {
    expect(word("iso")[1]).toBe("█ █▀▀▀ █▀▀█");
  });
});
