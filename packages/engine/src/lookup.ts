// What Iso can look up while it works: the notes of the base, by their words,
// by their meaning (where a search by meaning is given), by their outline, a
// section at a time, and along their links. Read only: there is no tool here
// that writes. Carried over from rdstudio's lookup.ts, without the code tools.

import { SearchIndex, headings, section, type Bundle } from "@isorite/core";
import type { ToolDef } from "./provider.ts";

/** How a note came to be looked at. The Atlas draws each differently. */
export type How = "keyword" | "meaning" | "link" | "read";

/** One thing looked up. */
export interface Step {
  tool: string;
  /** One line for the person: what was looked up and what came of it. */
  said: string;
  how: How;
  /** The notes it named: what a search found, or the one note opened. */
  notes: string[];
  /** The note opened (outlined or read), and the section read. */
  opened?: string;
  section?: string;
  /** The note already in hand that links to the one opened: a step along a chain. */
  from?: string;
  /** For a step along a link, what the link says of it, when it is rated: requires, see also. */
  rel?: string;
  /** For a search, what was searched for; by meaning, how alike each note found was (0 to 1). */
  query?: string;
  scores?: Record<string, number>;
  failed?: boolean;
}

/** Search by meaning, when the device can run it. */
export interface Similar {
  (text: string, opts: { limit: number; under?: string }): Promise<{ ready: boolean; hits: { note: string; heading: string; body: string; score: number }[] }>;
}

const str = { type: "string" } as const;
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });

export const TOOLS: ToolDef[] = [
  fn("search_notes", "Keyword search over the knowledge base. Returns note ids, titles, types, one-sentence descriptions and a one-line snippet. Search by the words a note would use.",
    { query: str, under: { ...str, description: "Only notes in this folder." }, limit: { type: "integer", description: "How many, 8 unless said, 15 at most." } }, ["query"]),
  fn("outline_note", "A note's description, its headings, the notes it links to and the notes that link to it, without its body. Use it to choose a section to read.", { id: { ...str, description: "The note's id or path: basics/entropy or /basics/entropy.md." } }, ["id"]),
  fn("read_note", "Read one section of a note, by its heading, or the whole note when no section is named. Prefer a section.", { id: str, section: { ...str, description: "A heading's text, as outline_note gives it." } }, ["id"]),
];
export const FIND_SIMILAR: ToolDef = fn("find_similar", "Find notes by meaning: notes that say something like the text you give, even in quite other words. Slower and vaguer than search_notes: use it after search_notes and the links of the notes in hand have not found what you need, or when you cannot guess the words a note would use. Give a question or a sentence, not keywords. Returns each note's nearest section, with how alike it is (0 to 1).",
  { text: { ...str, description: "A question, or a sentence saying what you are looking for." }, under: { ...str, description: "Only notes in this folder." }, limit: { type: "integer", description: "How many, 6 unless said, 15 at most." } }, ["text"]);

const MAX_READ = 8000;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "\n[…cut: read a section of it for the rest]" : s);
const brief = (s: string, n = 220) => {
  const t = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*(?:[-*+]|\d+\.|#+|>)\s+/gm, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
};

/** A note's id from what a model writes for one: /basics/entropy.md, basics/entropy, [x](/basics/entropy.md). */
export function noteId(b: Bundle, raw: unknown): string | null {
  const id = String(raw ?? "").trim().replace(/^.*\]\(/, "").replace(/\)$/, "").replace(/\s+"[^"]*"$/, "").split("#")[0]!.replace(/^\/+/, "").replace(/\.md$/i, "");
  return b.concepts.has(id) ? id : null;
}

/** What is looked up for one request: the base as it was when asked, and what has been opened so far. */
export class Lookup {
  readonly steps: Step[] = [];
  private index: SearchIndex | null = null;
  /** The notes in hand, latest last: the one being written, then each one opened. */
  private readonly held: string[];
  /** How each note was first named, by a search of words or of meaning. */
  private readonly named = new Map<string, "keyword" | "meaning">();
  private readonly b: Bundle;
  private readonly similar: Similar | null;

  constructor(b: Bundle, note: string, similar: Similar | null = null) { this.b = b; this.held = [note]; this.similar = similar; }

  defs(): ToolDef[] { return this.similar ? [TOOLS[0]!, FIND_SIMILAR, ...TOOLS.slice(1)] : TOOLS; }

  /** The notes opened, each once, in order. */
  read(): string[] { return [...new Set(this.steps.filter((s) => s.opened && !s.failed).map((s) => s.opened!))]; }

