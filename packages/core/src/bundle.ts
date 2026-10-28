// An OKF bundle: notes (concepts), folders and links, with trust and staleness,
// lint, the requires graph and generated indexes. Checked against fixtures/.
//
// The core never touches a file system: it is given the bundle's files as
// text, so it runs the same in a browser, Node and Tauri (see node.ts).

import { FrontmatterError, splitFrontmatter, type Meta } from "./frontmatter.ts";
import { citeRefs, headings, linkRefs, rating, type Rating } from "./markdown.ts";
import { ABOUT, doneOf, embedRefs, idsOf, kindOf, outwardLinks, type Kind, type Outward } from "./kinds.ts";
import { basename, cmp, cmpTuple, dirname, join, normpath, strip, text, toTime, unquote } from "./text.ts";

/** The base's own instructions, for Iso and any other agent, at the top of the notes (M15). Not a note. */
export const AGENTS_FILE = "AGENTS.md";

export const OKF_VERSION = "0.2";

/** One file of a bundle: its path from the bundle root, and its text if it is Markdown. */
export interface FileEntry {
  path: string;
  text?: string;
  dir?: boolean; // an (empty) folder
  mtime?: number; // milliseconds, when known
}

export interface Link {
  target: string; // a concept id, or a folder id with a trailing "/"
  kind: "concept" | "directory";
  broken: boolean;
  rel: Rating | null;
}

/** What a file in the bundle that is not a note is (M23): an artifact (an HTML document isorite shows), a picture,
 *  data (what an artifact draws from, or evidence), a document to read, or anything else. */
export type FileKind = "artifact" | "image" | "data" | "document" | "misc";

/** A file in the bundle that a note cites and that is not a note (T76): any kind, linked or shown in place. What an
 *  artifact links to in turn is never read. */
export interface Cite {
  target: string; // the file's path in the bundle: "design/figure.html"
  kind: FileKind;
  embed: boolean; // ![…](…): shown in the note; else a link to it
  broken: boolean;
  rel: Rating | null; // a link's rating, as for a link to a note
  align: "left" | "center" | null; // a picture's place, from its title
  alt?: string; // what a picture shown says it shows (M22)
}
const KINDS: [FileKind, RegExp][] = [
  ["artifact", /\.html?$/i],
  ["image", /\.(png|jpe?g|gif|svg|webp|avif)$/i],
  ["data", /\.(csv|tsv|json|jsonl|ndjson|parquet|arrow|feather|npy|npz|xlsx|xls|h5|hdf5|nc)$/i],
  ["document", /\.(pdf|docx?|odt|rtf|epub|pptx?|odp|txt|tex)$/i],
];
/** What kind of file a path is: null for a note, or a path with no extension (a note or a folder named without one);
 *  anything not listed is misc rather than dropped. */
export const citeKind = (path: string): FileKind | null => {
  const name = basename(path);
  if (/\.md$/i.test(name) || !/\.[^.]+$/.test(name.replace(/^\./, ""))) return null;
  return KINDS.find(([, re]) => re.test(name))?.[0] ?? "misc";
};

export type IssueCode =
  | "broken-link" | "requires-cycle" | "frontmatter-invalid" | "frontmatter-missing" | "type-missing"
  | "generated-without-by" | "verified-without-by" | "index-frontmatter" | "root-index-frontmatter"
  | "log-heading-date" | "embed-broken";

export interface Issue {
  path: string;
  level: "error" | "warning";
  code: IssueCode;
  message: string;
}

export type Trust = "unverified" | "machine-confirmed" | "human-reviewed";

type Entry = Record<string, unknown>;
const isEntry = (v: unknown): v is Entry => typeof v === "object" && v !== null && !Array.isArray(v);

export class Concept {
  readonly id: string; // bundle path without .md, such as "design/overview"
  readonly path: string; // "design/overview.md"
  readonly meta: Meta;
  readonly body: string;
  readonly mtime: number;
  links: Link[] = [];
  cites: Cite[] = [];
  /** The notes it embeds (`[[!name]]`, M12), resolved to ids, in order. */
  embeds: string[] = [];
  /** Its links out of the base: to the web, and to code (M12). */
  outward: Outward[] = [];
  /** For a question or a problem: the notes it is about (or uses), from its frontmatter and from the notes that
   *  embed it. */
  attached: string[] = [];

