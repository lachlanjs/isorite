// Session bench for isorite's own agent: what pi sends a model over a whole session, turn by turn, where the person
// points at notes as they work. Runs the real harness (`PiHost`, the base's tools, compaction) on a copy of
// packages/example with the scripted model (packages/server/src/pi/scripted.ts), so nothing goes over the network.
//
//   node bench/tokens/sessions.ts            the table, the harness as it is ("after") against pointers sent as the pane
//                                             writes them ("before")
//   node bench/tokens/sessions.ts --json     the numbers as JSON
//   node bench/tokens/sessions.ts --check    exit 1 where a scenario costs more than its baseline (sessions.baseline.json)
//   node bench/tokens/sessions.ts --write    write the baseline from this run
//
// Each request is serialised as a provider would receive it (system prompt, tools, then each message's role and
// content) and measured as chars/4, as run.ts does. The share of a request that is the same as the start of the one
// before it is the part a provider's prompt cache can serve: a proxy for cache hits, not a measurement of them (a
// provider caches in blocks, and only above a minimum length).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeExample } from "../../packages/example/src/node.ts";
import { locate, openEngine } from "../../packages/server/src/serve.ts";
import { PiHost } from "../../packages/server/src/pi/host.ts";
import { scriptedModel } from "../../packages/server/src/pi/scripted.ts";
import { expand, type Pointer } from "../../app/src/lib/pointers.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const BASELINE = join(here, "sessions.baseline.json");
const tok = (chars: number): number => Math.ceil(chars / 4);

// ------------------------------------------------------------ prices
// USD per million tokens, as of 2026-11-12. `cached` is a cache hit; `fresh` is input not served from the cache (for
// Anthropic, a cache write, 1.25x input at the 5-minute TTL, since pi marks the prefix for caching).
// - Claude Sonnet 5.5: $2 input, $0.10 cache read, $10 output (Anthropic's model table, cached 2026-11-03); the cache
//   write at 1.25x input is Anthropic's published multiplier.
// - DeepSeek V4 Flash: ASSUMPTION. Not verified; DeepSeek's published V3.2 prices are used ($0.28 cache miss, $0.028
//   cache hit, $0.42 output, api-docs.deepseek.com, 2025-09). DeepSeek caches automatically, with no write premium.
// - Gemma 4 31B (dense): ASSUMPTION. Open weights served by third parties; a typical hosted price is taken ($0.13
//   input, $0.38 output) and no cache discount, as most hosts of open models give none.
export const PRICES = {
  "deepseek-v4-flash (typical)": { fresh: 0.28, cached: 0.028, output: 0.42, assumed: true },
  "gemma-4-31b (low)": { fresh: 0.13, cached: 0.13, output: 0.38, assumed: true },
  "claude-sonnet-5.5 (high)": { fresh: 2.5, cached: 0.1, output: 10, assumed: false },
} as const;
type Tier = keyof typeof PRICES;

// ------------------------------------------------------------ measuring what is sent

interface Request { turn: number; input: number; prefix: number; output: number }
type Context = { systemPrompt?: string; messages: { role?: string; content?: unknown; toolCallId?: string; toolName?: string; isError?: boolean; sections?: Record<string, string | null> }[]; tools?: { name: string; description: string; parameters: unknown }[] };

/** A request as a provider receives it: what the model reads, without pi's bookkeeping (timestamps, usage). */
function serialise(c: Context): string {
  const tools = JSON.stringify((c.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })));
  const messages = c.messages.map((m) => JSON.stringify({ role: m.role, content: Array.isArray(m.content) ? m.content.map((b: Record<string, unknown>) => (b.type === "toolCall" ? { type: "tool_use", id: b.id, name: b.name, input: b.arguments } : b.type === "image" ? { type: "image", bytes: String(b.data ?? "").length } : b)) : m.content, ...(m.toolCallId ? { tool_use_id: m.toolCallId } : {}), ...(m.isError ? { is_error: true } : {}), ...(m.sections ? { sections: m.sections } : {}) }));
  return [c.systemPrompt ?? "", tools, ...messages].join("\n");
}
const common = (a: string, b: string): number => { let i = 0; while (i < a.length && i < b.length && a.charCodeAt(i) === b.charCodeAt(i)) i++; return i; };

// ------------------------------------------------------------ the person's words, deterministic

