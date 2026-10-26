// npm run eval:iso [-- --tier low|mid|max] [--only <case>]: Iso's eval (M15). Each case in eval/iso/ is run on a
// fresh copy of the example base (the N-body notes), or of the guide where it says so, against the provider in ~/.config/isorite/config.toml: its
// earlier turns are written into the conversation as they are, so only the judged turn (and a compaction, where a
// case asks for one) is asked of the model. Each check passes or fails without a judge. A table of them, what each
// case cost, and each case's transcript go to .eval/iso-<when>/, which git ignores.

import { parse as parseDiagram } from "pele";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { newId } from "@isorite/core";
import type { Engine, EngineEvent, Given, HandLine, Tier, Turn, TurnItem } from "@isorite/engine";
import { readHand, readTurns } from "@isorite/engine";
import { writeExample } from "../packages/example/src/node.ts";
import { openEngine } from "../packages/server/src/serve.ts";
import { writeGuide } from "../packages/server/src/guide.ts";

type Check =
  | { called: string[] } | { notCalled: string[] } | { says: string } | { saysNot: string } | { linksResolve: true }
  | { changed: string[] } | { created: string } | { createdNot: string } | { editLines: number } | { changedSays: string }
  | { notRead: string[] } | { briefing: { open?: string; notes?: string[] } } | { words: number } | { unchanged: string[] } | { asks: true } | { diagram: boolean } | { lookedIn: string };
interface Case {
  name: string;
  /** The base it is run on: the N-body example, unless the guide (M16). */
  base?: "guide";
  agents?: string;
  understanding?: Record<string, string>;
  history?: { asked: string; said: string; read?: string[] }[];
  compact?: boolean;
  /** Notes of the agent's memory, a second base lent to this one (M20), by path. */
  memory?: Record<string, string>;
  turn: { mode: "ask" | "write"; asked: string; given: Given[] };
  checks: Check[];
}

const ROOT = join(import.meta.dirname, "..");
const arg = (name: string): string | undefined => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const tier = (arg("--tier") ?? "mid") as Tier, only = arg("--only");
// --scripted: every call answered with a fixed reply, to try the runner itself for nothing.
const scripted = process.argv.includes("--scripted") ? {
  fetch: (async (_u: unknown, init?: RequestInit) => {
    const sum = String(init?.body ?? "").includes("You sum up the earlier turns");
    const text = sum ? JSON.stringify({ settled: ["Units are G = 1."], open: ["Why softening removes the singularity."], preferences: [], notes: ["physics/softening"] }) : "A scripted reply about [Leapfrog](/integrators/leapfrog.md): one kick, softening?";
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0 } })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch,
} : undefined;
const cases = readdirSync(join(ROOT, "eval", "iso")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(ROOT, "eval", "iso", f), "utf8")) as Case] as const).filter(([k]) => !only || k === only);
const out = join(ROOT, ".eval", `iso-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${tier}`);
mkdirSync(out, { recursive: true });

