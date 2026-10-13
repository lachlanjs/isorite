// How well a search finds the note that answers a question: for keyword
// search, search by meaning, and either. Carried over from rdstudio, to show
// the search was carried over without loss.
//   node bench/retrieval.ts <folder of notes> <questions.json> [--each]
// The questions file is {"questions": [{"q": …, "note": id, "also": [ids]}]}.
// Needs the model (npm run model). The vectors are made in memory and thrown away.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SearchIndex } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { Meaning, MemoryFiles } from "@isorite/engine";
import { modelDir, nodeEmbedder } from "../packages/server/src/embedder.ts";

const [notes, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!notes || !file) { console.error("usage: node bench/retrieval.ts <folder of notes> <questions.json> [--each]"); process.exit(2); }
const dir = modelDir();
if (!dir) { console.error("The model for search by meaning is not installed: npm run model"); process.exit(1); }
const { questions } = JSON.parse(readFileSync(file, "utf8")) as { questions: { q: string; note: string; also?: string[] }[] };
const b = loadBundle(resolve(notes)), index = new SearchIndex(b);
const embedder = nodeEmbedder(dir), meaning = new Meaning(embedder, new MemoryFiles(), "vectors.json");
const t0 = Date.now();
const made = await meaning.refresh(b);
console.error(`embedded ${made.made} sections of ${b.concepts.size} notes in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const N = 15, KS = [1, 3, 5, 10];
const rows: { q: string; kw: number; me: number; kwTop: string; meTop: string }[] = [];
for (const { q, note, also = [] } of questions) {
  const ok = [note, ...also];
  const kw = index.search(q, { limit: N }).map((h) => h.concept.id);
  const me = (await meaning.similar(b, q, { limit: N })).hits.map((h) => h.note);
  const at = (list: string[]) => { const k = list.findIndex((id) => ok.includes(id)); return k < 0 ? 99 : k + 1; };
  rows.push({ q, kw: at(kw), me: at(me), kwTop: kw[0] ?? "-", meTop: me[0] ?? "-" });
}
const pct = (f: (r: (typeof rows)[number]) => number, k: number) => `${Math.round((100 * rows.filter((r) => f(r) <= k).length) / rows.length)}%`.padStart(5);
console.log(`${rows.length} questions: an answering note within the first k notes returned\n`);
console.log(`                ${KS.map((k) => String(k).padStart(5)).join("")}   not in ${N}`);
for (const [name, f] of [["keyword", (r) => r.kw], ["by meaning", (r) => r.me], ["either", (r) => Math.min(r.kw, r.me)]] as [string, (r: (typeof rows)[number]) => number][])
  console.log(`${name.padEnd(16)}${KS.map((k) => pct(f, k)).join("")}   ${rows.filter((r) => f(r) > N).length}`);
if (process.argv.includes("--each")) for (const r of rows) console.log(`${String(r.kw).padStart(3)}${String(r.me).padStart(3)}  ${r.q}  [${r.kwTop} | ${r.meTop}]`);
await embedder.close();