const TOPICS = ["the step size", "the half kick", "energy drift", "time reversal", "the shadow Hamiltonian", "softening near close passes", "the force evaluation", "a fixed timestep"];
/** The k-th paragraph the person writes: about 450 characters, each its own. */
const paragraph = (k: number): string => `Paragraph ${k}. Here I try to say why ${TOPICS[k % TOPICS.length]} matters for the leapfrog scheme. Each step kicks the velocities by half a step, drifts the positions by a whole one, and kicks again; the order is what keeps it symmetric in time. If I change ${TOPICS[(k + 3) % TOPICS.length]} the error should still stay bounded rather than grow, which is the property I keep coming back to in these notes (draft ${k}).`;
/** The agent's answer: about 350 characters. */
const answer = (k: number): string => `Mostly, yes. The paragraph follows from the one before it: you name ${TOPICS[k % TOPICS.length]} and tie it to the symmetric kick-drift-kick order. One gap: you say the error stays bounded but not why; that is the symplectic property, which the note on symplectic integrators states. Worth a link there, and a sentence on what bounded means for a long run (answer ${k}).`;

// ------------------------------------------------------------ scenarios

interface Env {
  /** The person adds a paragraph at the end of a note, in the editor (not through the agent). */
  append(id: string, text: string): Promise<void>;
  /** The note's file now. */
  file(id: string): Promise<string>;
  /** Send a message with pointers, as the pane does: each `⟨n⟩` in the text is the n-th pointer. */
  ask(text: string, pointers?: Omit<Pointer, "id">[]): Promise<void>;
  compact(): Promise<void>;
  /** The person moves a folder, or a note, in the browser (not through the agent). */
  moveFolder(from: string, to: string): Promise<void>;
  moveNote(id: string, to: string): Promise<void>;
}
interface Scenario { name: string; what: string; compaction?: { reserveTokens: number; keepRecentTokens: number }; run(env: Env): Promise<void> }

const wholeNote = (ref: string): Omit<Pointer, "id"> => ({ kind: "note", ref, title: ref.split("/").at(-1)!, from: 0, to: 0, text: "" });
/** A selection of lines `from`..`to` of a note's file as it is now. */
const selection = (file: string, ref: string, from: number, to: number): Omit<Pointer, "id"> => ({ kind: "note", ref, title: ref.split("/").at(-1)!, from, to, text: file.split("\n").slice(from - 1, to).join("\n") });

const LEAP = "integrators/leapfrog";
/** One turn of the agent's script: it reads the note (as it is told to, for a pointer), may edit it, and answers. */
const script = (k: number, id: string, { read = true, edit = false } = {}): string => [read ? `read ${id}` : "", edit ? `edit ${id} (draft ${k}). => (draft ${k}). The agent adds: this is the symplectic property.` : "", `say ${answer(k)}`].filter(Boolean).join("\n");

export const SCENARIOS: Scenario[] = [
  {
    name: "append-one-note",
    what: "20 turns on one note: the person appends a paragraph, points at the whole note and asks; the agent reads it, edits it every 4th turn, answers",
    async run(env) {
      for (let k = 1; k <= 20; k++) {
        await env.append(LEAP, paragraph(k));
        await env.ask(`Does the new paragraph follow from the one before it? ⟨1⟩\n${script(k, LEAP, { edit: k % 4 === 0 })}`, [wholeNote(LEAP)]);
      }
    },
  },
  {
    name: "three-notes",
    what: "18 turns moving between three notes in turn, the person appending to the one pointed at every other turn; the agent reads it and answers",
    async run(env) {
      const ids = ["physics/softening", LEAP, "simulation/diagnostics"];
      for (let k = 1; k <= 18; k++) {
        const id = ids[k % 3]!;
        if (k % 2 === 0) await env.append(id, paragraph(k));
        await env.ask(`How does this note stand now? ⟨1⟩\n${script(k, id)}`, [wholeNote(id)]);
      }
    },
  },
  {
    name: "selections-read",
    what: "16 turns pointing at two lines of one note (the person appending every other turn); the agent reads the note each time",
    async run(env) { await selections(env, true); },
  },
  {
    name: "selections-trust",
    what: "as selections-read, but the agent answers from what the pointer brings, reading nothing",
    async run(env) { await selections(env, false); },
  },
  {
    name: "append-compacting",
    what: "append-one-note with a small window: compaction when the context passes ~6k tokens (keeping ~2.5k), and /compact at turn 12",
    compaction: { reserveTokens: 200_000 - 6_000, keepRecentTokens: 2_500 },
    async run(env) {
      for (let k = 1; k <= 20; k++) {
        if (k === 12) await env.compact();
        await env.append(LEAP, paragraph(k));
        await env.ask(`Does the new paragraph follow from the one before it? ⟨1⟩\n${script(k, LEAP, { edit: k % 4 === 0 })}`, [wholeNote(LEAP)]);
      }
    },
  },
  {
    name: "moves",
    what: "12 turns over two notes, the person moving their folder before turn 5 and renaming one before turn 9; each turn points at a note where it is now, and the agent reads it and answers",
    async run(env) {
      let dir = "integrators", one = "leapfrog";
      const other = "symplectic-integrators";
      for (let k = 1; k <= 12; k++) {
        if (k === 5) { await env.moveFolder(dir, "methods/integrators"); dir = "methods/integrators"; }
        if (k === 9) { await env.moveNote(`${dir}/${one}`, `${dir}/kick-drift-kick`); one = "kick-drift-kick"; }
        const id = `${dir}/${k % 2 ? one : other}`;
        await env.ask(`How does this note stand now? ⟨1⟩\n${script(k, id)}`, [wholeNote(id)]);
      }
    },
  },
];