  constructor(id: string, path: string, meta: Meta, body: string, mtime = 0) {
    this.id = id;
    this.path = path;
    this.meta = meta;
    this.body = body;
    this.mtime = mtime;
  }

  get directory(): string { return dirname(this.id); }

  get type(): string {
    const t = this.meta.type;
    return t === null || t === undefined || t === "" ? "" : text(t);
  }

  get title(): string {
    const t = this.meta.title;
    if (t) return text(t);
    const stem = basename(this.id);
    const words = strip(stem.replaceAll("-", " ").replaceAll("_", " "));
    return words ? words[0]!.toUpperCase() + words.slice(1).toLowerCase() : stem;
  }

  get description(): string { return text(this.meta.description || ""); }

  /** A note, an open question, or a problem (M12). */
  get kind(): Kind { return kindOf(this.type); }

  /** When a question was resolved or a problem solved, as written; null while open, and for a note. */
  get done(): string | null { return doneOf(this.meta, this.kind); }

  get tags(): string[] {
    let tags = this.meta.tags || [];
    if (typeof tags === "string") tags = [tags];
    return Array.isArray(tags) ? tags.filter((t) => t !== null && t !== undefined).map(text) : [];
  }

  get status(): string { return text(this.meta.status || "stable"); }

  get generated(): Entry { return isEntry(this.meta.generated) ? this.meta.generated : {}; }

  get generatedAt(): number | null { return toTime(this.generated.at); }

  get verified(): Entry[] {
    const v = this.meta.verified;
    if (isEntry(v)) return [v];
    return Array.isArray(v) ? v.filter(isEntry) : [];
  }

  /** OKF §5.3. */
  get trust(): Trust {
    const events = this.verified;
    if (!events.length) return "unverified";
    return events.some((e) => text(e.by).startsWith("human:")) ? "human-reviewed" : "machine-confirmed";
  }

  get lastHumanVerification(): number | null {
    const times = this.verified.filter((e) => text(e.by).startsWith("human:")).map((e) => toTime(e.at))
      .filter((t): t is number => t !== null);
    return times.length ? Math.max(...times) : null;
  }

  /** Human-reviewed, but meaningfully changed since the latest human check. */
  get verificationStale(): boolean {
    const verified = this.lastHumanVerification, generated = this.generatedAt;
    return verified !== null && generated !== null && generated > verified;
  }

  /** `stale_after` has passed (OKF §5.5). */
  contentStale(now = Date.now()): boolean {
    const at = toTime(this.meta.stale_after);
    return at !== null && Math.floor(now / 1000) * 1000 >= at;
  }
}

export class Directory {
  concepts: string[] = [];
  children: string[] = [];
  hasIndex = false;
  hasLog = false;
  readonly id: string; // "" for the root
  constructor(id: string) { this.id = id; }
  get name(): string { return this.id ? basename(this.id) : ""; }
}

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LOG_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sort paths part by part, as Python sorts Path objects. */
function comparePaths(a: string, b: string): number {
  return cmpTuple(a.split("/"), b.split("/"));
}

export class Bundle {
  readonly concepts = new Map<string, Concept>();
  readonly directories = new Map<string, Directory>();
  readonly issues: Issue[] = [];
  /** Every file in the bundle that is not Markdown, by path: what a note may cite (artifacts, pictures, data). */
  readonly files = new Set<string>();
  rootMeta: Meta = {};
  private cache = new Map<string, unknown>();

  /** Load a bundle from its files (paths relative to the bundle root). */
  static fromFiles(files: Iterable<FileEntry>): Bundle {
    const b = new Bundle();
    b.scan([...files]);
    return b;
  }

