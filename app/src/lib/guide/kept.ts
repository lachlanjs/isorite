// Files kept in this browser (M16, Q73): the guide on the public site, as you change it, until you start again. Held
// in memory as the engine reads them, and each change written through to IndexedDB. Where IndexedDB cannot be used
// (a private window, storage blocked) they are held in memory only, and a reload starts again.

import { MemoryFiles } from "@isorite/engine";

const DB = "isorite-guide", STORE = "files";
/** The arrangement of the guide the kept files began from; changed when its notes are moved, so an old kept copy is begun again. */
const STAMP = "islands-1";
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

  /** The folder as this browser kept it, or else `seed`, which is then kept. `stamp` says which arrangement of the notes
   *  the kept folder began from: one begun from another (the guide's notes moved into islands) is begun again. */
  static async open(name: string, seed: Record<string, string>, stamp = STAMP): Promise<KeptFiles> {
    const db = await opened(), prefix = `${name}:`, stored = db ? await all(db) : new Map<string, string>();
    if (db) connections.push(db);
    // The empty path marks a folder begun: kept, even when every file in it has since been removed.
    const begun = stored.get(prefix) === stamp;
    if (db && stored.has(prefix) && !begun) for (const k of stored.keys()) if (k.startsWith(prefix)) db.transaction(STORE, "readwrite").objectStore(STORE).delete(k);
    const kept = [...stored].filter(([k]) => k.startsWith(prefix) && k !== prefix).map(([k, v]) => [k.slice(prefix.length), v] as const);
    const files = new KeptFiles(db, name, begun ? Object.fromEntries(kept) : seed);
    if (!begun) { for (const [path, text] of Object.entries(seed)) files.put(path, text); files.put("", stamp); }
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

/** The names a base's folders are kept under: the Tutorial keeps its files where it always did. */
export const keptNames = (base: string): { notes: string; own: string } => (base === "tutorial" ? { notes: "notes", own: "own" } : { notes: `${base}-notes`, own: `${base}-own` });

/** Forget what is kept for one base, so its next load starts it again; the others are left as they are. */
export async function forgetKept(base: string): Promise<void> {
  const names = keptNames(base), db = connections[0] ?? (await opened());
  if (!db) return;
  await new Promise<void>((done) => {
    try {
      const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE), cursor = store.openKeyCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { const k = String(c.key); if (k.startsWith(`${names.notes}:`) || k.startsWith(`${names.own}:`)) store.delete(c.key); c.continue(); } };
      tx.oncomplete = tx.onerror = tx.onabort = () => done();
    } catch { done(); }
  });
}
