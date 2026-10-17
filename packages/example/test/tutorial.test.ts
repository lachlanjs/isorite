import { expect, test } from "vitest";
import { tutorialAnswer, UNSCRIPTED, PROMPTS } from "../src/index.ts";

const user = (content: string, tool = false) => ({ model: "m", messages: [{ role: "user", content }, ...(tool ? [{ role: "tool", content: "x" }] : [])] });

test("the Bethe lattice is marked wrong as first written, and right once Δ = t² G", () => {
  const wrong = JSON.parse(tutorialAnswer(user("(id: dmft/self-consistency-condition; …)\n⟦answer⟧So $\\Delta = t^2/G$.⟦/answer⟧")).text!);
  expect(wrong).toMatchObject({ result: "wrong", moves: { "dmft/self-consistency-condition": { by: 0 } } });
  expect(wrong.marks.map((m: { mark: string }) => m.mark)).toEqual(["right", "wrong"]);
  const right = JSON.parse(tutorialAnswer(user("(id: dmft/self-consistency-condition; …)\n⟦answer⟧So $\\Delta = t^2 G$.⟦/answer⟧")).text!);
  expect(right).toMatchObject({ result: "right", moves: { "dmft/self-consistency-condition": { by: 1 } } });
});

test("the solver's question looks things up first, then answers; anything unscripted is answered plainly", () => {
  const asked = `# What they ask now\n\n${PROMPTS.insert}`;
  expect(tutorialAnswer(user(asked)).calls?.map((c) => c.name)).toEqual(["search_notes", "read_note"]);
  expect(tutorialAnswer(user(asked, true)).text).toContain("Continuous-time quantum Monte Carlo");
  expect(tutorialAnswer(user("# What they ask now\n\nwrite me a poem")).text).toBe(UNSCRIPTED);
});

test("the TODO is answered as a rewrite; an exercise is set on the note asked from", () => {
  expect(tutorialAnswer(user(`⟦1⟧TODO…⟦/1⟧\n# What they ask now, of the marked passage\n\n${PROMPTS.rewrite}`)).text).toMatch(/^⟦1⟧At low temperature/);
  expect(tutorialAnswer(user("# What it is to test\n\n## Weiss field (/dmft/weiss-field.md)\n\n…")).text).toMatch(/^# What the Weiss field is for/);
});
