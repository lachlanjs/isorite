import { expect, test } from "vitest";
import { change, insertAt, stamp, type Entry, type Insert, type Rewrite, type Stamp } from "@isorite/core";
import { noteView, type ViewBlock, type ViewChange } from "../plugin/noteview.ts";

let clock = Date.parse("2026-10-18T09:00:00Z");
const at = (who: string): Stamp => stamp(who, "laptop1", null, (clock += 1000));
const NOTE = "---\ntitle: Loop\n---\n\n# The loop\n\nGuess the self-energy.\n\n$$\nG = 1/(iw - S)\n$$\n\n```python\nmix = 0.5\n```\n\n![the loop](/figures/loop.svg)\n";

test("a note's blocks, each marked by who wrote most of it, and of a kind", () => {
  const entries: Entry[] = [];
  entries.push(change(entries, NOTE.replace("Guess the self-energy.", "Guess."), at("external"), "external")!);
  entries.push(change(entries, NOTE, at("you"), "edit")!);
  const view = noteView(NOTE, entries) as ViewBlock[];
  expect(view.map((b) => [b.kind, b.mark])).toEqual([["heading", "outside"], ["text", "you"], ["math", "outside"], ["code", "outside"], ["figure", "outside"]]);
});

test("waiting changes are placed after the block they belong to: new text after its place, a rewrite after its passage's block", () => {
  const entries: Entry[] = [change([], NOTE, at("you"), "edit")!];
  const ins: Insert = { ...at("iso:model"), kind: "proposal", asked: "say more", ...insertAt(NOTE, 7), text: "Then solve the impurity." };
  const rw: Rewrite = { ...at("agent:opencode"), kind: "proposal", form: "rewrite", asked: "plainer", regions: [{ old: { text: "mix = 0.5", nth: 0 }, new: "mix = 0.3" }, { old: { text: "no longer here", nth: 0 }, new: "x" }] };
  entries.push(ins, rw);
  const view = noteView(NOTE, entries);
  expect(view.map((i) => (i.type === "block" ? i.kind : `change:${(i as ViewChange).key.split(":")[1]}`))).toEqual([
    "heading", "text", `change:${ins.id}`, "math", "code", "change:0", "figure", "change:1",
  ]);
  const placed = view.filter((i): i is ViewChange => i.type === "change");
  expect(placed[1]).toMatchObject({ who: "agent:opencode", old: "mix = 0.5", text: "mix = 0.3", region: 0, placed: true });
  expect(placed[2]).toMatchObject({ placed: false });
});