  /** Run one call: the text that goes back to the model, and the step kept of it. */
  async call(name: string, raw: string): Promise<{ text: string; step: Step }> {
    let args: Record<string, unknown> = {};
    try { const parsed: unknown = raw.trim() ? JSON.parse(raw) : {}; if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) args = parsed as Record<string, unknown>; } catch { /* no arguments */ }
    const step: Step = { tool: name, said: "", how: "read", notes: [] };
    let text: string;
    try {
      text = name === "search_notes" ? this.search(args, step) : name === "find_similar" ? await this.meaning(args, step)
        : name === "outline_note" ? this.outline(args, step) : name === "read_note" ? this.section(args, step) : this.fail(step, `There is no tool ${name}.`);
    } catch (err) { text = this.fail(step, `That could not be looked up: ${(err as Error).message}`); }
    this.steps.push(step);
    return { text, step };
  }

  private fail(step: Step, why: string): string { step.failed = true; step.said = why; return why; }
  private line(id: string): string { const c = this.b.concepts.get(id)!; return `${c.title} (/${id}.md), ${c.type}${c.description ? `: ${c.description}` : ""}`; }

  private search(a: Record<string, unknown>, step: Step): string {
    step.how = "keyword";
    const query = String(a.query ?? "").trim();
    if (!query) return this.fail(step, "search_notes needs a query.");
    step.query = query;
    this.index ??= new SearchIndex(this.b);
    const limit = Math.max(1, Math.min(Number(a.limit) || 8, 15));
    const hits = this.index.search(query, { limit, ...(typeof a.under === "string" && a.under ? { under: a.under.replace(/^\/+|\/+$/g, "") } : {}) });
    step.notes = hits.map((h) => h.concept.id);
    for (const id of step.notes) if (!this.named.has(id)) this.named.set(id, "keyword");
    step.said = `Searched the notes for "${query}": ${hits.length ? `${hits.length} found` : "nothing found"}`;
    if (!hits.length) return "No notes match. Try other words, or fewer.";
    return hits.map((h) => `- ${this.line(h.concept.id)}\n  ${h.snippet}`).join("\n");
  }

  private async meaning(a: Record<string, unknown>, step: Step): Promise<string> {
    step.how = "meaning";
    const text = String(a.text ?? a.query ?? "").trim();
    if (!text) return this.fail(step, "find_similar needs the text to look for.");
    step.query = text;
    if (!this.similar) return this.fail(step, "Search by meaning is not available here. Use search_notes.");
    const found = await this.similar(text, { limit: Math.max(1, Math.min(Number(a.limit) || 6, 15)), ...(typeof a.under === "string" && a.under ? { under: a.under } : {}) });
    if (!found.ready) return this.fail(step, "Search by meaning is still being prepared for this base. Use search_notes for now.");
    const hits = found.hits.filter((h) => this.b.concepts.has(h.note));
    step.notes = hits.map((h) => h.note);
    step.scores = Object.fromEntries(hits.map((h) => [h.note, Math.round(h.score * 100) / 100]));
    for (const id of step.notes) if (!this.named.has(id)) this.named.set(id, "meaning");
    step.said = `Looked for notes that mean "${text.length > 70 ? text.slice(0, 70) + "…" : text}": ${hits.length ? `${hits.length} found` : "nothing found"}`;
    if (!hits.length) return "No notes were found.";
    return "Nearest in meaning first (how alike, 0 to 1). A high figure is not proof: read a note before resting on it.\n"
      + hits.map((h) => `- ${this.line(h.note)}${h.heading ? `, section "${h.heading}"` : ""} (${h.score.toFixed(2)})\n  ${brief(h.body)}`).join("\n");
  }

  /** The note in hand that links to this one, latest first: how it was reached. */
  private reached(id: string, step: Step): void {
    for (let k = this.held.length - 1; k >= 0; k--) {
      const h = this.held[k]!;
      const link = h === id ? undefined : this.b.concepts.get(h)?.links.find((l) => l.target === id);
      if (link) { step.from = h; step.how = "link"; if (link.rel) step.rel = link.rel; break; }
    }
    // Not by a link: if a search was what named it, that is how it was found.
    if (step.how !== "link") step.how = this.named.get(id) ?? "read";
    if (!this.held.includes(id)) this.held.push(id);
  }

  private outline(a: Record<string, unknown>, step: Step): string {
    const id = noteId(this.b, a.id);
    if (!id) return this.fail(step, `There is no note ${String(a.id ?? "")}. Search for it by its words.`);
    const c = this.b.concepts.get(id)!;
    step.opened = id; step.notes = [id];
    this.reached(id, step);
    step.said = `Looked at the outline of ${c.title}`;
    const out = [...new Set(c.links.filter((l) => !l.broken && l.kind === "concept").map((l) => l.target))], inn = this.b.backlinks(id);
    const named = (ids: string[]) => ids.slice(0, 30).map((i) => `${this.b.concepts.get(i)?.title ?? i} (/${i}.md)`).join("; ") || "none";
    return [`# ${c.title} (/${id}.md), ${c.type}`, c.description, `${[...c.body].length} characters.`,
      `Headings:\n${headings(c.body).map((h) => "#".repeat(h.level) + " " + h.text).join("\n") || "none"}`, `Links to: ${named(out)}`, `Linked from: ${named(inn)}`].filter(Boolean).join("\n\n");
  }

  private section(a: Record<string, unknown>, step: Step): string {
    const id = noteId(this.b, a.id);
    if (!id) return this.fail(step, `There is no note ${String(a.id ?? "")}. Search for it by its words.`);
    const c = this.b.concepts.get(id)!;
    step.opened = id; step.notes = [id];
    const want = typeof a.section === "string" ? a.section.replace(/^#+\s*/, "").trim() : "";
    let body = c.body.trim();
    this.reached(id, step);
    if (want) {
      const s = section(c.body, want);
      if (s === null) return this.fail(step, `There is no section "${want}" in ${c.title}. Its headings: ${headings(c.body).map((h) => h.text).join("; ") || "none"}.`);
      body = s.trim(); step.section = want;
    }
    step.said = want ? `Read "${want}" in ${c.title}` : `Read ${c.title}`;
    return `# ${c.title} (/${id}.md)${want ? `, the section "${want}"` : ""}\n\n${cut(body, MAX_READ)}`;
  }
}
