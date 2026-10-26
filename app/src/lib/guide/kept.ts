// Files kept in this browser (M16, Q73): the guide on the public site, as you change it, until you start again. Held
// in memory as the engine reads them, and each change written through to IndexedDB. Where IndexedDB cannot be used
// (a private window, storage blocked) they are held in memory only, and a reload starts again.

import { MemoryFiles } from "@isorite/engine";

const DB = "isorite-guide", STORE = "files";
/** The connections open, closed before the store is forgotten (a deletion waits on them). */
const connections: IDBDatabase[] = [];

function opened(): Promise<IDBDatabase | null> {
  return new Promise((done) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch { done(null); }
  });
}

const all = (db: IDBDatabase): Promise<Map<string, string>> => new Promise((done) => {
  const out = new Map<string, string>(), tx = db.transaction(STORE, "readonly"), cursor = tx.objectStore(STORE).openCursor();
  cursor.onsuccess = () => { const c = cursor.result; if (c) { out.set(String(c.key), String(c.value)); c.continue(); } else done(out); };
  cursor.onerror = () => done(out);
});

/** One of the guide's folders (its notes, or isorite's own files for them), kept under `name` in the browser. */
export class KeptFiles extends MemoryFiles {
  private constructor(private readonly db: IDBDatabase | null, private readonly name: string, files: Record<string, string>) { super(files); }

  /** The folder as this browser kept it, or else `seed`, which is then kept. */
  static async open(name: string, seed: Record<string, string>): Promise<KeptFiles> {
    const db = await opened(), prefix = `${name}:`, stored = db ? await all(db) : new Map<string, string>();
    if (db) connections.push(db);
    // The empty path marks a folder begun: kept, even when every file in it has since been removed.
    const begun = stored.has(prefix);
    const kept = [...stored].filter(([k]) => k.startsWith(prefix) && k !== prefix).map(([k, v]) => [k.slice(prefix.length), v] as const);
    const files = new KeptFiles(db, name, begun ? Object.fromEntries(kept) : seed);
    if (!begun) { for (const [path, text] of Object.entries(seed)) files.put(path, text); files.put("", "begun"); }
    return files;
  }

  /** Whether what is done here outlives a reload. */
  get lasting(): boolean { return this.db !== null; }

  private put(path: string, text: string | null): void {
    if (!this.db) return;
    try {
      const store = this.db.transaction(STORE, "readwrite").objectStore(STORE), key = `${this.name}:${path}`;
      if (text === null) store.delete(key); else store.put(text, key);
    } catch { /* not kept: the next change tries again */ }
  }

  override async write(path: string, text: string): Promise<void> { await super.write(path, text); this.put(path, text); }
  override async append(path: string, text: string): Promise<void> { await super.append(path, text); this.put(path, this.files.get(path) ?? text); }
  override async remove(path: string): Promise<void> { await super.remove(path); this.put(path, null); }
}

/** Forget everything kept, so the next load starts the guide again. */
export function forgetKept(): Promise<void> {
  for (const db of connections.splice(0)) db.close();
  return new Promise((done) => {
    try {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => done();
    } catch { done(); }
  });
}