async function selections(env: Env, read: boolean): Promise<void> {
  const id = "integrators/symplectic-integrators";
  for (let k = 1; k <= 16; k++) {
    if (k % 2 === 0) await env.append(id, paragraph(k));
    const file = await env.file(id), n = file.replace(/\n$/, "").split("\n").length;
    // Two lines, moving down the note and back to its new end.
    const from = Math.max(6, 1 + ((k * 7) % Math.max(1, n - 2)));
    await env.ask(`What does this passage mean? ⟨1⟩\n${script(k, id, { read })}`, [selection(file, id, from, Math.min(n, from + 1))]);
  }
}

// ------------------------------------------------------------ running

/** A harness to measure: whether it remembers what the model has seen (seen.ts), the lines sent around a passage, and
 *  (an experiment, done here in the bench and not in the harness) old long tool results shortened before sending. */
export interface Variant { name: string; remember: boolean; around?: number; shorten?: boolean; /** false: the harness is not told where notes went (as before 0.30). */ moves?: boolean }
export const VARIANTS: Variant[] = [
  { name: "before", remember: false },
  { name: "before+shorten", remember: false, shorten: true },
  { name: "after-no-around", remember: true, around: 0 },
  { name: "after-no-moves", remember: true, moves: false },
  { name: "after", remember: true },
  { name: "after+shorten", remember: true, shorten: true },
];

/** Proposal (4), measured: a read_note result more than two of the person's messages back, and longer than 1,200
 *  characters, is sent as its first line and a note that it was shortened. Earlier messages change, so the cache's
 *  prefix stops where the newest shortened one is. */
function shortened(messages: Context["messages"]): Context["messages"] {
  const users = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));
  const before = users.at(-2) ?? 0;
  return messages.map((m, i) => {
    if (i >= before || m.role !== "toolResult" || m.toolName !== "read_note" || !Array.isArray(m.content)) return m;
    const text = (m.content as { type?: string; text?: string }[]).map((b) => b.text ?? "").join("");
    if (text.length <= 1200) return m;
    return { ...m, content: [{ type: "text", text: `${text.split("\n")[0]}\n[Read earlier and shortened here (${text.length} characters): read_note again for it.]` }] };
  });
}

export interface Result {
  scenario: string; variant: string; turns: number; requests: number;
  /** Tokens of input sent in each turn (all its requests). */
  perTurn: number[];
  input: number; cached: number; fresh: number; output: number;
  /** The share of all input that repeated the start of the request before. */
  prefixShare: number;
  cost: Record<Tier, number>;
}