  private memo<T>(key: string, make: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key) as T;
  }

  // ------------------------------------------------------------ load

  private scan(files: FileEntry[]): void {
    this.directories.set("", new Directory(""));
    // Every folder that contains something, as a directory walk would find it.
    const entries = new Map<string, FileEntry>();
    for (const f of files) {
      const path = f.path.replace(/^\/+|\/+$/g, "");
      if (!path) continue;
      entries.set(path, { ...f, path });
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const d = parts.slice(0, i).join("/");
        if (!entries.has(d)) entries.set(d, { path: d, dir: true });
      }
    }
    for (const f of [...entries.values()].sort((a, b) => comparePaths(a.path, b.path))) {
      const rel = f.path;
      // Line endings as Python's text mode reads them: CRLF and CR become LF.
      if (f.text !== undefined) f.text = f.text.replace(/\r\n?/g, "\n");
      if (rel.split("/").some((part) => part.startsWith("."))) continue;
      if (f.dir) { this.ensureDir(rel); continue; }
      // AGENTS.md at the top is the base's instructions for Iso and other agents (M15): a file, not a note.
      if (!rel.endsWith(".md") || rel === AGENTS_FILE) { this.files.add(rel); continue; }
      const directory = dirname(rel);
      this.ensureDir(directory);
      const name = basename(rel);
      if (name === "index.md") {
        this.directories.get(directory)!.hasIndex = true;
        this.checkIndex(f.text ?? "", rel, directory);
      } else if (name === "log.md") {
        this.directories.get(directory)!.hasLog = true;
        this.checkLog(f.text ?? "", rel);
      } else {
        this.loadConcept(f.text ?? "", rel, f.mtime ?? 0);
      }
    }
    for (const concept of this.concepts.values()) {
      const links: Link[] = [];
      for (const [target, rel] of linkRefs(concept.body)) {
        const link = this.resolve(concept, target);
        if (link) { link.rel = rel; links.push(link); }
      }
      concept.links = links;
      concept.outward = outwardLinks(concept.body);
      for (const link of links) {
        if (link.broken) this.issue(concept.path, "warning", "broken-link", `broken link to ${link.target}`);
      }
      // Files cited, of any kind: links to them, or embeds (image syntax).
      for (const { href, title, embed, alt } of citeRefs(concept.body)) {
        const path = this.filePath(concept, href), kind = path === null ? null : citeKind(path);
        if (path === null || kind === null) continue;
        const t = strip((title ?? "").toLowerCase());
        const cite: Cite = { target: path, kind, embed, broken: !this.files.has(path), rel: rating(title), align: t === "left" ? "left" : t === "center" || t === "centre" ? "center" : null, ...(embed && alt ? { alt } : {}) };
        concept.cites.push(cite);
        if (cite.broken) this.issue(concept.path, "warning", "broken-link", kind === "image" ? `picture not in the notes: ${path}` : `broken link to ${path}`);
      }
    }
    // Embeds (M12): by file name, or by path where two share it. An embed attaches what it embeds to its note.
    const byName = new Map<string, string[]>();
    for (const id of this.concepts.keys()) { const n = basename(id); byName.set(n, [...(byName.get(n) ?? []), id]); }
    for (const concept of this.concepts.values()) {
      for (const ref of embedRefs(concept.body)) {
        const path = ref.replace(/^\/+/, "").replace(/\.md$/, "");
        const found = path.includes("/") ? (this.concepts.has(path) ? [path] : []) : byName.get(path) ?? [];
        if (found.length === 1) concept.embeds.push(found[0]!);
        else this.issue(concept.path, "warning", "embed-broken", found.length ? `two notes are named ${path}: embed one by its path` : `no note to embed: ${ref}`);
      }
    }
    for (const concept of this.concepts.values()) {
      if (concept.kind === "note") continue;
      concept.attached = idsOf(concept.meta[ABOUT[concept.kind]]).filter((id) => this.concepts.has(id) && id !== concept.id);
    }
    for (const concept of this.concepts.values()) {
      for (const id of concept.embeds) {
        const embedded = this.concepts.get(id)!;
        if (embedded.kind !== "note" && id !== concept.id && !embedded.attached.includes(concept.id)) embedded.attached.push(concept.id);
      }
    }
    for (const group of this.requiresCycles()) {
      this.issue(this.concepts.get(group[0]!)!.path, "warning", "requires-cycle",
        `requires cycle: ${group.join(", ")} require each other`);
    }
  }

  private issue(path: string, level: Issue["level"], code: IssueCode, message: string): void {
    this.issues.push({ path, level, code, message });
  }

  private ensureDir(directory: string): void {
    if (this.directories.has(directory)) return;
    const parent = dirname(directory);
    this.ensureDir(parent);
    this.directories.set(directory, new Directory(directory));
    this.directories.get(parent)!.children.push(directory);
  }

  private loadConcept(source: string, rel: string, mtime: number): void {
    const cid = rel.slice(0, -3);
    let meta: Meta | null, body: string;
    try {
      [meta, body] = splitFrontmatter(source);
    } catch (err) {
      if (!(err instanceof FrontmatterError)) throw err;
      this.issue(rel, "error", "frontmatter-invalid", err.message);
      [meta, body] = [{}, source];
    }
    const concept = new Concept(cid, rel, meta ?? {}, body, mtime);
    if (meta === null) this.issue(rel, "error", "frontmatter-missing", "missing YAML frontmatter");
    else if (!concept.type) this.issue(rel, "error", "type-missing", "frontmatter has no non-empty 'type'");
    if ("generated" in concept.meta && !("by" in concept.generated)) {
      this.issue(rel, "warning", "generated-without-by", "'generated' should record 'by'");
    }
    for (const event of concept.verified) {
      if (!("by" in event)) this.issue(rel, "warning", "verified-without-by", "'verified' entry without 'by'");
    }
    this.concepts.set(cid, concept);
    this.directories.get(dirname(rel))!.concepts.push(cid);
  }

  private checkIndex(source: string, rel: string, directory: string): void {
    let meta: Meta | null;
    try {
      [meta] = splitFrontmatter(source);
    } catch (err) {
      if (!(err instanceof FrontmatterError)) throw err;
      this.issue(rel, "error", "frontmatter-invalid", err.message);
      return;
    }
    if (meta === null) return;
    if (directory !== "") {
      this.issue(rel, "error", "index-frontmatter", "index.md below the root must not have frontmatter");
    } else if (Object.keys(meta).some((k) => k !== "okf_version")) {
      this.issue(rel, "error", "root-index-frontmatter", "root index.md frontmatter may only carry okf_version");
    } else {
      this.rootMeta = meta;
    }
  }

  private checkLog(source: string, rel: string): void {
    for (const line of source.split("\n")) {
      if (line.startsWith("## ") && !LOG_DATE.test(strip(line.slice(3)))) {
        this.issue(rel, "warning", "log-heading-date", `log heading is not YYYY-MM-DD: ${strip(line)}`);
      }
    }
  }

  /** A link's target as a path in the bundle (not checked to exist), or null for an address or a way out of it. */
  private filePath(concept: Concept, raw: string): string | null {
    if (!raw || raw.startsWith("#") || SCHEME.test(raw)) return null;
    const target = unquote(raw.split("#", 1)[0]!.split("?", 1)[0]!);
    if (!target || target.endsWith("/")) return null;
    const norm = normpath(target.startsWith("/") ? target.replace(/^\/+/, "") : join(concept.directory, target));
    return norm.startsWith("..") || norm === "." ? null : norm;
  }

  private resolve(concept: Concept, raw: string): Link | null {
    if (!raw || raw.startsWith("#") || SCHEME.test(raw)) return null;
    const target = unquote(raw.split("#", 1)[0]!.split("?", 1)[0]!);
    if (!target) return null;
    const joined = target.startsWith("/") ? target.replace(/^\/+/, "") : join(concept.directory, target);
    let norm = joined ? normpath(joined) : ".";
    if (norm.startsWith("..")) return null; // outside the bundle
    if (norm === ".") norm = "";
    const link = (t: string, kind: Link["kind"], broken: boolean): Link => ({ target: t, kind, broken, rel: null });
    if (target.endsWith("/") || this.directories.has(norm)) return link(norm + "/", "directory", !this.directories.has(norm));
    if (norm.endsWith("/index.md") || norm === "index.md") {
      const d = dirname(norm);
      return link(d + "/", "directory", !this.directories.has(d));
    }
    if (norm.endsWith(".md")) {
      const cid = norm.slice(0, -3);
      return link(cid, "concept", !this.concepts.has(cid));
    }
    return null; // a non-Markdown file: not a concept link
  }

  // ------------------------------------------------------------ queries

  /** Each concept's direct prerequisites: the concepts it links to as `requires`. */
  requiresGraph(): Map<string, string[]> {
    return this.memo("requires", () => {
      const graph = new Map<string, string[]>();
      for (const [cid, c] of this.concepts) {
        const targets = new Set(c.links.filter((l) => l.rel === "requires" && l.kind === "concept" && !l.broken
          && l.target !== cid && this.concepts.has(l.target)).map((l) => l.target));
        graph.set(cid, [...targets].sort(cmp));
      }
      return graph;
    });
  }

  /** Strongly connected components of the requires graph (Tarjan), singletons
   *  included; a component is a group that require each other. */
  private components(): string[][] {
    return this.memo("components", () => {
      const graph = this.requiresGraph();
      const index = new Map<string, number>(), low = new Map<string, number>();
      const stack: string[] = [], onStack = new Set<string>(), groups: string[][] = [];
      let counter = 0;
      const visit = (v: string): void => {
        index.set(v, counter); low.set(v, counter); counter++;
        stack.push(v); onStack.add(v);
        for (const w of graph.get(v)!) {
          if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
          else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
        if (low.get(v) === index.get(v)) {
          const group: string[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            group.push(w);
            if (w === v) break;
          }
          groups.push(group.sort(cmp));
        }
      };
      for (const v of [...graph.keys()].sort(cmp)) if (!index.has(v)) visit(v);
      return groups;
    });
  }

  /** Groups of concepts that require each other, directly or through a chain. */
  requiresCycles(): string[][] {
    return this.components().filter((g) => g.length > 1).sort(cmpTuple);
  }

  /** Every concept's place in a reading order and its depth (the longest chain
   *  of prerequisites below it). A topological sort of the requires graph with
   *  cycles as one step; among the notes ready, it prefers staying in the
   *  folder just read, then shallower notes, then folder and title. */
  prerequisiteOrder(): Map<string, { order: number; depth: number }> {
    return this.memo("order", () => {
      const graph = this.requiresGraph();
      const comps = this.components();
      const compOf = new Map<string, number>();
      comps.forEach((g, i) => g.forEach((cid) => compOf.set(cid, i)));
      const needs = comps.map((g, i) =>
        [...new Set(g.flatMap((v) => graph.get(v)!.map((w) => compOf.get(w)!)))].filter((j) => j !== i).sort((a, b) => a - b));
      const depth = comps.map(() => -1);
      // Tarjan emits a component only after everything it reaches.
      comps.forEach((_, i) => { depth[i] = 1 + Math.max(-1, ...needs[i]!.map((j) => depth[j]!)); });
      const waiting = needs.map((n) => n.length);
      const unlocks: number[][] = comps.map(() => []);
      needs.forEach((n, i) => n.forEach((j) => unlocks[j]!.push(i)));
      const ready = new Set(waiting.flatMap((w, i) => (w === 0 ? [i] : [])));
      const lower = (cid: string) => this.concepts.get(cid)!.title.toLowerCase();
      const title = comps.map((g) => g.map(lower).sort(cmp)[0]!);
      const folder = comps.map((g) => this.concepts.get(g[0]!)!.directory);
      const parts = folder.map((f) => (f ? f.split("/") : []));
      const shared = (a: string[], b: string[]) => {
        let n = 0;
        while (n < Math.min(a.length, b.length) && a[n] === b[n]) n++;
        return n;
      };
      const out = new Map<string, { order: number; depth: number }>();
      let last: number | null = null;
      while (ready.size) {
        const near = last === null ? [] : parts[last]!;
        const key = (k: number): (string | number)[] => [-shared(parts[k]!, near), depth[k]!, folder[k]!, title[k]!];
        let best = -1;
        for (const k of [...ready].sort((a, b) => a - b)) {
          if (best < 0 || cmpTuple(key(k), key(best)) < 0) best = k;
        }
        ready.delete(best);
        for (const cid of [...comps[best]!].sort((a, b) => cmp(lower(a), lower(b)))) {
          out.set(cid, { order: out.size, depth: depth[best]! });
        }
        last = best;
        for (const k of unlocks[best]!) if (--waiting[k]! === 0) ready.add(k);
      }
      return out;
    });
  }

  /** Everything `cid` requires, directly or through a chain, in reading order. */
  prerequisites(cid: string): string[] {
    const graph = this.requiresGraph();
    const seen = new Set<string>();
    const todo = [...(graph.get(cid) ?? [])];
    while (todo.length) {
      const v = todo.pop()!;
      if (!seen.has(v)) { seen.add(v); todo.push(...graph.get(v)!); }
    }
    seen.delete(cid);
    const order = this.prerequisiteOrder();
    return [...seen].sort((a, b) => order.get(a)!.order - order.get(b)!.order);
  }

  /** The concepts that link to `cid`. */
  backlinks(cid: string): string[] {
    const index = this.memo("backlinks", () => {
      const m = new Map<string, Set<string>>();
      for (const c of this.concepts.values()) {
        for (const l of c.links) {
          if (!m.has(l.target)) m.set(l.target, new Set());
          m.get(l.target)!.add(c.id);
        }
      }
      return new Map([...m].map(([t, ids]) => [t, [...ids].sort(cmp)]));
    });
    return index.get(cid) ?? [];
  }

  /** Accept an id, a bundle path, or a bundle-absolute link. */
  resolveId(ref: string): string | null {
    let id = strip(ref).replace(/^\/+/, "");
    if (id.endsWith(".md")) id = id.slice(0, -3);
    return this.concepts.has(id) ? id : null;
  }

  /** Every issue found in the bundle. */
  lint(): Issue[] {
    return [...this.issues];
  }

  // ------------------------------------------------------------ indexes

  overviewFor(directory: string): Concept | null {
    for (const cid of this.directories.get(directory)!.concepts) {
      const c = this.concepts.get(cid)!;
      if (c.type.toLowerCase() === "overview") return c;
    }
    return null;
  }

  /** The generated OKF §8 index of a folder. */
  renderIndex(directory: string): string {
    const d = this.directories.get(directory)!;
    const groups = new Map<string, Concept[]>();
    for (const cid of d.concepts) {
      const c = this.concepts.get(cid)!;
      const t = c.type || "Concept";
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(c);
    }
    const parts: string[] = [];
    if (directory === "") parts.push(`---\nokf_version: "${OKF_VERSION}"\n---\n`);
    const typeKey = (t: string): (string | number)[] => [t.toLowerCase() !== "overview" ? 1 : 0, t.toLowerCase()];
    for (const typeName of [...groups.keys()].sort((a, b) => cmpTuple(typeKey(a), typeKey(b)))) {
      const items = [...groups.get(typeName)!].sort((a, b) => cmp(a.title.toLowerCase(), b.title.toLowerCase()));
      const lines = [`# ${typeName}`, ""];
      for (const c of items) {
        const desc = c.description ? ` - ${oneLine(c.description)}` : "";
        lines.push(`* [${escape(c.title)}](${basename(c.path)})${desc}`);
      }
      parts.push(lines.join("\n") + "\n");
    }
    if (d.children.length) {
      const lines = ["# Directories", ""];
      for (const child of [...d.children].sort(cmp)) {
        const overview = this.overviewFor(child);
        const desc = overview?.description ? ` - ${oneLine(overview.description)}` : "";
        const name = basename(child);
        lines.push(`* [${name}](${name}/)${desc}`);
      }
      parts.push(lines.join("\n") + "\n");
    }
    if (!groups.size && !d.children.length) parts.push("# Contents\n");
    return parts.join("\n").replace(/\s+$/u, "") + "\n";
  }
}

const oneLine = (s: string) => strip(s).split(/\s+/u).filter(Boolean).join(" ");
const escape = (s: string) => s.replaceAll("[", "\\[").replaceAll("]", "\\]");

export { headings };