/** Every note's text, by its id. */
function snapshot(notes: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (f.startsWith(".")) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".md")) files.set(relative(notes, p).slice(0, -3), readFileSync(p, "utf8"));
    }
  };
  walk(notes);
  return files;
}
/** Lines taken out and put in, as multisets: what an edit changed. */
const lineChange = (a: string, b: string): number => {
  const count = (t: string) => t.split("\n").reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
  const x = count(a), y = count(b);
  let gone = 0, came = 0;
  for (const [l, n] of x) gone += Math.max(0, n - (y.get(l) ?? 0));
  for (const [l, n] of y) came += Math.max(0, n - (x.get(l) ?? 0));
  return Math.max(gone, came);
};
const LINK = /\]\(\/([^)\s#]+?)\.md(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g;

async function run(key: string, c: Case): Promise<{ results: [string, boolean, string][]; usd: number; transcript: string }> {
  const root = mkdtempSync(join(tmpdir(), "isorite-eval-"));
  try {
    const { notes } = c.base === "guide" ? writeGuide(join(root, "base")) : await writeExample(join(root, "base"));
    if (c.agents) writeFileSync(join(notes, "AGENTS.md"), c.agents);
    // The memory, lent: a base of its own beside this one, as a server holding both lends it.
    let memory: Engine | null = null;
    if (c.memory) {
      const at = join(root, "memory");
      for (const [path, text] of Object.entries(c.memory)) { mkdirSync(dirname(join(at, path)), { recursive: true }); writeFileSync(join(at, path), text); }
      memory = await openEngine({ notes: at }, "eval0000", undefined, scripted, null, undefined, { name: "memory", embedder: null });
    }
    const about = memory ? await memory.about() : "";
    const elsewhere = memory ? { lent: () => [{ name: "memory", about }], base: (name: string) => (name === "memory" ? memory : null) } : undefined;
    const engine: Engine = await openEngine({ notes }, "eval0000", undefined, scripted, null, undefined, { name: "base", ...(elsewhere ? { elsewhere } : {}) });
    for (const [id, reading] of Object.entries(c.understanding ?? {})) {
      mkdirSync(join(notes, ".isorite", "understanding", id.split("/").slice(0, -1).join("/")), { recursive: true });
      const title = /title:\s*"?([^"\n]+)"?/.exec(readFileSync(join(notes, `${id}.md`), "utf8"))?.[1] ?? id;
      writeFileSync(join(notes, ".isorite", "understanding", `${id}.md`), `---\ntype: Understanding\ntitle: ${JSON.stringify(`Understanding · ${title}`)}\nof: ${id}\n---\n\n## Iso's reading\n\n${reading}\n\n## Scratchpad\n\n\n`);
    }
    // The earlier turns, written as the engine writes them.
    let conversation: string | undefined;
    if (c.history?.length) {
      conversation = newId(Date.now() - 60_000);
      const lines: unknown[] = [];
      c.history.forEach((h, k) => {
        const turn = newId(Date.now() - 50_000 + k * 1000), at = new Date(Date.now() - 50_000 + k * 1000).toISOString();
        lines.push({ kind: "turn", id: turn, conversation, at, mode: "ask", asked: h.asked, given: [], tier });
        for (const id of h.read ?? []) lines.push({ kind: "item", turn, item: { kind: "look", step: { tool: "read_note", said: `Read ${id}`, how: "read", notes: [id], opened: id } } satisfies { kind: string; turn: string; item: TurnItem } });
        lines.push({ kind: "item", turn, item: { kind: "text", text: h.said } });
        lines.push({ kind: "end", turn, state: "done" });
      });
      mkdirSync(join(notes, ".isorite", "conversations"), { recursive: true });
      writeFileSync(join(notes, ".isorite", "conversations", `${conversation}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    }
    let usd = 0, briefing: Extract<HandLine, { kind: "briefing" }> | undefined;
    if (c.compact && conversation) {
      const done = await engine.compact(conversation, 0);
      usd += done.usd;
      briefing = readHand(readFileSync(join(notes, ".isorite", "conversations", `${conversation}.jsonl`), "utf8")).filter((l) => l.kind === "briefing").at(-1) as typeof briefing;
    }
    const before = snapshot(notes);
    // The judged turn: anything it asks before doing is refused, so it ends.
    const events: EngineEvent[] = [];
    const stop = engine.events((e) => {
      events.push(e);
      if (e.type === "iso-item" && e.item.kind === "permission") void engine.answer(e.request, e.item.id, "reject");
    });
    const { conversation: conv, turn } = await engine.converse({ ...(conversation ? { conversation } : {}), mode: c.turn.mode, asked: c.turn.asked, given: c.turn.given, tier });
    await new Promise<void>((done) => {
      const ended = () => events.some((e) => "request" in e && e.request === turn && ["iso-done", "iso-failed", "iso-stopped"].includes(e.type));
      if (ended()) return done();
      const off = engine.events(() => { if (ended()) { off(); done(); } });
    });
    stop();
    const t = readTurns(readFileSync(join(notes, ".isorite", "conversations", `${conv}.jsonl`), "utf8")).find((x) => x.id === turn) as Turn;
    usd += t.cost?.usd ?? 0;
    const after = snapshot(notes);
    const reply = t.items.filter((i) => i.kind === "text").map((i) => (i as { text: string }).text).join("\n\n");
    const calls = t.items.flatMap((i) => (i.kind === "look" ? [i.step.tool] : i.kind === "change" ? [i.why === "create" ? "write_note" : i.why === "move" ? "move_note" : i.why === "delete" ? "delete_note" : "edit_note"] : i.kind === "question" ? ["ask_question"] : i.kind === "offer" ? ["offer_text"] : i.kind === "point" ? ["point_to_note"] : i.kind === "permission" ? [i.tool] : []));
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id)).sort();
    const created = changed.filter((id) => !before.has(id));
    const changedText = changed.map((id) => after.get(id) ?? "").join("\n");
    const exists = (id: string) => after.has(id);
    const results: [string, boolean, string][] = c.checks.map((k): [string, boolean, string] => {
      const [name, v] = Object.entries(k)[0]! as [string, unknown];
      const re = (s: string) => new RegExp(s, "i");
      switch (name) {
        case "called": return [name, (v as string[]).every((x) => calls.includes(x)), `called ${calls.join(", ") || "nothing"}`];
        case "lookedIn": {
          const away = t.items.flatMap((i) => (i.kind === "look" && i.step.away ? [i.step.away.base] : []));
          return [name, away.includes(v as string), `looked in ${[...new Set(away)].join(", ") || "no other base"}`];
        }
        case "notCalled": return [name, !(v as string[]).some((x) => calls.includes(x)), `called ${calls.join(", ") || "nothing"}`];
        case "says": return [name, re(v as string).test(reply), `/${v as string}/`];
        case "saysNot": return [name, !re(v as string).test(reply), `/${v as string}/`];
        case "linksResolve": { const bad = [...reply.matchAll(LINK)].map((m) => m[1]!).filter((id) => !exists(id)); return [name, !bad.length, bad.length ? `no note ${bad.join(", ")}` : "all resolve"]; }
        case "changed": return [name, JSON.stringify(changed) === JSON.stringify([...(v as string[])].sort()), `changed ${changed.join(", ") || "nothing"}`];
        case "created": {
          const made = created.filter((id) => id.startsWith(v as string)), text = made.map((id) => after.get(id)!).join("\n");
          const ok = created.length === 1 && made.length === 1 && /^---\n[\s\S]*?\btype:\s*\S[\s\S]*?\btitle:\s*\S[\s\S]*?\n---/.test(text) && [...text.matchAll(LINK)].some((m) => exists(m[1]!));
          return [name, ok, `made ${created.join(", ") || "nothing"}`];
        }
        case "createdNot": { const bad = created.filter((id) => re(v as string).test(/title:\s*(.*)/.exec(after.get(id)!)?.[1] ?? id)); return [name, !bad.length, `made ${created.join(", ") || "nothing"}`]; }
        case "editLines": { const n = changed.reduce((s, id) => s + lineChange(before.get(id) ?? "", after.get(id) ?? ""), 0); return [name, n <= (v as number), `${n} lines`]; }
        case "changedSays": return [name, re(v as string).test(changedText), `/${v as string}/`];
        case "notRead": { const again = t.items.flatMap((i) => (i.kind === "look" && i.step.tool === "read_note" && (v as string[]).includes(i.step.opened ?? "") ? [i.step.opened!] : [])); return [name, !again.length, again.length ? `read ${again.join(", ")} again` : "not read again"]; }
        case "briefing": {
          const w = v as { open?: string; notes?: string[] };
          const ok = !!briefing && (!w.open || re(w.open).test(briefing.open.join(" "))) && (w.notes ?? []).every((n) => briefing!.notes.includes(n));
          return [name, ok, briefing ? `open: ${briefing.open.join("; ") || "none"}; notes: ${briefing.notes.join(", ") || "none"}` : "no briefing"];
        }
        case "unchanged": { const touched = (v as string[]).filter((id) => changed.includes(id)); return [name, !touched.length, touched.length ? `changed ${touched.join(", ")}` : "untouched"]; }
        case "asks": return [name, calls.includes("ask_question") || /\?/.test(reply), calls.includes("ask_question") ? "asked with ask_question" : /\?/.test(reply) ? "asked in the reply" : "asked nothing"];
        case "diagram": {
          // A mermaid block Pele can draw (M19), or none at all when the case says false.
          const blocks = [...reply.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]!);
          if (!v) return [name, !blocks.length, blocks.length ? "drew one unasked" : "none"];
          const bad = blocks.map((b) => { try { parseDiagram(b); return ""; } catch (e) { return (e as Error).message.split("\n")[0]!; } }).filter(Boolean);
          return [name, blocks.length > 0 && !bad.length, !blocks.length ? "no diagram" : bad.length ? bad[0]! : `${blocks.length} drawable`];
        }
        case "words": { const n = reply.split(/\s+/).filter(Boolean).length; return [name, n <= (v as number), `${n} words`]; }
        default: return [name, false, "not a check"];
      }
    });
    const transcript = [`# ${key}: ${c.name}`, `Asked (${c.turn.mode}, ${tier}): ${c.turn.asked}`,
      briefing ? `## Briefing\n\n${JSON.stringify({ settled: briefing.settled, open: briefing.open, preferences: briefing.preferences, notes: briefing.notes }, null, 2)}` : "",
      `## What Iso did\n\n${calls.map((x) => `- ${x}`).join("\n") || "nothing"}`, `## What it said\n\n${reply || t.message || "(nothing)"}`,
      ...changed.map((id) => `## ${created.includes(id) ? "Made" : "Changed"}: ${id}\n\n\`\`\`\n${after.get(id) ?? "(deleted)"}\n\`\`\``),
      `## Checks\n\n${results.map(([n, ok, d]) => `- ${ok ? "✓" : "✗"} ${n}: ${d}`).join("\n")}`, `Cost: $${usd.toFixed(4)}`].filter(Boolean).join("\n\n");
    return { results, usd, transcript };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const rows: string[] = [];
let passed = 0, all = 0, spent = 0;
for (const [key, c] of cases) {
  process.stdout.write(`${key} … `);
  try {
    const r = await run(key, c);
    writeFileSync(join(out, `${key}.md`), r.transcript + "\n");
    const ok = r.results.filter(([, p]) => p).length;
    passed += ok; all += r.results.length; spent += r.usd;
    rows.push(`| ${key} | ${ok}/${r.results.length} | ${r.results.filter(([, p]) => !p).map(([n, , d]) => `${n} (${d})`).join("; ").replace(/\|/g, "\\|") || ""} | $${r.usd.toFixed(4)} |`);
    console.log(`${ok}/${r.results.length}, $${r.usd.toFixed(4)}`);
  } catch (e) {
    all += c.checks.length;
    rows.push(`| ${key} | 0/${c.checks.length} | failed: ${(e as Error).message.replace(/\|/g, "\\|")} | |`);
    console.log(`failed: ${(e as Error).message}`);
  }
}
const report = `# Iso's eval, ${tier} tier\n\n${passed} of ${all} checks passed; $${spent.toFixed(4)} in all.\n\n| case | passed | failed checks | cost |\n|---|---|---|---|\n${rows.join("\n")}\n`;
writeFileSync(join(out, "report.md"), report);
console.log(`\n${passed} of ${all} checks passed; $${spent.toFixed(4)}. ${relative(ROOT, out)}/report.md`);
process.exit(0);
