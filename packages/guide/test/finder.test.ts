import { expect, test } from "vitest";
import { Engine, KEY, MemoryFiles, MemorySecrets, OPENROUTER, type EngineEvent } from "@isorite/engine";
import { finderHttp, NOT_A_MODEL, YOURS } from "../src/index.ts";
import { loadGuide } from "../src/node.ts";

// The finder is Iso where there is no model (M16): every turn goes through the engine as with a provider.
async function guide() {
  const notes = new MemoryFiles(loadGuide()), own = new MemoryFiles();
  const engine = await Engine.open({ notes, own, clock: { now: () => Date.now() }, device: "guide1", name: "isorite guide", http: finderHttp(), secrets: new MemorySecrets({ [KEY]: "none" }), provider: { ...OPENROUTER, auth: undefined, context: 200_000 } });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  const ended = (turn: string) => new Promise<void>((done) => {
    const over = () => events.some((e) => "request" in e && e.request === turn && ["iso-done", "iso-stopped", "iso-failed"].includes(e.type));
    if (over()) return done();
    const stop = engine.events(() => { if (over()) { stop(); done(); } });
  });
  const ask = async (asked: string, o: { conversation?: string; mode?: "ask" | "write"; given?: { kind: "note"; id: string }[] } = {}) => {
    const r = await engine.converse({ ...(o.conversation ? { conversation: o.conversation } : {}), mode: o.mode ?? "ask", asked, tier: "mid", given: o.given ?? [] });
    await ended(r.turn);
    const turn = (await engine.conversation(r.conversation))!.turns.at(-1)!;
    return { conversation: r.conversation, turn, said: turn.items.filter((i) => i.kind === "text").map((i) => i.text).join("\n") };
  };
  return { engine, notes, ask };
}

test("a question about the context view finds What Iso is sent, reads it, and says it is no model, once", async () => {
  const { ask } = await guide();
  const { conversation, turn, said } = await ask("what does the context view show, and can I switch parts off?");
  expect(turn.state).toBe("done");
  expect(turn.items.filter((i) => i.kind === "look").map((i) => i.kind === "look" && i.step.tool)).toEqual(["search_notes", "read_note"]);
  expect(said).toContain(NOT_A_MODEL);
  expect(said).toMatch(/The note that answers it best is \[What Iso is sent\]\(\/iso\/what-iso-is-sent\.md\)/);
  const next = await ask("how do I mark a problem solved?", { conversation });
  expect(next.said).not.toContain(NOT_A_MODEL);
  expect(next.said).toMatch(/\]\(\/[a-z-/]+\.md\)/);
});

test("with the notes switch on and a note given, it adds one link at its end, marked Iso's, and the turn's undo takes it out", async () => {
  const { engine, notes, ask } = await guide();
  const before = (await notes.read(`${YOURS}.md`))!;
  const { turn, said } = await ask("what are the kinds of link?", { mode: "write", given: [{ kind: "note", id: YOURS }] });
  const after = (await notes.read(`${YOURS}.md`))!;
  expect(after.trimEnd()).toBe(`${before.trimEnd()}\n\nSee also [Links and their kinds](/notes/links-and-their-kinds.md "see also").`);
  expect(turn.items.filter((i) => i.kind === "change")).toHaveLength(1);
  expect(said).toContain("I added a link to [Links and their kinds]");
  await engine.undoTurn(turn.conversation, turn.id);
  expect(await notes.read(`${YOURS}.md`)).toBe(before);
});

test("nothing found is said plainly, and summing up a conversation keeps nothing", async () => {
  const { engine, ask } = await guide();
  const { conversation, said } = await ask("zzqx");
  expect(said).toContain("Nothing in the guide matches that");
  await ask("what is the Atlas?", { conversation });
  await engine.compact(conversation);
  expect((await engine.turnContext({ conversation, mode: "ask", tier: "mid", given: [] })).rows!.some((r) => r.kind === "briefing")).toBe(true);
});

test("a concept answers, and the problem that practises it is named as the thing to try", async () => {
  const { ask } = await guide();
  const { said } = await ask("how do I give Iso a note?");
  expect(said).toMatch(/The note that answers it best is \[(?!Give and switch off)[^\]]+\]/);
  expect(said).toContain("To try it: [Give and switch off](/iso/give-and-switch-off.md).");
});