export async function runScenario(s: Scenario, v: Variant): Promise<Result> {
  const root = mkdtempSync(join(tmpdir(), "isorite-bench-sessions-"));
  try {
    const base = await writeExample(join(root, "base"), Date.parse("2026-10-18T09:00:00Z"));
    const api = await openEngine(locate(base.notes), "benchdev", null);
    const { chosen, streamFn } = scriptedModel(undefined, { tokensPerSecond: 0 });
    const requests: Request[] = [];
    let turn = 0, last = "";
    const watched = ((model: never, given: Context, options: never) => {
      const context = v.shorten ? { ...given, messages: shortened(given.messages) } : given;
      const sent = serialise(context);
      const r: Request = { turn, input: tok(sent.length), prefix: tok(common(last, sent)), output: 0 };
      requests.push(r);
      last = sent;
      const stream = (streamFn as (...a: unknown[]) => { result(): Promise<{ content?: unknown }> })(model, context, options);
      void stream.result().then((m) => { r.output = tok(JSON.stringify(m.content ?? "").length); }, () => undefined);
      return stream;
    }) as never;
    // Without moves, the host is given no way to ask where a note went.
    const given = v.moves === false ? new Proxy(api, { get: (t, k) => (k === "resolveNote" ? undefined : Reflect.get(t, k)) }) : api;
    const host = new PiHost({ api: given, model: chosen!, streamFn: watched, remember: v.remember, ...(v.around !== undefined ? { around: v.around } : {}), ...(s.compaction ? { compaction: s.compaction } : {}) });
    const settled = (): Promise<void> => new Promise((done) => { const off = host.listen((view) => { if (!view.busy && view.turns.at(-1)?.state !== "running") { off(); done(); } }); });
    const send = async (text: string) => {
      const done = settled();
      await host.prompt(text);
      await done;
      const t = host.view().turns.at(-1);
      if (t?.state !== "done") throw new Error(`${s.name}/${v.name}, turn ${turn}: ${t?.state} ${JSON.stringify(t?.items.at(-1))}`);
    };
    const env: Env = {
      async append(id, text) { const now = await api.readNote(id); await api.saveNote(id, { base: now.version, text: `${now.text.replace(/\n*$/, "")}\n\n${text}\n` }); },
      async file(id) { return (await api.readNote(id)).text; },
      async ask(text, ps = []) {
        turn++;
        const all = new Map<number, Pointer>(ps.map((p, i) => [i, { ...p, id: i }]));
        const marked = text.replace(/⟨(\d+)⟩/g, (_, n: string) => String.fromCharCode(0xe000 + Number(n) - 1));
        await send(expand(marked, (id) => all.get(id)));
      },
      async compact() { turn++; await send("/compact"); },
      async moveFolder(from, to) { await api.moveFolder(from, to); },
      async moveNote(id, to) { await api.moveNote(id, to, (await api.readNote(id)).version); },
    };
    await s.run(env);
    await new Promise((r) => setTimeout(r, 0));
    const perTurn = Array.from({ length: turn }, (_, i) => requests.filter((r) => r.turn === i + 1).reduce((n, r) => n + r.input, 0));
    const input = requests.reduce((n, r) => n + r.input, 0), cached = requests.reduce((n, r) => n + r.prefix, 0), output = requests.reduce((n, r) => n + r.output, 0);
    const cost = Object.fromEntries(Object.entries(PRICES).map(([tier, p]) => [tier, ((input - cached) * p.fresh + cached * p.cached + output * p.output) / 1e6])) as Record<Tier, number>;
    return { scenario: s.name, variant: v.name, turns: turn, requests: requests.length, perTurn, input, cached, fresh: input - cached, output, prefixShare: cached / input, cost };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

export async function runAll(variants: Variant[] = VARIANTS): Promise<Result[]> {
  const out: Result[] = [];
  for (const s of SCENARIOS) for (const v of variants) out.push(await runScenario(s, v));
  return out;
}

/** The baseline a run is checked against: for each scenario, the harness's input and fresh (uncached) tokens. */
export type Baseline = Record<string, { input: number; fresh: number }>;
export const baselineOf = (results: Result[]): Baseline => Object.fromEntries(results.filter((r) => r.variant === "after").map((r) => [r.scenario, { input: r.input, fresh: r.fresh }]));
/** Where a run costs more than the baseline by more than `slack` (a share): what, and by how much. */
export function regressions(results: Result[], baseline: Baseline, slack = 0.05): string[] {
  const out: string[] = [];
  for (const r of results.filter((x) => x.variant === "after")) {
    const b = baseline[r.scenario];
    if (!b) continue;
    for (const k of ["input", "fresh"] as const) if (r[k] > b[k] * (1 + slack)) out.push(`${r.scenario}: ${k} ${r[k]} tokens, baseline ${b[k]} (+${(((r[k] - b[k]) / b[k]) * 100).toFixed(1)}%)`);
  }
  return out;
}

// ------------------------------------------------------------ the command

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const results = await runAll(args.includes("--check") || args.includes("--write") ? VARIANTS.filter((v) => v.name === "after") : VARIANTS);
  if (args.includes("--json")) console.log(JSON.stringify(results, null, 1));
  else if (!args.includes("--check")) {
    const k = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    for (const s of SCENARIOS) {
      console.log(`\n${s.name}: ${s.what}`);
      for (const r of results.filter((x) => x.scenario === s.name)) {
        console.log(`  ${r.variant.padEnd(7)} ${r.requests} requests, input ${k(r.input)} tok (fresh ${k(r.fresh)}, repeated prefix ${(r.prefixShare * 100).toFixed(0)}%), output ${k(r.output)}; ` + Object.entries(r.cost).map(([t, c]) => `${t.split(" ")[0]} $${c.toFixed(4)}`).join(", "));
        console.log(`          per turn: ${r.perTurn.map(k).join(" ")}`);
      }
    }
    console.log(`\nPrices (USD/Mtok, fresh/cached/output; * an assumption, see the source): ${Object.entries(PRICES).map(([t, p]) => `${t}${p.assumed ? "*" : ""} ${p.fresh}/${p.cached}/${p.output}`).join("; ")}`);
  }
  if (args.includes("--write")) { writeFileSync(BASELINE, JSON.stringify(baselineOf(results), null, 1) + "\n"); console.log(`wrote ${BASELINE}`); }
  if (args.includes("--check")) {
    const bad = regressions(results, JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline);
    if (bad.length) { console.error(`More tokens than the baseline:\n${bad.join("\n")}`); process.exit(1); }
    console.log("sessions: within the baseline");
  }
  process.exit(0);
}
