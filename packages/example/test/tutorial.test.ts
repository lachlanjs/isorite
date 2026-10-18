import { expect, test } from "vitest";
import { COST_WORKING, tutorialAnswer, UNSCRIPTED, PROMPTS } from "../src/index.ts";

const user = (content: string, tool = false) => ({ model: "m", messages: [{ role: "user", content }, ...(tool ? [{ role: "tool", content: "x" }] : [])] });

test("the cost of direct summation is marked wrong as first written, and right once the pairs are halved", () => {
  const last = COST_WORKING.split("\n\n").at(-2)!;
  const wrong = JSON.parse(tutorialAnswer(user(`(id: algorithms/direct-summation; …)\n⟦answer⟧${last}⟦/answer⟧`)).text!);
  expect(wrong).toMatchObject({ result: "wrong", moves: { "algorithms/direct-summation": { by: 0 } } });
  expect(wrong.marks.map((m: { mark: string }) => m.mark)).toEqual(["right", "wrong", "wrong"]);
  for (const fixed of ["So there are $N(N-1)/2$ pairs: $2 \\times 10^6$.", "At 20 ns a pair, a step takes 0.04 s."]) {
    const right = JSON.parse(tutorialAnswer(user(`(id: algorithms/direct-summation; …)\n⟦answer⟧${fixed}⟦/answer⟧`)).text!);
    expect(right, fixed).toMatchObject({ result: "right", moves: { "algorithms/direct-summation": { by: 1 } } });
  }
});

test("the quadtree's question looks things up first, then answers; so does the project's; anything else is answered plainly", () => {
  for (const [prompt, words] of [[PROMPTS.insert, "An empty leaf"], [PROMPTS.speed, "ten times fewer"]] as const) {
    const asked = `# What they ask now\n\n${prompt}`;
    expect(tutorialAnswer(user(asked)).calls?.length).toBeGreaterThan(0);
    expect(tutorialAnswer(user(asked, true)).text).toContain(words);
  }
  expect(tutorialAnswer(user("# What they ask now\n\nwrite me a poem")).text).toBe(UNSCRIPTED);
});

test("the TODO is answered as a rewrite; notes for Iso on close encounters and on the octree; an exercise on the note asked from", () => {
  expect(tutorialAnswer(user(`⟦1⟧TODO…⟦/1⟧\n# What they ask now, of the marked passage\n\n${PROMPTS.rewrite}`)).text).toMatch(/^⟦1⟧With \$\\theta = 0.5\$/);
  expect(tutorialAnswer(user("# What they wrote for you\n\nClose encounters…", true)).text).toContain("Soften the force");
  expect(tutorialAnswer(user(`# What they wrote for you\n\n${PROMPTS.octree}`, true)).text).toContain("eight children");
  expect(tutorialAnswer(user("# What it is to test\n\n## Softening (/physics/softening.md)\n\n…")).text).toMatch(/^# What softening is for/);
});
