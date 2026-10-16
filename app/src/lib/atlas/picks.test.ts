import { describe, expect, test } from "vitest";
import { linkedIn, short, testsIn, titleIn, withLink, withoutLink, withTest } from "./picks.ts";

const head = `---\ntype: Concept\ntitle: "Self-consistency, in my words"\n---\n\n`;

describe("the notes a note for Iso is linked to", () => {
  test("are those its text links to, once each, in order", () => {
    expect(linkedIn(`${head}From [the bit](/basics/bit.md "requires") and [this](/coding/a%20b.md#part), and [the bit](/basics/bit.md) again. Not [out](https://x.org/y.md).`)).toEqual(["basics/bit", "coding/a b"]);
  });
  test("one picked is a line at the foot, and the next stands under it", () => {
    const one = withLink(`${head}What I think.\n`, "basics/bit", "The bit");
    expect(one).toBe(`${head}What I think.\n\n[The bit](/basics/bit.md)\n`);
    expect(withLink(one, "coding/a b", "A [b]")).toBe(`${head}What I think.\n\n[The bit](/basics/bit.md)\n[A b](/coding/a%20b.md)\n`);
    expect(withLink(head, "basics/bit", "The bit")).toBe(`${head}[The bit](/basics/bit.md)\n`);
    expect(linkedIn(withLink(one, "coding/a b", "A b"))).toEqual(["basics/bit", "coding/a b"]);
  });
  test("one picked is taken away again; one written into the prose is left", () => {
    const two = withLink(withLink(`${head}What I think.\n`, "basics/bit", "The bit"), "basics/surprise", "Surprise");
    expect(withoutLink(two, "basics/bit")).toBe(`${head}What I think.\n\n[Surprise](/basics/surprise.md)\n`);
    expect(withoutLink(withoutLink(two, "basics/bit")!, "basics/surprise")).toBe(`${head}What I think.\n`);
    expect(withoutLink(`${head}It rests on [the bit](/basics/bit.md).\n`, "basics/bit")).toBeNull();
    expect(withoutLink(`${head}It rests on [the bit](/basics/bit.md).\n\n[The bit](/basics/bit.md)\n`, "basics/bit")).toBeNull();
    expect(withoutLink(two, "basics/absent")).toBeNull();
  });
  test("a draft's title, and a size said shortly", () => {
    expect(titleIn(head)).toBe("Self-consistency, in my words");
    expect(titleIn(`---\ntype: Concept\ntitle: ""\n---\n\ntitle: not this\n`)).toBe("");
    expect([940, 1234, 14_400].map(short)).toEqual(["940", "1.2k", "14k"]);
  });
});

describe("picking what a request for an exercise tests", () => {
  const request = "---\ntype: Exercise\nfolder: basics\ntests: [basics/surprise]\n---\n\nA calculation, please.\n";
  test("its tests are read from the frontmatter; another draft has none", () => {
    expect(testsIn(request)).toEqual(["basics/surprise"]);
    expect(testsIn("---\ntype: Concept\ntitle: x\n---\n\n[a](/a.md)\n")).toBeNull();
  });
  test("a pick adds a note to them and a second takes it out; what was written is left alone", () => {
    const added = withTest(request, "basics/bit");
    expect(testsIn(added)).toEqual(["basics/surprise", "basics/bit"]);
    expect(added.endsWith("A calculation, please.\n")).toBe(true);
    expect(testsIn(withTest(added, "basics/surprise"))).toEqual(["basics/bit"]);
  });
});
