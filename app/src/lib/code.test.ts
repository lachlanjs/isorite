// Code coloured by its language (M19): the fence's name found, the language loaded once, and the code given the
// highlighter's classes, escaped.

import { describe, expect, test } from "vitest";
import { highlight, highlighted, languageOf } from "./code.ts";

describe("code coloured by its language", () => {
  test("a fence's language is found by its name or an alias, and nothing for one not known", () => {
    expect(languageOf("python")?.name).toBe("Python");
    expect(languageOf("ts")?.name).toBe("TypeScript");
    expect(languageOf("julia {.numbered}")?.name).toBe("Julia");
    expect(languageOf("")).toBeNull();
    expect(languageOf("isorite")).toBeNull();
    expect(languageOf("mermaid")).toBeNull();
  });

  test("Python is coloured once loaded: keywords, strings, numbers and comments, the rest as it is, escaped", async () => {
    const code = 'def f(x):\n    return x < 2 and "a&b"  # small';
    const html = await highlight(code, "python");
    expect(html).toContain('<span class="tok-k">def</span>');
    expect(html).toContain('<span class="tok-n">2</span>');
    expect(html).toContain('<span class="tok-s">"a&amp;b"</span>');
    expect(html).toContain('<span class="tok-c"># small</span>');
    expect(html).toContain("x &lt; ");
    expect(html!.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&amp;/g, "&")).toBe(code);
    // Loaded now, so the same is had at once.
    expect(highlighted(code, "python")).toBe(html);
  });

  test("a language not loaded yet gives nothing at once; one not known, nothing at all", async () => {
    expect(highlighted("fn main() {}", "rust")).toBeNull();
    expect(await highlight("fn main() {}", "rust")).toContain('<span class="tok-k">fn</span>');
    expect(await highlight("anything", "no-such-language")).toBeNull();
  });

  test("a legacy mode (Julia) and a type name (TypeScript) are coloured", async () => {
    expect(await highlight("function f(x)\n  return 1\nend", "julia")).toContain('<span class="tok-k">function</span>');
    expect(await highlight("let n: number = 1", "typescript")).toContain('<span class="tok-t">number</span>');
  });
});
